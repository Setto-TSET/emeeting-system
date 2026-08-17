import { queryOne } from '../database/connection';

/** admin เข้าได้ทุกห้องอยู่แล้ว — ตรงกับ can() ฝั่งหน้าเว็บ */
export async function isMeetingMember(meetingId: string, userId: string): Promise<boolean> {
  const row = await queryOne(
    'SELECT user_id FROM meeting_participants WHERE meeting_id = ? AND user_id = ?',
    [meetingId, userId]
  );
  return Boolean(row);
}

export async function meetingExists(meetingId: string): Promise<boolean> {
  const row = await queryOne('SELECT id FROM meetings WHERE id = ?', [meetingId]);
  return Boolean(row);
}
