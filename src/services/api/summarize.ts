// ═══════════════════════════════════════════
// Summarize API — ร่างรายงานสรุปการประชุมโดย Claude
//
// ส่งแค่ meetingId — server อ่านบันทึกคำพูดที่เก็บไว้ระหว่างประชุมเอง
// หน้าเว็บไม่ได้ถือ transcript ทั้งประชุม และไม่ควรเป็นคนบอกว่าในห้องพูดอะไรกัน
// ═══════════════════════════════════════════

import type { MeetingSummary } from "@/services/summarize/types";
import { apiFetch } from "./client";

export async function summarizeMeeting(meetingId: string): Promise<MeetingSummary> {
  const { summary } = await apiFetch<{ summary: MeetingSummary }>("/api/summarize", {
    method: "POST",
    body: JSON.stringify({ meetingId }),
  });
  return summary;
}
