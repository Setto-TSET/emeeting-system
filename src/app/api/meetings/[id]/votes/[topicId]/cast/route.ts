// POST /api/meetings/[id]/votes/[topicId]/cast — ลงคะแนน
//
// "1 คน 1 เสียง" บังคับด้วย unique index (topicId, userId) ใน schema แล้ว upsert ทับ
// ของเดิม — เปลี่ยนใจโหวตใหม่ได้ และสองแท็บกดพร้อมกันก็ไม่ทำให้คะแนนคนอื่นหาย
// (ต่างจากของเดิมใน IndexedDB ที่อ่าน-แก้-เขียนทั้งก้อน แล้วเสียงที่เขียนช้ากว่าทับเสียงแรกทิ้ง)

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/api/auth";
import { requireMeetingAccess } from "@/lib/api/meetingGuard";
import { withApi, readJson } from "@/lib/api/respond";
import { voteTopicInclude, toVoteTopic } from "@/lib/api/votes";

type Ctx = { params: Promise<{ id: string; topicId: string }> };

const bodySchema = z.object({ optionId: z.string().min(1) });

export const POST = withApi(async (request: Request, ctx: Ctx) => {
  const { id: meetingId, topicId } = await ctx.params;
  const user = await requireAuth(request);
  await requireMeetingAccess(user, meetingId, "meeting.join");

  const { optionId } = bodySchema.parse(await readJson(request));

  const topic = await prisma.voteTopic.findUnique({
    where: { id: topicId },
    select: { meetingId: true, status: true, options: { select: { id: true } } },
  });
  // เทียบ meetingId ด้วย — กัน topicId ของประชุมอื่นถูกยิงผ่าน path ของประชุมที่ตัวเองมีสิทธิ์
  if (!topic || topic.meetingId !== meetingId) throw new ApiError(404, "ไม่พบหัวข้อโหวตนี้");
  if (topic.status === "closed") throw new ApiError(409, "หัวข้อนี้ปิดโหวตแล้ว");
  if (!topic.options.some((o) => o.id === optionId)) {
    throw new ApiError(400, "ตัวเลือกนี้ไม่ได้อยู่ในหัวข้อโหวตนี้");
  }

  await prisma.voteRecord.upsert({
    where: { topicId_userId: { topicId, userId: user.id } },
    create: { topicId, optionId, userId: user.id, userName: user.name },
    update: { optionId, userName: user.name },
  });

  const updated = await prisma.voteTopic.findUniqueOrThrow({
    where: { id: topicId },
    include: voteTopicInclude,
  });

  return Response.json({ topic: toVoteTopic(updated) });
});
