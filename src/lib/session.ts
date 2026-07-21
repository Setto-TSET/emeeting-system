// ═══════════════════════════════════════════
// Session — จุดเดียวที่ระบบรู้ว่า "ตอนนี้ใครล็อกอินอยู่"
//
// รอบนี้ยังเป็น prototype: ตรวจแค่อีเมล ไม่ตรวจรหัสผ่าน
// แต่ "รูปแบบการเรียก" ถูกต้องแล้ว — วันที่มี backend จริงเปลี่ยนแค่ในไฟล์นี้
// โดยที่หน้า login และ UserContext ไม่ต้องแก้เลย
//
// ⚠️ ยังไม่ใช่ระบบรักษาความปลอดภัยจริง
//    ไม่มี token / ไม่มีการเข้ารหัสรหัสผ่าน / ไม่มีการตรวจซ้ำที่ server
//    ใครแก้ localStorage ก็เปลี่ยนตัวเองเป็น admin ได้
// ═══════════════════════════════════════════

import { users, AppUser } from "@/data";

export type SignInResult =
  | { ok: true; user: AppUser }
  | { ok: false; reason: string };

/**
 * เข้าสู่ระบบ
 *
 * เวอร์ชันนี้หาผู้ใช้จากอีเมลอย่างเดียว (รหัสผ่านรับไว้แต่ยังไม่ตรวจ)
 * เมื่อต่อ backend ให้เปลี่ยนเป็น POST /api/auth/login แล้วคืนผลแบบเดียวกัน
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  void password; // ยังไม่ตรวจรหัสผ่าน — รับไว้เพื่อให้ signature ตรงกับตอนต่อ backend
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { ok: false, reason: "กรุณากรอกอีเมล" };

  const user = users.find((u) => u.email.toLowerCase() === normalized);
  if (!user) {
    return { ok: false, reason: "ไม่พบผู้ใช้งานนี้ในระบบ" };
  }

  return { ok: true, user };
}

/** รายชื่ออีเมลที่ใช้ทดสอบได้ — แสดงในหน้า login ระหว่างที่ยังเป็น prototype */
export function demoAccounts(): { email: string; name: string; roleLabel: string }[] {
  return users.map((u) => ({
    email: u.email,
    name: u.name,
    roleLabel: u.systemRole,
  }));
}
