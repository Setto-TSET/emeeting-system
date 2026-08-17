import { query, queryOne } from '../database/connection';

export type DocShare = {
  fileId: string;
  fileName: string;
  page: number;
  sharedBy: string;
  sharedName: string;
};

export async function setShare(
  meetingId: string,
  share: Omit<DocShare, 'page'> & { page?: number }
): Promise<void> {
  await query(
    `INSERT INTO doc_shares (meeting_id, file_id, file_name, page, shared_by, shared_name, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE file_id = VALUES(file_id), file_name = VALUES(file_name),
       page = VALUES(page), shared_by = VALUES(shared_by), shared_name = VALUES(shared_name),
       updated_at = VALUES(updated_at)`,
    [meetingId, share.fileId, share.fileName, share.page ?? 1, share.sharedBy, share.sharedName, Date.now()]
  );
}

export async function setPage(meetingId: string, page: number): Promise<void> {
  await query('UPDATE doc_shares SET page = ?, updated_at = ? WHERE meeting_id = ?', [
    page,
    Date.now(),
    meetingId,
  ]);
}

export async function clearShare(meetingId: string): Promise<void> {
  await query('DELETE FROM doc_shares WHERE meeting_id = ?', [meetingId]);
}

export async function getShare(meetingId: string): Promise<DocShare | null> {
  const row = (await queryOne(
    'SELECT file_id, file_name, page, shared_by, shared_name FROM doc_shares WHERE meeting_id = ?',
    [meetingId]
  )) as
    | { file_id: string; file_name: string; page: number; shared_by: string; shared_name: string }
    | undefined;

  if (!row) return null;
  return {
    fileId: row.file_id,
    fileName: row.file_name,
    page: Number(row.page),
    sharedBy: row.shared_by,
    sharedName: row.shared_name,
  };
}
