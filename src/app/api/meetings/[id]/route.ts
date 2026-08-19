// GET   /api/meetings/[id] — รายละเอียดการประชุม
// PATCH /api/meetings/[id] — อัปเดตแบบ "ทั้งเอกสาร"
//
// UI มองการประชุมเป็นก้อนเดียว (updateMeeting(id, partial) ส่ง array ซ้อนมาทั้งชุด)
// endpoint นี้จึงรับ partial แบบเดียวกัน: field ไหนส่งมาก็เขียนทับ field นั้น
// array ไหนส่งมาก็ลบของเดิมแล้วสร้างใหม่ทั้งชุด
//
// ponytail: เขียนทับทั้ง array ง่ายและตรงกับที่ UI คิด แต่แลกมาด้วยการเขียนเยอะกว่าที่จำเป็น
// และคนสองคนแก้คนละ field ในเทิร์นเดียวกันจะทับกัน — ถ้าเริ่มชนกันจริงค่อยแยกเป็น
// endpoint ย่อยรายฟิลด์ (participants/files/permissions) แล้ว PATCH ทีละแถว

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError, type SessionUser } from "@/lib/api/auth";
import { withApi, readJson } from "@/lib/api/respond";
import { meetingInclude, toMeeting } from "@/lib/api/meetings";
import { loadMeetingForAuthz } from "@/lib/api/meetingGuard";
import { can } from "@/lib/authz";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireAuth(request);
  const row = await prisma.meeting.findUnique({ where: { id }, include: meetingInclude });
  if (!row) throw new ApiError(404, "ไม่พบการประชุมนี้");

  const meeting = toMeeting(row);
  if (!can(user, "meeting.view", meeting)) throw new ApiError(403, "คุณไม่มีสิทธิ์ดูการประชุมนี้");
  return Response.json({ meeting });
});

const participantSchema = z.object({
  id: z.string().optional(),
  userId: z.string().nullable().default(null),
  name: z.string(),
  position: z.string().default(""),
  role: z.string().default(""),
  department: z.string().default(""),
  email: z.string().default(""),
  attendance: z.enum(["attend", "representative", "absent", "pending"]).default("pending"),
  present: z.boolean().default(false),
  inSystem: z.boolean().default(false),
});

const fileSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().default(""),
  size: z.string().default(""),
  uploadedBy: z.string().default(""),
  type: z.enum(["regulation", "attachment", "report_draft", "report_final"]).default("attachment"),
  visibility: z.enum(["public", "committee", "participants", "restricted"]).default("participants"),
  allowedPositions: z.array(z.string()).optional(),
  allowedUserIds: z.array(z.string()).optional(),
  storageKey: z.string().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().optional(),
});

const patchSchema = z.object({
  name: z.string().optional(),
  shortName: z.string().optional(),
  type: z.string().optional(),
  date: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  emailSenderName: z.string().optional(),
  conferenceProvider: z
    .enum(["mock", "teams", "zoom", "google_meet", "zegocloud", "other"])
    .optional(),
  conferenceLink: z.string().nullable().optional(),
  conferenceRoomKey: z.string().nullable().optional(),
  zegoSipUri: z.string().nullable().optional(),
  status: z.enum(["prepare", "notified", "in_progress", "waiting_endorse", "endorsed"]).optional(),
  displayFormat: z.number().int().min(1).max(6).optional(),
  savedToDrive: z.boolean().optional(),
  allowGuestJoin: z.boolean().optional(),
  transcriptStatus: z.enum(["none", "processing", "ready", "failed"]).optional(),
  summaryDraftId: z.string().nullable().optional(),
  activeAgendaId: z.string().nullable().optional(),
  confidentialityLevel: z.enum(["normal", "restricted", "top_secret"]).optional(),
  notifiedAt: z.string().nullable().optional(),
  reminderSentAt: z.string().nullable().optional(),
  extraTextBoxes: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  participants: z.array(participantSchema).optional(),
  files: z.array(fileSchema).optional(),
  permissions: z
    .array(z.object({ userId: z.string(), name: z.string(), type: z.enum(["manager", "reader"]) }))
    .optional(),
});

/** ผู้ที่แก้เอกสารการประชุมได้ = ผู้ดูแลการประชุม หรือผู้คุมห้อง (host แก้สถานะ/เช็คชื่อระหว่างประชุม) */
async function requireWriteAccess(user: SessionUser, meetingId: string) {
  const meeting = await loadMeetingForAuthz(meetingId);
  if (!can(user, "meeting.edit", meeting) && !can(user, "meeting.host", meeting)) {
    throw new ApiError(403, "คุณไม่มีสิทธิ์แก้ไขการประชุมนี้");
  }
  // รับรองแล้ว = ปิดถาวร แม้แต่ผู้จัดก็ย้อนแก้ไม่ได้ (เดิมล็อกแค่ที่ UI)
  if (meeting.status === "endorsed" && user.systemRole !== "admin") {
    throw new ApiError(409, "การประชุมนี้รับรองแล้ว แก้ไขไม่ได้");
  }
  return meeting;
}

export const PATCH = withApi(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireAuth(request);
  await requireWriteAccess(user, id);

  const { participants, files, permissions, notifiedAt, reminderSentAt, extraTextBoxes, ...scalars } =
    patchSchema.parse(await readJson(request));

  await prisma.$transaction(async (tx) => {
    await tx.meeting.update({
      where: { id },
      data: {
        ...scalars,
        ...(notifiedAt !== undefined ? { notifiedAt: notifiedAt ? new Date(notifiedAt) : null } : {}),
        ...(reminderSentAt !== undefined
          ? { reminderSentAt: reminderSentAt ? new Date(reminderSentAt) : null }
          : {}),
        ...(extraTextBoxes !== undefined ? { extraTextBoxes } : {}),
      },
    });

    if (participants) {
      await tx.meetingParticipant.deleteMany({ where: { meetingId: id } });
      await tx.meetingParticipant.createMany({
        data: participants.map((p) => ({ ...p, meetingId: id })),
      });
    }
    if (files) {
      await tx.meetingFile.deleteMany({ where: { meetingId: id } });
      await tx.meetingFile.createMany({ data: files.map((f) => ({ ...f, meetingId: id })) });
    }
    if (permissions) {
      await tx.meetingPermission.deleteMany({ where: { meetingId: id } });
      await tx.meetingPermission.createMany({
        data: permissions.map((p) => ({ ...p, meetingId: id })),
      });
    }
  });

  const updated = await prisma.meeting.findUniqueOrThrow({ where: { id }, include: meetingInclude });
  return Response.json({ meeting: toMeeting(updated) });
});
