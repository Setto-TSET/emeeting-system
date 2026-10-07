import request from 'supertest';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { signAccessToken } from '../../src/services/auth';
import { createApp } from '../../src/server';

const app = createApp();
const MEETING_ID = 'MT-GUEST-LINK-1';

// มาลีสร้างการประชุมนี้ จึงเป็นผู้จัด
const organizer = signAccessToken({ sub: 'U-003', email: 'malee.r@e-office.cloud', name: 'นางสาว มาลี รักษาสัตย์', role: 'secretary' });
// เดชาเป็นผู้เข้าร่วมทั่วไป ไม่ใช่ผู้จัดการ
const participant = signAccessToken({ sub: 'U-005', email: 'decha@e-office.cloud', name: 'นาย เดชา เก่งจริง', role: 'staff' });

async function createMeeting(overrides: Record<string, unknown> = {}) {
  await request(app)
    .post('/api/meetings')
    .set('Authorization', `Bearer ${organizer}`)
    .send({
      meeting: {
        id: MEETING_ID,
        name: 'ประชุมคณะกรรมการชุดที่ 1',
        date: '2026-10-20',
        startTime: '10:00',
        endTime: '11:30',
        location: 'ห้องประชุม 801',
        organizer: 'นางสาว มาลี รักษาสัตย์',
        status: 'prepare',
        participants: [{ userId: 'U-005' }],
        agenda: [{ id: 'AG-1', no: '1', title: 'วาระลับ', comments: [] }],
        files: [],
        permissions: [],
        allowGuestJoin: true,
        ...overrides,
      },
    });
}

async function createLink(auth = organizer) {
  return request(app).post(`/api/meetings/${MEETING_ID}/guest-link`).set('Authorization', `Bearer ${auth}`);
}

describe('ลิงก์เชิญบุคคลภายนอก (ลิงก์เดียวต่อการประชุม)', () => {
  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM app_users');
    await seedFromMockData('Meeting@2569');
  });

  beforeEach(async () => {
    await query('DELETE FROM meeting_participants WHERE meeting_id = ?', [MEETING_ID]);
    await query('DELETE FROM meetings WHERE id = ?', [MEETING_ID]);
    await createMeeting();
  });

  afterAll(async () => {
    await close();
  });

  it('ผู้จัดสร้างลิงก์ได้ แล้วคนที่ได้ลิงก์เปิดดูได้โดยไม่ต้องล็อกอิน — เห็นแค่ข้อมูลนัดหมาย', async () => {
    const created = await createLink();
    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^[\w-]{32}$/);

    const opened = await request(app).get(`/api/guest-links/${created.body.token}`);
    expect(opened.status).toBe(200);
    expect(opened.body.meeting).toEqual(expect.objectContaining({ id: MEETING_ID, name: 'ประชุมคณะกรรมการชุดที่ 1' }));
    expect(opened.body.meeting.agenda).toBeUndefined();
    expect(opened.body.meeting.participants).toBeUndefined();
  });

  it('ใส่ชื่อแล้วได้ guest token ที่ผูกกับการประชุมนี้ห้องเดียว — หลายคนใช้ลิงก์เดียวกันได้', async () => {
    const { token } = (await createLink()).body;

    const first = await request(app).post(`/api/guest-links/${token}/join`).send({ name: '  ดร. วิชัย ตั้งใจ  ' });
    const second = await request(app).post(`/api/guest-links/${token}/join`).send({ name: 'คุณสมศรี' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.user).toEqual(expect.objectContaining({ name: 'ดร. วิชัย ตั้งใจ', systemRole: 'guest' }));
    expect(first.body.user.id).not.toBe(second.body.user.id);

    const own = await request(app).get(`/api/meetings/${MEETING_ID}`).set('Authorization', `Bearer ${first.body.token}`);
    const other = await request(app).get('/api/meetings/MT-2569-010').set('Authorization', `Bearer ${first.body.token}`);
    expect(own.status).toBe(200);
    expect(other.status).toBe(403);
  });

  it('ไม่ใส่ชื่อเข้าร่วมไม่ได้', async () => {
    const { token } = (await createLink()).body;
    const res = await request(app).post(`/api/guest-links/${token}/join`).send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  it('สร้างลิงก์ใหม่แล้วลิงก์เดิมใช้ไม่ได้ทันที', async () => {
    const old = (await createLink()).body.token;
    const fresh = (await createLink()).body.token;

    expect(fresh).not.toBe(old);
    expect((await request(app).get(`/api/guest-links/${old}`)).status).toBe(404);
    expect((await request(app).post(`/api/guest-links/${old}/join`).send({ name: 'x' })).status).toBe(404);
    expect((await request(app).get(`/api/guest-links/${fresh}`)).status).toBe(200);
  });

  it('ปิดรับบุคคลภายนอกแล้วลิงก์ใช้ไม่ได้ทันที — 403 guest_join_disabled', async () => {
    const { token } = (await createLink()).body;
    await query("UPDATE meetings SET payload = JSON_SET(payload, '$.allowGuestJoin', false) WHERE id = ?", [MEETING_ID]);

    const opened = await request(app).get(`/api/guest-links/${token}`);
    const joined = await request(app).post(`/api/guest-links/${token}/join`).send({ name: 'ดร. วิชัย' });

    expect(opened.status).toBe(403);
    expect(opened.body.reason).toBe('guest_join_disabled');
    expect(joined.status).toBe(403);
    expect(joined.body.token).toBeUndefined();
  });

  it('ลิงก์ที่ไม่มีอยู่ — 404 not_found', async () => {
    const res = await request(app).get('/api/guest-links/no-such-link');
    expect(res.status).toBe(404);
    expect(res.body.reason).toBe('not_found');
  });

  it('ผู้เข้าร่วมทั่วไปสร้างหรือดูลิงก์ไม่ได้ และไม่เห็นลิงก์ในข้อมูลการประชุม', async () => {
    await createLink();

    expect((await createLink(participant)).status).toBe(403);
    expect(
      (await request(app).get(`/api/meetings/${MEETING_ID}/guest-link`).set('Authorization', `Bearer ${participant}`)).status
    ).toBe(403);

    const asParticipant = await request(app).get(`/api/meetings/${MEETING_ID}`).set('Authorization', `Bearer ${participant}`);
    const asOrganizer = await request(app).get(`/api/meetings/${MEETING_ID}`).set('Authorization', `Bearer ${organizer}`);
    expect(asParticipant.body.meeting.guestLinkToken).toBeUndefined();
    expect(typeof asOrganizer.body.meeting.guestLinkToken).toBe('string');
  });

  it('ข้อตกลงรักษาความลับ: แขกกดยอมรับได้ ผู้จัดเห็นรายชื่อ ผู้เข้าร่วมไม่เห็น และ PUT ลบไม่ได้', async () => {
    const { token } = (await createLink()).body;
    const guest = (await request(app).post(`/api/guest-links/${token}/join`).send({ name: 'คุณสมศรี' })).body;
    const ack = (auth: string, body: object) =>
      request(app).post(`/api/meetings/${MEETING_ID}/confidentiality-ack`).set('Authorization', `Bearer ${auth}`).send(body);

    expect((await ack(guest.token, {})).status).toBe(400);
    expect((await ack(guest.token, { accepted: true })).status).toBe(201);
    expect((await ack(participant, { accepted: true })).status).toBe(201);
    expect((await request(app).post('/api/meetings/MT-2569-010/confidentiality-ack').set('Authorization', `Bearer ${guest.token}`).send({ accepted: true })).status).toBe(403);

    await request(app)
      .put(`/api/meetings/${MEETING_ID}`)
      .set('Authorization', `Bearer ${organizer}`)
      .send({ meeting: { id: MEETING_ID, name: 'แก้ชื่อแล้ว', participants: [{ userId: 'U-005' }], confidentialityAcks: [], allowGuestJoin: true } });

    const asOrganizer = await request(app).get(`/api/meetings/${MEETING_ID}`).set('Authorization', `Bearer ${organizer}`);
    const asParticipant = await request(app).get(`/api/meetings/${MEETING_ID}`).set('Authorization', `Bearer ${participant}`);
    expect(asOrganizer.body.meeting.confidentialityAcks.map((a: { name: string }) => a.name)).toEqual(['คุณสมศรี', 'นาย เดชา เก่งจริง']);
    expect(asParticipant.body.meeting.confidentialityAcks).toBeUndefined();
  });

  it('แก้การประชุม (PUT) ไม่ลบหรือเปลี่ยนลิงก์ และตั้งลิงก์เองตอนสร้างการประชุมไม่ได้', async () => {
    const { token } = (await createLink()).body;
    await request(app)
      .put(`/api/meetings/${MEETING_ID}`)
      .set('Authorization', `Bearer ${organizer}`)
      .send({ meeting: { id: MEETING_ID, name: 'แก้ชื่อแล้ว', guestLinkToken: 'guessable', allowGuestJoin: true } });
    expect((await request(app).get(`/api/guest-links/${token}`)).status).toBe(200);
    expect((await request(app).get('/api/guest-links/guessable')).status).toBe(404);

    await query('DELETE FROM meetings WHERE id = ?', [MEETING_ID]);
    await createMeeting({ guestLinkToken: 'guessable' });
    expect((await request(app).get('/api/guest-links/guessable')).status).toBe(404);
  });
});
