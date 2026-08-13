// ═══════════════════════════════════════════
// POST /api/video/token — สร้าง ZegoCloud privilege token
//
// ServerSecret ไม่เคยออกจากฝั่ง server
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { generateToken04 } from "@/lib/zegoToken";

const EXPIRY_SECONDS = 1800; // 30 minutes

export async function POST(request: NextRequest) {
  try {
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

    const { roomId, userId, userName } = body as {
      roomId?: string;
      userId?: string;
      userName?: string;
    };

    if (!roomId || !userId || !userName) {
      return NextResponse.json(
        { error: "Missing required fields: roomId, userId, userName" },
        { status: 400 }
      );
    }

    // Privilege payload — allow login + publish
    const payload = JSON.stringify({
      room_id: roomId,
      privilege: { 1: 1, 2: 1 },
      stream_id_list: null,
    });

    const token = generateToken04(appId, userId, secret, EXPIRY_SECONDS, payload);
    const expiresAt = Date.now() + EXPIRY_SECONDS * 1000;

    return NextResponse.json({ token, appId, serverUrl, expiresAt });
  } catch (error) {
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
