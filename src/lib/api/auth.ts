// ═══════════════════════════════════════════
// Session — JWT ใน httpOnly cookie
//
// ทำไม httpOnly: JavaScript ในหน้าเว็บอ่าน cookie นี้ไม่ได้ ต่อให้มีช่อง XSS ก็ขโมย session ไม่ได้
// ทำไม jose: ทำงานได้ทั้ง Edge และ Node runtime ของ Next.js (jsonwebtoken ใช้ได้เฉพาะ Node)
//
// ใช้คู่กับ src/lib/authz.ts — ไฟล์นี้ตอบว่า "คนนี้คือใคร", authz.ts ตอบว่า "ทำสิ่งนี้ได้ไหม"
// ═══════════════════════════════════════════

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import type { SystemRole } from "@/data";

export const SESSION_COOKIE = "session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 วัน — ตรงกับ JWT_EXPIRY ใน backend/.env.example

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    // ล้มตั้งแต่ตอน sign ดีกว่าปล่อยให้ระบบเดินด้วย secret อ่อนแอโดยไม่มีใครรู้
    throw new Error("JWT_SECRET ต้องตั้งค่าใน .env.local และยาวอย่างน้อย 32 ตัวอักษร");
  }
  return new TextEncoder().encode(secret);
}

/** ผู้ใช้ที่ session ชี้ถึง — รูปแบบเดียวกับ AppUser ฝั่ง UI เพื่อส่งให้ authz.ts ใช้ได้ตรงๆ */
export type SessionUser = {
  id: string;
  name: string;
  position: string;
  department: string;
  email: string;
  systemRole: SystemRole;
  committeeIds: string[];
  roomId?: string;
};

/** ตั้ง cookie แล้วคืน token ดิบ เพื่อให้ฝั่ง client เก็บต่อแท็บได้ด้วย (ดูหมายเหตุใน getSessionUser) */
export async function createSession(userId: string, systemRole: SystemRole): Promise<string> {
  const token = await new SignJWT({ userId, systemRole })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * อ่าน session แล้วโหลดผู้ใช้จาก DB — คืน null ถ้าไม่มี/หมดอายุ/ผู้ใช้ถูกลบไปแล้ว
 *
 * รับ token ได้สองทาง:
 *   1. httpOnly cookie — ทางปกติของเบราว์เซอร์ ปลอดภัยกว่าเพราะ JS อ่านไม่ได้
 *   2. header `Authorization: Bearer <token>` — จำเป็นตอนทดสอบ เพราะ cookie เป็นของ
 *      ทั้งเบราว์เซอร์ แต่ระบบนี้ออกแบบให้แต่ละแท็บล็อกอินคนละบทบาทได้
 *      (ดู src/context/UserContext.tsx) header จึงชนะ cookie เมื่อส่งมาทั้งคู่
 */
export async function getSessionUser(request?: Request): Promise<SessionUser | null> {
  const bearer = request?.headers.get("authorization")?.replace(/^Bearer /i, "").trim();
  const token = bearer || (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.userId !== "string") return null;
    userId = payload.userId;
  } catch {
    return null; // ลายเซ็นไม่ถูกหรือหมดอายุ — ถือว่าไม่ได้ล็อกอิน
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { committees: { select: { committeeId: true } }, roomAccount: { select: { id: true } } },
  });
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    position: user.position,
    department: user.department,
    email: user.email,
    systemRole: user.systemRole as SystemRole,
    committeeIds: user.committees.map((c) => c.committeeId),
    roomId: user.roomAccount?.id,
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * ใช้เปิดหัว route handler ทุกตัวที่ต้องล็อกอิน
 * โยน ApiError(401) แทนการ return Response เพื่อให้ handler เขียนเป็นเส้นตรงได้
 * แล้วให้ withApi() แปลงเป็น response ตอนท้ายจุดเดียว
 */
export async function requireAuth(request?: Request): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw new ApiError(401, "กรุณาเข้าสู่ระบบ");
  return user;
}
