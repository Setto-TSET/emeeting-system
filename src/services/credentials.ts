// ═══════════════════════════════════════════
// Credentials Service — จุดเดียวที่ขอ token สำหรับเข้าห้องประชุมฝัง
//
// embedded SDK ทุกตัว (Webex/Zoom/ACS) ต้องมี token ที่ backend เซ็นด้วย secret
// secret ห้ามอยู่ฝั่งเบราว์เซอร์เด็ดขาด — ใครเปิด DevTools ก็ขโมยได้
//
// ตอนนี้คืน null เสมอ (ยังไม่มี backend) → engine ที่ requiresBackend จะ mount ไม่ได้
// วันมี backend: เปลี่ยนแค่ในไฟล์นี้เป็น fetch("/api/video/token") โดยหน้าจอไม่ต้องแก้
// ═══════════════════════════════════════════

import type { EmbeddedEngineId } from "./video/types";

export type VideoCredential = {
  engineId: EmbeddedEngineId;
  /** token ที่ backend เซ็นแล้ว — ส่งให้ SDK ตอน mount */
  token: string;
  /** ห้องจริงของผู้ให้บริการที่ backend แลกมาจาก roomKey */
  providerRoomId: string;
  /** เวลาหมดอายุ (epoch ms) */
  expiresAt: number;
};

/**
 * ขอ credential สำหรับเข้าห้องประชุม
 *
 * @returns null ระหว่างที่ยังไม่มี backend — เป็นสัญญาณให้หน้าจอแสดง
 *          "ระบบประชุมออนไลน์ยังไม่พร้อมใช้งาน" แทนจอว่างหรือ error
 */
export async function requestVideoCredential(
  engineId: EmbeddedEngineId,
  roomKey: string
): Promise<VideoCredential | null> {
  void engineId; void roomKey; // รับไว้ให้ signature ตรงกับตอนต่อ backend — ยังไม่ใช้
  // TODO(backend): POST /api/video/token { engineId, roomKey } → VideoCredential
  return null;
}
