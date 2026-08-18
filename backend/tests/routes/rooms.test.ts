import request from 'supertest';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { signAccessToken } from '../../src/services/auth';
import { createApp } from '../../src/server';
import * as votes from '../../src/repositories/votes';
import * as hands from '../../src/repositories/handRaises';

const app = createApp();
// หมายเหตุ: ข้อมูลจำลองมีการประชุมเดียวคือ MT-2569-010 (ปรับจาก MT-2569-007 ในโจทย์ต้นฉบับ
// ให้ตรงกับ seedFromMockData จริง — ดู tests/realtime/handlers.test.ts)
const MEETING = 'MT-2569-010';

const adminToken = signAccessToken({
  sub: 'U-999',
  email: 'admin@e-office.cloud',
  name: 'IT Admin',
  role: 'admin',
});

describe('GET /api/rooms/:meetingId/state', () => {
  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM meeting_participants');
    await query('DELETE FROM meetings');
    await query('DELETE FROM app_users');
    await seedFromMockData('Meeting@2569');

    await query('DELETE FROM vote_records');
    await query('DELETE FROM vote_options');
    await query('DELETE FROM vote_topics');
    await query('DELETE FROM hand_raises');

    await votes.createTopic({
      id: 'vote-snapshot-1',
      meetingId: MEETING,
      title: 'มติทดสอบ',
      options: [{ id: 'opt-1', label: 'เห็นด้วย' }],
      createdBy: 'U-999',
      createdByName: 'IT Admin',
    });
    await votes.castVote('vote-snapshot-1', 'U-003', 'นางสาว มาลี รักษาสัตย์', 'opt-1');
    await hands.raiseHand(MEETING, 'U-003', 'นางสาว มาลี รักษาสัตย์');
  });

  afterAll(async () => {
    await close();
  });

  it('returns every piece of room state a late joiner needs', async () => {
    const res = await request(app)
      .get(`/api/rooms/${MEETING}/state`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.voteTopics).toHaveLength(1);
    expect(res.body.voteTopics[0].votes).toHaveLength(1);
    expect(res.body.raisedHands).toHaveLength(1);
    expect(res.body.docShare).toBeNull();
    expect(Array.isArray(res.body.transcript)).toBe(true);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get(`/api/rooms/${MEETING}/state`);
    expect(res.status).toBe(401);
  });

  it('rejects a user who is not in the meeting', async () => {
    await query('DELETE FROM meeting_participants WHERE meeting_id = ? AND user_id = ?', [MEETING, 'U-005']);
    const token = signAccessToken({
      sub: 'U-005',
      email: 'decha@e-office.cloud',
      name: 'นาย เดชา เก่งจริง',
      role: 'staff',
    });

    const res = await request(app).get(`/api/rooms/${MEETING}/state`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
