// ═══════════════════════════════════════════
// Phrase list — บอก ASR ล่วงหน้าว่าจะได้ยินชื่อและศัพท์อะไรในห้องนี้
//
// นี่คือส่วนที่ทำให้ชื่อคนกับศัพท์เฉพาะขององค์กรถอดออกมาถูก ซึ่ง base model
// ของผู้ให้บริการไหนก็ไม่รู้จักมาก่อน
// ═══════════════════════════════════════════

import type { MeetingPayload } from '../repositories/meetings';

// เพดานที่ Azure รับต่อ session — เกินแล้วรายการท้าย ๆ ถูกเมินทั้งชุด ไม่ใช่แค่ส่วนที่เกิน
export const MAX_PHRASES = 300;

function pushClean(out: string[], seen: Set<string>, value: unknown): void {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed || seen.has(trimmed)) return;
  seen.add(trimmed);
  out.push(trimmed);
}

/**
 * เรียงตามความสำคัญ: ชื่อคน > ชื่อคณะ/หน่วยงาน > หัวข้อวาระ > คำอธิบาย
 * เกินเพดานแล้วตัดจากท้าย เพราะชื่อคนผิดคือความผิดพลาดที่คนอ่านรู้สึกแรงที่สุด
 *
 * วาระที่มี secretGroupId ถูกตัดทิ้งเสมอ — วาระลับอยู่ในห้องที่ระดับความลับเป็น
 * normal/restricted ได้ การส่งหัวข้อของมันเข้า phrase list คือการส่งข้อความนั้นออก
 * นอกองค์กรโดยที่ไม่มีใครสั่ง
 */
export function buildPhraseList(meeting: MeetingPayload): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const participants = Array.isArray(meeting.participants) ? meeting.participants : [];
  for (const p of participants) pushClean(out, seen, (p as { name?: unknown })?.name);

  pushClean(out, seen, meeting.committee);
  pushClean(out, seen, meeting.shortName);
  pushClean(out, seen, meeting.title);

  const agenda = Array.isArray(meeting.agenda) ? meeting.agenda : [];
  for (const item of agenda) {
    const entry = item as { title?: unknown; secretGroupId?: unknown };
    if (entry?.secretGroupId) continue;
    pushClean(out, seen, entry?.title);
  }

  pushClean(out, seen, meeting.description);

  return out.slice(0, MAX_PHRASES);
}
