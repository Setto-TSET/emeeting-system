// ═══════════════════════════════════════════
// Routes — Video Token (ZegoCloud)
//
// หมายเหตุ: ตอนนี้ frontend ออก token เองที่ Next.js route /api/video/token
// เส้นนี้เตรียมไว้สำหรับตอนย้ายมาออก token ที่ backend จริง
// (ServerSecret ต้องอยู่ฝั่ง server เท่านั้น ไม่ว่าจะออกจากที่ไหน)
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware';
import { query } from '../database/connection';

const router = Router();

/**
 * POST /api/video/token
 * ขอ token สำหรับเข้าห้องประชุม ZegoCloud จากเบราว์เซอร์
 */
router.post('/token', asyncHandler(async (req: Request, res: Response) => {
  const { engineId, roomKey } = req.body;

  if (!engineId || !roomKey) {
    return res.status(400).json({ error: 'Missing engineId or roomKey' });
  }

  if (engineId !== 'zegocloud') {
    return res.status(400).json({ error: 'Unsupported engineId — รองรับเฉพาะ zegocloud' });
  }

  try {
    // TODO: implement generateZegoToken (port ของ generateToken04 ฝั่ง server)
    // 1. แลก roomKey เป็นห้องจริงจากตาราง conference_rooms
    // 2. เซ็น token04 ด้วย ZEGO_SERVER_SECRET
    // 3. คืน token + appId + serverUrl

    const rooms = await query(
      'SELECT provider_room_id FROM conference_rooms WHERE room_key = ?',
      [roomKey]
    );
    const providerRoomId = (rooms as any)?.[0]?.provider_room_id ?? roomKey;

    res.status(501).json({
      error: 'ยังไม่ได้ implement การออก token ฝั่ง backend — ตอนนี้ใช้ /api/video/token ของ Next.js',
      providerRoomId
    });
  } catch (error: any) {
    console.error('❌ Failed to issue video token:', error);
    res.status(500).json({ error: error.message });
  }
}));

export default router;
