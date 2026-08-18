// ═══════════════════════════════════════════
// POST /api/summarize — สรุปประชุมด้วย Claude API
// windows ว่าง = ยังไม่มี agenda-change history (out of scope รอบนี้) → สรุปภาพรวมอย่างเดียว
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import type { MeetingTranscript } from "@/services/transcription/types";
import type { AgendaWindow, AgendaSummary, MeetingSummary } from "@/services/summarize/types";
import {
  segmentsInWindow,
  transcriptToText,
  buildOverallPrompt,
  buildAgendaPrompt,
  parseAgendaJson,
  callClaude,
} from "@/lib/claudeSummarize";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้งค่า CLAUDE_API_KEY ใน .env.local — ไม่มี mock ให้ fallback" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const transcript = body?.transcript as MeetingTranscript | undefined;
  if (!transcript) {
    return NextResponse.json({ error: "Missing required field: transcript" }, { status: 400 });
  }
  // เช็ค shape ให้ลึกพอ — ถ้า segments ไม่ใช่ array จะไปพังที่ .map() แล้วโผล่ error ที่อ่านไม่รู้เรื่อง
  if (!Array.isArray(transcript?.segments)) {
    return NextResponse.json(
      { error: "Missing/invalid field: transcript.segments" },
      { status: 400 }
    );
  }
  const windows = (body?.windows ?? []) as AgendaWindow[];

  try {
    if (windows.length === 0) {
      const raw = await callClaude(apiKey, buildOverallPrompt(transcriptToText(transcript.segments)));
      const summary: MeetingSummary = {
        meetingId: transcript.meetingId,
        isDraft: true,
        byAgenda: [],
        overall: raw.trim(),
      };
      return NextResponse.json(summary);
    }

    const byAgenda: AgendaSummary[] = [];
    for (const w of windows) {
      const segs = segmentsInWindow(transcript.segments, w);
      const raw = await callClaude(apiKey, buildAgendaPrompt(transcriptToText(segs)));
      byAgenda.push(parseAgendaJson(w.agendaId, raw));
    }

    const overallLine = byAgenda.map((a) => a.resolutions[0] ?? "รับทราบ").join(" · ");
    const summary: MeetingSummary = {
      meetingId: transcript.meetingId,
      isDraft: true,
      byAgenda,
      overall: `สรุปผลการประชุม: ${overallLine}`,
    };
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[/api/summarize] failed:", error);
    const detail = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: `สรุปประชุมไม่สำเร็จ: ${detail}` }, { status: 500 });
  }
}
