/**
 * ลิงก์เชิญย้ายขึ้น server แล้ว — ดู `@/services/api/invites`
 *
 * เดิมไฟล์นี้เก็บ token ใน localStorage คีย์ `meeting_system_invite_tokens`
 * ผลคือลิงก์อยู่แค่ในเบราว์เซอร์ของผู้เชิญ คนที่ได้รับลิงก์เปิดแล้วเจอ "ลิงก์ไม่ถูกต้อง" เสมอ
 * เหลือไว้แค่การประกอบ URL ซึ่งขึ้นกับ origin ของเบราว์เซอร์ ไม่ใช่ข้อมูล
 */

export function buildJoinUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://emeeting.org";
  return `${origin}/join/${token}`;
}
