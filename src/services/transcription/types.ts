// ═══════════════════════════════════════════
// Transcription Service — สัญญาของ "ตัวถอดเสียงเป็นข้อความ"
//
// implementation ในอนาคต (ตัดสินหลังทดสอบภาษาไทย - Phase A):
//   - assemblyai.ts: ส่งไฟล์เสียงเข้า STT ที่ไทยดีสุด แล้วถอดเอง
//   - azure.ts     : Azure Speech-to-Text
//
// ⚠️ ไฟล์นี้เป็นสัญญาล้วน ยังไม่มี implementation — รอผลทดสอบไทยและ backend
// ═══════════════════════════════════════════

/** หนึ่งช่วงคำพูด — ใครพูด ช่วงเวลาไหน ว่าอะไร */
export type TranscriptSegment = {
  /** id ผู้พูดในระบบเรา — null = ระบุตัวไม่ได้ (เช่นแขกที่ไม่มีบัญชี) */
  speakerId: string | null;
  /** ชื่อที่แสดง — มาจาก roster ของเรา ไม่ใช่ให้ AI เดาเสียง */
  speakerName: string;
  /** วินาทีนับจากเริ่มประชุม — ใช้จับคู่กับช่วงเวลาของแต่ละวาระ */
  startSec: number;
  endSec: number;
  text: string;
};

export type TranscriptStatus = "none" | "processing" | "ready" | "failed";

export type MeetingTranscript = {
  meetingId: string;
  status: TranscriptStatus;
  language: string;              // เช่น "th"
  segments: TranscriptSegment[];
};

/**
 * สัญญากลาง — หน้าจอ/ท่อสรุปเรียกผ่านนี้ ไม่ต้องรู้ว่าใครเป็นคนถอดเสียง
 */
export type TranscriptionProvider = {
  id: "assemblyai" | "azure" | "mock";
  /** ดึง/สร้าง transcript ของการประชุม (หลังประชุมจบ) */
  getTranscript(meetingId: string): Promise<MeetingTranscript>;
};
