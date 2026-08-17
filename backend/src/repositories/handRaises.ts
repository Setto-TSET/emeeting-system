import { query } from '../database/connection';

export type RaisedHand = { userId: string; userName: string; raisedAt: number };

export async function raiseHand(meetingId: string, userId: string, userName: string): Promise<void> {
  await query(
    `INSERT INTO hand_raises (meeting_id, user_id, user_name, raised_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_name = VALUES(user_name)`,
    [meetingId, userId, userName, Date.now()]
  );
}

export async function lowerHand(meetingId: string, userId: string): Promise<void> {
  await query('DELETE FROM hand_raises WHERE meeting_id = ? AND user_id = ?', [meetingId, userId]);
}

export async function listRaised(meetingId: string): Promise<RaisedHand[]> {
  const rows = (await query(
    'SELECT user_id, user_name, raised_at FROM hand_raises WHERE meeting_id = ? ORDER BY raised_at ASC',
    [meetingId]
  )) as { user_id: string; user_name: string; raised_at: number }[];

  return rows.map((r) => ({ userId: r.user_id, userName: r.user_name, raisedAt: Number(r.raised_at) }));
}
