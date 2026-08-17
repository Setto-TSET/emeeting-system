import { query, queryOne } from '../database/connection';

export type VoteOption = { id: string; label: string };
export type VoteRecord = { userId: string; userName: string; optionId: string; timestamp: number };
export type VoteTopic = {
  id: string;
  meetingId: string;
  title: string;
  description?: string;
  options: VoteOption[];
  createdBy: string;
  createdByName: string;
  createdAt: number;
  status: 'open' | 'closed';
  votes: VoteRecord[];
};

export async function createTopic(input: {
  id: string;
  meetingId: string;
  title: string;
  description?: string;
  options: VoteOption[];
  createdBy: string;
  createdByName: string;
}): Promise<VoteTopic> {
  const createdAt = Date.now();
  await query(
    `INSERT INTO vote_topics (id, meeting_id, title, description, created_by, created_by_name, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
    [
      input.id,
      input.meetingId,
      input.title,
      input.description ?? null,
      input.createdBy,
      input.createdByName,
      createdAt,
    ]
  );

  for (let i = 0; i < input.options.length; i += 1) {
    const option = input.options[i];
    await query('INSERT INTO vote_options (id, topic_id, label, sort_order) VALUES (?, ?, ?, ?)', [
      option.id,
      input.id,
      option.label,
      i,
    ]);
  }

  const topic = await getTopic(input.id);
  if (!topic) throw new Error('topic disappeared right after insert');
  return topic;
}

export async function getTopic(topicId: string): Promise<VoteTopic | null> {
  const row = (await queryOne(
    `SELECT id, meeting_id, title, description, created_by, created_by_name, created_at, status
     FROM vote_topics WHERE id = ?`,
    [topicId]
  )) as
    | {
        id: string;
        meeting_id: string;
        title: string;
        description: string | null;
        created_by: string;
        created_by_name: string;
        created_at: number;
        status: 'open' | 'closed';
      }
    | undefined;

  if (!row) return null;

  const options = (await query(
    'SELECT id, label FROM vote_options WHERE topic_id = ? ORDER BY sort_order ASC',
    [topicId]
  )) as VoteOption[];

  const records = (await query(
    'SELECT user_id, user_name, option_id, voted_at FROM vote_records WHERE topic_id = ?',
    [topicId]
  )) as { user_id: string; user_name: string; option_id: string; voted_at: number }[];

  return {
    id: row.id,
    meetingId: row.meeting_id,
    title: row.title,
    ...(row.description ? { description: row.description } : {}),
    options,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: Number(row.created_at),
    status: row.status,
    votes: records.map((r) => ({
      userId: r.user_id,
      userName: r.user_name,
      optionId: r.option_id,
      timestamp: Number(r.voted_at),
    })),
  };
}

export async function listTopics(meetingId: string): Promise<VoteTopic[]> {
  const rows = (await query(
    'SELECT id FROM vote_topics WHERE meeting_id = ? ORDER BY created_at ASC',
    [meetingId]
  )) as { id: string }[];

  const topics: VoteTopic[] = [];
  for (const row of rows) {
    const topic = await getTopic(row.id);
    if (topic) topics.push(topic);
  }
  return topics;
}

/** คืน null เมื่อหัวข้อปิดแล้วหรือไม่มีจริง — ตัวเรียกต้องแจ้ง error กลับไปที่ client */
export async function castVote(
  topicId: string,
  userId: string,
  userName: string,
  optionId: string
): Promise<VoteTopic | null> {
  const topic = await getTopic(topicId);
  if (!topic || topic.status !== 'open') return null;
  if (!topic.options.some((o) => o.id === optionId)) return null;

  await query(
    `INSERT INTO vote_records (topic_id, user_id, user_name, option_id, voted_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE option_id = VALUES(option_id), voted_at = VALUES(voted_at)`,
    [topicId, userId, userName, optionId, Date.now()]
  );

  return getTopic(topicId);
}

export async function closeTopic(topicId: string): Promise<VoteTopic | null> {
  const topic = await getTopic(topicId);
  if (!topic) return null;
  await query("UPDATE vote_topics SET status = 'closed' WHERE id = ?", [topicId]);
  return getTopic(topicId);
}
