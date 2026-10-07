// ═══════════════════════════════════════════
// Routes — ลิงก์เชิญบุคคลภายนอก (ลิงก์เดียวต่อการประชุม)
//
// ผู้จัดแชร์ลิงก์เดียวให้วิทยากร/ผู้สังเกตการณ์ทุกคน คนที่ได้ลิงก์ใส่ชื่อแล้วเข้าห้องได้เลยโดยไม่ต้องมีบัญชี
// ใช้ได้เฉพาะตอนเปิด "รับบุคคลภายนอก" (allowGuestJoin) — ปิดเมื่อไรลิงก์ใช้ไม่ได้ทันที
// สร้างลิงก์ใหม่ = ยกเลิกลิงก์เดิม (เช่น ลิงก์หลุดไปถึงคนที่ไม่ควรได้)
//
// สองเส้นทางแรกเปิดสาธารณะโดยตั้งใจ — แขกยังไม่มี token ตอนเปิดลิงก์
// ตัวลิงก์คือหลักฐานการได้รับเชิญ (24 ไบต์จาก CSPRNG เดาไม่ได้)
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { authMiddleware, asyncHandler } from '../middleware';
import { findMeetingByGuestToken, getMeeting, MeetingPayload, setGuestLinkToken } from '../repositories/meetings';
import { actorFrom, canEditMeeting } from '../services/meetingAccess';
import { signGuestToken } from '../services/auth';

const MAX_NAME_LENGTH = 120;

/**
 * รายละเอียดการประชุมเท่าที่หน้าเชิญต้องใช้
 * ไม่ส่งวาระ ไฟล์ หรือรายชื่อผู้เข้าร่วม — ใครถือลิงก์เห็นได้แค่ว่าถูกเชิญไปประชุมอะไร
 */
export function publicMeetingView(meeting: MeetingPayload) {
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

/** หาการประชุมจากลิงก์ แล้วตอบเหตุผลไปเองถ้าใช้ไม่ได้ — คืน null เมื่อตอบไปแล้ว */
async function loadByLink(req: Request, res: Response): Promise<MeetingPayload | null> {
  const meeting = await findMeetingByGuestToken(req.params.token);
  if (!meeting) {
    res.status(404).json({ reason: 'not_found' });
    return null;
  }
  if (!meeting.allowGuestJoin) {
    res.status(403).json({ reason: 'guest_join_disabled' });
    return null;
  }
  return meeting;
}

/** เส้นทางสาธารณะ — ไม่ผ่าน authMiddleware */
export const publicGuestLinksRouter = Router();

/** GET /api/guest-links/:token — เปิดลิงก์ ดูว่าเชิญไปประชุมอะไร */
publicGuestLinksRouter.get(
  '/:token',
  asyncHandler(async (req: Request, res: Response) => {
    const meeting = await loadByLink(req, res);
    if (meeting) res.json({ meeting: publicMeetingView(meeting) });
  })
);

/** POST /api/guest-links/:token/join — ใส่ชื่อแล้วได้ guest token ที่ผูกกับการประชุมนี้ห้องเดียว */
publicGuestLinksRouter.post(
  '/:token/join',
  asyncHandler(async (req: Request, res: Response) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อของท่าน' });
    if (name.length > MAX_NAME_LENGTH) return res.status(400).json({ error: `ชื่อยาวเกิน ${MAX_NAME_LENGTH} ตัวอักษร` });

    const meeting = await loadByLink(req, res);
    if (!meeting) return;

    const guestId = `guest-${randomUUID()}`;
    res.json({
      token: signGuestToken({ sub: guestId, name, meetingId: meeting.id }),
      user: { id: guestId, name, email: '', systemRole: 'guest' },
      meeting: publicMeetingView(meeting),
    });
  })
);

/** เส้นทางย่อยของการประชุม (`/api/meetings/:id/guest-link`) — เฉพาะผู้ที่แก้การประชุมได้ */
export const meetingGuestLinkRouter = Router({ mergeParams: true });
meetingGuestLinkRouter.use(authMiddleware);

async function loadEditable(req: Request, res: Response): Promise<MeetingPayload | null> {
  const meeting = await getMeeting(req.params.id);
  if (!meeting) {
    res.status(404).json({ error: 'ไม่พบการประชุมนี้' });
    return null;
  }
  if (!canEditMeeting(actorFrom(req.user!), meeting)) {
    res.status(403).json({ error: 'ไม่มีสิทธิ์จัดการลิงก์เชิญของการประชุมนี้' });
    return null;
  }
  return meeting;
}

/** GET — ลิงก์ปัจจุบัน (null = ยังไม่เคยสร้าง) */
meetingGuestLinkRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const meeting = await loadEditable(req, res);
    if (meeting) res.json({ token: (meeting.guestLinkToken as string | undefined) ?? null });
  })
);

/** POST — สร้างลิงก์ใหม่ ลิงก์เดิมใช้ไม่ได้ทันที */
meetingGuestLinkRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const meeting = await loadEditable(req, res);
    if (!meeting) return;
    const token = randomBytes(24).toString('base64url');
    await setGuestLinkToken(meeting.id, token);
    res.status(201).json({ token });
  })
);
