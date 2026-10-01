// ═══════════════════════════════════════════
// Routes — Summarization (Claude API)
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware';
import { summarizeTranscript, SummarizerNotConfiguredError, Agenda } from '../services/claude';
import { getMeeting } from '../repositories/meetings';
import { listSegments } from '../repositories/transcript';
import { canEditMeeting } from '../services/meetingAccess';

const router = Router();

/**
 * POST /api/summarize { meetingId }
 * สรุปการประชุมจากคำบรรยายสดที่ถอดเก็บไว้ใน transcript_segments
 * ดึง transcript จาก DB เอง ไม่รับจาก client — กันการยัดเนื้อหาปลอมเข้าร่างรายงาน
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const meetingId = req.body?.meetingId;
  if (typeof meetingId !== 'string' || !meetingId) {
    return res.status(400).json({ error: 'Missing meetingId' });
  }

  const meeting = await getMeeting(meetingId);
  if (!meeting) return res.status(404).json({ error: 'ไม่พบการประชุมนี้' });

  const actor = {
    id: req.user!.id,
    role: req.user!.role,
    ...(req.user!.meetingId ? { meetingId: req.user!.meetingId } : {}),
  };
  if (!canEditMeeting(actor, meeting)) {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์สร้างร่างรายงานของการประชุมนี้' });
  }

  const segments = await listSegments(meetingId);
  if (segments.length === 0) {
    return res.status(422).json({
      error: 'ยังไม่มีคำบรรยายของประชุมนี้ — ต้องเปิดคำบรรยายสดระหว่างประชุมก่อนจึงสรุปได้',
    });
  }

  const agendas: Agenda[] = (Array.isArray(meeting.agenda) ? meeting.agenda : []).map(
    (a: { id?: unknown; no?: unknown; title?: unknown }) => ({
      id: String(a.id ?? ''),
      no: String(a.no ?? ''),
      title: String(a.title ?? ''),
    })
  );

  try {
    const summary = await summarizeTranscript(segments, agendas);
    res.json({ meetingId, isDraft: true, byAgenda: summary.byAgenda, overall: summary.overall });
  } catch (error) {
    if (error instanceof SummarizerNotConfiguredError) {
      return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า CLAUDE_API_KEY บนเซิร์ฟเวอร์ — ใช้ AI สรุปไม่ได้' });
    }
    console.error('❌ Failed to summarize:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'สรุปการประชุมไม่สำเร็จ' });
  }
}));

export default router;
