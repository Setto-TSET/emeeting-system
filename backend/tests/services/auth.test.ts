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
});
