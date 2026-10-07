import http from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { signAccessToken } from '../../src/services/auth';
import { createApp } from '../../src/server';
import { attachRealtime } from '../../src/realtime/server';
import * as votes from '../../src/repositories/votes';
import { getMeeting } from '../../src/repositories/meetings';

let server: http.Server;
let port: number;
// หมายเหตุ: ข้อมูลจำลองมีการประชุมเดียวคือ MT-2569-010 (ปรับจาก MT-2569-007 ในโจทย์ต้นฉบับ
// เพราะ seed data จริงมีแค่ MT-2569-010 — ดู task-7-report.md)
const MEETING = 'MT-2569-010';

function tokenFor(sub: string, name: string, role: string) {
  return signAccessToken({ sub, email: `${sub}@e-office.cloud`, name, role });
}

async function openClient(sub: string, name: string, role = 'admin'): Promise<WebSocket> {
  const socket = new WebSocket(
    `ws://localhost:${port}/ws?meetingId=${MEETING}&token=${tokenFor(sub, name, role)}`
  );
  // ผูก listener ของข้อความแรก (room_joined) ก่อนรอ 'open' เสมอ — ถ้า room_joined
  // มาถึงพร้อม handshake response ใน read เดียวกัน (พบได้บ่อยบน localhost) ws จะยิง
  // 'open' แล้ว 'message' ติดกันในสแต็กเดียวกัน ถ้าผูก listener หลัง await 'open'
  // จะพลาดข้อความนั้นไปตลอดกาลเพราะไม่มีการบัฟเฟอร์ event ใน EventEmitter
  const firstMessage = nextMessage(socket);
  await new Promise<void>((resolve) => socket.on('open', () => resolve()));
  // ข้อความแรกคือ room_joined — กินทิ้งเพื่อให้ nextMessage() ครั้งถัดไปอ่านสัญญาณจริง
  await firstMessage;
  return socket;
}

// room_state ถูกประกาศทุกครั้งที่มีคนเข้า/ออกห้อง — ข้ามไป ไม่งั้นแย่งที่ข้อความที่เทสต์รออยู่
function nextMessage(socket: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    const onMessage = (raw: WebSocket.RawData) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'room_state') return;
      socket.off('message', onMessage);
      resolve(message);
    };
    socket.on('message', onMessage);
  });
}

describe('signal handlers', () => {
  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM meeting_participants');
    await query('DELETE FROM meetings');
    await query('DELETE FROM app_users');
    await seedFromMockData('Meeting@2569');

    server = http.createServer(createApp());
    attachRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  beforeEach(async () => {
    await query('DELETE FROM vote_records');
    await query('DELETE FROM vote_options');
    await query('DELETE FROM vote_topics');
    await query('DELETE FROM hand_raises');
    // transcript_segments/doc_shares ไม่มี FK ไปที่ meetings จึงไม่ถูกล้างตอน beforeAll
    // ลบทิ้งทุกครั้งเพื่อไม่ให้แถวจากรันครั้งก่อนปนกับการนับผลลัพธ์ในเทสต์นี้
    await query('DELETE FROM transcript_segments');
    await query('DELETE FROM doc_shares');
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // event 'close' ฝั่ง server มาช้ากว่าฝั่งเทสต์ แล้วยิง room_state ไป query DB — รอให้จบก่อนปิด pool
    await new Promise((resolve) => setTimeout(resolve, 200));
    await close();
  });

  it('persists a created vote topic and broadcasts it to the other client', async () => {
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-003', 'นางสาว มาลี รักษาสัตย์');

    const received = nextMessage(b);
    a.send(
      JSON.stringify({
        type: 'vote_create',
        payload: {
          title: 'รับรองวาระที่ 1',
          description: '',
          options: [
            { id: 'opt-1', label: 'เห็นด้วย' },
            { id: 'opt-2', label: 'ไม่เห็นด้วย' },
          ],
        },
      })
    );

    const message = await received;
    expect(message.type).toBe('vote_state');
    expect(message.payload.topic.title).toBe('รับรองวาระที่ 1');
    expect(message.payload.topic.createdBy).toBe('U-999');

    const rows = (await query('SELECT id FROM vote_topics WHERE meeting_id = ?', [MEETING])) as unknown[];
    expect(rows).toHaveLength(1);

    a.close();
    b.close();
  });

  it('records the sender from the token, ignoring any senderId in the payload', async () => {
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-003', 'นางสาว มาลี รักษาสัตย์');

    const created = nextMessage(b);
    a.send(
      JSON.stringify({
        type: 'vote_create',
        senderId: 'U-001',
        payload: { title: 'ทดสอบการปลอมตัว', options: [{ id: 'opt-1', label: 'เห็นด้วย' }] },
      })
    );
    const message = await created;

    expect(message.payload.topic.createdBy).toBe('U-999');
    expect(message.senderId).toBe('U-999');

    a.close();
    b.close();
  });

  it('keeps one vote per user — voting twice replaces the earlier choice', async () => {
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-003', 'นางสาว มาลี รักษาสัตย์');

    const created = nextMessage(b);
    a.send(
      JSON.stringify({
        type: 'vote_create',
        payload: {
          title: 'มติที่ 2',
          options: [
            { id: 'opt-1', label: 'เห็นด้วย' },
            { id: 'opt-2', label: 'ไม่เห็นด้วย' },
          ],
        },
      })
    );
    const topicId = (await created).payload.topic.id;

    const firstCast = nextMessage(a);
    b.send(JSON.stringify({ type: 'vote_cast', payload: { topicId, optionId: 'opt-1' } }));
    await firstCast;

    const secondCast = nextMessage(a);
    b.send(JSON.stringify({ type: 'vote_cast', payload: { topicId, optionId: 'opt-2' } }));
    const message = await secondCast;

    expect(message.payload.topic.votes).toHaveLength(1);
    expect(message.payload.topic.votes[0].optionId).toBe('opt-2');

    a.close();
    b.close();
  });

  it('refuses a vote on a closed topic', async () => {
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-003', 'นางสาว มาลี รักษาสัตย์');

    const created = nextMessage(b);
    a.send(
      JSON.stringify({ type: 'vote_create', payload: { title: 'ปิดแล้ว', options: [{ id: 'opt-1', label: 'ok' }] } })
    );
    const topicId = (await created).payload.topic.id;

    const closed = nextMessage(b);
    a.send(JSON.stringify({ type: 'vote_close', payload: { topicId } }));
    await closed;

    const rejected = nextMessage(b);
    b.send(JSON.stringify({ type: 'vote_cast', payload: { topicId, optionId: 'opt-1' } }));
    const message = await rejected;

    expect(message.type).toBe('signal_error');

    const rows = (await query('SELECT user_id FROM vote_records WHERE topic_id = ?', [topicId])) as unknown[];
    expect(rows).toHaveLength(0);

    a.close();
    b.close();
  });

  it('refuses vote_close from a participant who did not create the topic and is not a manager', async () => {
    const a = await openClient('U-999', 'IT Admin');
    // U-005 เป็นผู้เข้าร่วมทั่วไป — สิทธิ์ผู้จัดการคิดจากการประชุมนี้ (ผู้จัด/ผู้รับมอบสิทธิ์) ไม่ใช่จาก role
    const b = await openClient('U-005', 'นาย เดชา เก่งจริง', 'staff');

    const created = nextMessage(b);
    a.send(
      JSON.stringify({ type: 'vote_create', payload: { title: 'ของแอดมิน', options: [{ id: 'opt-1', label: 'ok' }] } })
    );
    const topicId = (await created).payload.topic.id;

    const rejected = nextMessage(b);
    b.send(JSON.stringify({ type: 'vote_close', payload: { topicId } }));
    expect((await rejected).type).toBe('signal_error');

    a.close();
    b.close();
  });

  it('persists hand raises and broadcasts the full raised list', async () => {
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-003', 'นางสาว มาลี รักษาสัตย์');

    const raised = nextMessage(a);
    b.send(JSON.stringify({ type: 'hand_raise', payload: { raised: true } }));
    const message = await raised;

    expect(message.type).toBe('hand_state');
    expect(message.payload.raised).toEqual([
      expect.objectContaining({ userId: 'U-003', userName: 'นางสาว มาลี รักษาสัตย์' }),
    ]);
    // lastAction ของการยกมือตัวเอง: userId และ byUserId ต้องเป็นคนเดียวกัน (ผู้ส่งเอง)
    expect(message.payload.lastAction).toEqual({ userId: 'U-003', byUserId: 'U-003' });

    const lowered = nextMessage(a);
    b.send(JSON.stringify({ type: 'hand_raise', payload: { raised: false } }));
    const loweredMessage = await lowered;
    expect(loweredMessage.payload.raised).toEqual([]);
    expect(loweredMessage.payload.lastAction).toEqual({ userId: 'U-003', byUserId: 'U-003' });

    a.close();
    b.close();
  });

  it('refuses hand_lower from a non-manager targeting someone else, but lets a manager lower it — and stamps lastAction with the real actor', async () => {
    const manager = await openClient('U-999', 'IT Admin'); // admin จัดการได้ทุกห้อง
    const target = await openClient('U-003', 'นางสาว มาลี รักษาสัตย์', 'staff');
    const outsider = await openClient('U-005', 'นาย เดชา เก่งจริง', 'staff'); // ผู้เข้าร่วมทั่วไป ไม่ใช่ผู้จัดการ

    // broadcast กระจายไปทุก socket ในห้อง (รวมทั้ง target/outsider เอง) — ต้องดักรับให้ครบ
    // ทุกตัวก่อนไปทำ action ถัดไป ไม่งั้นข้อความเก่าที่ยังไม่ถูกอ่านจะมาปนกับผลลัพธ์รอบถัดไป
    const raisedAll = Promise.all([nextMessage(manager), nextMessage(target), nextMessage(outsider)]);
    target.send(JSON.stringify({ type: 'hand_raise', payload: { raised: true } }));
    await raisedAll;

    // ผู้ใช้ทั่วไปที่ไม่ใช่เจ้าของมือและไม่ใช่ manager ต้องเอามือคนอื่นลงไม่ได้ — ถ้าเอาการเช็คสิทธิ์
    // ออก (targetUserId !== client.userId && !client.canManage) เทสต์นี้จะจับได้ทันที
    const rejected = nextMessage(outsider);
    outsider.send(JSON.stringify({ type: 'hand_lower', payload: { targetUserId: 'U-003' } }));
    expect((await rejected).type).toBe('signal_error');

    const stillRaised = (await query('SELECT user_id FROM hand_raises WHERE meeting_id = ? AND user_id = ?', [
      MEETING,
      'U-003',
    ])) as unknown[];
    expect(stillRaised).toHaveLength(1);

    // manager เอามือของ U-003 ลงได้ — lastAction ต้องบอกว่ามือของใคร (U-003) และใครเป็นคนกด (U-999)
    // broadcast นี้ก็กระจายไปทุก socket เช่นกัน ต้องดักรับให้ครบทั้งสามอีกครั้ง
    const loweredAll = Promise.all([nextMessage(manager), nextMessage(target), nextMessage(outsider)]);
    manager.send(JSON.stringify({ type: 'hand_lower', payload: { targetUserId: 'U-003' } }));
    const [, loweredMessage] = await loweredAll;
    expect(loweredMessage.type).toBe('hand_state');
    expect(loweredMessage.payload.raised).toEqual([]);
    expect(loweredMessage.payload.lastAction).toEqual({ userId: 'U-003', byUserId: 'U-999' });
    expect(loweredMessage.payload.lastAction.userId).not.toBe(loweredMessage.payload.lastAction.byUserId);

    const gone = (await query('SELECT user_id FROM hand_raises WHERE meeting_id = ? AND user_id = ?', [
      MEETING,
      'U-003',
    ])) as unknown[];
    expect(gone).toHaveLength(0);

    manager.close();
    target.close();
    outsider.close();
  });

  it('ignores subtitle_text sent by a client — only the server-side ASR writes the transcript', async () => {
    // ทุกคนในห้อง รวมถึงแขก เคยส่งข้อความนี้ด้วย isFinal แล้วกลายเป็น transcript ถาวร
    // ที่ถูกเอาไปทำร่างรายงาน AI ได้ — "มติ" ปลอมจึงเข้าไปในรายงานได้
    await query('DELETE FROM transcript_segments WHERE meeting_id = ?', [MEETING]);
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-003', 'นางสาว มาลี รักษาสัตย์');
    const received: unknown[] = [];
    a.on('message', (m) => {
      const message = JSON.parse(m.toString());
      if (message.type !== 'room_state') received.push(message);
    });

    b.send(JSON.stringify({ type: 'subtitle_text', payload: { text: 'มติปลอม', isFinal: true, lang: 'th-TH' } }));
    await new Promise((resolve) => setTimeout(resolve, 200));

    const rows = (await query('SELECT text FROM transcript_segments WHERE meeting_id = ?', [MEETING])) as unknown[];
    expect(rows).toHaveLength(0);
    expect(received).toHaveLength(0);
    expect(b.readyState).toBe(WebSocket.OPEN);

    a.close();
    b.close();
  });

  it('ignores an unknown signal type without closing the socket', async () => {
    const a = await openClient('U-999', 'IT Admin');
    a.send(JSON.stringify({ type: 'not_a_real_signal', payload: {} }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(a.readyState).toBe(WebSocket.OPEN);
    a.close();
  });

  it('starts a document share, lets the sharer change pages, and refuses an unrelated non-manager', async () => {
    const sharer = await openClient('U-001', 'นาย สมชาย ใจดี', 'staff');
    const outsider = await openClient('U-005', 'นาย เดชา เก่งจริง', 'staff');

    const started = nextMessage(outsider);
    sharer.send(JSON.stringify({ type: 'doc_share', payload: { fileId: 'F-1', fileName: 'สรุปการประชุม.pdf' } }));
    const startMessage = await started;
    expect(startMessage.type).toBe('doc_share_state');
    expect(startMessage.payload.share).toEqual(
      expect.objectContaining({ fileId: 'F-1', fileName: 'สรุปการประชุม.pdf', sharedBy: 'U-001', page: 1 })
    );

    let rows = (await query('SELECT file_id, page, shared_by FROM doc_shares WHERE meeting_id = ?', [
      MEETING,
    ])) as { file_id: string; page: number; shared_by: string }[];
    expect(rows).toEqual([{ file_id: 'F-1', page: 1, shared_by: 'U-001' }]);

    // เจ้าของการแชร์เปลี่ยนหน้าได้เอง
    const paged = nextMessage(outsider);
    sharer.send(JSON.stringify({ type: 'doc_share_page', payload: { page: 3 } }));
    const pagedMessage = await paged;
    expect(pagedMessage.payload.share.page).toBe(3);

    rows = (await query('SELECT file_id, page, shared_by FROM doc_shares WHERE meeting_id = ?', [
      MEETING,
    ])) as { file_id: string; page: number; shared_by: string }[];
    expect(rows).toEqual([{ file_id: 'F-1', page: 3, shared_by: 'U-001' }]);

    // ผู้ใช้อื่นที่ไม่ใช่เจ้าของและไม่ใช่ manager เปลี่ยนหน้าไม่ได้ — เทสต์นี้จะจับได้ถ้าลบ
    // การเช็คสิทธิ์ (current.sharedBy !== client.userId && !MANAGER_ROLES.has(...)) ออก
    const rejectedPage = nextMessage(outsider);
    outsider.send(JSON.stringify({ type: 'doc_share_page', payload: { page: 5 } }));
    expect((await rejectedPage).type).toBe('signal_error');

    rows = (await query('SELECT file_id, page, shared_by FROM doc_shares WHERE meeting_id = ?', [
      MEETING,
    ])) as { file_id: string; page: number; shared_by: string }[];
    expect(rows).toEqual([{ file_id: 'F-1', page: 3, shared_by: 'U-001' }]);

    // ผู้ใช้อื่นที่ไม่ใช่เจ้าของและไม่ใช่ manager หยุดแชร์ของคนอื่นไม่ได้
    const rejectedStop = nextMessage(outsider);
    outsider.send(JSON.stringify({ type: 'doc_share_stop', payload: {} }));
    expect((await rejectedStop).type).toBe('signal_error');

    rows = (await query('SELECT file_id, page, shared_by FROM doc_shares WHERE meeting_id = ?', [
      MEETING,
    ])) as { file_id: string; page: number; shared_by: string }[];
    expect(rows).toHaveLength(1);

    // เจ้าของหยุดแชร์เองได้ — ต้องลบแถวออกจริงและกระจาย share: null
    const stopped = nextMessage(outsider);
    sharer.send(JSON.stringify({ type: 'doc_share_stop', payload: {} }));
    const stopMessage = await stopped;
    expect(stopMessage.type).toBe('doc_share_state');
    expect(stopMessage.payload.share).toBeNull();

    const finalRows = (await query('SELECT file_id FROM doc_shares WHERE meeting_id = ?', [MEETING])) as {
      file_id: string;
    }[];
    expect(finalRows).toHaveLength(0);

    sharer.close();
    outsider.close();
  });

  it('lets a manager stop another participant\'s document share', async () => {
    const sharer = await openClient('U-001', 'นาย สมชาย ใจดี', 'staff');
    const manager = await openClient('U-999', 'IT Admin'); // admin จัดการได้ทุกห้อง

    const started = nextMessage(manager);
    sharer.send(JSON.stringify({ type: 'doc_share', payload: { fileId: 'F-2', fileName: 'วาระ.pdf' } }));
    await started;

    const stopped = nextMessage(sharer);
    manager.send(JSON.stringify({ type: 'doc_share_stop', payload: {} }));
    const stopMessage = await stopped;
    expect(stopMessage.type).toBe('doc_share_state');
    expect(stopMessage.payload.share).toBeNull();

    const rows = (await query('SELECT file_id FROM doc_shares WHERE meeting_id = ?', [MEETING])) as unknown[];
    expect(rows).toHaveLength(0);

    sharer.close();
    manager.close();
  });

  it('lets anyone start a share when none is active, but blocks starting over someone else\'s active share unless a manager takes over', async () => {
    const sharer = await openClient('U-001', 'นาย สมชาย ใจดี', 'staff');
    const outsider = await openClient('U-005', 'นาย เดชา เก่งจริง', 'staff');
    const manager = await openClient('U-999', 'IT Admin'); // admin จัดการได้ทุกห้อง

    // ไม่มีใครแชร์อยู่ — ใครก็เริ่มแชร์ได้
    const started = Promise.all([nextMessage(outsider), nextMessage(manager)]);
    sharer.send(JSON.stringify({ type: 'doc_share', payload: { fileId: 'F-A', fileName: 'A.pdf' } }));
    await started;

    let rows = (await query('SELECT file_id, shared_by FROM doc_shares WHERE meeting_id = ?', [
      MEETING,
    ])) as { file_id: string; shared_by: string }[];
    expect(rows).toEqual([{ file_id: 'F-A', shared_by: 'U-001' }]);

    // เจ้าของเดิมเปลี่ยนไปแชร์ไฟล์อื่นแทนได้ (ไปเอกสารถัดไป) — ไม่ใช่ "คนอื่น" ตามกฎ
    const replaced = Promise.all([nextMessage(outsider), nextMessage(manager)]);
    sharer.send(JSON.stringify({ type: 'doc_share', payload: { fileId: 'F-B', fileName: 'B.pdf' } }));
    await replaced;

    rows = (await query('SELECT file_id, shared_by FROM doc_shares WHERE meeting_id = ?', [
      MEETING,
    ])) as { file_id: string; shared_by: string }[];
    expect(rows).toEqual([{ file_id: 'F-B', shared_by: 'U-001' }]);

    // ผู้ใช้อื่นที่ไม่ใช่เจ้าของและไม่ใช่ manager เริ่มแชร์ทับไม่ได้ระหว่างที่คนอื่นแชร์อยู่ —
    // เทสต์นี้จะจับได้ทันทีถ้าลบการเช็ค current && current.sharedBy !== client.userId ออก
    const rejected = nextMessage(outsider);
    outsider.send(JSON.stringify({ type: 'doc_share', payload: { fileId: 'F-C', fileName: 'C.pdf' } }));
    expect((await rejected).type).toBe('signal_error');

    rows = (await query('SELECT file_id, shared_by FROM doc_shares WHERE meeting_id = ?', [
      MEETING,
    ])) as { file_id: string; shared_by: string }[];
    expect(rows).toEqual([{ file_id: 'F-B', shared_by: 'U-001' }]);

    // manager แย่งแชร์แทนคนอื่นได้ — shared_by ต้องกลายเป็น manager
    const takenOver = Promise.all([nextMessage(sharer), nextMessage(outsider)]);
    manager.send(JSON.stringify({ type: 'doc_share', payload: { fileId: 'F-D', fileName: 'D.pdf' } }));
    await takenOver;

    rows = (await query('SELECT file_id, shared_by FROM doc_shares WHERE meeting_id = ?', [
      MEETING,
    ])) as { file_id: string; shared_by: string }[];
    expect(rows).toEqual([{ file_id: 'F-D', shared_by: 'U-999' }]);

    sharer.close();
    outsider.close();
    manager.close();
  });

  it('rejects vote_create with no title, vote_cast with a missing optionId, and a non-object payload — without crashing or writing', async () => {
    const a = await openClient('U-999', 'IT Admin');

    // vote_create ไม่มี title
    let error = nextMessage(a);
    a.send(JSON.stringify({ type: 'vote_create', payload: { options: [{ id: 'opt-1', label: 'x' }] } }));
    expect((await error).type).toBe('signal_error');

    let topics = (await query('SELECT id FROM vote_topics WHERE meeting_id = ?', [MEETING])) as unknown[];
    expect(topics).toHaveLength(0);

    // vote_cast ไม่มี optionId
    error = nextMessage(a);
    a.send(JSON.stringify({ type: 'vote_cast', payload: { topicId: 'whatever' } }));
    expect((await error).type).toBe('signal_error');

    const votes = (await query('SELECT topic_id FROM vote_records')) as unknown[];
    expect(votes).toHaveLength(0);

    // payload ไม่ใช่ object เลย — ต้องไม่ throw และไม่ปิด socket
    error = nextMessage(a);
    a.send(JSON.stringify({ type: 'vote_create', payload: 'not-an-object' }));
    expect((await error).type).toBe('signal_error');

    topics = (await query('SELECT id FROM vote_topics WHERE meeting_id = ?', [MEETING])) as unknown[];
    expect(topics).toHaveLength(0);

    expect(a.readyState).toBe(WebSocket.OPEN);
    a.close();
  });

  it('stores chat in the meeting and broadcasts it with the sender taken from the token', async () => {
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-005', 'นาย เดชา เก่งจริง', 'staff');

    const received = nextMessage(a);
    b.send(JSON.stringify({ type: 'chat_send', payload: { text: '  สวัสดีครับ  ', sender: 'ปลอมตัว' } }));
    const message = (await received).payload.message;

    expect(message).toEqual(expect.objectContaining({ senderId: 'U-005', sender: 'นาย เดชา เก่งจริง', text: 'สวัสดีครับ' }));
    const meeting = await getMeeting(MEETING);
    expect((meeting!.chatMessages as { id: string }[]).some((m) => m.id === message.id)).toBe(true);

    a.close();
    b.close();
  });

  it('refuses a vote on a topic that belongs to another meeting', async () => {
    await votes.createTopic({
      id: 'vote-other-room',
      meetingId: 'MT-SOMEWHERE-ELSE',
      title: 'มติห้องอื่น',
      options: [{ id: 'opt-1', label: 'เห็นด้วย' }],
      createdBy: 'U-999',
      createdByName: 'IT Admin',
    });
    const a = await openClient('U-999', 'IT Admin');

    const rejected = nextMessage(a);
    a.send(JSON.stringify({ type: 'vote_cast', payload: { topicId: 'vote-other-room', optionId: 'opt-1' } }));
    expect((await rejected).type).toBe('signal_error');

    const rows = (await query('SELECT user_id FROM vote_records WHERE topic_id = ?', ['vote-other-room'])) as unknown[];
    expect(rows).toHaveLength(0);
    a.close();
  });

  it('meeting_refresh announces the stored status and who is connected — values come from the server, not the payload', async () => {
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-005', 'นาย เดชา เก่งจริง', 'staff');

    const state = new Promise<any>((resolve) => {
      const onMessage = (raw: WebSocket.RawData) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'room_state' && message.payload.connectedUserIds.length === 2) {
          a.off('message', onMessage);
          resolve(message);
        }
      };
      a.on('message', onMessage);
    });
    b.send(JSON.stringify({ type: 'meeting_refresh', payload: { status: 'endorsed' } }));
    const { payload } = await state;

    const stored = await getMeeting(MEETING);
    expect(payload.status).toBe(stored!.status);
    expect([...payload.connectedUserIds].sort()).toEqual(['U-005', 'U-999']);

    a.close();
    b.close();
  });
});
