// POST /api/invite/[token]/join — ใช้ลิงก์เชิญเข้าประชุมในฐานะแขก
//
// ลิงก์ใช้ได้ครั้งเดียว: ทำเครื่องหมาย used + สร้างผู้เข้าร่วม + เปิด session ให้แขก
// ในทรานแซกชันเดียว เพื่อไม่ให้กดพร้อมกันสองครั้งแล้วได้ที่นั่งสองที่

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, ApiError } from "@/lib/api/auth";
import { withApi, readJson } from "@/lib/api/respond";

type Ctx = { params: Promise<{ token: string }> };

const bodySchema = z.object({
  name: z.string().trim().min(1, "กรุณาระบุชื่อ").max(200),
  role: z.string().trim().max(200).default("ผู้เข้าร่วมประชุม"),
});

export const POST = withApi(async (request: Request, ctx: Ctx) => {
  const { token } = await ctx.params;
  const body = bodySchema.parse(await readJson(request));

  const result = await prisma.$transaction(async (tx) => {
    // updateMany + เงื่อนไข used:false = การอ้างสิทธิ์แบบอะตอมมิก
    // ถ้ามีคนใช้ลิงก์นี้ไปแล้วเสี้ยววินาทีก่อน count จะเป็น 0
    const claimed = await tx.inviteToken.updateMany({
      where: { token, used: false, expiresAt: { gt: new Date() } },
      data: { used: true, usedAt: new Date() },
    });
    if (claimed.count === 0) return null;

    const invite = await tx.inviteToken.findUniqueOrThrow({ where: { token } });

    // ponytail: แขกได้ User จริงหนึ่งแถว เพราะทุกอย่างปลายทาง (โหวต/แชท/ผู้เข้าร่วม)
    // ผูก FK กับ User อยู่แล้ว — ถูกกว่าการทำ session อีกชนิดที่ทุก FK ต้องรองรับ null
    // อีเมลเป็นค่าสังเคราะห์ต่อ token กันชนกับบัญชีพนักงานจริงที่อาจใช้อีเมลเดียวกัน
    // passwordHash ว่าง = ล็อกอินด้วยรหัสผ่านไม่ได้ตลอดกาล (bcrypt.compare กับค่าว่างคืน false)
    const guest = await tx.user.create({
      data: {
        id: `U-GUEST-${token.slice(0, 12)}`,
        name: body.name,
        position: "ผู้เข้าร่วมประชุม",
        department: "ภายนอกองค์กร",
        email: `guest-${token.slice(0, 16)}@invite.local`,
        passwordHash: "",
        systemRole: "external",
      },
    });

    const participant = await tx.meetingParticipant.create({
      data: {
        meetingId: invite.meetingId,
        userId: guest.id,
        name: body.name,
        position: "ผู้เข้าร่วมประชุม",
        role: body.role,
        department: "ภายนอกองค์กร",
        email: invite.guestEmail,
        attendance: "attend",
        present: true,
        inSystem: false,
      },
    });

    return { guest, participant, meetingId: invite.meetingId };
  });

  if (!result) throw new ApiError(410, "ลิงก์นี้ถูกใช้ไปแล้วหรือหมดอายุ");

  const sessionToken = await createSession(result.guest.id, "external");

  return Response.json({
    token: sessionToken,
    meetingId: result.meetingId,
    participant: {
      id: result.participant.id,
      userId: result.participant.userId,
      name: result.participant.name,
      position: result.participant.position,
      role: result.participant.role,
      department: result.participant.department,
      email: result.participant.email,
      attendance: result.participant.attendance,
      present: result.participant.present,
      inSystem: result.participant.inSystem,
    },
    user: {
      id: result.guest.id,
      name: result.guest.name,
      position: result.guest.position,
      department: result.guest.department,
      email: result.guest.email,
      systemRole: result.guest.systemRole,
      committeeIds: [],
    },
  });
});
