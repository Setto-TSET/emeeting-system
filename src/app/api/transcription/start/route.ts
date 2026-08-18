// ═══════════════════════════════════════════
// POST /api/transcription/start — เริ่มถอดเสียงห้องประชุมด้วย ZegoCloud Cloud Real-Time ASR
// เรียกครั้งเดียวโดย host ตอนเข้าห้อง (ดู live/[id]/page.tsx)
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { startAsrTask } from "@/lib/zegoAsr";
import { initTranscript } from "@/lib/transcriptStore";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  const appId = Number(process.env.ZEGO_APP_ID);
  const secret = process.env.ZEGO_SERVER_SECRET;
  if (!appId || !secret) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้งค่า ZEGO_APP_ID / ZEGO_SERVER_SECRET ใน .env.local — ไม่มี mock ให้ fallback" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const meetingId = body?.meetingId as string | undefined;
  const roomId = body?.roomId as string | undefined;
  if (!meetingId || !roomId) {
    return NextResponse.json({ error: "Missing required fields: meetingId, roomId" }, { status: 400 });
  }

  try {
    const taskId = await startAsrTask(appId, secret, roomId);
    initTranscript(meetingId, taskId);
    return NextResponse.json({ taskId });
  } catch (error) {
    console.error("[/api/transcription/start] failed:", error);
    const detail = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: `เริ่มถอดเสียงไม่สำเร็จ: ${detail}` }, { status: 500 });
  }
}
