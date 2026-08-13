// ═══════════════════════════════════════════
// Video Service — จุดเดียวที่บอกว่าการประชุมนี้แสดงวิดีโอแบบไหน
//
// หน้าห้องประชุมเรียก resolveVideoSurface(meeting) แล้ว switch ตาม kind
// ═══════════════════════════════════════════

import { resolveConference } from "@/lib/conference";
import type { Meeting } from "@/data";
import type { VideoSurface, EmbeddedEngineId, EmbeddedEngine } from "./types";
import { zegoEngine } from "./zego";

/**
 * Registry ของ engine ที่ฝังในเว็บได้
 * เพิ่มเจ้าใหม่: implement EmbeddedEngine แล้วลงทะเบียนที่นี่ — หน้าจอไม่ต้องแก้
 */
export const embeddedEngines: Record<EmbeddedEngineId, EmbeddedEngine> = {
  zegocloud: zegoEngine,
};

/** map provider ที่ฝังได้ → id ของ engine */
const embedEngineByProvider: Partial<Record<string, EmbeddedEngineId>> = {
  zegocloud: "zegocloud",
};

/**
 * ตัดสินว่าการประชุมนี้แสดงวิดีโอแบบไหน — จำลอง / เปิดแอปภายนอก / ฝังในเว็บ
 */
export function resolveVideoSurface(meeting: Meeting): VideoSurface {
  const conference = resolveConference(meeting);
  const { launchMode, id } = conference.spec;

  if (launchMode === "simulated") {
    return { kind: "simulated" };
  }

  if (launchMode === "embed" || launchMode === "sdk") {
    const engineId = embedEngineByProvider[id];
    // ถ้ายังไม่มี engine รองรับ provider นี้ ให้ตกลงไปเปิดแอปภายนอกแทน (ปลอดภัยกว่าจอว่าง)
    if (engineId) return { kind: "embed", engineId };
    return { kind: "external", conference };
  }

  return { kind: "external", conference };
}
