// ═══════════════════════════════════════════
// Room State — สแนปช็อตสำหรับคนที่เข้าห้องทีหลัง
// ต่อ WebSocket แล้วต้องเรียกอันนี้ก่อน ไม่งั้นจะไม่เห็นของที่เกิดก่อนหน้า
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { authMiddleware, asyncHandler } from '../middleware';
import { isMeetingMember, meetingExists } from '../repositories/meetings';
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

    if (!(await meetingExists(meetingId))) {
      return res.status(404).json({ error: 'ไม่พบการประชุมนี้' });
    }

    const allowed =
      user.role === 'admin' ||
      (user.role === 'guest' ? user.meetingId === meetingId : await isMeetingMember(meetingId, user.id));

    if (!allowed) return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงการประชุมนี้' });

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
