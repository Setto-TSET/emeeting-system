// src/services/transcript/store.ts
//
// เดิมแต่ละเครื่องบันทึก transcript สำเนาของตัวเองลง IndexedDB จึงได้ไม่ครบ
// ตอนนี้ server บันทึกจาก ASR ฝั่ง server เอง — ฝั่ง client อ่านอย่างเดียว

import { apiFetch } from "@/services/api/client";

export type TranscriptSegment = {
  speakerId: string;
  speakerName: string;
  startSec: number;
  text: string;
};

type RoomStateResponse = { transcript: TranscriptSegment[] };

/** โยน error ต่อให้ผู้เรียกแสดงผล — เดิมกลืนแล้วคืน [] ทำให้ขึ้นว่า "ยังไม่มีบทถอด" ทั้งที่โหลดไม่สำเร็จ */
export async function getTranscript(meetingId: string): Promise<TranscriptSegment[]> {
  const state = await apiFetch<RoomStateResponse>(`/api/rooms/${encodeURIComponent(meetingId)}/state`);
  return state.transcript ?? [];
}
