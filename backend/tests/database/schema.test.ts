import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';

const TABLES = [
  'app_users',
  'meetings',
  'meeting_participants',
  'vote_topics',
  'vote_options',
  'vote_records',
  'hand_raises',
  'transcript_segments',
  'doc_shares',
];

describe('schema', () => {
  beforeAll(async () => {
    await runMigrations();
  });

  afterAll(async () => {
    await close();
  });

  it.each(TABLES)('creates table %s', async (table) => {
    const rows = (await query(
      'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
      [table]
    )) as { n: number }[];
    expect(rows[0].n).toBe(1);
  });

  it('is idempotent', async () => {
    await expect(runMigrations()).resolves.toBeUndefined();
  });

  it('stores a vote record keyed by meeting and topic', async () => {
    await query('DELETE FROM vote_records');
    await query('DELETE FROM vote_options');
    await query('DELETE FROM vote_topics');
    await query(
      'INSERT INTO vote_topics (id, meeting_id, title, created_by, created_by_name, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['vote-test-1', 'MT-TEST', 'หัวข้อทดสอบ', 'U-001', 'ทดสอบ', Date.now(), 'open']
    );
    await query('INSERT INTO vote_options (id, topic_id, label, sort_order) VALUES (?, ?, ?, ?)', [
      'opt-1',
      'vote-test-1',
      'เห็นด้วย',
      0,
    ]);
    await query(
      'INSERT INTO vote_records (topic_id, user_id, user_name, option_id, voted_at) VALUES (?, ?, ?, ?, ?)',
      ['vote-test-1', 'U-001', 'ทดสอบ', 'opt-1', Date.now()]
    );
    const rows = (await query('SELECT user_id FROM vote_records WHERE topic_id = ?', ['vote-test-1'])) as {
      user_id: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe('U-001');
  });

  it('allows only one vote row per user per topic', async () => {
    await expect(
      query('INSERT INTO vote_records (topic_id, user_id, user_name, option_id, voted_at) VALUES (?, ?, ?, ?, ?)', [
        'vote-test-1',
        'U-001',
        'ทดสอบ',
        'opt-1',
        Date.now(),
      ])
    ).rejects.toThrow(/Duplicate entry/);
  });
});
