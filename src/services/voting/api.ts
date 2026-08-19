// ═══════════════════════════════════════════
// Voting — client ที่คุยกับ API ฝั่ง server
//
// แทนที่ src/services/voting/store.ts (IndexedDB) ซึ่งเก็บผลโหวตไว้ในเครื่องใครเครื่องมัน
// ทุกฟังก์ชันคืน VoteTopic รูปแบบเดิมเป๊ะ component จึงไม่ต้องรู้ว่าข้อมูลมาจากไหน
// ═══════════════════════════════════════════

import { authHeaders } from "@/lib/session";
import type { VoteTopic } from "./types";

/** error ที่รู้ status — ให้ผู้เรียกแยกได้ว่าเป็น 401 (ยังไม่ล็อกอิน) หรือ 403 (ไม่มีสิทธิ์) */
export class VoteApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...authHeaders(), ...init?.headers },
    });
  } catch {
    throw new VoteApiError(0, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  }

  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new VoteApiError(response.status, data?.error ?? "เรียกข้อมูลโหวตไม่สำเร็จ");
  }
  return data as T;
}

export async function listTopics(meetingId: string): Promise<VoteTopic[]> {
  const data = await call<{ topics: VoteTopic[] }>(`/api/meetings/${meetingId}/votes`);
  return data.topics;
}

export async function createTopic(
  meetingId: string,
  draft: { title: string; description?: string; options: string[] }
): Promise<VoteTopic> {
  const data = await call<{ topic: VoteTopic }>(`/api/meetings/${meetingId}/votes`, {
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
  const data = await call<{ topic: VoteTopic }>(
    `/api/meetings/${meetingId}/votes/${topicId}/cast`,
    { method: "POST", body: JSON.stringify({ optionId }) }
  );
  return data.topic;
}

export async function closeTopic(meetingId: string, topicId: string): Promise<VoteTopic> {
  const data = await call<{ topic: VoteTopic }>(
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
