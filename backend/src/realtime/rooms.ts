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

// เวลาเริ่มห้อง — จุดอ้างอิงเดียวที่ทุกคนในห้องใช้คำนวณ offset ของคำบรรยาย ถ้าปล่อยให้แต่ละเครื่อง
// ใช้เวลาที่ตัวเองเปิดหน้าเว็บ คนเข้าทีหลังจะได้ offset เล็กกว่าและ transcript เรียงสลับกันมั่ว
//
// ไม่ลบทิ้งตอนห้องว่าง เพราะถ้าทุกคนหลุดพร้อมกันแล้วต่อกลับมา offset จะรีเซ็ตกลับไปใกล้ศูนย์
// ทั้งที่ประชุมเดินหน้าไปแล้ว — เก็บไว้ตามอายุโปรเซส (หนึ่งรายการต่อหนึ่งห้องที่เคยเปิด)
// ponytail: ถ้าต้องรีสตาร์ต backend กลางประชุมแล้วยังอยากได้ offset ต่อเนื่อง ต้องย้ายไปเก็บใน DB
const roomStarts = new Map<string, number>();

/** เวลาที่คนแรกเข้าห้องนี้ (epoch ms) */
export function roomStartedAt(meetingId: string): number {
  return roomStarts.get(meetingId) ?? Date.now();
}

export function addClient(client: RoomClient): void {
  if (!roomStarts.has(client.meetingId)) roomStarts.set(client.meetingId, Date.now());

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
