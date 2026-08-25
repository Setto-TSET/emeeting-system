// ═══════════════════════════════════════════
// WebSocket Server — แทน BroadcastChannel ที่คุยข้ามเครื่องไม่ได้
//
// ตัวตนผู้ส่งมาจาก JWT เท่านั้น payload ที่ client ส่งมาไม่มีสิทธิ์บอกว่าตัวเองเป็นใคร
// ═══════════════════════════════════════════

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAccessToken } from '../services/auth';
import { isMeetingMember } from '../repositories/meetings';
import { addClient, removeClient, clientsIn, RoomClient } from './rooms';
import { handleSignal } from './handlers';
import { handleAudioFrame } from './audio';

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FORBIDDEN = 4403;
const CLOSE_BAD_REQUEST = 4400;

export function send(socket: WebSocket, message: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
}

export function broadcast(meetingId: string, message: unknown, exceptUserId?: string): void {
  for (const client of clientsIn(meetingId)) {
    if (exceptUserId && client.userId === exceptUserId) continue;
    send(client.socket, message);
  }
}

export function attachRealtime(server: http.Server): WebSocketServer {
  // ก้อนเสียง 3 วินาทีที่ 16 kHz 16-bit เท่ากับ 96 KB บวก header — 200 KB คือเผื่อไว้เท่าตัว
  // เกินกว่านี้ไม่ใช่เสียงประชุม จำกัดที่ตัว WebSocketServer เลยเพื่อให้ ws ปิดการเชื่อมต่อ
  // ก่อนโหลด payload เข้าหน่วยความจำ
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 200 * 1024 });

  wss.on('connection', async (socket, request) => {
    const url = new URL(request.url ?? '', 'http://localhost');
    const meetingId = url.searchParams.get('meetingId');
    const token = url.searchParams.get('token');

    if (!meetingId) return socket.close(CLOSE_BAD_REQUEST, 'meetingId required');
    if (!token) return socket.close(CLOSE_UNAUTHORIZED, 'token required');

    const claims = verifyAccessToken(token);
    if (!claims) return socket.close(CLOSE_UNAUTHORIZED, 'invalid token');

    const client: RoomClient = {
      socket,
      meetingId,
      userId: claims.sub,
      userName: claims.name,
      role: claims.role,
    };

    // ผูก listener ก่อน await ใดๆ — ถ้า client หลุดระหว่างรอ query membership
    // (ยังไม่ถูก addClient) removeClient จะเป็น no-op ปลอดภัย ไม่ผูกทีหลังเพราะ
    // ถ้าหลุดระหว่างรอ query จะไม่มีใครมาถอดทะเบียนออก กลายเป็น client ค้างตลอดไป
    socket.on('close', () => removeClient(client));
    socket.on('error', () => removeClient(client));

    // guest token ผูกกับการประชุมเดียวตอนออก token — เข้าห้องอื่นไม่ได้
    if (claims.role === 'guest') {
      if (claims.meetingId !== meetingId) return socket.close(CLOSE_FORBIDDEN, 'not your meeting');
    } else if (claims.role !== 'admin') {
      const member = await isMeetingMember(meetingId, claims.sub);
      if (!member) return socket.close(CLOSE_FORBIDDEN, 'not a participant');
    }

    // socket อาจถูกปิดไปแล้วระหว่างรอ query ข้างบน — ห้ามลงทะเบียน client ที่ตายแล้ว
    if (socket.readyState !== WebSocket.OPEN) return;

    addClient(client);

    send(socket, {
      type: 'room_joined',
      senderId: 'server',
      senderName: 'server',
      timestamp: Date.now(),
      payload: { userId: client.userId, userName: client.userName, meetingId },
    });

    socket.on('message', async (raw, isBinary) => {
      if (isBinary) {
        return handleAudioFrame(client, Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer));
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      await handleSignal(client, parsed);
    });
  });

  return wss;
}
