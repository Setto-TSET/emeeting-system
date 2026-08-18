// ═══════════════════════════════════════════
// POST /api/transcription/start — เริ่มถอดเสียงห้องประชุมด้วย ZegoCloud Cloud Real-Time ASR
// เรียกครั้งเดียวโดย host ตอนเข้าห้อง (ดู live/[id]/page.tsx)
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { startAsrTask } from "@/lib/zegoAsr";
import { initTranscript, getTaskId } from "@/lib/transcriptStore";

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

  // Idempotent: React Strict Mode (dev) เรียก effect 2 ครั้ง / user refresh เร็ว ๆ ก็เรียกซ้ำได้
  // ถ้ามี ASR task ของ roomId นี้อยู่แล้ว คืน taskId เดิมไปเลย ไม่สร้าง task ใหม่บน ZegoCloud
  // (ไม่งั้น task แรกกลายเป็น orphan รันค้าง เสียเงินจริง) และไม่ reset segments ที่สะสมไว้
  const existingTaskId = getTaskId(roomId);
  if (existingTaskId) {
    return NextResponse.json({ taskId: existingTaskId, reused: true });
  }

  try {
    const taskId = await startAsrTask(appId, secret, roomId);
    // เก็บด้วย roomId (= conferenceRoomKey ?? meeting.id) ให้ตรงกับ callback ที่เขียนด้วย body.RoomId
    initTranscript(roomId, taskId);
    return NextResponse.json({ taskId });
  } catch (error) {
    console.error("[/api/transcription/start] failed:", error);
    const detail = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: `เริ่มถอดเสียงไม่สำเร็จ: ${detail}` }, { status: 500 });
  }
}
