import request from 'supertest';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { signAccessToken } from '../../src/services/auth';
import { createApp } from '../../src/server';

const app = createApp();

const admin = signAccessToken({
  sub: 'U-999',
  email: 'admin@e-office.cloud',
  name: 'IT Admin',
  role: 'admin',
});
// U-003 มาลี เลขานุการ — ผู้เข้าร่วม MT-2569-010
const secretary = signAccessToken({
  sub: 'U-003',
  email: 'malee.r@e-office.cloud',
  name: 'นางสาว มาลี รักษาสัตย์',
  role: 'secretary',
});
// U-006 ไม่ได้อยู่ในประชุมไหนเลย
const outsider = signAccessToken({
  sub: 'U-006',
  email: 'outsider@e-office.cloud',
  name: 'คนนอก',
  role: 'staff',
});

function meetingBody(id: string, overrides: Record<string, unknown> = {}) {
  return {
    meeting: {
      id,
      name: 'ประชุมทดสอบสร้างผ่าน API',
      date: '2569-09-01',
      startTime: '09:00',
      endTime: '10:30',
      status: 'scheduled',
      committeeId: 'CM-001',
      participants: [{ userId: 'U-001', position: 'ประธาน' }, { userId: 'U-003' }],
      files: [],
      agenda: [],
      permissions: [],
      ...overrides,
    },
  };
}

describe('/api/meetings', () => {
  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM meeting_files');
    await query('DELETE FROM meeting_participants');
    await query('DELETE FROM meetings');
    await query('DELETE FROM app_users');
    await seedFromMockData('Meeting@2569');
  });

  it('เก็บก้อน payload ครบและ sync รายชื่อผู้เข้าร่วมลงตารางที่ WebSocket ใช้', async () => {
    const res = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${secretary}`)
      .send(meetingBody('MT-TEST-001'));

    expect(res.status).toBe(201);
    expect(res.body.meeting.agenda).toEqual([]);
    // ผู้จัดมาจาก token เสมอ ไม่ใช่จาก body
    expect(res.body.meeting.organizerId).toBe('U-003');

    const rows = (await query(
      'SELECT user_id FROM meeting_participants WHERE meeting_id = ? ORDER BY user_id',
      ['MT-TEST-001']
    )) as { user_id: string }[];
    expect(rows.map((r) => r.user_id)).toEqual(['U-001', 'U-003']);
  });

  it('ถอดชื่อผู้เข้าร่วมออกแล้วตารางต้องหายตาม ไม่ค้างสิทธิ์เข้าห้อง', async () => {
    const res = await request(app)
      .put('/api/meetings/MT-TEST-001')
      .set('Authorization', `Bearer ${secretary}`)
      .send(meetingBody('MT-TEST-001', { participants: [{ userId: 'U-001' }] }));

    expect(res.status).toBe(200);
    const rows = (await query(
      'SELECT user_id FROM meeting_participants WHERE meeting_id = ?',
      ['MT-TEST-001']
    )) as { user_id: string }[];
    expect(rows.map((r) => r.user_id)).toEqual(['U-001']);
  });

  it('ส่งมาแค่ userId ก็ต้องได้ชื่อ/ตำแหน่ง/อีเมลกลับมาครบ', async () => {
    const res = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${secretary}`)
      .send(meetingBody('MT-TEST-003', { participants: [{ userId: 'U-001' }] }));

    expect(res.status).toBe(201);
    const [p] = res.body.meeting.participants;
    // หน้าเว็บอ่าน p.name.charAt(...) ตรงๆ — ชื่อว่างทำให้หน้ารายละเอียดประชุมพังทั้งหน้า
    expect(p.name).toBe('นาย สมชาย ใจดี');
    expect(p.email).toBe('somchai.j@e-office.cloud');
    expect(p.position).toBeTruthy();
    expect(p.inSystem).toBe(true);
  });

  it('ตำแหน่งในที่ประชุมที่ระบุมาต้องชนะข้อมูลโปรไฟล์', async () => {
    const res = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${secretary}`)
      .send(meetingBody('MT-TEST-004', { participants: [{ userId: 'U-001', position: 'ประธาน' }] }));

    expect(res.body.meeting.participants[0].position).toBe('ประธาน');
    expect(res.body.meeting.participants[0].name).toBe('นาย สมชาย ใจดี');
  });

  it('คนนอกการประชุมเปิดดูไม่ได้', async () => {
    const res = await request(app)
      .get('/api/meetings/MT-TEST-001')
      .set('Authorization', `Bearer ${outsider}`);
    expect(res.status).toBe(403);
  });

  it('คนนอกแก้ไขไม่ได้แม้จะเดา id ถูก', async () => {
    const res = await request(app)
      .put('/api/meetings/MT-TEST-001')
      .set('Authorization', `Bearer ${outsider}`)
      .send(meetingBody('MT-TEST-001', { name: 'โดนแก้' }));
    expect(res.status).toBe(403);
  });

  it('รายการประชุมของแต่ละคนเห็นไม่เท่ากัน', async () => {
    const mine = await request(app)
      .get('/api/meetings')
      .set('Authorization', `Bearer ${secretary}`);
    const none = await request(app)
      .get('/api/meetings')
      .set('Authorization', `Bearer ${outsider}`);
    const all = await request(app).get('/api/meetings').set('Authorization', `Bearer ${admin}`);

    expect(mine.body.meetings.map((m: { id: string }) => m.id)).toContain('MT-TEST-001');
    expect(none.body.meetings).toHaveLength(0);
    expect(all.body.meetings.length).toBeGreaterThanOrEqual(2);
  });

  it('ไม่มี token เข้าไม่ได้เลย', async () => {
    expect((await request(app).get('/api/meetings')).status).toBe(401);
  });
});

describe('/api/meetings/:id/files', () => {
  const pdf = Buffer.from('%PDF-1.4 เอกสารลับ').toString('base64');

  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM meeting_files');
    await query('DELETE FROM meeting_participants');
    await query('DELETE FROM meetings');
    await query('DELETE FROM app_users');
    await seedFromMockData('Meeting@2569');

    await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${secretary}`)
      .send(meetingBody('MT-TEST-002'));
  });

  it('อัปโหลดแล้วผู้เข้าร่วมคนอื่นโหลดไฟล์เดียวกันได้', async () => {
    const upload = await request(app)
      .post('/api/meetings/MT-TEST-002/files')
      .set('Authorization', `Bearer ${secretary}`)
      .send({ name: 'ระเบียบวาระ.pdf', mimeType: 'application/pdf', contentBase64: pdf });

    expect(upload.status).toBe(201);
    const fileId = upload.body.file.id;

    // ผูกไฟล์เข้ากับ payload พร้อมระดับการมองเห็น — สิทธิ์รายไฟล์อ่านจากตรงนี้
    await request(app)
      .put('/api/meetings/MT-TEST-002')
      .set('Authorization', `Bearer ${secretary}`)
      .send(
        meetingBody('MT-TEST-002', {
          files: [{ id: fileId, storageKey: fileId, visibility: 'participants' }],
        })
      );

    const download = await request(app)
      .get(`/api/meetings/MT-TEST-002/files/${fileId}`)
      .set('Authorization', `Bearer ${admin}`);

    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('application/pdf');
    expect(download.body.toString()).toContain('เอกสารลับ');
  });

  it('ไฟล์ระดับ restricted คนที่ไม่อยู่ใน whitelist โหลดไม่ได้', async () => {
    const upload = await request(app)
      .post('/api/meetings/MT-TEST-002/files')
      .set('Authorization', `Bearer ${secretary}`)
      .send({ name: 'ลับเฉพาะ.pdf', mimeType: 'application/pdf', contentBase64: pdf });
    const fileId = upload.body.file.id;

    await request(app)
      .put('/api/meetings/MT-TEST-002')
      .set('Authorization', `Bearer ${secretary}`)
      .send(
        meetingBody('MT-TEST-002', {
          participants: [{ userId: 'U-001' }, { userId: 'U-003' }],
          files: [
            { id: fileId, storageKey: fileId, visibility: 'restricted', allowedUserIds: ['U-002'] },
          ],
        })
      );

    const denied = await request(app)
      .get(`/api/meetings/MT-TEST-002/files/${fileId}`)
      .set('Authorization', `Bearer ${signAccessToken({
        sub: 'U-001',
        email: 'somchai.j@e-office.cloud',
        name: 'นาย สมชาย ใจดี',
        role: 'staff',
      })}`);

    expect(denied.status).toBe(403);
  });

  it('ไฟล์ที่ยังไม่ถูกผูกกับ payload ถือว่าเข้าถึงไม่ได้', async () => {
    const upload = await request(app)
      .post('/api/meetings/MT-TEST-002/files')
      .set('Authorization', `Bearer ${secretary}`)
      .send({ name: 'ลอย.pdf', contentBase64: pdf });

    const res = await request(app)
      .get(`/api/meetings/MT-TEST-002/files/${upload.body.file.id}`)
      .set('Authorization', `Bearer ${signAccessToken({
        sub: 'U-001',
        email: 'somchai.j@e-office.cloud',
        name: 'นาย สมชาย ใจดี',
        role: 'staff',
      })}`);

    expect(res.status).toBe(403);
  });

  it('คนนอกอัปโหลดเข้าประชุมคนอื่นไม่ได้', async () => {
    const res = await request(app)
      .post('/api/meetings/MT-TEST-002/files')
      .set('Authorization', `Bearer ${outsider}`)
      .send({ name: 'แทรก.pdf', contentBase64: pdf });
    expect(res.status).toBe(403);
  });
});

// pool เดียวใช้ร่วมกันทุก describe ในไฟล์ — ปิดครั้งเดียวตอนจบไฟล์
afterAll(async () => {
  await close();
});
