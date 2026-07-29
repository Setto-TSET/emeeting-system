// ═══════════════════════════════════════════
// Transcription Service — สัญญาของ "ตัวถอดเสียงเป็นข้อความ"
//
// จะมี implementation 2 ทางในอนาคต (ตัดสินหลังทดสอบภาษาไทย - Phase A):
//   - webex.ts     : ดึง transcript ที่ Webex ถอดให้ ผ่าน Transcript API
//   - assemblyai.ts: ส่งไฟล์เสียงเข้า STT ที่ไทยดีสุด แล้วถอดเอง
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
 * สัญญากลาง — หน้าจอ/ท่อสรุปเรียกผ่านนี้ ไม่ต้องรู้ว่าเสียงมาจาก Webex หรือ STT ของเรา
 */
export type TranscriptionProvider = {
  id: "webex" | "assemblyai" | "azure" | "mock";
  /** ดึง/สร้าง transcript ของการประชุม (หลังประชุมจบ) */
  getTranscript(meetingId: string): Promise<MeetingTranscript>;
};
