// ═══════════════════════════════════════════
// Routes — ลิงก์เชิญบุคคลภายนอก
//
// สองเส้นทางแรกเปิดสาธารณะโดยตั้งใจ — แขกยังไม่มี token ตอนเปิดลิงก์
// ตัวลิงก์เองคือหลักฐานการได้รับเชิญ (32 ไบต์จาก CSPRNG เดาไม่ได้)
// ที่เหลือต้องล็อกอินและเป็นผู้จัดการประชุมนั้น
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware, asyncHandler } from '../middleware';
import { getMeeting } from '../repositories/meetings';
import { canEditMeeting } from '../services/meetingAccess';
import { signGuestToken } from '../services/auth';
import {
  Invite,
  consumeInvite,
  createInvite,
  getInvite,
  listInvitesForMeeting,
  revokeInvite,
} from '../repositories/invites';

/** เส้นทางสาธารณะ — ไม่ผ่าน authMiddleware */
export const publicInvitesRouter = Router();

/** เส้นทางที่ต้องล็อกอิน */
export const invitesRouter = Router();
invitesRouter.use(authMiddleware);

/** เส้นทางย่อยของการประชุม (`/api/meetings/:id/invites`) — ต้องล็อกอิน */
export const meetingInvitesRouter = Router({ mergeParams: true });
meetingInvitesRouter.use(authMiddleware);

/**
 * รายละเอียดการประชุมเท่าที่หน้าเชิญต้องใช้
 * ไม่ส่งวาระ ไฟล์ หรือรายชื่อผู้เข้าร่วม — ใครถือลิงก์เห็นได้แค่ว่าถูกเชิญไปประชุมอะไร
 */
function publicMeetingView(meeting: Record<string, unknown>) {
  return {
    id: meeting.id,
    name: (meeting.name ?? meeting.title ?? '') as string,
    date: (meeting.date ?? '') as string,
    startTime: (meeting.startTime ?? '') as string,
    endTime: (meeting.endTime ?? '') as string,
    location: (meeting.location ?? meeting.room ?? '') as string,
    organizer: (meeting.organizer ?? '') as string,
  };
}

/** ข้อมูลลิงก์ที่ปลอดภัยจะส่งให้คนที่ยังไม่ล็อกอิน */
function publicInviteView(invite: Invite) {
  return {
    guestEmail: invite.guestEmail,
    guestName: invite.guestName,
    expiresAt: invite.expiresAt,
    invitedBy: invite.createdByName,
  };
}

/** แปลงสถานะลิงก์เป็นคำตอบ HTTP — ใช้ร่วมกันทั้งตอนเปิดลิงก์และตอนกดยอมรับ */
function rejectionFor(invite: Invite | null): { status: number; reason: string } | null {
  if (!invite) return { status: 404, reason: 'not_found' };
  if (invite.status === 'revoked') return { status: 410, reason: 'revoked' };
  if (invite.status === 'used') return { status: 410, reason: 'already_used' };
  if (invite.status === 'expired') return { status: 410, reason: 'expired' };
  return null;
}

/** GET /api/invites/:token — เปิดลิงก์ ไม่ต้องล็อกอิน */
publicInvitesRouter.get(
  '/:token',
  asyncHandler(async (req: Request, res: Response) => {
    const invite = await getInvite(req.params.token);
    const rejected = rejectionFor(invite);
    if (rejected) return res.status(rejected.status).json({ reason: rejected.reason });

    const meeting = await getMeeting(invite!.meetingId);
    if (!meeting) return res.status(404).json({ reason: 'meeting_not_found' });

    res.json({ invite: publicInviteView(invite!), meeting: publicMeetingView(meeting) });
  })
);

/**
 * POST /api/invites/:token/accept — ยอมรับคำเชิญ ไม่ต้องล็อกอิน
 * คำเชิญที่ผู้จัดออกให้เป็นรายคนคือการอนุญาตแล้ว จึงไม่เช็ค allow_guest_join ซ้ำ
 * (ต่างจาก /api/auth/guest ที่ใครรู้ meetingId ก็ยิงได้)
 */
publicInvitesRouter.post(
  '/:token/accept',
  asyncHandler(async (req: Request, res: Response) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อของท่าน' });

    const invite = await getInvite(req.params.token);
    const rejected = rejectionFor(invite);
    if (rejected) return res.status(rejected.status).json({ reason: rejected.reason });

    const meeting = await getMeeting(invite!.meetingId);
    if (!meeting) return res.status(404).json({ reason: 'meeting_not_found' });

    // ตัดสินที่ MySQL ไม่ใช่ที่นี่ — สองคนกดพร้อมกันได้แค่คนเดียว
    if (!(await consumeInvite(req.params.token, name))) {
      const latest = await getInvite(req.params.token);
      const late = rejectionFor(latest) ?? { status: 410, reason: 'already_used' };
      return res.status(late.status).json({ reason: late.reason });
    }

    const guestId = `guest-${randomUUID()}`;
    res.json({
      token: signGuestToken({ sub: guestId, name, meetingId: invite!.meetingId }),
      user: { id: guestId, name, email: invite!.guestEmail, systemRole: 'guest' },
      meeting: publicMeetingView(meeting),
    });
  })
);

/** โหลดการประชุมพร้อมเช็คสิทธิ์ออกลิงก์ — คืน null แล้วตอบไปแล้วถ้าไม่ผ่าน */
async function loadEditable(req: Request, res: Response, meetingId: string) {
  const meeting = await getMeeting(meetingId);
  if (!meeting) {
    res.status(404).json({ error: 'ไม่พบการประชุมนี้' });
    return null;
  }
  if (!canEditMeeting({ id: req.user!.id, role: req.user!.role }, meeting)) {
    res.status(403).json({ error: 'ไม่มีสิทธิ์จัดการลิงก์เชิญของการประชุมนี้' });
    return null;
  }
  return meeting;
}

/** POST /api/meetings/:id/invites — ออกลิงก์ใหม่ */
meetingInvitesRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const meeting = await loadEditable(req, res, req.params.id);
    if (!meeting) return;

    const input = req.body?.invite ?? {};
    const guestEmail = typeof input.guestEmail === 'string' ? input.guestEmail.trim() : '';
    if (!guestEmail) return res.status(400).json({ error: 'ต้องระบุอีเมลผู้รับคำเชิญ' });

    const invite = await createInvite({
      meetingId: req.params.id,
      guestEmail,
      guestName: typeof input.guestName === 'string' ? input.guestName : null,
      createdBy: req.user!.id,
      createdByName: req.user!.name,
    });

    res.status(201).json({ invite });
  })
);

/** GET /api/meetings/:id/invites — ดูลิงก์ทั้งหมดของการประชุมนี้ */
meetingInvitesRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const meeting = await loadEditable(req, res, req.params.id);
    if (!meeting) return;

    res.json({ invites: await listInvitesForMeeting(req.params.id) });
  })
);

/** DELETE /api/invites/:token — เพิกถอน (ไม่ลบแถว) */
invitesRouter.delete(
  '/:token',
  asyncHandler(async (req: Request, res: Response) => {
    const invite = await getInvite(req.params.token);
    if (!invite) return res.status(404).json({ error: 'ไม่พบลิงก์เชิญนี้' });

    const meeting = await loadEditable(req, res, invite.meetingId);
    if (!meeting) return;

    await revokeInvite(req.params.token);
    res.json({ revoked: true });
  })
);
