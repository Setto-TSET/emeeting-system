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
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (socket, request) => {
    const url = new URL(request.url ?? '', 'http://localhost');
    const meetingId = url.searchParams.get('meetingId');
    const token = url.searchParams.get('token');

    if (!meetingId) return socket.close(CLOSE_BAD_REQUEST, 'meetingId required');
    if (!token) return socket.close(CLOSE_UNAUTHORIZED, 'token required');

    const claims = verifyAccessToken(token);
    if (!claims) return socket.close(CLOSE_UNAUTHORIZED, 'invalid token');

    // guest token ผูกกับการประชุมเดียวตอนออก token — เข้าห้องอื่นไม่ได้
    if (claims.role === 'guest') {
      if (claims.meetingId !== meetingId) return socket.close(CLOSE_FORBIDDEN, 'not your meeting');
    } else if (claims.role !== 'admin') {
      const member = await isMeetingMember(meetingId, claims.sub);
      if (!member) return socket.close(CLOSE_FORBIDDEN, 'not a participant');
    }

    const client: RoomClient = {
      socket,
      meetingId,
      userId: claims.sub,
      userName: claims.name,
      role: claims.role,
    };
    addClient(client);

    send(socket, {
      type: 'room_joined',
      senderId: 'server',
      senderName: 'server',
      timestamp: Date.now(),
      payload: { userId: client.userId, userName: client.userName, meetingId },
    });

    socket.on('message', async (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      await handleSignal(client, parsed);
    });

    socket.on('close', () => removeClient(client));
    socket.on('error', () => removeClient(client));
  });

  return wss;
}
