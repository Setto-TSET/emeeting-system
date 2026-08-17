// ═══════════════════════════════════════════
// Room Registry — ใครต่ออยู่ห้องไหน (in-memory เท่านั้น)
// ไม่มี business logic ในไฟล์นี้
// ═══════════════════════════════════════════

import type { WebSocket } from 'ws';

export type RoomClient = {
  socket: WebSocket;
  meetingId: string;
  userId: string;
  userName: string;
  role: string;
};

const rooms = new Map<string, Set<RoomClient>>();

export function addClient(client: RoomClient): void {
  let set = rooms.get(client.meetingId);
  if (!set) {
    set = new Set();
    rooms.set(client.meetingId, set);
  }
  set.add(client);
}

export function removeClient(client: RoomClient): void {
  const set = rooms.get(client.meetingId);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) rooms.delete(client.meetingId);
}

export function clientsIn(meetingId: string): RoomClient[] {
  return Array.from(rooms.get(meetingId) ?? []);
}
