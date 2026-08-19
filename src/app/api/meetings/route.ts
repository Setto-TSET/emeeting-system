// GET  /api/meetings — การประชุมทั้งหมดที่ผู้ใช้คนนี้มีสิทธิ์เห็น
// POST /api/meetings — สร้างการประชุมใหม่

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/api/auth";
import { withApi, readJson } from "@/lib/api/respond";
import { meetingInclude, toMeeting } from "@/lib/api/meetings";
import { can, canCreateMeeting } from "@/lib/authz";

export const GET = withApi(async (request: Request) => {
  const user = await requireAuth(request);
  const rows = await prisma.meeting.findMany({ include: meetingInclude, orderBy: { date: "desc" } });
  // กรองด้วย can() ตัวเดียวกับที่ UI ใช้ — ไม่แปลงกติกาเป็น where clause ซ้ำอีกชุด
  // ponytail: กรองในหน่วยความจำ พอสำหรับหลักร้อยรายการ ถ้าโตกว่านั้นค่อยดันเงื่อนไขลง SQL
  const meetings = rows.map(toMeeting).filter((m) => can(user, "meeting.view", m));
  return Response.json({ meetings });
});

const createSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  shortName: z.string().trim().default(""),
  type: z.string().trim().default(""),
  committeeId: z.string().min(1),
  organizerEmail: z.string().default(""),
  emailSenderName: z.string().default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  location: z.string().default(""),
  conferenceProvider: z
    .enum(["mock", "teams", "zoom", "google_meet", "zegocloud", "other"])
    .default("mock"),
  conferenceLink: z.string().optional(),
  conferenceRoomKey: z.string().optional(),
  displayFormat: z.number().int().min(1).max(6).default(1),
  description: z.string().optional(),
  allowGuestJoin: z.boolean().default(false),
  participants: z
    .array(
      z.object({
        userId: z.string().nullable().default(null),
        name: z.string(),
        position: z.string().default(""),
        role: z.string().default(""),
        department: z.string().default(""),
        email: z.string().default(""),
        inSystem: z.boolean().default(false),
      })
    )
    .default([]),
  agenda: z
    .array(z.object({ no: z.string(), title: z.string(), detail: z.string().optional() }))
    .default([]),
});

export const POST = withApi(async (request: Request) => {
  const user = await requireAuth(request);
  if (!canCreateMeeting(user)) throw new ApiError(403, "คุณไม่มีสิทธิ์สร้างการประชุม");

  const body = createSchema.parse(await readJson(request));
  if (await prisma.meeting.findUnique({ where: { id: body.id }, select: { id: true } })) {
    throw new ApiError(409, "มีการประชุมรหัสนี้อยู่แล้ว");
  }

  const { participants, agenda, ...meeting } = body;
  const created = await prisma.meeting.create({
    data: {
      ...meeting,
      organizerId: user.id,
      organizerEmail: meeting.organizerEmail || user.email,
      participants: { create: participants },
      agenda: { create: agenda },
      // ผู้สร้างได้สิทธิ์ manager ของประชุมนี้เสมอ ไม่งั้นแก้ของตัวเองไม่ได้ถ้าไม่ใช่เลขาฯ ของคณะ
      permissions: { create: [{ userId: user.id, name: user.name, type: "manager" }] },
    },
    include: meetingInclude,
  });

  return Response.json({ meeting: toMeeting(created) }, { status: 201 });
});
