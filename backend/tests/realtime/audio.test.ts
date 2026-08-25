import http from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { signAccessToken } from '../../src/services/auth';
import { createApp } from '../../src/server';
import { attachRealtime } from '../../src/realtime/server';
import { resetAudioState } from '../../src/realtime/audio';

jest.mock('../../src/realtime/asrClient', () => ({
  transcribePcm: jest.fn(),
}));
import { transcribePcm } from '../../src/realtime/asrClient';

const mockTranscribe = transcribePcm as jest.MockedFunction<typeof transcribePcm>;

let server: http.Server;
let port: number;
const MEETING = 'MT-2569-010';

function tokenFor(sub: string, name: string, role: string) {
  return signAccessToken({ sub, email: `${sub}@e-office.cloud`, name, role });
}

function audioFrame(startMs: number, sampleCount = 8): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(startMs, 0);
  return Buffer.concat([header, Buffer.alloc(sampleCount * 2)]);
}

async function openClient(sub: string, name: string, role = 'admin'): Promise<WebSocket> {
  const socket = new WebSocket(
    `ws://localhost:${port}/ws?meetingId=${MEETING}&token=${tokenFor(sub, name, role)}`
  );
  const firstMessage = nextMessage(socket);
  await new Promise<void>((resolve) => socket.on('open', () => resolve()));
  await firstMessage;
  return socket;
}

function nextMessage(socket: WebSocket): Promise<any> {
  return new Promise((resolve) => socket.once('message', (raw) => resolve(JSON.parse(raw.toString()))));
}

describe('audio frames', () => {
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

  afterAll(async () => {
    // ปิด socket ที่ยังค้างก่อน ไม่งั้น server.close() รอ WebSocket ที่เทสต์เปิดไว้ไปตลอด
    // แล้ว jest ค้างไม่จบ (handlers.test ไม่เจอเพราะทุกเคสที่นั่นปิด socket ครบก่อน assert สุดท้าย)
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await close();
  });

  beforeEach(async () => {
    await query('DELETE FROM transcript_segments');
    mockTranscribe.mockReset();
    resetAudioState();
  });

  test('ผู้พูดได้รับคำบรรยายของตัวเองกลับมาด้วย', async () => {
    mockTranscribe.mockResolvedValue('สวัสดีครับ');
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    const echoed = nextMessage(speaker);
    speaker.send(audioFrame(0));
    const signal = await echoed;

    expect(signal.type).toBe('subtitle_text');
    expect(signal.senderId).toBe('U-001');
    expect(signal.payload.text).toBe('สวัสดีครับ');
    expect(signal.payload.isFinal).toBe(true);

    speaker.close();
  });

  test('คนอื่นในห้องได้รับคำบรรยายเดียวกัน', async () => {
    mockTranscribe.mockResolvedValue('รับทราบครับ');
    const speaker = await openClient('U-001', 'สมชาย ใจดี');
    const listener = await openClient('U-003', 'มาลี รักษาสัตย์');

    const heard = nextMessage(listener);
    speaker.send(audioFrame(0));
    const signal = await heard;

    expect(signal.senderId).toBe('U-001');
    expect(signal.senderName).toBe('สมชาย ใจดี');
    expect(signal.payload.text).toBe('รับทราบครับ');

    speaker.close();
    listener.close();
  });

  test('บันทึกลง transcript_segments ด้วย startSec จาก header ไม่ใช่เวลาที่เฟรมมาถึง', async () => {
    mockTranscribe.mockResolvedValue('วาระที่หนึ่ง');
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    const echoed = nextMessage(speaker);
    speaker.send(audioFrame(12_500));
    await echoed;

    const rows = (await query(
      'SELECT speaker_id, start_sec, text FROM transcript_segments WHERE meeting_id = ?',
      [MEETING]
    )) as { speaker_id: string; start_sec: number; text: string }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].speaker_id).toBe('U-001');
    expect(Number(rows[0].start_sec)).toBeCloseTo(12.5, 3);
    expect(rows[0].text).toBe('วาระที่หนึ่ง');

    speaker.close();
  });

  test('ข้อความที่ซ้ำจากช่วงทับซ้อนถูกตัดก่อนบันทึก', async () => {
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    mockTranscribe.mockResolvedValueOnce('มติที่ประชุมเห็นชอบ');
    let echoed = nextMessage(speaker);
    speaker.send(audioFrame(0));
    await echoed;

    mockTranscribe.mockResolvedValueOnce('เห็นชอบตามที่เสนอ');
    echoed = nextMessage(speaker);
    speaker.send(audioFrame(3_000));
    const second = await echoed;

    expect(second.payload.text).toBe('ตามที่เสนอ');

    speaker.close();
  });

  test('เฟรมที่แกะไม่ได้ถูกทิ้งเงียบ ๆ ไม่เรียก ASR และไม่ทำให้ socket ตาย', async () => {
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    speaker.send(Buffer.from([0x00, 0x01]));
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(speaker.readyState).toBe(WebSocket.OPEN);

    speaker.close();
  });

  test('sidecar ล้มเหลว แจ้ง signal_error กลับหาผู้ส่งเท่านั้น', async () => {
    mockTranscribe.mockRejectedValue(new Error('sidecar down'));
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    const replied = nextMessage(speaker);
    speaker.send(audioFrame(0));
    const signal = await replied;

    expect(signal.type).toBe('signal_error');
    expect(typeof signal.payload.reason).toBe('string');

    const rows = (await query('SELECT id FROM transcript_segments WHERE meeting_id = ?', [MEETING])) as unknown[];
    expect(rows).toHaveLength(0);

    speaker.close();
  });

  test('ข้อความว่างจาก ASR ไม่ถูกบันทึกและไม่ถูกกระจาย', async () => {
    mockTranscribe.mockResolvedValue('   ');
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    speaker.send(audioFrame(0));
    await new Promise((resolve) => setTimeout(resolve, 200));

    const rows = (await query('SELECT id FROM transcript_segments WHERE meeting_id = ?', [MEETING])) as unknown[];
    expect(rows).toHaveLength(0);

    speaker.close();
  });

  test('ก้อนใหม่ที่มาระหว่างก้อนเก่ายังถอดไม่เสร็จ ทำให้ก้อนเก่าถูกทิ้ง', async () => {
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    let releaseFirst: (value: string) => void = () => {};
    mockTranscribe.mockImplementationOnce(
      () => new Promise<string>((resolve) => { releaseFirst = resolve; })
    );
    mockTranscribe.mockResolvedValueOnce('ก้อนที่สอง');

    speaker.send(audioFrame(0));
    await new Promise((resolve) => setTimeout(resolve, 50));

    const echoed = nextMessage(speaker);
    speaker.send(audioFrame(3_000));
    // รอให้ server รับก้อนที่สองจริง ๆ ก่อนค่อยปล่อยก้อนแรก — ปล่อยเลยจะกลายเป็นว่าก้อนแรก
    // ถอดเสร็จตั้งแต่ยังไม่มีก้อนใหม่มาแทนที่ ซึ่งไม่ใช่สถานการณ์ที่เทสต์นี้ต้องการวัด
    while (mockTranscribe.mock.calls.length < 2) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    releaseFirst('ก้อนที่หนึ่ง');
    const signal = await echoed;

    // ก้อนแรกถูกทิ้ง ข้อความที่ออกอากาศต้องเป็นก้อนที่สองเท่านั้น
    expect(signal.payload.text).toBe('ก้อนที่สอง');

    const rows = (await query('SELECT text FROM transcript_segments WHERE meeting_id = ?', [MEETING])) as {
      text: string;
    }[];
    expect(rows.map((r) => r.text)).toEqual(['ก้อนที่สอง']);

    speaker.close();
  });
});
