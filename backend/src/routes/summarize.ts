// ═══════════════════════════════════════════
// Routes — Summarization (Claude API)
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware';
import { summarizeTranscript } from '../services/claude';

const router = Router();

/**
 * POST /api/summarize
 * สรุปการประชุมจาก transcript โดยใช้ Claude API
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { meetingId, transcript, agendas } = req.body;

  if (!meetingId || !transcript || !Array.isArray(transcript)) {
    return res.status(400).json({ error: 'Missing meetingId or transcript' });
  }

  try {
    // TODO: implement summarizeTranscript using Claude API
    const summary = await summarizeTranscript(transcript, agendas || []);

    res.json({
      meetingId,
      isDraft: true,
      byAgenda: summary.byAgenda,
      overall: summary.overall
    });
  } catch (error: any) {
    console.error('❌ Failed to summarize:', error);
    res.status(500).json({ error: error.message });
  }
}));

export default router;
