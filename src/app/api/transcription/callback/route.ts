// ═══════════════════════════════════════════
// POST /api/transcription/callback — webhook รับผลถอดเสียงจาก ZegoCloud
//
// ⚠️ Callback URL ต้องตั้งค่าฝั่ง ZegoCloud console ก่อน (ติดต่อ ZegoCloud support ผูก URL นี้เข้ากับ
// AppId — ไม่ใช่ parameter ต่อ request) ดู docs/superpowers/specs/2026-08-18-zegocloud-asr-summary-design.md
//
// ⚠️ Schema ของ Data field (event ASRResult) ไม่ได้ระบุ field ละเอียดในเอกสารสาธารณะของ ZegoCloud
// (ตรวจสอบแล้ว 2026-08-18) — log payload ดิบไว้เสมอ ปรับ mapping ด้านล่างตอน manual test ครั้งแรกที่ได้
// payload จริง ถ้า field ไม่ตรงที่สมมติไว้ (UserId/Text/StartTime/EndTime)
//
// ต้องคืน HTTP 2XX เสมอไม่งั้น ZegoCloud retry 5 ครั้ง (2s,4s,8s,16s,32s)
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { appendSegments, markFailed } from "@/lib/transcriptStore";
import type { TranscriptSegment } from "@/services/transcription/types";

type AsrResultData = {
  UserId?: string;
  Text?: string;
  StartTime?: number; // มิลลิวินาที
  EndTime?: number;
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log("[/api/transcription/callback] raw payload:", JSON.stringify(body));

  const meetingId = body.RoomId as string | undefined; // roomId ผูกกับ meetingId 1:1 (conferenceRoomKey ?? meeting.id)
  if (!meetingId) {
    return NextResponse.json({ error: "Missing RoomId in callback payload" }, { status: 400 });
  }

  const event = body.Event as string | undefined;

  if (event === "Exception") {
    markFailed(meetingId);
    return NextResponse.json({ ok: true });
  }

  if (event === "ASRResult") {
    const data = body.Data as AsrResultData | undefined;
    if (data?.Text) {
      const segment: TranscriptSegment = {
        speakerId: data.UserId ?? null,
        speakerName: data.UserId ?? "ไม่ทราบผู้พูด", // ชื่อจริงถูกเติมทีหลังฝั่ง client จาก roster — ดู zegoAsrProvider.ts
        startSec: (data.StartTime ?? 0) / 1000,
        endSec: (data.EndTime ?? 0) / 1000,
        text: data.Text,
      };
      appendSegments(meetingId, [segment]);
    }
  }

  return NextResponse.json({ ok: true });
}
