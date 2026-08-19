// POST /api/meetings/[id]/agenda/[agendaId]/comments — แสดงความเห็นต่อวาระ (ผู้ที่ดูประชุมนี้ได้)

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/api/auth";
import { requireMeetingAccess } from "@/lib/api/meetingGuard";
import { withApi, readJson } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string; agendaId: string }> };

const bodySchema = z.object({ text: z.string().trim().min(1).max(2000), time: z.string().min(1) });

export const POST = withApi(async (request: Request, ctx: Ctx) => {
  const { id: meetingId, agendaId } = await ctx.params;
  const user = await requireAuth(request);
  await requireMeetingAccess(user, meetingId, "meeting.view");

  const agenda = await prisma.meetingAgendaItem.findUnique({
    where: { id: agendaId },
    select: { meetingId: true },
  });
  if (!agenda || agenda.meetingId !== meetingId) throw new ApiError(404, "ไม่พบวาระนี้");

  const body = bodySchema.parse(await readJson(request));
  const comment = await prisma.agendaComment.create({
    data: { agendaItemId: agendaId, by: user.name, text: body.text, time: body.time },
  });

  return Response.json(
    { comment: { by: comment.by, text: comment.text, time: comment.time } },
    { status: 201 }
  );
});
