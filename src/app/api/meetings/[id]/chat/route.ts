// POST /api/meetings/[id]/chat — ส่งข้อความแชทในห้องประชุม (ผู้เข้าร่วมส่งได้ ไม่ต้องเป็นผู้ดูแล)

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth";
import { requireMeetingAccess } from "@/lib/api/meetingGuard";
import { withApi, readJson } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  text: z.string().trim().min(1).max(2000),
  time: z.string().min(1),
});

export const POST = withApi(async (request: Request, ctx: Ctx) => {
  const { id: meetingId } = await ctx.params;
  const user = await requireAuth(request);
  await requireMeetingAccess(user, meetingId, "meeting.join");

  const body = bodySchema.parse(await readJson(request));
  // ชื่อผู้ส่งมาจาก session — client กำหนดเองไม่ได้ ไม่งั้นสวมรอยเป็นคนอื่นได้
  const message = await prisma.chatMessage.create({
    data: { meetingId, sender: user.name, text: body.text, time: body.time },
  });

  return Response.json(
    { message: { id: message.id, sender: message.sender, text: message.text, time: message.time } },
    { status: 201 }
  );
});
