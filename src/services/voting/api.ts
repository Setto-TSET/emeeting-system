// ═══════════════════════════════════════════
// Voting — client ที่คุยกับ API ฝั่ง server
//
// แทนที่ store เดิมที่เก็บผลโหวตไว้ใน IndexedDB ของเครื่องใครเครื่องมัน
// ทุกฟังก์ชันคืน VoteTopic รูปแบบเดิมเป๊ะ component จึงไม่ต้องรู้ว่าข้อมูลมาจากไหน
// ═══════════════════════════════════════════

import { apiCall, ApiClientError } from "@/lib/api/client";
import type { VoteTopic } from "./types";

export { ApiClientError as VoteApiError };

export async function listTopics(meetingId: string): Promise<VoteTopic[]> {
  const data = await apiCall<{ topics: VoteTopic[] }>(`/api/meetings/${meetingId}/votes`);
  return data.topics;
}

export async function createTopic(
  meetingId: string,
  draft: { title: string; description?: string; options: string[] }
): Promise<VoteTopic> {
  const data = await apiCall<{ topic: VoteTopic }>(`/api/meetings/${meetingId}/votes`, {
    method: "POST",
    body: JSON.stringify(draft),
  });
  return data.topic;
}

export async function castVote(
  meetingId: string,
  topicId: string,
  optionId: string
): Promise<VoteTopic> {
  const data = await apiCall<{ topic: VoteTopic }>(
    `/api/meetings/${meetingId}/votes/${topicId}/cast`,
    { method: "POST", body: JSON.stringify({ optionId }) }
  );
  return data.topic;
}

export async function closeTopic(meetingId: string, topicId: string): Promise<VoteTopic> {
  const data = await apiCall<{ topic: VoteTopic }>(
    `/api/meetings/${meetingId}/votes/${topicId}/close`,
    { method: "POST" }
  );
  return data.topic;
}

/** ดึงหัวข้อเดียว — ใช้ตอนได้รับสัญญาณ vote_create เพื่อเอาชื่อหัวข้อมาขึ้น toast */
export async function getTopic(meetingId: string, topicId: string): Promise<VoteTopic | null> {
  const topics = await listTopics(meetingId).catch(() => [] as VoteTopic[]);
  return topics.find((t) => t.id === topicId) ?? null;
}
