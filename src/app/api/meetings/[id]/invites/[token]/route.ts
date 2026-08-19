// DELETE /api/meetings/[id]/invites/[token] — ยกเลิกลิงก์เชิญ

import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/api/auth";
import { requireMeetingAccess } from "@/lib/api/meetingGuard";
import { withApi } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string; token: string }> };

export const DELETE = withApi(async (request: Request, ctx: Ctx) => {
  const { id: meetingId, token } = await ctx.params;
  const user = await requireAuth(request);
  await requireMeetingAccess(user, meetingId, "meeting.manageParticipants");

  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    select: { meetingId: true },
  });
  if (!invite || invite.meetingId !== meetingId) throw new ApiError(404, "ไม่พบลิงก์เชิญนี้");

  await prisma.inviteToken.delete({ where: { token } });
  return Response.json({ ok: true });
});
