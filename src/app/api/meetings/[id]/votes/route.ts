// GET  /api/meetings/[id]/votes — รายการหัวข้อโหวตทั้งหมดของการประชุม
// POST /api/meetings/[id]/votes — สร้างหัวข้อโหวตใหม่ (เฉพาะผู้คุมห้องประชุม)

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth";
import { requireMeetingAccess } from "@/lib/api/meetingGuard";
import { withApi, readJson } from "@/lib/api/respond";
import { voteTopicInclude, toVoteTopic } from "@/lib/api/votes";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi(async (request: Request, ctx: Ctx) => {
  const { id: meetingId } = await ctx.params;
  const user = await requireAuth(request);
  await requireMeetingAccess(user, meetingId, "meeting.view");

  const topics = await prisma.voteTopic.findMany({
    where: { meetingId },
    include: voteTopicInclude,
    orderBy: { createdAt: "asc" },
  });

  return Response.json({ topics: topics.map(toVoteTopic) });
});

const createSchema = z.object({
  title: z.string().trim().min(1, "ต้องระบุหัวข้อโหวต").max(200),
  description: z.string().trim().max(2000).optional(),
  // อย่างน้อย 2 ตัวเลือก — โหวตที่มีตัวเลือกเดียวไม่มีความหมาย
  options: z.array(z.string().trim().min(1).max(200)).min(2).max(20),
});

export const POST = withApi(async (request: Request, ctx: Ctx) => {
  const { id: meetingId } = await ctx.params;
  const user = await requireAuth(request);
  await requireMeetingAccess(user, meetingId, "meeting.manageVoting");

  const body = createSchema.parse(await readJson(request));

  const topic = await prisma.voteTopic.create({
    data: {
      meetingId,
      title: body.title,
      description: body.description,
      createdBy: user.id,
      options: {
        create: body.options.map((label, index) => ({ label, sortOrder: index })),
      },
    },
    include: voteTopicInclude,
  });

  return Response.json({ topic: toVoteTopic(topic) }, { status: 201 });
});
