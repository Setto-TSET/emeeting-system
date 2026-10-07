// ═══════════════════════════════════════════
// POST /api/video/token — สร้าง ZegoCloud privilege token
//
// ServerSecret ไม่เคยออกจากฝั่ง server
//
// ห้องและตัวตนใน token มาจาก backend เท่านั้น — client บอกได้แค่ว่าอยากเข้าประชุมไหน
// เดิมรับ roomId/userId จาก body ตรง ๆ แล้วไม่เช็คอะไรเลย ใครยิง curl (ไม่มี Origin) ก็ได้ token
// เข้าห้องประชุมลับห้องไหนก็ได้ ในนามใครก็ได้
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { generateToken04 } from "@/lib/zegoToken";
import { apiBaseUrl } from "@/services/api/client";

const EXPIRY_SECONDS = 1800; // 30 minutes

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });
    }

    // กันเว็บอื่นยิงข้าม origin ด้วย token ที่ขโมยไปไม่ได้ทั้งหมด แต่ยังกันสคริปต์บนเว็บอื่นได้
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

    // รายละเอียดการตั้งค่าเขียนลง log ของ server เท่านั้น — ผู้ใช้ไม่ต้องเห็นชื่อตัวแปรหรือไฟล์ config
    if (!appId || !secret || secret.length !== 32) {
      console.error(
        "[/api/video/token] ZEGO_APP_ID / ZEGO_SERVER_SECRET ไม่ได้ตั้งหรือรูปแบบผิด (secret ต้องยาว 32 ตัวอักษร)"
      );
      return NextResponse.json(
        { error: "ระบบวิดีโอยังไม่พร้อมใช้งาน — กรุณาติดต่อผู้ดูแลระบบ" },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const meetingId = typeof body?.meetingId === "string" ? body.meetingId : "";
    if (!meetingId) {
      return NextResponse.json({ error: "ต้องระบุ meetingId" }, { status: 400 });
    }

    // ให้ backend ตัดสินทั้งตัวตนและสิทธิ์ด้วยกฎชุดเดียวกับที่ใช้ทั้งระบบ (canViewMeeting)
    // ไม่ verify JWT ที่นี่เอง — จะต้องแชร์ JWT_SECRET มาที่ Vercel อีกที่หนึ่งโดยไม่จำเป็น
    const headers = { Authorization: authorization };
    const [meRes, meetingRes] = await Promise.all([
      fetch(`${apiBaseUrl()}/api/auth/me`, { headers, cache: "no-store" }),
      fetch(`${apiBaseUrl()}/api/meetings/${encodeURIComponent(meetingId)}`, { headers, cache: "no-store" }),
    ]);
    if (meRes.status === 401 || meetingRes.status === 401) {
      return NextResponse.json({ error: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่" }, { status: 401 });
    }
    if (!meRes.ok || !meetingRes.ok) {
      const status = meetingRes.status === 403 || meetingRes.status === 404 ? meetingRes.status : 502;
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าห้องประชุมนี้" }, { status });
    }

    const { user } = (await meRes.json()) as { user: { id: string; name: string } };
    const { meeting } = (await meetingRes.json()) as { meeting: { id: string; conferenceRoomKey?: string } };
    const roomId = meeting.conferenceRoomKey ?? meeting.id;
    const userId = user.id;

    // Privilege payload — allow login + publish
    const payload = JSON.stringify({
      room_id: roomId,
      privilege: { 1: 1, 2: 1 },
      stream_id_list: null,
    });

    const token = generateToken04(appId, userId, secret, EXPIRY_SECONDS, payload);
    const expiresAt = Date.now() + EXPIRY_SECONDS * 1000;

    return NextResponse.json({ token, appId, serverUrl, expiresAt, roomId, userId });
  } catch (error) {
    console.error("[/api/video/token] Token generation failed:", error);
    return NextResponse.json({ error: "สร้างสิทธิ์เข้าห้องวิดีโอไม่สำเร็จ — ลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
