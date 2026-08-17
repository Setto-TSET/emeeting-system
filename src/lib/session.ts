// ═══════════════════════════════════════════
// Session — จุดเดียวที่ระบบรู้ว่า "ตอนนี้ใครล็อกอินอยู่"
//
// ล็อกอินผ่าน backend จริงแล้ว (POST /api/auth/login) — ตรวจรหัสผ่านที่ server
// และเก็บ JWT ไว้ให้ apiFetch แนบไปกับทุก request ต่อจากนี้
// ═══════════════════════════════════════════

import { users, AppUser } from "@/data";
import { apiFetch, setAccessToken, ApiError } from "@/services/api/client";

export type SignInResult =
  | { ok: true; user: AppUser }
  | { ok: false; reason: string };

type LoginResponse = {
  token: string;
  user: { id: string; name: string; email: string; systemRole: string; roomId?: string };
};

/**
 * เข้าสู่ระบบผ่าน backend จริง — ตรวจรหัสผ่านที่ server ด้วย bcrypt
 * แล้วเก็บ JWT ไว้ให้ทุก request และ WebSocket ใช้ต่อ
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { ok: false, reason: "กรุณากรอกอีเมล" };
  if (!password) return { ok: false, reason: "กรุณากรอกรหัสผ่าน" };

  try {
    const result = await apiFetch<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: normalized, password }),
    });

    setAccessToken(result.token);

    // ข้อมูลโปรไฟล์เต็ม (คณะที่สังกัด ฯลฯ) ยังมาจาก mock data จนกว่าจะย้าย meetings ขึ้น server ครบ
    const local = users.find((u) => u.id === result.user.id);
    const user: AppUser = local ?? {
      id: result.user.id,
      name: result.user.name,
      position: "",
      department: "",
      email: result.user.email,
      systemRole: result.user.systemRole as AppUser["systemRole"],
      committeeIds: [],
      ...(result.user.roomId ? { roomId: result.user.roomId } : {}),
    };

    return { ok: true, user };
  } catch (error) {
    setAccessToken(null);
    if (error instanceof ApiError) return { ok: false, reason: error.message };
    return { ok: false, reason: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

/** รายชื่ออีเมลที่ใช้ทดสอบได้ — แสดงในหน้า login ระหว่างที่ยังเป็น prototype */
export function demoAccounts(): { email: string; name: string; roleLabel: string }[] {
  return users.map((u) => ({
    email: u.email,
    name: u.name,
    roleLabel: u.systemRole,
  }));
}
