// src/services/signaling/types.ts

export type SignalType =
  | "hand_raise"
  | "hand_lower"
  | "vote_create"
  | "vote_cast"
  | "vote_close"
  | "subtitle_text"
  | "doc_share"
  | "doc_share_page"
  | "doc_share_stop";

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
  vote_create: { topicId: string };
  vote_cast: { topicId: string; optionId: string };
  vote_close: { topicId: string };
  subtitle_text: { text: string; isFinal: boolean; lang: string };
  doc_share: { fileId: string; fileName: string };
  doc_share_page: { fileId: string; page: number };
  doc_share_stop: Record<string, never>;
}
