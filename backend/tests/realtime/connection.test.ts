import http from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { signAccessToken } from '../../src/services/auth';
import { createApp } from '../../src/server';
import { attachRealtime } from '../../src/realtime/server';
import { clientsIn } from '../../src/realtime/rooms';
import * as meetingsRepo from '../../src/repositories/meetings';

let server: http.Server;
let port: number;

// หมายเหตุ: ข้อมูลจำลองมีการประชุมเดียวคือ MT-2569-010 (MT-2569-005..009 ถูกตัดออกแล้ว)
const MEETING_ID = 'MT-2569-010';

function connect(url: string): Promise<{ socket: WebSocket; opened: boolean; closeCode?: number }> {
  return new Promise((resolve) => {
    const socket = new WebSocket(url);
    let settled = false;

    socket.on('close', (code) => {
      if (settled) return;
      settled = true;
      resolve({ socket, opened: false, closeCode: code });
    });

    // หมายเหตุ: ตาม WS spec, 'open' ที่ฝั่ง client ยิงก่อนเสมอแม้ server จะปิด
    // connection ทันทีหลัง handshake — จึงแข่งกับ 'open' ไม่ได้ (เคยลองแล้วพัง)
    // และแข่งกับ timer ก็ไม่ทน เพราะ membership check ต้อง query DB ก่อนปิด ใช้เวลา
    // ไม่แน่นอน (เครื่องช้าเกิน timer ก็ผิดผล) server จะส่ง room_joined ก็ต่อเมื่อ
    // ผ่านทุกการตรวจสอบแล้วเท่านั้น จึงแข่ง 'message' กับ 'close' แทน — ตัดสินผลได้
    // ทันทีที่ผลลัพธ์จริงมาถึง ไม่ขึ้นกับความเร็วของ DB เลย
    socket.on('message', () => {
      if (settled) return;
      settled = true;
      resolve({ socket, opened: true });
    });
  });
}

describe('realtime connection', () => {
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
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await close();
  });

  it('rejects a connection with no token', async () => {
    const result = await connect(`ws://localhost:${port}/ws?meetingId=${MEETING_ID}`);
    expect(result.opened).toBe(false);
    expect(result.closeCode).toBe(4401);
  });

  it('rejects a connection with an invalid token', async () => {
    const result = await connect(`ws://localhost:${port}/ws?meetingId=${MEETING_ID}&token=garbage`);
    expect(result.opened).toBe(false);
    expect(result.closeCode).toBe(4401);
  });

  it('rejects a valid token for a meeting the user is not a member of', async () => {
    await query('DELETE FROM meeting_participants WHERE meeting_id = ? AND user_id = ?', [
      MEETING_ID,
      'U-005',
    ]);
    const token = signAccessToken({
      sub: 'U-005',
      email: 'decha@e-office.cloud',
      name: 'นาย เดชา เก่งจริง',
      role: 'staff',
    });
    const result = await connect(`ws://localhost:${port}/ws?meetingId=${MEETING_ID}&token=${token}`);
    expect(result.opened).toBe(false);
    expect(result.closeCode).toBe(4403);
  });

  it('accepts a member and lets an admin in without a membership row', async () => {
    const memberRow = (await query(
      'SELECT user_id FROM meeting_participants WHERE meeting_id = ? LIMIT 1',
      [MEETING_ID]
    )) as { user_id: string }[];
    expect(memberRow.length).toBe(1);

    const adminToken = signAccessToken({
      sub: 'U-999',
      email: 'admin@e-office.cloud',
      name: 'IT Admin',
      role: 'admin',
    });
    const result = await connect(`ws://localhost:${port}/ws?meetingId=${MEETING_ID}&token=${adminToken}`);
    expect(result.opened).toBe(true);
    result.socket.close();
  });

  it('confirms the join with a room_joined message carrying the identity from the token', async () => {
    const token = signAccessToken({
      sub: 'U-999',
      email: 'admin@e-office.cloud',
      name: 'IT Admin',
      role: 'admin',
    });
    const socket = new WebSocket(`ws://localhost:${port}/ws?meetingId=${MEETING_ID}&token=${token}`);

    const message = await new Promise<Record<string, unknown>>((resolve) => {
      socket.on('message', (raw) => resolve(JSON.parse(raw.toString())));
    });

    expect(message.type).toBe('room_joined');
    expect((message.payload as Record<string, unknown>).userId).toBe('U-999');
    socket.close();
  });

  it('does not leak a client that disconnects while the membership check is in flight', async () => {
    // U-003 เป็นสมาชิกจริงของ MT-2569-010 และไม่ถูกแตะโดยเทสต์อื่น — ต้องผ่านการ
    // ตรวจ isMeetingMember (มี await คั่นกลาง) ก่อนถึงจะลงทะเบียนได้
    //
    // หน่วง isMeetingMember ไว้ชั่วคราวเพื่อบังคับให้ "ปิด socket ระหว่างรอ query"
    // เกิดขึ้นแน่นอน — ถ้าไม่หน่วง การแข่งกับ query จริงบน local DB ที่เร็วมากจะ
    // ไม่ทริกเกอร์บั๊กอย่างเสถียร (query อาจจบก่อนที่ close frame จะมาถึง)
    const real = meetingsRepo.isMeetingMember;
    const spy = jest
      .spyOn(meetingsRepo, 'isMeetingMember')
      .mockImplementation(async (meetingId, userId) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return real(meetingId, userId);
      });

    try {
      const token = signAccessToken({
        sub: 'U-003',
        email: 'malee.r@e-office.cloud',
        name: 'นางสาว มาลี รักษาสัตย์',
        role: 'staff',
      });
      const socket = new WebSocket(`ws://localhost:${port}/ws?meetingId=${MEETING_ID}&token=${token}`);

      // ปิด socket ทันทีที่ handshake เสร็จ — แข่งกับ query isMeetingMember ที่ยัง
      // ค้างอยู่ฝั่ง server โดยเจตนา
      socket.on('open', () => socket.close());
      await new Promise<void>((resolve) => socket.on('close', () => resolve()));

      // ให้เวลา query ที่ค้างอยู่ resolve และให้โค้ดฝั่ง server มีโอกาสลงทะเบียน
      // client ที่ตายไปแล้ว (ถ้ายังมีบั๊ก) ก่อนเช็คผล
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(clientsIn(MEETING_ID).length).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
});
