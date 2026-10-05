// ═══════════════════════════════════════════
// Routes — Summarization (Claude API)
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware';
import { getMeeting } from '../repositories/meetings';
import { listSegments } from '../repositories/transcript';
import { canEditMeeting } from '../services/meetingAccess';
import { Agenda, summarizeTranscript, SummarizerUnavailableError } from '../services/claude';

const router = Router();

/**
 * POST /api/summarize  body: { meetingId }
 * สรุปการประชุมจาก transcript ที่ server เก็บไว้เองระหว่างประชุม
 *
 * ไม่รับ transcript จาก client — ไม่งั้นใครก็ยัดข้อความปลอมให้กลายเป็น "ร่างรายงานโดย AI" ได้
 * และไม่ต้องส่งข้อความทั้งประชุมวนกลับมาผ่านเบราว์เซอร์
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const meetingId = req.body?.meetingId;
    if (typeof meetingId !== 'string' || !meetingId) {
      return res.status(400).json({ error: 'ต้องระบุ meetingId' });
    }

    const meeting = await getMeeting(meetingId);
    if (!meeting) return res.status(404).json({ error: 'ไม่พบการประชุมนี้' });

    // ร่างรายงานกลายเป็นไฟล์ของการประชุม จึงให้เฉพาะคนที่แก้การประชุมได้เป็นคนสั่ง (และจ่ายค่า API)
    const actor = {
      id: req.user!.id,
      role: req.user!.role,
      ...(req.user!.meetingId ? { meetingId: req.user!.meetingId } : {}),
    };
    if (!canEditMeeting(actor, meeting)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์สร้างรายงานของการประชุมนี้' });
    }

    const transcript = await listSegments(meetingId);
    if (transcript.length === 0) {
      return res.status(409).json({ error: 'ยังไม่มีบันทึกคำพูดของการประชุมนี้ — เปิดคำบรรยายระหว่างประชุมก่อน' });
    }

    const agendas = Array.isArray(meeting.agenda)
      ? (meeting.agenda as Agenda[]).map(({ id, no, title }) => ({ id, no, title }))
      : [];

    try {
      const summary = await summarizeTranscript(transcript, agendas);
      res.json({ summary: { meetingId, isDraft: true, ...summary } });
    } catch (error) {
      if (error instanceof SummarizerUnavailableError) {
        return res.status(503).json({ error: error.message });
      }
      console.error('❌ Failed to summarize:', error);
      res.status(502).json({ error: 'สรุปการประชุมไม่สำเร็จ ลองใหม่อีกครั้ง' });
    }
  })
);

export default router;
