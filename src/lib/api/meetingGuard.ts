// ═══════════════════════════════════════════
// โหลดการประชุมจาก DB แล้วตรวจสิทธิ์ด้วยกติกาชุดเดียวกับฝั่ง UI
//
// จุดสำคัญ: ใช้ can() จาก src/lib/authz.ts ตัวเดียวกับที่หน้าจอใช้ ไม่เขียนกติกาซ้ำ
// — ฝั่ง UI ทำหน้าที่ซ่อนปุ่ม ฝั่งนี้ทำหน้าที่บังคับจริง
// ═══════════════════════════════════════════

import { prisma } from "@/lib/prisma";
import { can, type AuthzMeeting, type MeetingAction } from "@/lib/authz";
import { ApiError, type SessionUser } from "./auth";

/** query เท่าที่ authz.ts ต้องใช้ — ไม่ดึง agenda/files/chat ที่ไม่เกี่ยวกับการตัดสินสิทธิ์ */
export async function loadMeetingForAuthz(meetingId: string): Promise<AuthzMeeting> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      organizerId: true,
      committeeId: true,
      location: true,
      status: true,
      committee: { select: { name: true } },
      participants: { select: { userId: true } },
      permissions: { select: { userId: true, type: true } },
    },
  });
  if (!meeting) throw new ApiError(404, "ไม่พบการประชุมนี้");

  return {
    organizerId: meeting.organizerId,
    committeeId: meeting.committeeId,
    committee: meeting.committee.name,
    location: meeting.location,
    status: meeting.status,
    participants: meeting.participants,
    permissions: meeting.permissions,
  };
}

/** โหลด + ตรวจสิทธิ์ในขั้นตอนเดียว — ไม่ผ่านให้ 403 (ไม่ใช่ 404 เพราะผู้เรียกล็อกอินแล้ว) */
export async function requireMeetingAccess(
  user: SessionUser,
  meetingId: string,
  action: MeetingAction
): Promise<AuthzMeeting> {
  const meeting = await loadMeetingForAuthz(meetingId);
  if (!can(user, action, meeting)) throw new ApiError(403, "คุณไม่มีสิทธิ์ดำเนินการนี้");
  return meeting;
}
