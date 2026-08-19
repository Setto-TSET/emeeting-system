// ═══════════════════════════════════════════
// Credentials Service — จุดเดียวที่ขอ token สำหรับเข้าห้องประชุมฝัง
//
// embedded SDK ทุกตัว ต้องมี token ที่ backend เซ็นด้วย secret
// secret ห้ามอยู่ฝั่งเบราว์เซอร์เด็ดขาด — ใครเปิด DevTools ก็ขโมยได้
//
// fetch จาก /api/video/token → คืน credential พร้อม appId, serverUrl
// fetch ล้มเหลว → คืน null → UI แสดง error state จริง (ไม่มี mock ให้ fallback แล้ว)
// ═══════════════════════════════════════════

import type { EmbeddedEngineId } from "./video/types";
import { authHeaders } from "@/lib/session";

export type VideoCredential = {
  engineId: EmbeddedEngineId;
  /** token ที่ backend เซ็นแล้ว — ส่งให้ SDK ตอน mount */
  token: string;
  /** ห้องจริงของผู้ให้บริการที่ backend แลกมาจาก roomKey */
  providerRoomId: string;
  /** ZegoCloud App ID — client ใช้สร้าง ZegoExpressEngine */
  appId: number;
  /** ZegoCloud Server URL — client ใช้สร้าง ZegoExpressEngine */
  serverUrl: string;
  /** เวลาหมดอายุ (epoch ms) */
  expiresAt: number;
  /** id ที่ token ผูกไว้ (มาจาก session ฝั่ง server) — ต้องใช้ id นี้ login เข้า engine */
  userId: string;
};

/** ผลของการขอ credential — แยก error ออกมาเพื่อให้หน้าจอบอกผู้ใช้ได้ว่าทำไมถึงเป็นโหมดสาธิต */
export type VideoCredentialResult =
  | { ok: true; credential: VideoCredential }
  | { ok: false; reason: string };

/**
 * ขอ credential สำหรับเข้าห้องประชุม
 *
 * @returns ok:false พร้อมเหตุผล เมื่อ backend ไม่พร้อมหรือ fetch ล้มเหลว
 *          — หน้าจอเอาเหตุผลไปแสดงตรงๆ แทนที่จะเงียบแล้วตกเป็น demo mode (ไม่มีให้ fallback แล้ว)
 */
export async function requestVideoCredential(
  engineId: EmbeddedEngineId,
  roomKey: string,
  meetingId: string
): Promise<VideoCredentialResult> {
  try {
    const response = await fetch("/api/video/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ roomId: roomKey, meetingId }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const reason = data?.error ?? `ขอ token ไม่สำเร็จ (HTTP ${response.status})`;
      console.warn("[credentials] Token request failed:", reason);
      return { ok: false, reason };
    }

    return {
      ok: true,
      credential: {
        engineId,
        token: data.token,
        providerRoomId: roomKey,
        appId: data.appId,
        serverUrl: data.serverUrl,
        expiresAt: data.expiresAt,
        userId: data.userId,
      },
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "ติดต่อเซิร์ฟเวอร์ออก token ไม่ได้";
    console.warn("[credentials] Token request error:", error);
    return { ok: false, reason };
  }
}
