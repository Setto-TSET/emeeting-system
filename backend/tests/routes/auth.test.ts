import request from 'supertest';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { createApp } from '../../src/server';

const app = createApp();

describe('auth routes', () => {
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

  it('logs in with a correct password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@e-office.cloud', password: 'Meeting@2569' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.id).toBe('U-999');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('rejects a wrong password with 401 and no detail about which field failed', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@e-office.cloud', password: 'nope' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  });

  it('rejects an unknown email with the same 401 message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@e-office.cloud', password: 'Meeting@2569' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  });

  it('rejects a missing body with 400', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('returns the caller from GET /api/auth/me', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'malee.r@e-office.cloud', password: 'Meeting@2569' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe('U-003');
    expect(res.body.user.systemRole).toBe('secretary');
  });

  it('rejects GET /api/auth/me without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('issues a guest token for a meeting that allows guest join', async () => {
    const res = await request(app)
      .post('/api/auth/guest')
      .send({ meetingId: 'MT-2569-010', name: 'ผู้เข้าร่วมภายนอก' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.systemRole).toBe('guest');
  });

  it('refuses a guest token for a meeting that does not allow guest join', async () => {
    // src/data/index.ts seeds exactly one meeting (MT-2569-010); there is no
    // MT-2569-007 to seed a second fixture from, so this test flips the same
    // meeting's flag after the earlier "allows guest join" test has already
    // used it — order-dependent, but there is no other seeded meeting to use.
    await query('UPDATE meetings SET allow_guest_join = 0 WHERE id = ?', ['MT-2569-010']);
    const res = await request(app)
      .post('/api/auth/guest')
      .send({ meetingId: 'MT-2569-010', name: 'ผู้เข้าร่วมภายนอก' });

    expect(res.status).toBe(403);
  });
});
