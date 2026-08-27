import request from 'supertest';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { signAccessToken } from '../../src/services/auth';
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

function body(overrides: Record<string, unknown> = {}) {
  return {
    booking: {
      roomId: 'R-801',
      roomName: 'ห้องประชุม 801',
      title: 'ประชุมทีมพัฒนา',
      department: 'ฝ่ายเทคโนโลยี',
      date: '2026-09-01',
      startTime: '09:00',
      endTime: '10:00',
      attendees: 8,
      purpose: 'ติดตามงาน',
      ...overrides,
    },
  };
}

describe('/api/bookings', () => {
  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM room_bookings');
    await query('DELETE FROM app_users');
    await seedFromMockData('Meeting@2569');
  });

  beforeEach(async () => {
    await query('DELETE FROM room_bookings');
  });

  it('ไม่มี token จองไม่ได้', async () => {
    expect((await request(app).get('/api/bookings')).status).toBe(401);
    expect((await request(app).post('/api/bookings').send(body())).status).toBe(401);
  });

  it('จองแล้วคนอื่นเห็นทันที — ไม่ใช่ข้อมูลในเครื่องตัวเองแบบเดิม', async () => {
    const created = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${malee}`)
      .send(body());

    expect(created.status).toBe(201);
    expect(created.body.booking.bookedById).toBe('U-003');

    const seenByOther = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${somchai}`);

    expect(seenByOther.status).toBe(200);
    expect(seenByOther.body.bookings.map((b: { id: string }) => b.id)).toContain(
      created.body.booking.id
    );
  });

  it('ผู้จองมาจาก token ไม่ใช่จาก body — จองในนามคนอื่นไม่ได้', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${somchai}`)
      .send(body({ bookedById: 'U-003', bookedBy: 'นางสาว มาลี รักษาสัตย์' }));

    expect(res.body.booking.bookedById).toBe('U-001');
    expect(res.body.booking.bookedBy).toBe('นาย สมชาย ใจดี');
  });

  it('เวลาชนกันในห้องเดียวกันต้องถูกปฏิเสธ 409', async () => {
    await request(app).post('/api/bookings').set('Authorization', `Bearer ${malee}`).send(body());

    const clash = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${somchai}`)
      .send(body({ startTime: '09:30', endTime: '11:00' }));

    expect(clash.status).toBe(409);
    expect(clash.body.conflict.bookedById).toBe('U-003');
  });

  it('สองคนกดจองห้องเดียวเวลาเดียวพร้อมกัน สำเร็จได้คนเดียว', async () => {
    const [a, b] = await Promise.all([
      request(app).post('/api/bookings').set('Authorization', `Bearer ${malee}`).send(body()),
      request(app).post('/api/bookings').set('Authorization', `Bearer ${somchai}`).send(body()),
    ]);

    const codes = [a.status, b.status].sort();
    expect(codes).toEqual([201, 409]);

    const all = await request(app).get('/api/bookings').set('Authorization', `Bearer ${malee}`);
    expect(all.body.bookings).toHaveLength(1);
  });

  it('ต่อท้ายพอดี (จบ 10:00 เริ่ม 10:00) ไม่ถือว่าชน', async () => {
    await request(app).post('/api/bookings').set('Authorization', `Bearer ${malee}`).send(body());

    const next = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${somchai}`)
      .send(body({ startTime: '10:00', endTime: '11:00' }));

    expect(next.status).toBe(201);
  });

  it('คนละห้องเวลาเดียวกันจองได้', async () => {
    await request(app).post('/api/bookings').set('Authorization', `Bearer ${malee}`).send(body());

    const other = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${somchai}`)
      .send(body({ roomId: 'R-808', roomName: 'ห้องประชุม 808' }));

    expect(other.status).toBe(201);
  });

  it('ยกเลิกแล้วช่วงเวลานั้นกลับมาจองได้', async () => {
    const first = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${malee}`)
      .send(body());

    await request(app)
      .delete(`/api/bookings/${first.body.booking.id}`)
      .set('Authorization', `Bearer ${malee}`);

    const again = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${somchai}`)
      .send(body());

    expect(again.status).toBe(201);
  });

  it('ยกเลิกการจองของคนอื่นไม่ได้ แต่ admin ทำได้', async () => {
    const mine = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${malee}`)
      .send(body());
    const id = mine.body.booking.id;

    const denied = await request(app)
      .delete(`/api/bookings/${id}`)
      .set('Authorization', `Bearer ${somchai}`);
    expect(denied.status).toBe(403);

    const byAdmin = await request(app)
      .delete(`/api/bookings/${id}`)
      .set('Authorization', `Bearer ${admin}`);
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.booking.status).toBe('cancelled');
  });

  it('ยกเลิกแล้วแถวยังอยู่ในระบบ ไม่ถูกลบทิ้ง', async () => {
    const created = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${malee}`)
      .send(body());

    await request(app)
      .delete(`/api/bookings/${created.body.booking.id}`)
      .set('Authorization', `Bearer ${malee}`);

    const rows = (await query('SELECT status FROM room_bookings WHERE id = ?', [
      created.body.booking.id,
    ])) as { status: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('cancelled');
  });

  it('ข้อมูลไม่ครบหรือเวลากลับหัวต้องได้ 400', async () => {
    const noTitle = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${malee}`)
      .send(body({ title: '  ' }));
    expect(noTitle.status).toBe(400);

    const backwards = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${malee}`)
      .send(body({ startTime: '11:00', endTime: '10:00' }));
    expect(backwards.status).toBe(400);

    const badDate = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${malee}`)
      .send(body({ date: '01/09/2026' }));
    expect(badDate.status).toBe(400);
  });

  it('วันที่ที่บันทึกต้องตรงกับที่ส่งมาเป๊ะ ไม่เลื่อนตาม timezone', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${malee}`)
      .send(body({ date: '2026-09-01' }));

    const list = await request(app).get('/api/bookings').set('Authorization', `Bearer ${malee}`);
    expect(res.body.booking.date).toBe('2026-09-01');
    expect(list.body.bookings[0].date).toBe('2026-09-01');
  });

  it('เก็บห้องเสริมกลับมาได้ครบ', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${malee}`)
      .send(body({ extraRooms: ['R-901'] }));

    expect(res.status).toBe(201);
    const list = await request(app).get('/api/bookings').set('Authorization', `Bearer ${malee}`);
    expect(list.body.bookings[0].extraRooms).toEqual(['R-901']);
  });
});

afterAll(async () => {
  await close();
});
