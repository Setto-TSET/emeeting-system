// ═══════════════════════════════════════════
// Transcript Store — เก็บผลถอดเสียงชั่วคราวฝั่ง server ต่อ meetingId
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

export function initTranscript(meetingId: string, taskId: string): void {
  store.set(meetingId, { status: "processing", language: "th", segments: [], taskId });
}

export function appendSegments(meetingId: string, segments: TranscriptSegment[]): void {
  const entry = store.get(meetingId);
  if (!entry) {
    store.set(meetingId, { status: "processing", language: "th", segments: [...segments], taskId: null });
    return;
  }
  entry.segments.push(...segments);
}

export function markReady(meetingId: string): void {
  const entry = store.get(meetingId);
  if (entry) entry.status = "ready";
}

export function markFailed(meetingId: string): void {
  const entry = store.get(meetingId);
  if (entry) entry.status = "failed";
  else store.set(meetingId, { status: "failed", language: "th", segments: [], taskId: null });
}

export function getTranscript(meetingId: string): MeetingTranscript {
  const entry = store.get(meetingId);
  if (!entry) return { meetingId, status: "none", language: "th", segments: [] };
  return { meetingId, status: entry.status, language: entry.language, segments: entry.segments };
}

export function getTaskId(meetingId: string): string | null {
  return store.get(meetingId)?.taskId ?? null;
}
