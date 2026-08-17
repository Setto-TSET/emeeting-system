import http from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { signAccessToken } from '../../src/services/auth';
import { createApp } from '../../src/server';
import { attachRealtime } from '../../src/realtime/server';

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

function nextMessage(socket: WebSocket): Promise<any> {
  return new Promise((resolve) => socket.once('message', (raw) => resolve(JSON.parse(raw.toString()))));
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
    const b = await openClient('U-001', 'นาย สมชาย ใจดี', 'staff');

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

    const lowered = nextMessage(a);
    b.send(JSON.stringify({ type: 'hand_raise', payload: { raised: false } }));
    expect((await lowered).payload.raised).toEqual([]);

    a.close();
    b.close();
  });

  it('relays only final subtitle segments to storage but broadcasts interim ones', async () => {
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-003', 'นางสาว มาลี รักษาสัตย์');

    const interim = nextMessage(a);
    b.send(
      JSON.stringify({ type: 'subtitle_text', payload: { text: 'กำลังพูด', isFinal: false, lang: 'th-TH' } })
    );
    expect((await interim).payload.text).toBe('กำลังพูด');

    const final = nextMessage(a);
    b.send(
      JSON.stringify({ type: 'subtitle_text', payload: { text: 'พูดจบแล้ว', isFinal: true, lang: 'th-TH' } })
    );
    await final;

    const rows = (await query('SELECT text FROM transcript_segments WHERE meeting_id = ?', [MEETING])) as {
      text: string;
    }[];
    expect(rows.map((r) => r.text)).toEqual(['พูดจบแล้ว']);

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
});
