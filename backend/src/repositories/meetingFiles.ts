// ═══════════════════════════════════════════
// Meeting Files — ตัวไฟล์เก็บใน MySQL เพื่อให้ deploy เป็น container เดียวจบ
// ponytail: LONGBLOB, ย้ายไป object storage เมื่อไฟล์รวมเกิน ~1GB
//
// listFiles/getFileMeta ไม่ดึงคอลัมน์ content — หน้ารายการไฟล์ไม่ควรลาก
// ไฟล์ทุกก้อนขึ้นมาทั้ง response
// ═══════════════════════════════════════════

import { query, queryOne } from '../database/connection';

export type MeetingFileMeta = {
  id: string;
  meetingId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  visibility: string;
  uploadedBy: string;
  uploadedAt: number;
};

type FileRow = {
  id: string;
  meeting_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  visibility: string;
  uploaded_by: string;
  uploaded_at: number;
};

function toMeta(row: FileRow): MeetingFileMeta {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    visibility: row.visibility,
    uploadedBy: row.uploaded_by,
    uploadedAt: Number(row.uploaded_at),
  };
}

const META_COLUMNS =
  'id, meeting_id, name, mime_type, size_bytes, visibility, uploaded_by, uploaded_at';

export async function listFiles(meetingId: string): Promise<MeetingFileMeta[]> {
  const rows = (await query(
    `SELECT ${META_COLUMNS} FROM meeting_files WHERE meeting_id = ? ORDER BY uploaded_at ASC`,
    [meetingId]
  )) as FileRow[];
  return rows.map(toMeta);
}

export async function getFileMeta(fileId: string): Promise<MeetingFileMeta | null> {
  const row = (await queryOne(`SELECT ${META_COLUMNS} FROM meeting_files WHERE id = ?`, [
    fileId,
  ])) as FileRow | undefined;
  return row ? toMeta(row) : null;
}

export async function getFileContent(fileId: string): Promise<Buffer | null> {
  const row = (await queryOne('SELECT content FROM meeting_files WHERE id = ?', [fileId])) as
    | { content: Buffer }
    | undefined;
  return row ? row.content : null;
}

export async function putFile(input: {
  id: string;
  meetingId: string;
  name: string;
  mimeType: string;
  visibility: string;
  uploadedBy: string;
  content: Buffer;
}): Promise<MeetingFileMeta> {
  await query(
    `INSERT INTO meeting_files
       (id, meeting_id, name, mime_type, size_bytes, visibility, uploaded_by, uploaded_at, content)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.meetingId,
      input.name,
      input.mimeType,
      input.content.length,
      input.visibility,
      input.uploadedBy,
      Date.now(),
      input.content,
    ]
  );

  const meta = await getFileMeta(input.id);
  if (!meta) throw new Error('บันทึกไฟล์ไม่สำเร็จ');
  return meta;
}

export async function deleteFile(fileId: string): Promise<void> {
  await query('DELETE FROM meeting_files WHERE id = ?', [fileId]);
}
