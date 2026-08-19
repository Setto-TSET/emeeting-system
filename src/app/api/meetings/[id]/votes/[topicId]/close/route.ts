// POST /api/meetings/[id]/votes/[topicId]/close — ปิดโหวต (ปิดแล้วลงคะแนนเพิ่มไม่ได้)
//
// สิทธิ์: ผู้คุมห้องประชุม (meeting.manageVoting) หรือคนที่สร้างหัวข้อนั้นเอง
// — ตรงกับเงื่อนไข canManage ที่ VoteTopicCard ใช้ซ่อน/แสดงปุ่มอยู่แล้ว

import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/api/auth";
import { loadMeetingForAuthz } from "@/lib/api/meetingGuard";
import { can } from "@/lib/authz";
import { withApi } from "@/lib/api/respond";
import { voteTopicInclude, toVoteTopic } from "@/lib/api/votes";

type Ctx = { params: Promise<{ id: string; topicId: string }> };

export const POST = withApi(async (request: Request, ctx: Ctx) => {
  const { id: meetingId, topicId } = await ctx.params;
  const user = await requireAuth(request);
  const meeting = await loadMeetingForAuthz(meetingId);

  const topic = await prisma.voteTopic.findUnique({
    where: { id: topicId },
    select: { meetingId: true, status: true, createdBy: true },
  });
  if (!topic || topic.meetingId !== meetingId) throw new ApiError(404, "ไม่พบหัวข้อโหวตนี้");

  const allowed = can(user, "meeting.manageVoting", meeting) || topic.createdBy === user.id;
  if (!allowed) throw new ApiError(403, "คุณไม่มีสิทธิ์ปิดโหวตหัวข้อนี้");

  // ปิดซ้ำไม่ถือเป็น error — ตอบสถานะปัจจุบันกลับไป แต่ไม่ทับ closedAt ของครั้งแรก
  const updated =
    topic.status === "closed"
      ? await prisma.voteTopic.findUniqueOrThrow({ where: { id: topicId }, include: voteTopicInclude })
      : await prisma.voteTopic.update({
          where: { id: topicId },
          data: { status: "closed", closedAt: new Date() },
          include: voteTopicInclude,
        });

  return Response.json({ topic: toVoteTopic(updated) });
});
