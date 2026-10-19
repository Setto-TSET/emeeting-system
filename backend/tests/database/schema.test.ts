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
  'audit_logs',
  'transcriptions',
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

  it('accepts the audit insert from routes/audit.ts and fills created_at', async () => {
    await query('DELETE FROM audit_logs WHERE action = ?', ['schema-test']);
    await query(
      'INSERT INTO audit_logs (user_id, action, meeting_id, resource, ip_address) VALUES (?, ?, ?, ?, ?)',
      ['U-001', 'schema-test', 'MT-TEST', 'file-1', '::ffff:127.0.0.1']
    );
    const rows = (await query('SELECT created_at FROM audit_logs WHERE action = ?', ['schema-test'])) as {
      created_at: Date | null;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].created_at).not.toBeNull();
  });

  it('upserts one transcription row per meeting and returns segments as text', async () => {
    const upsert =
      'INSERT INTO transcriptions (meeting_id, transcript_status) VALUES (?, ?) ON DUPLICATE KEY UPDATE transcript_status = ?';
    await query('DELETE FROM transcriptions WHERE meeting_id = ?', ['MT-TEST']);
    await query(upsert, ['MT-TEST', 'processing', 'processing']);
    await query(upsert, ['MT-TEST', 'processing', 'processing']);
    await query('UPDATE transcriptions SET segments = ? WHERE meeting_id = ?', ['[{"text":"ทดสอบ"}]', 'MT-TEST']);
    const rows = (await query('SELECT segments FROM transcriptions WHERE meeting_id = ?', ['MT-TEST'])) as {
      segments: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].segments)).toEqual([{ text: 'ทดสอบ' }]);
  });
});
