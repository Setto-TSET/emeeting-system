// ═══════════════════════════════════════════
// Prisma client — instance เดียวต่อโปรเซส
//
// dev mode ของ Next.js reload โมดูลทุกครั้งที่แก้ไฟล์ ถ้า new PrismaClient() ตรงๆ
// จะเปิด connection pool ใหม่ทุกรอบจน MySQL ปฏิเสธ connection — เก็บไว้บน globalThis
// เพื่อให้ reload แล้วใช้ตัวเดิม (production ไม่มีปัญหานี้ จึงไม่ต้องเก็บ)
// ═══════════════════════════════════════════

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
