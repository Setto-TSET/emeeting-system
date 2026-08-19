// ═══════════════════════════════════════════
// POST /api/video/token — สร้าง ZegoCloud privilege token
//
// ServerSecret ไม่เคยออกจากฝั่ง server
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { generateToken04 } from "@/lib/zegoToken";
import { requireAuth, ApiError } from "@/lib/api/auth";
import { requireMeetingAccess } from "@/lib/api/meetingGuard";

const EXPIRY_SECONDS = 1800; // 30 minutes

export async function POST(request: NextRequest) {
  try {
    // กันสคริปต์/เว็บอื่นยิงตรงเข้ามาขอ token ข้าม origin
    // (เบราว์เซอร์แนบ Origin ให้เองเสมอสำหรับ POST แบบนี้ ปลอมจาก JS ฝั่ง client ไม่ได้)
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
    }

    const appId = Number(process.env.ZEGO_APP_ID);
    const secret = process.env.ZEGO_SERVER_SECRET;
    // ZEGO_SERVER_URL เป็นตัวเลือก — ถ้าไม่ได้ตั้ง ให้ประกอบจาก App ID ตามรูปแบบมาตรฐานของ ZegoCloud
    // เดิมบังคับต้องมี ทำให้ทั้งระบบตกเป็น demo mode เงียบๆ เมื่อลืมใส่ค่านี้
    const serverUrl =
      process.env.ZEGO_SERVER_URL?.trim() ||
      `wss://webliveroom${appId}-api.coolzcloud.com/ws`;

    if (!appId || !secret) {
      return NextResponse.json(
        {
          error:
            "ยังไม่ได้ตั้งค่า ZEGO_APP_ID / ZEGO_SERVER_SECRET ใน .env.local — ระบบประชุมจะทำงานในโหมดสาธิตเท่านั้น",
        },
        { status: 500 }
      );
    }

    if (secret.length !== 32) {
      return NextResponse.json(
        { error: "ZEGO_SERVER_SECRET ต้องยาว 32 ตัวอักษร (ค่าปัจจุบันยาว " + secret.length + ")" },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { roomId, meetingId } = body as { roomId?: string; meetingId?: string };

    if (!roomId || !meetingId) {
      return NextResponse.json(
        { error: "Missing required fields: roomId, meetingId" },
        { status: 400 }
      );
    }

    // ตัวตนมาจาก session เท่านั้น — เดิมรับ userId/userName ที่ client ส่งมาตรงๆ
    // ใครก็ขอ token เข้าห้องไหนในนามใครก็ได้
    const user = await requireAuth(request);
    await requireMeetingAccess(user, meetingId, "meeting.join");

    // Privilege payload — allow login + publish
    const payload = JSON.stringify({
      room_id: roomId,
      privilege: { 1: 1, 2: 1 },
      stream_id_list: null,
    });

    const token = generateToken04(appId, user.id, secret, EXPIRY_SECONDS, payload);
    const expiresAt = Date.now() + EXPIRY_SECONDS * 1000;

    // คืน userId ที่ token ผูกไว้ — client ต้อง login เข้า engine ด้วย id นี้เท่านั้น ไม่งั้น Zego ปฏิเสธ
    return NextResponse.json({ token, appId, serverUrl, expiresAt, userId: user.id });
  } catch (error) {
    // 401/403 จาก requireAuth/requireMeetingAccess ต้องไม่ถูกกลบเป็น 500
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/video/token] Token generation failed:", error);
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "errorMessage" in error
        ? String((error as { errorMessage: unknown }).errorMessage)
        : "unknown error";
    return NextResponse.json(
      { error: `สร้าง token ไม่สำเร็จ: ${detail}` },
      { status: 500 }
    );
  }
}
