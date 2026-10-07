// ═══════════════════════════════════════════
// Clock — จุดเดียวที่ระบบรู้ว่า "วันนี้" คือวันไหน
//
// ข้อมูลอยู่ที่ server แล้ว จึงใช้วันจริงทั้งแอป — เดิมตรึงไว้ที่ 2026-07-15 ทำให้ kiosk, dashboard
// และ "การจองที่จะมาถึง" คำนวณจากวันในอดีต ประชุมจริงวันนี้จึงไม่ขึ้นหรือถูกจัดเป็นอดีต
// ถ้าต้องสาธิตด้วยวันที่ตายตัว ตั้ง DEMO_TODAY เป็น "YYYY-MM-DD" ชั่วคราว
// ═══════════════════════════════════════════

/** ตั้งเป็น null เพื่อสลับไปใช้เวลาจริง */
const DEMO_TODAY: string | null = null;

/** วันที่ปัจจุบันในรูปแบบ YYYY-MM-DD (ใช้เทียบกับ field date ของข้อมูล) */
// วันตามเวลาท้องถิ่นของเครื่อง — toISOString() เป็น UTC ซึ่งในไทยก่อน 07:00 จะได้วันของเมื่อวาน
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const today: string = DEMO_TODAY ?? localDate(new Date());

/** เวลาปัจจุบัน — ใช้เมื่อต้องการ Date object เช่น จับเวลาเริ่มประชุม */
export function now(): Date {
  return DEMO_TODAY ? new Date(`${DEMO_TODAY}T${currentClockTime()}`) : new Date();
}

/** เวลานาฬิกาจริงเสมอ (HH:mm) — วันที่อาจถูกตรึงไว้ แต่เวลาเดินตามจริง */
export function currentClockTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
