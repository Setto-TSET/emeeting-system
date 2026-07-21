// ═══════════════════════════════════════════
// Clock — จุดเดียวที่ระบบรู้ว่า "วันนี้" คือวันไหน
//
// ⚠️ ข้อมูลตัวอย่างทั้งระบบลงวันที่กลางปี 2026 (พ.ศ. 2569)
// ถ้าเปลี่ยนไปใช้ new Date() จริงตอนนี้ หน้าแดชบอร์ดและรายการ
// "ประชุมที่จะมาถึง" จะว่างเปล่าทันที เพราะข้อมูลทั้งหมดกลายเป็นอดีต
//
// เมื่อต่อ backend และมีข้อมูลจริงแล้ว เปลี่ยนแค่ DEMO_TODAY เป็น null
// ระบบจะสลับไปใช้เวลาจริงทั้งแอปโดยไม่ต้องแก้ไฟล์อื่นเลย
// ═══════════════════════════════════════════

/** ตั้งเป็น null เพื่อสลับไปใช้เวลาจริง */
const DEMO_TODAY: string | null = "2026-07-15";

/** วันที่ปัจจุบันในรูปแบบ YYYY-MM-DD (ใช้เทียบกับ field date ของข้อมูล) */
export const today: string = DEMO_TODAY ?? new Date().toISOString().split("T")[0];

/** เวลาปัจจุบัน — ใช้เมื่อต้องการ Date object เช่น จับเวลาเริ่มประชุม */
export function now(): Date {
  return DEMO_TODAY ? new Date(`${DEMO_TODAY}T${currentClockTime()}`) : new Date();
}

/** เวลานาฬิกาจริงเสมอ (HH:mm) — วันที่อาจถูกตรึงไว้ แต่เวลาเดินตามจริง */
export function currentClockTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
