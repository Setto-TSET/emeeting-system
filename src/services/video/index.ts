// ═══════════════════════════════════════════
// Video Service — จุดเดียวที่บอกว่าการประชุมนี้แสดงวิดีโอแบบไหน
//
// หน้าห้องประชุมเรียก resolveVideoSurface(meeting) แล้ว switch ตาม kind
// ยังไม่ได้ wire เข้าหน้าจอในรอบนี้ (Phase C) — วางไว้เป็น seam ให้พร้อม
// ═══════════════════════════════════════════

import { resolveConference } from "@/lib/conference";
import type { Meeting } from "@/data";
import type { VideoSurface, EmbeddedEngineId } from "./types";

/** map provider ที่ฝังได้ → id ของ engine */
const embedEngineByProvider: Partial<Record<string, EmbeddedEngineId>> = {
  webex: "webex",
};

/**
 * ตัดสินว่าการประชุมนี้แสดงวิดีโอแบบไหน — จำลอง / เปิดแอปภายนอก / ฝังในเว็บ
 *
 * ตอนนี้ยังไม่มีการประชุมไหนตั้ง provider เป็น webex ในข้อมูลตัวอย่าง
 * จึงไม่มีพฤติกรรมเปลี่ยน — ทุกอย่างยังเป็น simulated / external เหมือนเดิม
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
