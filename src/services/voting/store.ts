// src/services/voting/store.ts
//
// เดิมเก็บโหวตใน IndexedDB ของแต่ละเครื่อง — เครื่องอื่นจึงไม่มีทางเห็นผลโหวตของกัน
// ตอนนี้ server เป็นเจ้าของข้อมูล: อ่านผ่าน snapshot, เขียนผ่าน WebSocket
// (การเขียนไม่ได้อยู่ในไฟล์นี้แล้ว — VotePanel เรียก broadcast() ตรงๆ)

import { apiFetch } from "@/services/api/client";
import type { VoteTopic } from "./types";

type RoomStateResponse = { voteTopics: VoteTopic[] };

/** โยน error ต่อให้ผู้เรียก — เดิมกลืนแล้วคืน [] ทำให้หน้าโหวตขึ้นว่า "ยังไม่มีโหวต" ทั้งที่โหลดไม่สำเร็จ */
export async function listTopics(meetingId: string): Promise<VoteTopic[]> {
  const state = await apiFetch<RoomStateResponse>(`/api/rooms/${encodeURIComponent(meetingId)}/state`);
  return state.voteTopics ?? [];
}
