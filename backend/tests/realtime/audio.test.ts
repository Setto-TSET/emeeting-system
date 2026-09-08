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

// audio.ts ไม่คุยกับ asrClient/transcribePcm ตรง ๆ อีกแล้ว มันเลือก provider ผ่าน selectProvider
// แล้วเปิด session ผ่าน provider นั้น — ปลอม provider แทน เพื่อให้เทสต์คุมได้ว่า partial/final
// ยิงตอนไหน และพิสูจน์ได้ว่าเสียงวิ่งไปทาง provider ไหนจริง ๆ (openedProviders)
const openedProviders: string[] = [];

function fakeProvider(name: 'azure' | 'typhoon') {
  return {
    name,
    open: jest.fn(async (options: { onPartial(t: string): void; onFinal(t: string, s: number): void }) => {
      openedProviders.push(name);
      return {
        // เฟรมแรกยิง partial แล้วตามด้วย final ทันที เพื่อให้เทสต์ตรวจได้ทั้งสองเส้นทาง
        // ในหนึ่งเฟรมโดยไม่ต้องรอเวลาจริง
        push: (_pcm: Buffer, startSec: number) => {
          if (startSec < 2) options.onPartial('สวัส');
          else options.onFinal('สวัสดีครับ', startSec);
        },
        close: jest.fn(async () => {}),
      };
    }),
  };
}

jest.mock('../../src/realtime/providers/azure', () => ({
  azureProvider: fakeProvider('azure'),
  isAzureConfigured: () => true,
}));
jest.mock('../../src/realtime/providers/typhoon', () => ({
  typhoonProvider: fakeProvider('typhoon'),
}));

import { azureProvider } from '../../src/realtime/providers/azure';

let server: http.Server;
let port: number;
const MEETING = 'MT-2569-010';

function tokenFor(sub: string, name: string, role: string) {
  return signAccessToken({ sub, email: `${sub}@e-office.cloud`, name, role });
}

function audioFrame(startMs: number, level = 0.2, sampleCount = 4000): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(startMs, 0);
  header.writeFloatLE(level, 4);
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
    openedProviders.length = 0;
    resetAudioState();
  });

  it('ผลบางส่วนถูกกระจายแต่ไม่ถูกเขียนลง transcript', async () => {
    const socket = await openClient('U-001', 'มาลี');
    const before = (await query('SELECT COUNT(*) AS n FROM transcript_segments WHERE meeting_id = ?', [MEETING])) as any[];

    // provider ปลอมยิง partial เมื่อ startSec < 2 (ดู fakeProvider ด้านบนของไฟล์)
    socket.send(audioFrame(1000));
    const signal = await nextMessage(socket);

    expect(signal.type).toBe('subtitle_text');
    expect(signal.payload.isFinal).toBe(false);

    const after = (await query('SELECT COUNT(*) AS n FROM transcript_segments WHERE meeting_id = ?', [MEETING])) as any[];
    expect(after[0].n).toBe(before[0].n);

    socket.close();
  });

  it('ผลสุดท้ายถูกเขียนลง transcript พร้อมเวลาเริ่มของประโยค', async () => {
    const socket = await openClient('U-001', 'มาลี');

    socket.send(audioFrame(4000));
    await nextMessage(socket);

    const rows = (await query(
      'SELECT text, start_sec FROM transcript_segments WHERE meeting_id = ? ORDER BY id DESC LIMIT 1',
      [MEETING]
    )) as any[];
    expect(rows[0].text).toBe('สวัสดีครับ');
    expect(Number(rows[0].start_sec)).toBe(4);

    socket.close();
  });

  it('ยกระดับเป็น top_secret กลางประชุมแล้วเสียงเลิกวิ่งออก cloud ภายในหนึ่งนาที', async () => {
    // เทสต์นี้คุมกฎที่แคชละเมิดได้ง่ายที่สุด: การเปลี่ยนระดับความลับต้องมีผลจริง
    // ไม่ใช่รอรีสตาร์ต backend
    const socket = await openClient('U-001', 'มาลี');
    socket.send(audioFrame(1000));
    await nextMessage(socket);

    await query("UPDATE meetings SET payload = JSON_SET(payload, '$.confidentialityLevel', 'top_secret') WHERE id = ?", [MEETING]);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);

    socket.send(audioFrame(5000));
    await nextMessage(socket);

    // เฟรมหลังยกระดับต้องเปิด typhoon ไม่ใช่ azure
    expect(openedProviders.at(-1)).toBe('typhoon');

    jest.restoreAllMocks();
    socket.close();
  });

  it('เฟรมที่ header พังถูกทิ้งเงียบ ไม่ปิด socket', async () => {
    const socket = await openClient('U-001', 'มาลี');
    socket.send(Buffer.alloc(4));

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(socket.readyState).toBe(WebSocket.OPEN);

    socket.close();
  });

  it('ผู้พูดได้รับคำบรรยายของตัวเองกลับมาด้วย', async () => {
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    const echoed = nextMessage(speaker);
    speaker.send(audioFrame(4000));
    const signal = await echoed;

    expect(signal.type).toBe('subtitle_text');
    expect(signal.senderId).toBe('U-001');
    expect(signal.payload.text).toBe('สวัสดีครับ');
    expect(signal.payload.isFinal).toBe(true);

    speaker.close();
  });

  it('คนอื่นในห้องได้รับคำบรรยายเดียวกัน', async () => {
    const speaker = await openClient('U-001', 'สมชาย ใจดี');
    const listener = await openClient('U-003', 'มาลี รักษาสัตย์');

    const heard = nextMessage(listener);
    speaker.send(audioFrame(4000));
    const signal = await heard;

    expect(signal.senderId).toBe('U-001');
    expect(signal.senderName).toBe('สมชาย ใจดี');
    expect(signal.payload.text).toBe('สวัสดีครับ');

    speaker.close();
    listener.close();
  });

  it('เปิด session ไม่สำเร็จ แจ้ง signal_error กลับหาผู้ส่งเท่านั้น ไม่มี fallback ไป provider อื่น', async () => {
    (azureProvider.open as jest.Mock).mockRejectedValueOnce(new Error('quota exceeded'));
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    const replied = nextMessage(speaker);
    speaker.send(audioFrame(0));
    const signal = await replied;

    expect(signal.type).toBe('signal_error');
    expect(typeof signal.payload.reason).toBe('string');

    const rows = (await query('SELECT id FROM transcript_segments WHERE meeting_id = ?', [MEETING])) as unknown[];
    expect(rows).toHaveLength(0);
    // เปิดไม่สำเร็จแล้วต้องไม่มี session ค้างให้เฟรมถัดไปหลงเหลือ — เฟรมถัดมาต้องลองเปิดใหม่และสำเร็จ
    const nextEchoed = nextMessage(speaker);
    speaker.send(audioFrame(4000));
    expect((await nextEchoed).payload.text).toBe('สวัสดีครับ');

    speaker.close();
  });

  it('DB ล้มระหว่างบันทึก ไม่ทำให้โปรเซสตาย และห้องยังใช้งานต่อได้', async () => {
    const speaker = await openClient('U-001', 'สมชาย ใจดี');
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onUnhandled);

    // จำลอง DB ล้มด้วยการทิ้งตารางไปชั่วคราว — INSERT จะ reject จริงเหมือนตอน connection หลุด
    await query('RENAME TABLE transcript_segments TO transcript_segments_hidden');
    try {
      const echoed = nextMessage(speaker);
      speaker.send(audioFrame(4000));
      await echoed;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } finally {
      await query('RENAME TABLE transcript_segments_hidden TO transcript_segments');
      process.off('unhandledRejection', onUnhandled);
    }

    expect(rejections).toHaveLength(0);

    // socket เดิมยังใช้ได้ ก้อนถัดไปยังถอดและออกอากาศได้ตามปกติ
    const echoed = nextMessage(speaker);
    speaker.send(audioFrame(6000));
    expect((await echoed).payload.text).toBe('สวัสดีครับ');

    speaker.close();
  });
});
