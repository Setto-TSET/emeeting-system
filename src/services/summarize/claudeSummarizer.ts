// ═══════════════════════════════════════════
// Claude Summarizer — client-side, implements Summarizer, เรียก /api/summarize
// ═══════════════════════════════════════════

import type { Summarizer, MeetingSummary, AgendaWindow } from "./types";
import type { MeetingTranscript } from "@/services/transcription/types";

export const claudeSummarizer: Summarizer = {
  id: "claude",
  async summarizeByAgenda(
    transcript: MeetingTranscript,
    windows: AgendaWindow[]
  ): Promise<MeetingSummary> {
    const res = await fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, windows }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        typeof body?.error === "string" ? body.error : `สรุปประชุมไม่สำเร็จ: HTTP ${res.status}`
      );
    }
    return (await res.json()) as MeetingSummary;
  },
};
