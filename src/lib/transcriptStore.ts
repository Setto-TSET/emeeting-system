// ═══════════════════════════════════════════
// Transcript Store — เก็บผลถอดเสียงชั่วคราวฝั่ง server ต่อ roomKey
//
// ⚠️ In-memory (module-level Map) — อยู่รอดแค่ระหว่าง serverless instance เดียวกันมีชีวิต
// ไม่ persist ข้าม deploy/restart หรือข้าม instance คนละตัว ถ้าต้องการ sync ข้ามเครื่อง/ถาวร
// ต้องมี DB จริง (out of scope รอบนี้ — ดู docs/superpowers/specs/2026-08-18-zegocloud-asr-summary-design.md)
// ═══════════════════════════════════════════

import type { MeetingTranscript, TranscriptSegment, TranscriptStatus } from "@/services/transcription/types";

type StoreEntry = {
  status: TranscriptStatus;
  language: string;
  segments: TranscriptSegment[];
  taskId: string | null;
};

const store = new Map<string, StoreEntry>();

export function initTranscript(roomKey: string, taskId: string): void {
  store.set(roomKey, { status: "processing", language: "th", segments: [], taskId });
}

export function appendSegments(roomKey: string, segments: TranscriptSegment[]): void {
  const entry = store.get(roomKey);
  if (!entry) {
    store.set(roomKey, { status: "processing", language: "th", segments: [...segments], taskId: null });
    return;
  }
  entry.segments.push(...segments);
}

export function markReady(roomKey: string): void {
  const entry = store.get(roomKey);
  if (entry) entry.status = "ready";
}

export function markFailed(roomKey: string): void {
  const entry = store.get(roomKey);
  if (entry) entry.status = "failed";
  else store.set(roomKey, { status: "failed", language: "th", segments: [], taskId: null });
}

// หมายเหตุ: field `meetingId` ของ MeetingTranscript บรรจุค่า roomKey (conferenceRoomKey ?? meeting.id)
// ตามชื่อ field เดิมใน type contract — store เก็บด้วย roomKey เท่านั้น
export function getTranscript(roomKey: string): MeetingTranscript {
  const entry = store.get(roomKey);
  if (!entry) return { meetingId: roomKey, status: "none", language: "th", segments: [] };
  return { meetingId: roomKey, status: entry.status, language: entry.language, segments: entry.segments };
}

export function getTaskId(roomKey: string): string | null {
  return store.get(roomKey)?.taskId ?? null;
}
