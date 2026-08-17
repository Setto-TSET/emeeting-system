import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import bcrypt from 'bcryptjs';

describe('seedFromMockData', () => {
  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM meeting_participants');
    await query('DELETE FROM meetings');
    await query('DELETE FROM app_users');
  });

  afterAll(async () => {
    await close();
  });

  it('inserts every mock user with a bcrypt hash, never the plaintext', async () => {
    const result = await seedFromMockData('Meeting@2569');
    expect(result.users).toBeGreaterThanOrEqual(7);

    const rows = (await query('SELECT email, password_hash FROM app_users WHERE email = ?', [
      'admin@e-office.cloud',
    ])) as { email: string; password_hash: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].password_hash).not.toBe('Meeting@2569');
    expect(await bcrypt.compare('Meeting@2569', rows[0].password_hash)).toBe(true);
  });

  it('inserts meetings and their participants', async () => {
    const meetings = (await query('SELECT COUNT(*) AS n FROM meetings')) as { n: number }[];
    expect(meetings[0].n).toBeGreaterThan(0);

    const participants = (await query('SELECT COUNT(*) AS n FROM meeting_participants')) as { n: number }[];
    expect(participants[0].n).toBeGreaterThan(0);
  });

  it('is idempotent — running twice does not duplicate or change hashes', async () => {
    const before = (await query('SELECT password_hash FROM app_users WHERE email = ?', [
      'admin@e-office.cloud',
    ])) as { password_hash: string }[];

    await seedFromMockData('Meeting@2569');

    const after = (await query('SELECT password_hash FROM app_users WHERE email = ?', [
      'admin@e-office.cloud',
    ])) as { password_hash: string }[];
    expect(after).toHaveLength(1);
    expect(after[0].password_hash).toBe(before[0].password_hash);
  });
});
