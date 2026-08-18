// ═══════════════════════════════════════════
// Transcription Service — สัญญาของ "ตัวถอดเสียงเป็นข้อความ"
//
// ตอนนี้ใช้ Web Speech API ฝั่ง client จริงแล้ว (src/services/speech/webSpeechProvider.ts
// + src/services/transcript/store.ts) — ไฟล์นี้เป็นสัญญาเก่าสำหรับ post-meeting transcript
// pipeline ที่ยังเป็น mock อยู่ (assemblyai/azure เป็นตัวเลือกในอนาคตถ้าต้องการความแม่นยำสูงขึ้น)
//
// Webex ถูกตัดออกจากตัวเลือกแล้ว — ไม่มี license/backend และไม่ได้ใช้ ZegoCloud ทำ transcript
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
 * สัญญากลาง — หน้าจอ/ท่อสรุปเรียกผ่านนี้ ไม่ต้องรู้ว่าเสียงมาจาก STT ไหน
 */
export type TranscriptionProvider = {
  id: "web_speech" | "assemblyai" | "azure" | "mock" | "zego_asr";
  /** ดึง/สร้าง transcript ของการประชุม (หลังประชุมจบ) */
  getTranscript(meetingId: string): Promise<MeetingTranscript>;
};
