// src/services/rooms/snapshot.ts
//
// คนที่เข้าห้องทีหลังต้องได้สถานะปัจจุบันทั้งก้อนก่อน แล้วค่อยฟังสัญญาณต่อ
// ไม่งั้นจะไม่เห็นโหวต/มือที่ยกอยู่/เอกสารที่แชร์ค้างไว้ก่อนหน้า

import { apiFetch } from "@/services/api/client";
import type { VoteTopicDto, RaisedHandDto, DocShareDto } from "@/services/signaling/types";
import type { TranscriptSegment } from "@/services/transcript/store";

export type RoomSnapshot = {
  voteTopics: VoteTopicDto[];
  raisedHands: RaisedHandDto[];
  transcript: TranscriptSegment[];
  docShare: DocShareDto | null;
};

export const EMPTY_SNAPSHOT: RoomSnapshot = {
  voteTopics: [],
  raisedHands: [],
  transcript: [],
  docShare: null,
};

export async function fetchRoomSnapshot(meetingId: string): Promise<RoomSnapshot> {
  try {
    const state = await apiFetch<RoomSnapshot>(`/api/rooms/${encodeURIComponent(meetingId)}/state`);
    return {
      voteTopics: state.voteTopics ?? [],
      raisedHands: state.raisedHands ?? [],
      transcript: state.transcript ?? [],
      docShare: state.docShare ?? null,
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}
