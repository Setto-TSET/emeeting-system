// src/services/transcript/store.ts
//
// เดิมแต่ละเครื่องบันทึก transcript สำเนาของตัวเองลง IndexedDB จึงได้ไม่ครบ
// ตอนนี้ server บันทึกให้ตอนได้รับ subtitle_text ที่ isFinal — ฝั่ง client อ่านอย่างเดียว

import { apiFetch } from "@/services/api/client";

export type TranscriptSegment = {
  speakerId: string;
  speakerName: string;
  startSec: number;
  text: string;
};

type RoomStateResponse = { transcript: TranscriptSegment[] };

export async function getTranscript(meetingId: string): Promise<TranscriptSegment[]> {
  try {
    const state = await apiFetch<RoomStateResponse>(`/api/rooms/${encodeURIComponent(meetingId)}/state`);
    return state.transcript ?? [];
  } catch {
    return [];
  }
}
