// ═══════════════════════════════════════════
// GET /api/transcription/result?meetingId= — อ่าน transcript ที่สะสมไว้จาก callback
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getTranscript } from "@/lib/transcriptStore";

export async function GET(request: NextRequest) {
  const meetingId = request.nextUrl.searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json({ error: "Missing required query param: meetingId" }, { status: 400 });
  }
  return NextResponse.json(getTranscript(meetingId));
}
