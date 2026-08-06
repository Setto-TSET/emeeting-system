// ═══════════════════════════════════════════
// Credentials Service — จุดเดียวที่ขอ token สำหรับเข้าห้องประชุมฝัง
//
// embedded SDK ทุกตัว ต้องมี token ที่ backend เซ็นด้วย secret
// secret ห้ามอยู่ฝั่งเบราว์เซอร์เด็ดขาด — ใครเปิด DevTools ก็ขโมยได้
//
// fetch จาก /api/video/token → คืน credential พร้อม appId, serverUrl
// fetch ล้มเหลว → คืน null → UI fallback demo mode
// ═══════════════════════════════════════════

import type { EmbeddedEngineId } from "./video/types";

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
};

/**
 * ขอ credential สำหรับเข้าห้องประชุม
 *
 * @returns null เมื่อ backend ไม่พร้อมหรือ fetch ล้มเหลว
 *          — เป็นสัญญาณให้หน้าจอแสดง demo mode
 */
export async function requestVideoCredential(
  engineId: EmbeddedEngineId,
  roomKey: string,
  userId: string,
  userName: string
): Promise<VideoCredential | null> {
  try {
    const response = await fetch("/api/video/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: roomKey, userId, userName }),
    });

    if (!response.ok) {
      console.warn("[credentials] Token request failed:", response.status);
      return null;
    }

    const data = await response.json();
    return {
      engineId,
      token: data.token,
      providerRoomId: roomKey,
      appId: data.appId,
      serverUrl: data.serverUrl,
      expiresAt: data.expiresAt,
    };
  } catch (error) {
    console.warn("[credentials] Token request error:", error);
    return null;
  }
}
