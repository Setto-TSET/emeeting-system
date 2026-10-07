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
/** โดเมนของบัญชีในระบบ — พิมพ์แค่ชื่อหน้า @ ก็ล็อกอินได้ ส่วนบัญชีโดเมนอื่นพิมพ์อีเมลเต็มเหมือนเดิม */
export const DEFAULT_EMAIL_DOMAIN = "e-office.cloud";

// ponytail: ช่วงทดสอบ feasibility พิมพ์ชื่อบทบาท (admin, secretary, staff, ...) แทนอีเมลได้
// จับคู่กับบัญชีแรกของบทบาทนั้นในข้อมูลทดสอบ — ลบทิ้งพร้อมบัญชีทดสอบก่อนใช้งานจริง
const ROLE_LOGIN = new Map<string, string>([
  // ชื่อที่แจกให้ผู้ทดสอบ — admin, external, room-801 ได้จากกฎด้านล่างอยู่แล้ว
  ["organizer", "somchai.j@e-office.cloud"], // ผู้จัดการประชุม MT-2569-010
  ["member", "decha@e-office.cloud"], // ผู้เข้าร่วมประชุมทั่วไป
]);
for (const u of users) if (!ROLE_LOGIN.has(u.systemRole)) ROLE_LOGIN.set(u.systemRole, u.email);

/** แปลงสิ่งที่พิมพ์ในช่องล็อกอินเป็นอีเมล: ชื่อบทบาท → บัญชีของบทบาทนั้น, ไม่มี @ → เติมโดเมน */
export function loginEmail(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || trimmed.includes("@")) return trimmed;
  return ROLE_LOGIN.get(trimmed) ?? `${trimmed}@${DEFAULT_EMAIL_DOMAIN}`;
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const normalized = loginEmail(email);
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
