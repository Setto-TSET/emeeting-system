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

  it('is idempotent — running twice does not duplicate rows or change hashes', async () => {
    const beforeHash = (await query('SELECT password_hash FROM app_users WHERE email = ?', [
      'admin@e-office.cloud',
    ])) as { password_hash: string }[];
    const beforeMeetings = (await query('SELECT COUNT(*) AS n FROM meetings')) as { n: number }[];
    const beforeParticipants = (await query(
      'SELECT COUNT(*) AS n FROM meeting_participants'
    )) as { n: number }[];
    const beforeUsers = (await query('SELECT COUNT(*) AS n FROM app_users')) as { n: number }[];

    await seedFromMockData('Meeting@2569');

    const afterHash = (await query('SELECT password_hash FROM app_users WHERE email = ?', [
      'admin@e-office.cloud',
    ])) as { password_hash: string }[];
    const afterMeetings = (await query('SELECT COUNT(*) AS n FROM meetings')) as { n: number }[];
    const afterParticipants = (await query(
      'SELECT COUNT(*) AS n FROM meeting_participants'
    )) as { n: number }[];
    const afterUsers = (await query('SELECT COUNT(*) AS n FROM app_users')) as { n: number }[];

    expect(afterHash).toHaveLength(1);
    expect(afterHash[0].password_hash).toBe(beforeHash[0].password_hash);
    expect(afterUsers[0].n).toBe(beforeUsers[0].n);
    expect(afterMeetings[0].n).toBe(beforeMeetings[0].n);
    expect(afterParticipants[0].n).toBe(beforeParticipants[0].n);
  });
});
