// ═══════════════════════════════════════════
// Routes — Audit Log
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware';
import { query, queryOne } from '../database/connection';

const router = Router();

/**
 * POST /api/audit/log-view
 * บันทึก audit log 1 แถว (ใครทำอะไรกับ resource ไหน เมื่อไหร่)
 */
router.post('/log-view', asyncHandler(async (req: Request, res: Response) => {
  const { action, meetingId, resource } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Missing action' });
  }
  if (typeof action !== 'string' || action.length > 100) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  if (resource !== undefined && resource !== null && (typeof resource !== 'string' || resource.length > 100)) {
    return res.status(400).json({ error: 'Invalid resource' });
  }

  const result = await query(
    'INSERT INTO audit_logs (user_id, action, meeting_id, resource, ip_address) VALUES (?, ?, ?, ?, ?)',
    [req.user?.id || null, action, meetingId || null, resource || null, req.ip]
  );

  res.status(201).json({ ok: true, id: (result as any).insertId });
}));

/**
 * GET /api/audit/logs
 * ดึง audit trail (filter + pagination)
 */
router.get('/logs', asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden — admin only' });
  }

  const { meetingId, userId } = req.query;

  let limit = parseInt((req.query.limit as string) || '50', 10);
  if (!Number.isSafeInteger(limit) || limit < 0) limit = 50;
  limit = Math.min(limit, 200);

  let offset = parseInt((req.query.offset as string) || '0', 10);
  if (!Number.isSafeInteger(offset) || offset < 0) offset = 0;

  const conditions: string[] = [];
  const values: any[] = [];

  if (meetingId) {
    conditions.push('meeting_id = ?');
    values.push(meetingId);
  }
  if (userId) {
    conditions.push('user_id = ?');
    values.push(userId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // limit/offset are interpolated (not `?`-parameterized) because mysql2's
  // connection.execute() prepared-statement path doesn't support placeholders
  // for LIMIT/OFFSET; both are integer-clamped above before reaching this string.
  const logs = await query(
    `SELECT id, user_id, action, meeting_id, resource, ip_address, created_at
     FROM audit_logs ${whereClause}
     ORDER BY created_at DESC, id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    values
  );

  const countRow = await queryOne(
    `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`,
    values
  );

  res.json({ logs, total: countRow.total });
}));

export default router;
