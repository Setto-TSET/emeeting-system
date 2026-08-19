// GET  /api/meetings/[id]/invites — ลิงก์เชิญทั้งหมดของการประชุมนี้
// POST /api/meetings/[id]/invites — สร้าง magic link ใหม่

import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth";
import { requireMeetingAccess } from "@/lib/api/meetingGuard";
import { withApi, readJson } from "@/lib/api/respond";
import { toInvite } from "@/lib/api/invites";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi(async (request: Request, ctx: Ctx) => {
  const { id: meetingId } = await ctx.params;
  const user = await requireAuth(request);
  await requireMeetingAccess(user, meetingId, "meeting.manageParticipants");

  const invites = await prisma.inviteToken.findMany({
    where: { meetingId },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ invites: invites.map(toInvite) });
});

const createSchema = z.object({
  guestEmail: z.email(),
  guestName: z.string().trim().max(200).optional(),
  expiresInHours: z.number().int().positive().max(24 * 30).default(48),
});

export const POST = withApi(async (request: Request, ctx: Ctx) => {
  const { id: meetingId } = await ctx.params;
  const user = await requireAuth(request);
  // เชิญคนนอกเข้าประชุม = เพิ่มองค์ประชุม จึงใช้สิทธิ์ชุดเดียวกัน
  await requireMeetingAccess(user, meetingId, "meeting.manageParticipants");

  const body = createSchema.parse(await readJson(request));
  const invite = await prisma.inviteToken.create({
    data: {
      // 32 ไบต์สุ่มจาก CSPRNG — เดาไม่ได้ ต่างจากของเดิมที่สุ่มฝั่งเบราว์เซอร์แล้วเก็บใน localStorage
      token: randomBytes(24).toString("base64url"),
      meetingId,
      guestEmail: body.guestEmail,
      guestName: body.guestName,
      expiresAt: new Date(Date.now() + body.expiresInHours * 3600_000),
      createdBy: user.id,
    },
  });

  return Response.json({ invite: toInvite(invite) }, { status: 201 });
});
