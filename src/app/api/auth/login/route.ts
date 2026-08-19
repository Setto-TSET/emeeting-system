// POST /api/auth/login — ตรวจ email + password แล้วตั้ง session cookie

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, ApiError } from "@/lib/api/auth";
import { withApi, readJson } from "@/lib/api/respond";
import type { SystemRole } from "@/data";

const bodySchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const POST = withApi(async (request: Request) => {
  const { email, password } = bodySchema.parse(await readJson(request));

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { committees: { select: { committeeId: true } }, roomAccount: { select: { id: true } } },
  });

  // ตอบข้อความเดียวกันทั้งกรณีไม่มีอีเมลนี้และรหัสผิด — ไม่บอกใบ้ว่าอีเมลไหนมีอยู่ในระบบ
  const invalid = new ApiError(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  if (!user) {
    // เทียบกับ hash หลอกเพื่อให้เวลาตอบใกล้เคียงกรณีมีผู้ใช้จริง (กัน timing attack แบบหยาบ)
    await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin");
    throw invalid;
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) throw invalid;

  const token = await createSession(user.id, user.systemRole as SystemRole);

  return Response.json({
    // token ตัวเดียวกับใน cookie — ฝั่ง client เก็บต่อแท็บเพื่อสลับบทบาทคนละแท็บได้
    token,
    user: {
      id: user.id,
      name: user.name,
      position: user.position,
      department: user.department,
      email: user.email,
      systemRole: user.systemRole,
      committeeIds: user.committees.map((c) => c.committeeId),
      roomId: user.roomAccount?.id,
    },
  });
});
