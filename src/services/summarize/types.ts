// ═══════════════════════════════════════════
// Summarize Service — สัญญาของ "ตัวสรุปประชุมจาก transcript"
//
// จุดแข็งเหนือเครื่องมือทั่วไป: หั่น transcript ตามวาระด้วย activeAgendaId
// ที่โฮสต์กดไว้แล้ว → สรุปทีละวาระ ไม่ใช่ก้อนเดียว
//
// ⚠️ สัญญาล้วน ยังไม่มี implementation — รอ transcript จริงจาก Phase C
//    กฎเหล็ก: ผลสรุปเป็น "ร่าง" เสมอ คนต้องแก้และรับรอง ห้าม AI รับรองเอง
// ═══════════════════════════════════════════

import type { MeetingTranscript } from "@/services/transcription/types";

/** สรุปของวาระหนึ่ง */
export type AgendaSummary = {
  agendaId: string;
  /** สรุปการอภิปราย */
  discussion: string;
  /** มติที่ประชุม */
  resolutions: string[];
  /** ข้อสั่งการ + ผู้รับผิดชอบ */
  actionItems: { text: string; ownerName?: string }[];
};

export type MeetingSummary = {
  meetingId: string;
  /** ต้องเป็นร่างเสมอ — เลขาฯ แก้แล้วค่อยเปลี่ยนเป็น report_final */
  isDraft: true;
  byAgenda: AgendaSummary[];
  /** สรุปภาพรวมทั้งประชุม */
  overall: string;
};

/**
 * agendaWindows: ช่วงเวลาของแต่ละวาระ (วินาที) — ได้จากประวัติการกด activeAgendaId
 * ทำให้ตัดสรุปตรงวาระได้ ไม่ต้องเดา
 */
export type AgendaWindow = { agendaId: string; startSec: number; endSec: number };

export type Summarizer = {
  id: "llm" | "webex_ai" | "mock";
  summarizeByAgenda(
    transcript: MeetingTranscript,
    windows: AgendaWindow[]
  ): Promise<MeetingSummary>;
};
