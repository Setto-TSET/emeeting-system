// ═══════════════════════════════════════════
// Room State — สแนปช็อตสำหรับคนที่เข้าห้องทีหลัง
// ต่อ WebSocket แล้วต้องเรียกอันนี้ก่อน ไม่งั้นจะไม่เห็นของที่เกิดก่อนหน้า
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { authMiddleware, asyncHandler } from '../middleware';
import { getMeeting } from '../repositories/meetings';
import { actorFrom, canViewMeeting } from '../services/meetingAccess';
import { listTopics } from '../repositories/votes';
import { listRaised } from '../repositories/handRaises';
import { listSegments } from '../repositories/transcript';
import { getShare } from '../repositories/docShare';

const router = Router();

router.get(
  '/:meetingId/state',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { meetingId } = req.params;
    const user = req.user!;

    const meeting = await getMeeting(meetingId);
    if (!meeting) return res.status(404).json({ error: 'ไม่พบการประชุมนี้' });

    // กฎเดียวกับ REST และ WebSocket — ผู้รับมอบสิทธิ์ ผู้บริหาร และจอหน้าห้องเข้าได้ด้วย
    if (!canViewMeeting(actorFrom(user), meeting)) return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงการประชุมนี้' });

    const [voteTopics, raisedHands, transcript, docShare] = await Promise.all([
      listTopics(meetingId),
      listRaised(meetingId),
      listSegments(meetingId),
      getShare(meetingId),
    ]);

    res.json({ voteTopics, raisedHands, transcript, docShare });
  })
);

export default router;
