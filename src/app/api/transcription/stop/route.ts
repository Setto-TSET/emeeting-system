// ═══════════════════════════════════════════
// POST /api/transcription/stop — หยุดถอดเสียง ตอน host ออกจากห้อง/ประชุมจบ
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { stopAsrTask } from "@/lib/zegoAsr";
import { getTaskId, markReady } from "@/lib/transcriptStore";

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
  if (!meetingId) {
    return NextResponse.json({ error: "Missing required field: meetingId" }, { status: 400 });
  }

  const taskId = getTaskId(meetingId);
  if (!taskId) {
    return NextResponse.json(
      { error: `ไม่พบ ASR task ที่กำลังทำงานสำหรับ meetingId=${meetingId}` },
      { status: 404 }
    );
  }

  try {
    await stopAsrTask(appId, secret, taskId);
    markReady(meetingId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[/api/transcription/stop] failed:", error);
    const detail = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: `หยุดถอดเสียงไม่สำเร็จ: ${detail}` }, { status: 500 });
  }
}
