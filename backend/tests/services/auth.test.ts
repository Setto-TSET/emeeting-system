import jwt from 'jsonwebtoken';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import {
  verifyPassword,
  signAccessToken,
  signGuestToken,
  verifyAccessToken,
} from '../../src/services/auth';

describe('auth service', () => {
  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM meeting_participants');
    await query('DELETE FROM meetings');
    await query('DELETE FROM app_users');
    await seedFromMockData('Meeting@2569');
  });

  afterAll(async () => {
    await close();
  });

  it('accepts the correct password and returns claims', async () => {
    const claims = await verifyPassword('admin@e-office.cloud', 'Meeting@2569');
    expect(claims).not.toBeNull();
    expect(claims!.sub).toBe('U-999');
    expect(claims!.role).toBe('admin');
  });

  it('rejects the wrong password', async () => {
    expect(await verifyPassword('admin@e-office.cloud', 'wrong-password')).toBeNull();
  });

  it('rejects an unknown email', async () => {
    expect(await verifyPassword('nobody@e-office.cloud', 'Meeting@2569')).toBeNull();
  });

  it('is case-insensitive on email', async () => {
    const claims = await verifyPassword('ADMIN@E-OFFICE.CLOUD', 'Meeting@2569');
    expect(claims).not.toBeNull();
    expect(claims!.sub).toBe('U-999');
  });

  it('round-trips an access token', () => {
    const token = signAccessToken({
      sub: 'U-001',
      email: 'somchai.j@e-office.cloud',
      name: 'นาย สมชาย ใจดี',
      role: 'staff',
    });
    const decoded = verifyAccessToken(token);
    expect(decoded!.sub).toBe('U-001');
    expect(decoded!.role).toBe('staff');
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken({
      sub: 'U-001',
      email: 'somchai.j@e-office.cloud',
      name: 'นาย สมชาย ใจดี',
      role: 'staff',
    });
    expect(verifyAccessToken(token.slice(0, -3) + 'aaa')).toBeNull();
  });

  it('marks guest tokens with role guest and the meeting they are scoped to', () => {
    const token = signGuestToken({ sub: 'guest-abc', name: 'ผู้เข้าร่วมภายนอก', meetingId: 'MT-2569-007' });
    const decoded = verifyAccessToken(token);
    expect(decoded!.role).toBe('guest');
    expect(decoded!.meetingId).toBe('MT-2569-007');
  });

  // ═══════════════════════════════════════════
  // Regression tests for the security-critical decode path.
  // ตัวตนของผู้เข้าร่วมทั้งหมดมาจาก token เหล่านี้ — ถ้าการตรวจสอบอ่อนลง
  // แม้เพียงจุดเดียว ผู้เข้าร่วมคนหนึ่งอาจปลอมเป็นอีกคนได้
  // ═══════════════════════════════════════════

  it('rejects an expired token', () => {
    const token = jwt.sign(
      { sub: 'U-001', email: 'somchai.j@e-office.cloud', name: 'นาย สมชาย ใจดี', role: 'staff' },
      process.env.JWT_SECRET as string,
      { expiresIn: -10 }
    );
    expect(verifyAccessToken(token)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = jwt.sign(
      { sub: 'U-001', email: 'somchai.j@e-office.cloud', name: 'นาย สมชาย ใจดี', role: 'staff' },
      'a-completely-different-secret',
      { expiresIn: '8h' }
    );
    expect(verifyAccessToken(token)).toBeNull();
  });

  it('rejects an alg:none token', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'U-001', email: 'somchai.j@e-office.cloud', name: 'นาย สมชาย ใจดี', role: 'admin' })
    ).toString('base64url');
    const token = `${header}.${payload}.`;
    expect(verifyAccessToken(token)).toBeNull();
  });

  it('rejects a validly-signed payload missing required claims', () => {
    const missingSub = jwt.sign(
      { email: 'somchai.j@e-office.cloud', name: 'นาย สมชาย ใจดี', role: 'staff' },
      process.env.JWT_SECRET as string,
      { expiresIn: '8h' }
    );
    expect(verifyAccessToken(missingSub)).toBeNull();

    const missingRole = jwt.sign(
      { sub: 'U-001', email: 'somchai.j@e-office.cloud', name: 'นาย สมชาย ใจดี' },
      process.env.JWT_SECRET as string,
      { expiresIn: '8h' }
    );
    expect(verifyAccessToken(missingRole)).toBeNull();
  });
});
