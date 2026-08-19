// PATCH /api/meetings/[id]/active-agenda — ผู้คุมห้องกำหนดว่าตอนนี้อยู่วาระไหน

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth";
import { requireMeetingAccess } from "@/lib/api/meetingGuard";
import { withApi, readJson } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ agendaId: z.string().nullable() });

export const PATCH = withApi(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireAuth(request);
  await requireMeetingAccess(user, id, "meeting.host");

  const { agendaId } = bodySchema.parse(await readJson(request));
  await prisma.meeting.update({ where: { id }, data: { activeAgendaId: agendaId } });

  return Response.json({ activeAgendaId: agendaId });
});
