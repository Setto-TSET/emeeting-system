// ═══════════════════════════════════════════
// Session — จุดเดียวที่ระบบรู้ว่า "ตอนนี้ใครล็อกอินอยู่"
//
// ยิง POST /api/auth/login จริงแล้ว — รหัสผ่านถูกตรวจด้วย bcrypt ที่ server
// server ตอบกลับสองอย่าง:
//   1. httpOnly cookie — ใช้อัตโนมัติกับทุก request จากเบราว์เซอร์นี้
//   2. token ใน body — เก็บใน sessionStorage ของ "แท็บนี้" แล้วแนบเป็น
//      Authorization: Bearer ทุกครั้งที่เรียก API
//
// ทำไมต้องมีข้อ 2 ทั้งที่มี cookie แล้ว: cookie เป็นของทั้งเบราว์เซอร์ แต่ระบบนี้
// ออกแบบให้เปิดหลายแท็บเป็นคนละบทบาทเพื่อทดสอบการประชุม (ดู UserContext)
// ถ้าใช้ cookie อย่างเดียว ทุกแท็บจะกลายเป็นคนล่าสุดที่ล็อกอิน แล้วคะแนนโหวต
// จะถูกบันทึกผิดคน
//
// ⚠️ ข้อแลกเปลี่ยน: token ใน sessionStorage ถูก JavaScript อ่านได้ (ต่างจาก cookie
//    httpOnly) ถ้ามีช่อง XSS จะถูกขโมยได้ — ยอมรับได้ในช่วง dev/ทดสอบเท่านั้น
//    วันขึ้น production จริงที่ผู้ใช้อยู่คนละเครื่องอยู่แล้ว ให้เลิกเก็บ token ฝั่ง
//    client แล้วใช้ cookie ล้วน
// ═══════════════════════════════════════════

import { users, AppUser } from "@/data";

export type SignInResult =
  | { ok: true; user: AppUser }
  | { ok: false; reason: string };

const TOKEN_KEY = "meeting_system_session_token";

/** token ของแท็บนี้ — null ถ้ายังไม่ได้ล็อกอินในแท็บนี้ */
export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** header สำหรับแนบไปกับทุก fetch ที่เรียก API ของระบบ */
export function authHeaders(): Record<string, string> {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function storeToken(token: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* โหมดส่วนตัวบางเบราว์เซอร์เขียนไม่ได้ — ยังใช้ cookie ต่อได้ */
  }
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { ok: false, reason: "กรุณากรอกอีเมล" };
  if (!password) return { ok: false, reason: "กรุณากรอกรหัสผ่าน" };

  let response: Response;
  try {
    response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalized, password }),
    });
  } catch {
    return { ok: false, reason: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบว่าเปิดระบบอยู่หรือไม่" };
  }

  const data = (await response.json().catch(() => null)) as
    | { token?: string; user?: AppUser; error?: string }
    | null;

  if (!response.ok || !data?.user || !data.token) {
    return { ok: false, reason: data?.error ?? "เข้าสู่ระบบไม่สำเร็จ" };
  }

  storeToken(data.token);
  return { ok: true, user: data.user };
}

export async function signOut(): Promise<void> {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ไม่มีอะไรให้ลบ */
  }
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
}

/**
 * สลับผู้ใช้ในเมนู "สลับผู้ใช้ (สำหรับทดสอบสิทธิ์)" ของ TopNav
 *
 * ต้องล็อกอินใหม่จริงๆ ไม่ใช่แค่เปลี่ยน state ฝั่ง UI — ไม่งั้น API จะยังเห็นเป็นคนเดิม
 * แล้วคะแนนโหวตจะถูกบันทึกผิดคน ใช้รหัสผ่านชุดทดสอบที่ prisma/seed.ts ตั้งให้ทุกบัญชี
 * (ตั้งค่าอื่นได้ที่ NEXT_PUBLIC_DEV_LOGIN_PASSWORD) — ปิดตายใน production
 */
export async function signInAsDemoUser(email: string): Promise<SignInResult> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, reason: "การสลับผู้ใช้ใช้ได้เฉพาะระหว่างพัฒนา — กรุณาเข้าสู่ระบบตามปกติ" };
  }
  return signIn(email, process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD || "password");
}

/** รายชื่ออีเมลที่ใช้ทดสอบได้ — แสดงในหน้า login */
export function demoAccounts(): { email: string; name: string; roleLabel: string }[] {
  return users.map((u) => ({
    email: u.email,
    name: u.name,
    roleLabel: u.systemRole,
  }));
}
