// ═══════════════════════════════════════════
// Meeting Invites — ลิงก์เชิญบุคคลภายนอก
//
// หัวใจของไฟล์นี้คือ consumeInvite() ที่ตัดสิน "ใครได้ใช้ลิงก์" ด้วย
// UPDATE ... WHERE used_at IS NULL แล้วดู affectedRows — ไม่ใช่อ่านมาเช็คก่อนเขียน
// สองคนกดลิงก์เดียวกันพร้อมกัน แบบอ่านก่อนเขียนจะผ่านทั้งคู่
// ═══════════════════════════════════════════

import { randomBytes } from 'crypto';
import { query, queryOne } from '../database/connection';

export type Invite = {
  token: string;
  meetingId: string;
  guestEmail: string;
  guestName: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
  usedByName: string | null;
  revokedAt: number | null;
  /** สรุปสถานะให้หน้าเว็บใช้ตรงๆ ไม่ต้องคำนวณจากสามฟิลด์เอง */
  status: 'active' | 'used' | 'revoked' | 'expired';
};

type InviteRow = {
  token: string;
  meeting_id: string;
  guest_email: string;
  guest_name: string | null;
  created_by: string;
  created_by_name: string;
  created_at: number;
  expires_at: number;
  used_at: number | null;
  used_by_name: string | null;
  revoked_at: number | null;
};

export const DEFAULT_EXPIRY_HOURS = 48;

function statusOf(row: InviteRow): Invite['status'] {
  if (row.revoked_at !== null) return 'revoked';
  if (row.used_at !== null) return 'used';
  if (Number(row.expires_at) < Date.now()) return 'expired';
  return 'active';
}

function toInvite(row: InviteRow): Invite {
  return {
    token: row.token,
    meetingId: row.meeting_id,
    guestEmail: row.guest_email,
    guestName: row.guest_name,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    usedAt: row.used_at === null ? null : Number(row.used_at),
    usedByName: row.used_by_name,
    revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
    status: statusOf(row),
  };
}

/**
 * 32 ไบต์จาก CSPRNG — ลิงก์นี้คือหลักฐานการได้รับเชิญทั้งหมด ไม่มีรหัสผ่านมาช่วย
 * base64url เพราะต้องวางในเส้นทาง URL ได้โดยไม่ต้อง encode
 */
function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function createInvite(input: {
  meetingId: string;
  guestEmail: string;
  guestName?: string | null;
  createdBy: string;
  createdByName: string;
  expiresInHours?: number;
}): Promise<Invite> {
  const now = Date.now();
  const row: InviteRow = {
    token: generateToken(),
    meeting_id: input.meetingId,
    guest_email: input.guestEmail,
    guest_name: input.guestName?.trim() || null,
    created_by: input.createdBy,
    created_by_name: input.createdByName,
    created_at: now,
    expires_at: now + (input.expiresInHours ?? DEFAULT_EXPIRY_HOURS) * 60 * 60 * 1000,
    used_at: null,
    used_by_name: null,
    revoked_at: null,
  };

  await query(
    `INSERT INTO meeting_invites
       (token, meeting_id, guest_email, guest_name, created_by, created_by_name, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.token,
      row.meeting_id,
      row.guest_email,
      row.guest_name,
      row.created_by,
      row.created_by_name,
      row.created_at,
      row.expires_at,
    ]
  );

  return toInvite(row);
}

export async function getInvite(token: string): Promise<Invite | null> {
  const row = (await queryOne('SELECT * FROM meeting_invites WHERE token = ?', [token])) as
    | InviteRow
    | undefined;
  return row ? toInvite(row) : null;
}

export async function listInvitesForMeeting(meetingId: string): Promise<Invite[]> {
  const rows = (await query(
    'SELECT * FROM meeting_invites WHERE meeting_id = ? ORDER BY created_at DESC',
    [meetingId]
  )) as InviteRow[];
  return rows.map(toInvite);
}

/**
 * ใช้ลิงก์ — คืน true ให้คนแรกที่ยิงถึงเท่านั้น
 * เงื่อนไขทั้งหมดอยู่ใน WHERE เดียวกัน MySQL จึงเป็นผู้ตัดสิน ไม่ใช่โค้ดที่นี่
 */
export async function consumeInvite(token: string, usedByName: string): Promise<boolean> {
  const result = (await query(
    `UPDATE meeting_invites
        SET used_at = ?, used_by_name = ?
      WHERE token = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
    [Date.now(), usedByName, token, Date.now()]
  )) as { affectedRows: number };
  return result.affectedRows === 1;
}

export async function revokeInvite(token: string): Promise<void> {
  await query('UPDATE meeting_invites SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL', [
    Date.now(),
    token,
  ]);
}
