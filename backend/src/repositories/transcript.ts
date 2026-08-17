import { query } from '../database/connection';

export type TranscriptSegment = {
  speakerId: string;
  speakerName: string;
  startSec: number;
  text: string;
};

export async function appendSegment(meetingId: string, segment: TranscriptSegment): Promise<void> {
  await query(
    `INSERT INTO transcript_segments (meeting_id, speaker_id, speaker_name, start_sec, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [meetingId, segment.speakerId, segment.speakerName, segment.startSec, segment.text, Date.now()]
  );
}

export async function listSegments(meetingId: string): Promise<TranscriptSegment[]> {
  const rows = (await query(
    'SELECT speaker_id, speaker_name, start_sec, text FROM transcript_segments WHERE meeting_id = ? ORDER BY start_sec ASC, id ASC',
    [meetingId]
  )) as { speaker_id: string; speaker_name: string; start_sec: number; text: string }[];

  return rows.map((r) => ({
    speakerId: r.speaker_id,
    speakerName: r.speaker_name,
    startSec: Number(r.start_sec),
    text: r.text,
  }));
}
