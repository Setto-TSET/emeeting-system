// GET /api/invite/[token] — ตรวจลิงก์เชิญ (ไม่ต้องล็อกอิน — คนที่เปิดคือแขกที่ยังไม่มีบัญชี)

import { prisma } from "@/lib/prisma";
import { withApi } from "@/lib/api/respond";
import { toInvite } from "@/lib/api/invites";

type Ctx = { params: Promise<{ token: string }> };

export const GET = withApi(async (_request: Request, ctx: Ctx) => {
  const { token } = await ctx.params;

  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: {
      meeting: {
        select: {
          id: true,
          name: true,
          date: true,
          startTime: true,
          endTime: true,
          location: true,
          organizer: { select: { name: true } },
        },
      },
    },
  });

  // ไม่บอกรายละเอียดการประชุมจนกว่าลิงก์จะใช้ได้จริง
  if (!invite) return Response.json({ ok: false, reason: "not_found" }, { status: 404 });
  if (invite.used) return Response.json({ ok: false, reason: "already_used" }, { status: 410 });
  if (invite.expiresAt < new Date()) {
    return Response.json({ ok: false, reason: "expired" }, { status: 410 });
  }

  const { organizer, ...meeting } = invite.meeting;
  return Response.json({
    ok: true,
    invite: toInvite(invite),
    meeting: { ...meeting, organizer: organizer?.name ?? "" },
  });
});
