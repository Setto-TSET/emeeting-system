// ═══════════════════════════════════════════
// Auth Routes — เข้าสู่ระบบด้วยรหัสผ่านจริง
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { verifyPassword, signAccessToken } from '../services/auth';
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
