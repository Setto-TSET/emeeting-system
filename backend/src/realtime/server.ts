// ═══════════════════════════════════════════
// WebSocket Server — แทน BroadcastChannel ที่คุยข้ามเครื่องไม่ได้
//
// ตัวตนผู้ส่งมาจาก JWT เท่านั้น payload ที่ client ส่งมาไม่มีสิทธิ์บอกว่าตัวเองเป็นใคร
// ═══════════════════════════════════════════

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAccessToken } from '../services/auth';
import { getMeeting } from '../repositories/meetings';
import { actorFrom, canEditMeeting, canViewMeeting } from '../services/meetingAccess';
import { addClient, removeClient, clientsIn, roomStartedAt, RoomClient } from './rooms';
import { handleSignal, broadcastRoomState } from './handlers';
import { handleAudioFrame, forgetSpeaker } from './audio';

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
      canManage: false,
    };

    // ผูก listener ก่อน await ใดๆ — ถ้า client หลุดระหว่างรอ query membership
    // (ยังไม่ถูก addClient) removeClient จะเป็น no-op ปลอดภัย ไม่ผูกทีหลังเพราะ
    // ถ้าหลุดระหว่างรอ query จะไม่มีใครมาถอดทะเบียนออก กลายเป็น client ค้างตลอดไป
    socket.on('close', () => {
      removeClient(client);
      forgetSpeaker(client);
      // คนที่เหลือในห้องต้องเห็นว่าใครออกไปแล้ว — รายชื่อ "ในสาย" มาจากคนที่ต่ออยู่จริง ไม่ได้มาจาก DB
      broadcastRoomState(meetingId).catch((error) => console.error('[realtime] room_state ไม่สำเร็จ', error));
    });
    socket.on('error', () => {
      removeClient(client);
      forgetSpeaker(client);
    });

    // กฎเดียวกับ REST (canViewMeeting) — แขกผูกห้องเดียว, จอหน้าห้องเห็นเฉพาะห้องตัวเอง
    const meeting = await getMeeting(meetingId);
    const actor = actorFrom({ id: claims.sub, role: claims.role, name: claims.name, meetingId: claims.meetingId });
    if (!meeting || !canViewMeeting(actor, meeting)) return socket.close(CLOSE_FORBIDDEN, 'not a participant');
    // กฎเดียวกับการแก้การประชุมผ่าน REST — ผู้จัด ผู้รับมอบสิทธิ์ผู้จัดการ และ admin
    client.canManage = canEditMeeting(actor, meeting);

    // socket อาจถูกปิดไปแล้วระหว่างรอ query ข้างบน — ห้ามลงทะเบียน client ที่ตายแล้ว
    if (socket.readyState !== WebSocket.OPEN) return;

    addClient(client);

    send(socket, {
      type: 'room_joined',
      senderId: 'server',
      senderName: 'server',
      timestamp: Date.now(),
      // serverTime กับ roomStartedAt ไปด้วยกันเสมอ client เอาผลต่างมาตั้งจุดอ้างอิงของตัวเอง
      // จึงไม่ต้องให้นาฬิกาของเครื่องผู้ใช้ตรงกับของ server
      payload: {
        userId: client.userId,
        userName: client.userName,
        meetingId,
        serverTime: Date.now(),
        roomStartedAt: roomStartedAt(meetingId),
      },
    });
    broadcastRoomState(meetingId).catch((error) => console.error('[realtime] room_state ไม่สำเร็จ', error));

    socket.on('message', async (raw, isBinary) => {
      // ไม่มีใคร await listener ตัวนี้ ถ้าปล่อยให้ reject หลุดออกไป Node 20 จะจบโปรเซสทิ้ง
      // (ค่าเริ่มต้นของ --unhandled-rejections คือ throw) แล้วทุกห้องประชุมหลุดพร้อมกัน
      // เพราะ DB สะดุดครั้งเดียว จับไว้ตรงนี้ที่เดียวคุมได้ทั้งเส้นเสียงและเส้นสัญญาณ JSON
      try {
        if (isBinary) {
          await handleAudioFrame(client, Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer));
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw.toString());
        } catch {
          return;
        }
        await handleSignal(client, parsed);
      } catch (error) {
        console.error('[realtime] จัดการข้อความจาก client ไม่สำเร็จ', {
          meetingId: client.meetingId,
          userId: client.userId,
          isBinary,
          error,
        });
      }
    });
  });

  return wss;
}
