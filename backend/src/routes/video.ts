// ═══════════════════════════════════════════
// Routes — Video Token (Webex Guest Issuer)
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware';
import { getWebexGuestToken } from '../services/webex';

const router = Router();

/**
 * POST /api/video/token
 * ขอ guest token สำหรับเข้า Webex meeting จากเบราว์เซอร์
 */
router.post('/token', asyncHandler(async (req: Request, res: Response) => {
  const { engineId, roomKey } = req.body;

  if (!engineId || !roomKey) {
    return res.status(400).json({ error: 'Missing engineId or roomKey' });
  }

  if (engineId !== 'webex') {
    return res.status(400).json({ error: 'Only Webex supported for now' });
  }

  try {
    // TODO: implement getWebexGuestToken
    // ตอนนี้แค่ return mock ให้ frontend ไปต่อได้
    const token = await getWebexGuestToken(roomKey, req.user?.email || 'guest@example.com');

    res.json({
      token,
      providerRoomId: `space-${roomKey}`,
      expiresAt: Date.now() + 3600000 // 1 hour
    });
  } catch (error: any) {
    console.error('❌ Failed to get Webex token:', error);
    res.status(500).json({ error: error.message });
  }
}));

export default router;
