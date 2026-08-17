// src/services/voting/types.ts
//
// รูปร่างของข้อมูลโหวตมาจาก server แล้ว — นิยามไว้ที่ signaling/types.ts จุดเดียว
// ไฟล์นี้เหลือไว้เพื่อไม่ให้ import เดิมของคอมโพเนนต์พัง

export type {
  VoteOptionDto as VoteOption,
  VoteRecordDto as VoteRecord,
  VoteTopicDto as VoteTopic,
} from "@/services/signaling/types";
