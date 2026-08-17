// ═══════════════════════════════════════════
// Auth — ตรวจรหัสผ่านและออก JWT
//
// ตัวตนของผู้ใช้ทุกจุดในระบบมาจาก token ที่ verify แล้วเท่านั้น
// ห้ามอ่าน userId/role จาก request body หรือ payload ของ WebSocket
// ═══════════════════════════════════════════

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryOne } from '../database/connection';

export type TokenClaims = {
  sub: string;
  email: string;
  name: string;
  role: string;
  roomId?: string;
  meetingId?: string;
};

const STAFF_TOKEN_TTL = '8h';
const GUEST_TOKEN_TTL = '24h';

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET is not set');
  return value;
}

export async function verifyPassword(email: string, password: string): Promise<TokenClaims | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return null;

  const row = (await queryOne(
    'SELECT id, email, name, system_role, room_id, password_hash FROM app_users WHERE LOWER(email) = ?',
    [normalized]
  )) as
    | { id: string; email: string; name: string; system_role: string; room_id: string | null; password_hash: string }
    | undefined;

  if (!row) return null;
  if (!(await bcrypt.compare(password, row.password_hash))) return null;

  return {
    sub: row.id,
    email: row.email,
    name: row.name,
    role: row.system_role,
    ...(row.room_id ? { roomId: row.room_id } : {}),
  };
}

export function signAccessToken(claims: TokenClaims): string {
  return jwt.sign(claims, secret(), { expiresIn: STAFF_TOKEN_TTL });
}

export function signGuestToken(claims: { sub: string; name: string; meetingId: string }): string {
  return jwt.sign(
    { sub: claims.sub, email: '', name: claims.name, role: 'guest', meetingId: claims.meetingId },
    secret(),
    { expiresIn: GUEST_TOKEN_TTL }
  );
}

export function verifyAccessToken(token: string): TokenClaims | null {
  try {
    const decoded = jwt.verify(token, secret());
    if (typeof decoded === 'string') return null;
    const { sub, email, name, role, roomId, meetingId } = decoded as Record<string, unknown>;
    if (typeof sub !== 'string' || typeof role !== 'string' || typeof name !== 'string') return null;
    return {
      sub,
      email: typeof email === 'string' ? email : '',
      name,
      role,
      ...(typeof roomId === 'string' ? { roomId } : {}),
      ...(typeof meetingId === 'string' ? { meetingId } : {}),
    };
  } catch {
    return null;
  }
}
