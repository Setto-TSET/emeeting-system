// ═══════════════════════════════════════════
// Mock Summarizer — สรุปประชุมจาก transcript จำลอง
// วันมี LLM API (OpenAI/Claude/Gemini) หรือ Webex AI Assistant
// สร้าง llmSummarizer.ts / webexAiSummarizer.ts แทน
// ═══════════════════════════════════════════

import type { Summarizer, MeetingSummary, AgendaSummary, AgendaWindow } from "./types";
import type { MeetingTranscript, TranscriptSegment } from "@/services/transcription/types";

const mockResolutions = [
  "ที่ประชุมมีมติเห็นชอบตามที่เสนอด้วยเอกฉันท์",
  "อนุมัติในหลักการ มอบหมายให้ดำเนินการตามแผน",
  "รับทราบและให้จัดทำรายงานผลการดำเนินงานในการประชุมครั้งหน้า",
];

const mockActionItems = [
  { text: "จัดทำรายงานสรุปผลการดำเนินงานภายใน 15 วัน" },
  { text: "ประสานงานหน่วยงานที่เกี่ยวข้องเพื่อดำเนินการตามมติ" },
  { text: "รายงานความคืบหน้าในการประชุมครั้งถัดไป" },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function segmentsInWindow(
  segments: TranscriptSegment[],
  window: AgendaWindow
): TranscriptSegment[] {
  return segments.filter(s => s.startSec >= window.startSec && s.endSec <= window.endSec);
}

function discussionFromSegments(segments: TranscriptSegment[]): string {
  if (segments.length === 0) return "ที่ประชุมพิจารณาและอภิปรายในประเด็นที่เกี่ยวข้อง";
  // รวมข้อความทุก segment แล้วตัดให้สั้น
  const texts = segments.map(s => s.text).join(" ");
  return texts.length > 300 ? texts.slice(0, 297) + "..." : texts;
}

export const mockSummarizer: Summarizer = {
  id: "mock",
  async summarizeByAgenda(
    transcript: MeetingTranscript,
    windows: AgendaWindow[]
  ): Promise<MeetingSummary> {
    await new Promise(r => setTimeout(r, 1000));

    const byAgenda: AgendaSummary[] = windows.map((w, i) => {
      const segs = segmentsInWindow(transcript.segments, w);
      return {
        agendaId: w.agendaId,
        discussion: discussionFromSegments(segs) ||
          `วาระที่ ${i + 1}: ที่ประชุมได้พิจารณาและอภิปรายรายละเอียดตามที่เสนอ`,
        resolutions: [pick(mockResolutions)],
        actionItems: [
          { ...mockActionItems[i % mockActionItems.length] },
        ],
      };
    });

    // ถ้าไม่มี windows (ยังไม่มี activeAgendaId history) สร้าง summary ระดับภาพรวม
    if (byAgenda.length === 0) {
      return {
        meetingId: transcript.meetingId,
        isDraft: true,
        byAgenda: [],
        overall:
          "ที่ประชุมได้พิจารณาวาระต่างๆ ครบถ้วนแล้ว มีมติและข้อสั่งการตามที่บันทึกไว้ในรายงานการประชุม " +
          "ขอให้เลขานุการตรวจสอบความถูกต้องก่อนนำเสนอที่ประชุมรับรอง",
      };
    }

    const overallParts = byAgenda.map((a, i) =>
      `วาระที่ ${i + 1}: ${a.resolutions[0] || "รับทราบ"}`
    );

    return {
      meetingId: transcript.meetingId,
      isDraft: true,
      byAgenda,
      overall:
        `สรุปผลการประชุม: ${overallParts.join(" · ")} ` +
        "ขอให้เลขานุการตรวจทานและแก้ไขก่อนนำเสนอที่ประชุมรับรอง",
    };
  },
};
