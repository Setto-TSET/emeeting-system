// สัญญาหลักของลิงก์เชิญหลังย้ายขึ้น server:
// ลิงก์ที่สร้างบนเครื่องหนึ่งต้องใช้ได้จากเครื่องที่ไม่มี token เลย (นั่นคือทั้งหมดของฟีเจอร์นี้)
// และใช้ได้ครั้งเดียวจริงแม้สองคนกดพร้อมกัน
import request from 'supertest';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { signAccessToken } from '../../src/services/auth';
import { verifyAccessToken } from '../../src/services/auth';
import { createApp } from '../../src/server';

const app = createApp();

const malee = signAccessToken({
  sub: 'U-003',
  email: 'malee.r@e-office.cloud',
  name: 'นางสาว มาลี รักษาสัตย์',
  role: 'secretary',
});
const somchai = signAccessToken({
  sub: 'U-001',
  email: 'somchai.j@e-office.cloud',
  name: 'นาย สมชาย ใจดี',
  role: 'staff',
});
const admin = signAccessToken({
  sub: 'U-999',
  email: 'admin@e-office.cloud',
  name: 'IT Admin',
  role: 'admin',
});

const MEETING_ID = 'MT-INVITE-1';

async function seedMeeting() {
  await request(app)
    .post('/api/meetings')
    .set('Authorization', `Bearer ${malee}`)
    .send({
      meeting: {
        id: MEETING_ID,
        title: 'ประชุมคณะกรรมการชุดที่ 1',
        name: 'ประชุมคณะกรรมการชุดที่ 1',
        date: '2026-09-20',
        startTime: '10:00',
        endTime: '11:30',
        location: 'ห้องประชุม 801',
        room: 'ห้องประชุม 801',
        organizer: 'นางสาว มาลี รักษาสัตย์',
        status: 'scheduled',
        type: 'hybrid',
        participants: [],
      },
    });
}

/** สร้างลิงก์เชิญแล้วคืน token — ค่าเริ่มต้นออกโดยผู้จัด */
async function createInvite(auth = malee, payload: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`/api/meetings/${MEETING_ID}/invites`)
    .set('Authorization', `Bearer ${auth}`)
    .send({ invite: { guestEmail: 'expert@external.org', guestName: 'ดร. วิชัย', ...payload } });
  return res;
}

describe('/api/invites', () => {
  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM app_users');
    await seedFromMockData('Meeting@2569');
  });

  beforeEach(async () => {
    await query('DELETE FROM meeting_invites');
    await query('DELETE FROM meeting_participants');
    await query('DELETE FROM meetings');
    await seedMeeting();
  });

  afterAll(async () => {
    await close();
  });

  // ── ออกลิงก์ ────────────────────────────────────────────

  it('ไม่มี token ออกลิงก์เชิญไม่ได้', async () => {
    const res = await request(app)
      .post(`/api/meetings/${MEETING_ID}/invites`)
      .send({ invite: { guestEmail: 'x@y.com' } });
    expect(res.status).toBe(401);
  });

  it('คนที่ไม่ใช่ผู้จัดออกลิงก์เชิญไม่ได้ — 403', async () => {
    const res = await createInvite(somchai);
    expect(res.status).toBe(403);
  });

  it('admin ออกลิงก์แทนได้', async () => {
    expect((await createInvite(admin)).status).toBe(201);
  });

  it('ผู้จัดออกลิงก์ได้ และ token ยาวพอจะเดาไม่ได้', async () => {
    const res = await createInvite();
    expect(res.status).toBe(201);
    expect(res.body.invite.token.length).toBeGreaterThanOrEqual(24);
    expect(res.body.invite.meetingId).toBe(MEETING_ID);
    expect(res.body.invite.guestEmail).toBe('expert@external.org');
  });

  it('สองลิงก์ที่ออกติดกันต้องไม่ซ้ำกัน', async () => {
    const a = await createInvite();
    const b = await createInvite();
    expect(a.body.invite.token).not.toBe(b.body.invite.token);
  });

  it('ออกลิงก์ให้การประชุมที่ไม่มีอยู่ — 404', async () => {
    const res = await request(app)
      .post('/api/meetings/MT-NOT-EXIST/invites')
      .set('Authorization', `Bearer ${malee}`)
      .send({ invite: { guestEmail: 'x@y.com' } });
    expect(res.status).toBe(404);
  });

  it('ต้องระบุอีเมลผู้รับ — 400', async () => {
    expect((await createInvite(malee, { guestEmail: '' })).status).toBe(400);
  });

  // ── เปิดลิงก์ (ไม่ต้องล็อกอิน — หัวใจของฟีเจอร์) ─────────

  it('เปิดลิงก์ได้โดยไม่มี token เลย และเห็นรายละเอียดการประชุม', async () => {
    const { body } = await createInvite();
    const res = await request(app).get(`/api/invites/${body.invite.token}`);

    expect(res.status).toBe(200);
    expect(res.body.meeting.id).toBe(MEETING_ID);
    expect(res.body.meeting.name).toBe('ประชุมคณะกรรมการชุดที่ 1');
    expect(res.body.meeting.date).toBe('2026-09-20');
    expect(res.body.invite.guestEmail).toBe('expert@external.org');
  });

  it('ลิงก์ไม่เปิดเผยเนื้อหาการประชุม — ไม่มีวาระ ไฟล์ หรือรายชื่อผู้เข้าร่วม', async () => {
    const { body } = await createInvite();
    const res = await request(app).get(`/api/invites/${body.invite.token}`);

    expect(res.body.meeting.agenda).toBeUndefined();
    expect(res.body.meeting.files).toBeUndefined();
    expect(res.body.meeting.participants).toBeUndefined();
  });

  it('token มั่ว — 404 พร้อมเหตุผลที่หน้าเว็บแยกออก', async () => {
    const res = await request(app).get('/api/invites/ไม่มีอยู่จริง');
    expect(res.status).toBe(404);
    expect(res.body.reason).toBe('not_found');
  });

  it('ลิงก์หมดอายุ — 410 expired', async () => {
    const { body } = await createInvite();
    await query('UPDATE meeting_invites SET expires_at = ? WHERE token = ?', [
      Date.now() - 1000,
      body.invite.token,
    ]);

    const res = await request(app).get(`/api/invites/${body.invite.token}`);
    expect(res.status).toBe(410);
    expect(res.body.reason).toBe('expired');
  });

  it('ลิงก์ที่ถูกเพิกถอน — 410 revoked', async () => {
    const { body } = await createInvite();
    await request(app)
      .delete(`/api/invites/${body.invite.token}`)
      .set('Authorization', `Bearer ${malee}`);

    const res = await request(app).get(`/api/invites/${body.invite.token}`);
    expect(res.status).toBe(410);
    expect(res.body.reason).toBe('revoked');
  });

  it('การประชุมถูกลบไปแล้ว — 404 meeting_not_found', async () => {
    const { body } = await createInvite();
    await query('DELETE FROM meetings WHERE id = ?', [MEETING_ID]);

    const res = await request(app).get(`/api/invites/${body.invite.token}`);
    expect(res.status).toBe(404);
    expect(res.body.reason).toBe('meeting_not_found');
  });

  // ── ยอมรับคำเชิญ ────────────────────────────────────────

  it('ยอมรับคำเชิญแล้วได้ guest token ที่ผูกกับการประชุมนั้น', async () => {
    const { body } = await createInvite();
    const res = await request(app)
      .post(`/api/invites/${body.invite.token}/accept`)
      .send({ name: 'ดร. วิชัย ตั้งใจ', role: 'ผู้ทรงคุณวุฒิภายนอก' });

    expect(res.status).toBe(200);
    expect(res.body.user.systemRole).toBe('guest');
    expect(res.body.user.name).toBe('ดร. วิชัย ตั้งใจ');

    const claims = verifyAccessToken(res.body.token);
    expect(claims).not.toBeNull();
    expect(claims!.role).toBe('guest');
    // WebSocket ตรวจฟิลด์นี้ — ผูกผิดห้องแปลว่าแขกเข้าห้องอื่นได้
    expect(claims!.meetingId).toBe(MEETING_ID);
  });

  it('ไม่ระบุชื่อ ยอมรับไม่ได้ — 400', async () => {
    const { body } = await createInvite();
    const res = await request(app).post(`/api/invites/${body.invite.token}/accept`).send({ name: '  ' });
    expect(res.status).toBe(400);
  });

  it('ลิงก์ใช้ได้ครั้งเดียว — ครั้งที่สอง 410 already_used', async () => {
    const { body } = await createInvite();
    const first = await request(app)
      .post(`/api/invites/${body.invite.token}/accept`)
      .send({ name: 'ดร. วิชัย' });
    const second = await request(app)
      .post(`/api/invites/${body.invite.token}/accept`)
      .send({ name: 'คนอื่นที่แอบใช้ลิงก์ต่อ' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(410);
    expect(second.body.reason).toBe('already_used');
  });

  it('สองคนกดลิงก์เดียวกันพร้อมกัน — สำเร็จคนเดียว', async () => {
    const { body } = await createInvite();
    const [a, b] = await Promise.all([
      request(app).post(`/api/invites/${body.invite.token}/accept`).send({ name: 'คนแรก' }),
      request(app).post(`/api/invites/${body.invite.token}/accept`).send({ name: 'คนที่สอง' }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 410]);
  });

  it('ลิงก์หมดอายุแล้วยอมรับไม่ได้ — 410 expired', async () => {
    const { body } = await createInvite();
    await query('UPDATE meeting_invites SET expires_at = ? WHERE token = ?', [
      Date.now() - 1000,
      body.invite.token,
    ]);

    const res = await request(app).post(`/api/invites/${body.invite.token}/accept`).send({ name: 'ดร. วิชัย' });
    expect(res.status).toBe(410);
    expect(res.body.reason).toBe('expired');
  });

  it('ลิงก์ที่ใช้แล้วยังอยู่ในระบบเพื่อตรวจย้อนหลัง พร้อมชื่อคนที่ใช้', async () => {
    const { body } = await createInvite();
    await request(app).post(`/api/invites/${body.invite.token}/accept`).send({ name: 'ดร. วิชัย ตั้งใจ' });

    const rows = (await query('SELECT * FROM meeting_invites WHERE token = ?', [
      body.invite.token,
    ])) as Array<{ used_at: number | null; used_by_name: string | null }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].used_at).not.toBeNull();
    expect(rows[0].used_by_name).toBe('ดร. วิชัย ตั้งใจ');
  });

  // ── ดูและเพิกถอน ────────────────────────────────────────

  it('ผู้จัดดูลิงก์ทั้งหมดของการประชุมตัวเองได้ พร้อมสถานะ', async () => {
    const a = await createInvite(malee, { guestEmail: 'a@x.org' });
    await createInvite(malee, { guestEmail: 'b@x.org' });
    await request(app).post(`/api/invites/${a.body.invite.token}/accept`).send({ name: 'ใช้ไปแล้ว' });

    const res = await request(app)
      .get(`/api/meetings/${MEETING_ID}/invites`)
      .set('Authorization', `Bearer ${malee}`);

    expect(res.status).toBe(200);
    expect(res.body.invites).toHaveLength(2);
    const used = res.body.invites.find((i: { guestEmail: string }) => i.guestEmail === 'a@x.org');
    expect(used.status).toBe('used');
    const unused = res.body.invites.find((i: { guestEmail: string }) => i.guestEmail === 'b@x.org');
    expect(unused.status).toBe('active');
  });

  it('คนอื่นดูลิงก์ของการประชุมที่ตัวเองไม่ได้จัด — 403', async () => {
    await createInvite();
    const res = await request(app)
      .get(`/api/meetings/${MEETING_ID}/invites`)
      .set('Authorization', `Bearer ${somchai}`);
    expect(res.status).toBe(403);
  });

  it('คนอื่นเพิกถอนลิงก์ไม่ได้ — 403 และลิงก์ยังใช้ได้อยู่', async () => {
    const { body } = await createInvite();
    const res = await request(app)
      .delete(`/api/invites/${body.invite.token}`)
      .set('Authorization', `Bearer ${somchai}`);

    expect(res.status).toBe(403);
    expect((await request(app).get(`/api/invites/${body.invite.token}`)).status).toBe(200);
  });

  it('เพิกถอนแล้วยอมรับไม่ได้ — 410 revoked', async () => {
    const { body } = await createInvite();
    await request(app)
      .delete(`/api/invites/${body.invite.token}`)
      .set('Authorization', `Bearer ${malee}`);

    const res = await request(app).post(`/api/invites/${body.invite.token}/accept`).send({ name: 'ดร. วิชัย' });
    expect(res.status).toBe(410);
    expect(res.body.reason).toBe('revoked');
  });

  // ── แขกใช้ token ที่ได้จริง ────────────────────────────

  it('guest token เห็นเฉพาะการประชุมที่ตัวเองถูกเชิญ', async () => {
    const { body } = await createInvite();
    const accepted = await request(app)
      .post(`/api/invites/${body.invite.token}/accept`)
      .send({ name: 'ดร. วิชัย' });
    const guest = accepted.body.token;

    const list = await request(app).get('/api/meetings').set('Authorization', `Bearer ${guest}`);
    expect(list.status).toBe(200);
    expect(list.body.meetings).toHaveLength(1);
    expect(list.body.meetings[0].id).toBe(MEETING_ID);

    const one = await request(app)
      .get(`/api/meetings/${MEETING_ID}`)
      .set('Authorization', `Bearer ${guest}`);
    expect(one.status).toBe(200);
  });

  it('guest token เปิดการประชุมอื่นไม่ได้ — 403', async () => {
    await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${malee}`)
      .send({
        meeting: {
          id: 'MT-OTHER',
          title: 'ประชุมที่แขกไม่ได้ถูกเชิญ',
          date: '2026-09-21',
          startTime: '09:00',
          endTime: '10:00',
          participants: [],
        },
      });

    const { body } = await createInvite();
    const accepted = await request(app)
      .post(`/api/invites/${body.invite.token}/accept`)
      .send({ name: 'ดร. วิชัย' });

    const res = await request(app)
      .get('/api/meetings/MT-OTHER')
      .set('Authorization', `Bearer ${accepted.body.token}`);
    expect(res.status).toBe(403);
  });
});
