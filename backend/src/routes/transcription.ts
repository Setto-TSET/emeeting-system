// ═══════════════════════════════════════════
// Routes — Transcription (STT provider)
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware';
import { query } from '../database/connection';

const router = Router();

/**
 * POST /api/transcription/request
 * ขอถอดเสียงประชุม
 */
router.post('/request', asyncHandler(async (req: Request, res: Response) => {
  const { meetingId } = req.body;

  if (!meetingId) {
    return res.status(400).json({ error: 'Missing meetingId' });
  }

  try {
    // TODO: implement requestTranscript
    // 1. หา recording ID จาก meeting
    // 2. ส่งไฟล์เสียงเข้า STT
    // 3. เก็บ status = processing ใน DB

    await query(
      'INSERT INTO transcriptions (meeting_id, transcript_status) VALUES (?, ?) ON DUPLICATE KEY UPDATE transcript_status = ?',
      [meetingId, 'processing', 'processing']
    );

    res.json({
      status: 'processing',
      estimatedTime: 120,
      jobId: `transcript-job-${meetingId}`
    });
  } catch (error: any) {
    console.error('❌ Failed to request transcript:', error);
    res.status(500).json({ error: error.message });
  }
}));

/**
 * GET /api/transcription/result
 * ดึงผลถอดเสียง
 */
router.get('/result', asyncHandler(async (req: Request, res: Response) => {
  const { meetingId } = req.query;

  if (!meetingId) {
    return res.status(400).json({ error: 'Missing meetingId' });
  }

  try {
    const result = await query(
      'SELECT transcript_status, segments FROM transcriptions WHERE meeting_id = ?',
      [meetingId]
    );

    if (!result || (result as any).length === 0) {
      return res.status(404).json({ error: 'No transcription found' });
    }

    const row = (result as any)[0];
    const segments = row.segments ? JSON.parse(row.segments) : [];

    res.json({
      meetingId,
      status: row.transcript_status,
      language: 'th',
      segments
    });
  } catch (error: any) {
    console.error('❌ Failed to get transcript:', error);
    res.status(500).json({ error: error.message });
  }
}));

/**
 * POST /api/transcription/poll
 * Worker/Cron job: poll สถานะการถอดเสียง
 * (ต้องเรียก periodically ทุก 30 วิจาก backend worker)
 */
router.post('/poll', asyncHandler(async (req: Request, res: Response) => {
  try {
    // TODO: implement pollTranscripts
    // 1. หาประชุมที่ status = processing
    // 2. เรียก STT ถามว่าเสร็จหรือยัง
    // 3. ถ้าเสร็จ update segments ใน DB

    res.json({ message: 'Polling completed', updated: 0 });
  } catch (error: any) {
    console.error('❌ Polling failed:', error);
    res.status(500).json({ error: error.message });
  }
}));

export default router;
