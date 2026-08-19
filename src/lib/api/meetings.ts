// ═══════════════════════════════════════════
// แปลง row ของ Prisma เป็น Meeting รูปแบบเดียวกับ src/data/index.ts
// (UI มองการประชุมเป็น "เอกสารก้อนเดียวที่มี array ซ้อน" — เก็บรูปแบบนั้นไว้
//  จะได้ไม่ต้องแก้หน้าจอ 2,000 บรรทัดตอนย้ายข้อมูลขึ้น server)
// ═══════════════════════════════════════════

import type { Prisma } from "@prisma/client";
import type { Meeting } from "@/data";
import type { ConferenceProvider } from "@/lib/conference";

export const meetingInclude = {
  committee: { select: { name: true } },
  organizer: { select: { name: true } },
  participants: true,
  files: true,
  agenda: { include: { comments: { orderBy: { createdAt: "asc" } } } },
  permissions: true,
  chatMessages: { orderBy: { createdAt: "asc" } },
  secretGroups: { include: { members: { select: { participantId: true } } } },
  zoomRoomDevices: true,
} satisfies Prisma.MeetingInclude;

type MeetingRow = Prisma.MeetingGetPayload<{ include: typeof meetingInclude }>;

export function toMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    type: row.type,
    committee: row.committee.name,
    committeeId: row.committeeId,
    organizerId: row.organizerId,
    organizer: row.organizer?.name ?? "",
    organizerEmail: row.organizerEmail,
    emailSenderName: row.emailSenderName,
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    location: row.location,
    conferenceProvider: row.conferenceProvider as ConferenceProvider,
    conferenceLink: row.conferenceLink ?? undefined,
    conferenceRoomKey: row.conferenceRoomKey ?? undefined,
    zegoSipUri: row.zegoSipUri ?? undefined,
    status: row.status,
    displayFormat: row.displayFormat,
    description: row.description ?? undefined,
    savedToDrive: row.savedToDrive,
    allowGuestJoin: row.allowGuestJoin,
    transcriptStatus: row.transcriptStatus,
    summaryDraftId: row.summaryDraftId ?? undefined,
    activeAgendaId: row.activeAgendaId,
    confidentialityLevel: row.confidentialityLevel,
    notifiedAt: row.notifiedAt?.toISOString(),
    reminderSentAt: row.reminderSentAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    extraTextBoxes: (row.extraTextBoxes as Meeting["extraTextBoxes"]) ?? undefined,
    participants: row.participants.map((p) => ({
      id: p.id,
      userId: p.userId,
      name: p.name,
      position: p.position,
      role: p.role,
      department: p.department,
      email: p.email,
      attendance: p.attendance,
      present: p.present,
      inSystem: p.inSystem,
    })),
    files: row.files.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      size: f.size,
      uploadedAt: f.uploadedAt.toISOString(),
      uploadedBy: f.uploadedBy,
      type: f.type,
      visibility: f.visibility,
      allowedPositions: (f.allowedPositions as string[] | null) ?? undefined,
      allowedUserIds: (f.allowedUserIds as string[] | null) ?? undefined,
      storageKey: f.storageKey ?? undefined,
      mimeType: f.mimeType ?? undefined,
      sizeBytes: f.sizeBytes ?? undefined,
    })),
    agenda: row.agenda.map((a) => ({
      id: a.id,
      no: a.no,
      title: a.title,
      detail: a.detail ?? undefined,
      secretGroupId: a.secretGroupId,
      comments: a.comments.map((c) => ({ by: c.by, text: c.text, time: c.time })),
    })),
    permissions: row.permissions.map((p) => ({ userId: p.userId, name: p.name, type: p.type })),
    chatMessages: row.chatMessages.map((c) => ({
      id: c.id,
      sender: c.sender,
      text: c.text,
      time: c.time,
    })),
    secretGroups: row.secretGroups.map((g) => ({
      id: g.id,
      name: g.name,
      participantIds: g.members.map((m) => m.participantId),
    })),
    zoomRoomDevices: row.zoomRoomDevices.map((d) => ({
      id: d.id,
      name: d.name,
      roomId: d.roomId,
      sipAddress: d.sipAddress ?? undefined,
      status: d.status,
    })),
  };
}
