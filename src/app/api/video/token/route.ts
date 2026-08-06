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
    const serverUrl = process.env.ZEGO_SERVER_URL;

    if (!appId || !secret || !serverUrl) {
      return NextResponse.json(
        { error: "ZegoCloud credentials not configured on server" },
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
    return NextResponse.json(
      { error: "Token generation failed" },
      { status: 500 }
    );
  }
}
