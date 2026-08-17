// ═══════════════════════════════════════════
// Auth Routes — เข้าสู่ระบบด้วยรหัสผ่านจริง
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { queryOne } from '../database/connection';
import { verifyPassword, signAccessToken, signGuestToken } from '../services/auth';
import { authMiddleware, asyncHandler } from '../middleware';

const router = Router();

const INVALID_CREDENTIALS = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';

router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' });
    }

    const claims = await verifyPassword(email, password);
    if (!claims) {
      return res.status(401).json({ error: INVALID_CREDENTIALS });
    }

    res.json({
      token: signAccessToken(claims),
      user: {
        id: claims.sub,
        name: claims.name,
        email: claims.email,
        systemRole: claims.role,
        ...(claims.roomId ? { roomId: claims.roomId } : {}),
      },
    });
  })
);

router.post(
  '/guest',
  asyncHandler(async (req: Request, res: Response) => {
    const { meetingId, name } = req.body ?? {};
    if (typeof meetingId !== 'string' || typeof name !== 'string' || !meetingId || !name.trim()) {
      return res.status(400).json({ error: 'ต้องระบุรหัสการประชุมและชื่อผู้เข้าร่วม' });
    }

    const meeting = (await queryOne('SELECT id, allow_guest_join FROM meetings WHERE id = ?', [meetingId])) as
      | { id: string; allow_guest_join: number }
      | undefined;

    if (!meeting) return res.status(404).json({ error: 'ไม่พบการประชุมนี้' });
    if (!meeting.allow_guest_join) {
      return res.status(403).json({ error: 'การประชุมนี้ไม่เปิดให้บุคคลภายนอกเข้าร่วม' });
    }

    const guestId = `guest-${randomUUID()}`;
    res.json({
      token: signGuestToken({ sub: guestId, name: name.trim(), meetingId }),
      user: { id: guestId, name: name.trim(), email: '', systemRole: 'guest' },
    });
  })
);

router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json({
    user: {
      id: req.user!.id,
      name: req.user!.name,
      email: req.user!.email,
      systemRole: req.user!.role,
    },
  });
});

export default router;
