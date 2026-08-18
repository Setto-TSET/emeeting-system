// ═══════════════════════════════════════════
// GET /api/transcription/result?roomKey= — อ่าน transcript ที่สะสมไว้จาก callback
//
// คีย์เป็น roomKey (= conferenceRoomKey ?? meeting.id) ให้ตรงกับ callback ที่เขียนด้วย body.RoomId
// ผลพลอยได้: roomKey เดาไม่ได้เหมือน meeting.id ที่ enumerate ได้ — ลดโอกาสดูด transcript ของห้องคนอื่น
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getTranscript } from "@/lib/transcriptStore";

export async function GET(request: NextRequest) {
  const roomKey = request.nextUrl.searchParams.get("roomKey");
  if (!roomKey) {
    return NextResponse.json({ error: "Missing required query param: roomKey" }, { status: 400 });
  }
  return NextResponse.json(getTranscript(roomKey));
}
