// src/services/voting/store.ts
//
// เดิมเก็บโหวตใน IndexedDB ของแต่ละเครื่อง — เครื่องอื่นจึงไม่มีทางเห็นผลโหวตของกัน
// ตอนนี้ server เป็นเจ้าของข้อมูล: อ่านผ่าน snapshot, เขียนผ่าน WebSocket
// (การเขียนไม่ได้อยู่ในไฟล์นี้แล้ว — VotePanel เรียก broadcast() ตรงๆ)

import { apiFetch } from "@/services/api/client";
import type { VoteTopic } from "./types";

type RoomStateResponse = { voteTopics: VoteTopic[] };

export async function listTopics(meetingId: string): Promise<VoteTopic[]> {
  try {
    const state = await apiFetch<RoomStateResponse>(`/api/rooms/${encodeURIComponent(meetingId)}/state`);
    return state.voteTopics ?? [];
  } catch {
    // ห้องต้องเปิดได้แม้ backend ล่ม — ผู้ใช้จะเห็นรายการว่างแทนที่จะเจอหน้าพัง
    return [];
  }
}
