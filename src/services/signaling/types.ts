// src/services/signaling/types.ts
//
// สัญญาณแบ่งเป็นสองทาง:
//   client → server: hand_raise, hand_lower, vote_create, vote_cast, vote_close,
//                    subtitle_text, doc_share, doc_share_page, doc_share_stop
//   server → client: room_joined, signal_error, vote_state, hand_state,
//                    doc_share_state, subtitle_text
// server เป็นคนตัดสินสถานะจริงเสมอ — client ส่ง "เจตนา" ไป ไม่ได้ส่ง "ผลลัพธ์"

export type SignalType =
  | "hand_raise"
  | "hand_lower"
  | "vote_create"
  | "vote_cast"
  | "vote_close"
  | "subtitle_text"
  | "doc_share"
  | "doc_share_page"
  | "doc_share_stop"
  | "room_joined"
  | "signal_error"
  | "vote_state"
  | "hand_state"
  | "doc_share_state";

export type VoteOptionDto = { id: string; label: string };
export type VoteRecordDto = { userId: string; userName: string; optionId: string; timestamp: number };
export type VoteTopicDto = {
  id: string;
  meetingId: string;
  title: string;
  description?: string;
  options: VoteOptionDto[];
  createdBy: string;
  createdByName: string;
  createdAt: number;
  status: "open" | "closed";
  votes: VoteRecordDto[];
};
export type RaisedHandDto = { userId: string; userName: string; raisedAt: number };
export type DocShareDto = {
  fileId: string;
  fileName: string;
  page: number;
  sharedBy: string;
  sharedName: string;
};

export type RoomSignal<T extends SignalType = SignalType> = {
  type: T;
  senderId: string;
  senderName: string;
  timestamp: number;
  payload: SignalPayloadMap[T];
};

export interface SignalPayloadMap {
  hand_raise: { raised: boolean };
  hand_lower: { targetUserId: string };
  vote_create: { title: string; description?: string; options: VoteOptionDto[] };
  vote_cast: { topicId: string; optionId: string };
  vote_close: { topicId: string };
  subtitle_text: { text: string; isFinal: boolean; lang: string; startSec?: number };
  doc_share: { fileId: string; fileName: string };
  doc_share_page: { fileId: string; page: number };
  doc_share_stop: Record<string, never>;
  // serverTime/roomStartedAt ใช้ตั้งจุดอ้างอิงเวลาของคำบรรยายให้ทุกคนในห้องตรงกัน
  // (ดู src/services/speech/audioCapture.ts) โดยไม่ต้องพึ่งนาฬิกาของเครื่องผู้ใช้
  room_joined: {
    userId: string;
    userName: string;
    meetingId: string;
    serverTime: number;
    roomStartedAt: number;
  };
  signal_error: { reason: string };
  vote_state: { topic: VoteTopicDto };
  // lastAction: ใครเป็นคนทำให้เกิดการเปลี่ยนแปลงล่าสุด (ใครลด/ยกมือให้ใคร) — optional เพราะฝั่ง
  // server ยังไม่ส่งมาวันนี้ (ดู Task 7) client ใช้ field นี้เพื่อรู้ "ใครทำ" แทนการเดาจาก diff
  // ของ raised list เอง (เดาไม่ได้แน่นอน เพราะ payload เหมือนกันไม่ว่าใครเป็นคนลด)
  hand_state: { raised: RaisedHandDto[]; lastAction?: { userId: string; byUserId: string } };
  doc_share_state: { share: DocShareDto | null };
}
