// ═══════════════════════════════════════════
// Video Service — จุดเดียวที่บอกว่าการประชุมนี้แสดงวิดีโอแบบไหน
//
// หน้าห้องประชุมเรียก resolveVideoSurface(meeting) แล้ว switch ตาม kind
// เอนจินเดียวที่ระบบใช้จริงตอนนี้คือ ZegoCloud — Webex/Jitsi/ACS ถูกตัดออกแล้ว
// ═══════════════════════════════════════════

import { resolveConference } from "@/lib/conference";
import type { Meeting } from "@/data";
import type { VideoSurface, EmbeddedEngineId, EmbeddedEngine } from "./types";
import { zegoEngine } from "./zego";

/** Registry ของ engine ที่ระบบรู้จัก — ตอนนี้มีแค่ ZegoCloud */
export const embeddedEngines: Record<EmbeddedEngineId, EmbeddedEngine> = {
  zegocloud: zegoEngine,
};

/** map provider ที่ฝังได้ → id ของ engine */
const embedEngineByProvider: Partial<Record<string, EmbeddedEngineId>> = {
  zegocloud: "zegocloud",
};

/**
 * ตัดสินว่าการประชุมนี้แสดงวิดีโอแบบไหน — ฝังในเว็บผ่าน ZegoCloud หรือเปิดแอปภายนอก
 *
 * ห้องจำลอง (mockup) ถูกตัดออกแล้ว — meeting ที่ไม่ได้ระบุ provider จะเข้า ZegoCloud จริงเสมอ
 */
export function resolveVideoSurface(meeting: Meeting): VideoSurface {
  const conference = resolveConference(meeting);
  const { launchMode, id } = conference.spec;

  if (launchMode === "simulated") {
    return { kind: "embed", engineId: "zegocloud" };
  }

  if (launchMode === "embed" || launchMode === "sdk") {
    const engineId = embedEngineByProvider[id];
    // ถ้ายังไม่มี engine รองรับ provider นี้ ให้ตกลงไปเปิดแอปภายนอกแทน (ปลอดภัยกว่าจอว่าง)
    if (engineId) return { kind: "embed", engineId };
    return { kind: "external", conference };
  }

  return { kind: "external", conference };
}
