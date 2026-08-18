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
  const roomId = body?.roomId as string | undefined;
  const clientTaskId = body?.taskId as string | undefined;
  if (!roomId) {
    return NextResponse.json({ error: "Missing required field: roomId" }, { status: 400 });
  }

  // transcriptStore เป็น in-memory ต่อ serverless instance — instance ที่รับ stop อาจคนละตัวกับที่รับ start
  // ถ้าหา taskId ใน store ไม่เจอ ใช้ taskId ที่ client จำไว้จาก response ของ start เป็น fallback
  // ไม่งั้น ASR task จะรันค้างตลอดกาล (เสียเงินจริง)
  const storedTaskId = getTaskId(roomId);
  const fallbackTaskId =
    typeof clientTaskId === "string" && clientTaskId.trim() !== "" ? clientTaskId.trim() : null;
  const taskId = storedTaskId ?? fallbackTaskId;
  if (!taskId) {
    return NextResponse.json(
      { error: `ไม่พบ ASR task ที่กำลังทำงานสำหรับ roomId=${roomId}` },
      { status: 404 }
    );
  }

  try {
    await stopAsrTask(appId, secret, taskId);
    markReady(roomId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[/api/transcription/stop] failed:", error);
    const detail = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: `หยุดถอดเสียงไม่สำเร็จ: ${detail}` }, { status: 500 });
  }
}
