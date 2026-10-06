import request from 'supertest';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { signAccessToken } from '../../src/services/auth';
import { createApp } from '../../src/server';
import * as transcript from '../../src/repositories/transcript';

// ไม่ยิง Claude จริงในเทสต์ — แทนเฉพาะ summarizeTranscript แล้วดูว่า route ส่งอะไรเข้าไป
jest.mock('../../src/services/claude', () => {
  const actual = jest.requireActual('../../src/services/claude');
  return { ...actual, summarizeTranscript: jest.fn() };
});
import { summarizeTranscript, SummarizerUnavailableError } from '../../src/services/claude';

const mockSummarize = summarizeTranscript as jest.MockedFunction<typeof summarizeTranscript>;
const app = createApp();
const MEETING = 'MT-2569-010';

const admin = signAccessToken({ sub: 'U-999', email: 'admin@e-office.cloud', name: 'IT Admin', role: 'admin' });
const outsider = signAccessToken({ sub: 'U-006', email: 'outsider@e-office.cloud', name: 'คนนอก', role: 'staff' });

function post(token: string, body: object) {
  return request(app).post('/api/summarize').set('Authorization', `Bearer ${token}`).send(body);
}

describe('POST /api/summarize', () => {
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

  beforeEach(async () => {
    await query('DELETE FROM transcript_segments');
    mockSummarize.mockReset();
  });

  it('ต้องล็อกอิน', async () => {
    const res = await request(app).post('/api/summarize').send({ meetingId: MEETING });
    expect(res.status).toBe(401);
  });

  it('ไม่ระบุ meetingId ได้ 400', async () => {
    expect((await post(admin, {})).status).toBe(400);
  });

  it('ไม่พบการประชุมได้ 404', async () => {
    expect((await post(admin, { meetingId: 'MT-ไม่มีจริง' })).status).toBe(404);
  });

  it('คนที่แก้การประชุมไม่ได้สั่งสรุปไม่ได้', async () => {
    await transcript.appendSegment(MEETING, { speakerId: 'U-001', speakerName: 'สมชาย', startSec: 0, text: 'เปิดประชุม' });
    const res = await post(outsider, { meetingId: MEETING });
    expect(res.status).toBe(403);
    expect(mockSummarize).not.toHaveBeenCalled();
  });

  it('ยังไม่มีบันทึกคำพูดได้ 409 และไม่เรียกโมเดล', async () => {
    const res = await post(admin, { meetingId: MEETING });
    expect(res.status).toBe(409);
    expect(mockSummarize).not.toHaveBeenCalled();
  });

  it('สรุปจาก transcript ใน DB ไม่ใช่จาก body ที่ client ส่งมา', async () => {
    await transcript.appendSegment(MEETING, { speakerId: 'U-001', speakerName: 'สมชาย', startSec: 2.5, text: 'ที่ประชุมเห็นชอบ' });
    mockSummarize.mockResolvedValue({ byAgenda: [], overall: 'ภาพรวม' });

    const res = await post(admin, {
      meetingId: MEETING,
      transcript: [{ speakerName: 'ผู้ปลอม', startSec: 0, text: 'มติปลอม' }],
    });

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ meetingId: MEETING, isDraft: true, byAgenda: [], overall: 'ภาพรวม' });
    const [segments, agendas] = mockSummarize.mock.calls[0];
    expect(segments.map((s) => s.text)).toEqual(['ที่ประชุมเห็นชอบ']);
    // วาระส่งไปเฉพาะ id/no/title — ความเห็นและรายละเอียดอื่นไม่ต้องออกไปถึงโมเดล
    for (const a of agendas!) expect(Object.keys(a).sort()).toEqual(['id', 'no', 'title']);
  });

  it('ยังไม่ตั้ง API key ได้ 503', async () => {
    await transcript.appendSegment(MEETING, { speakerId: 'U-001', speakerName: 'สมชาย', startSec: 0, text: 'เปิดประชุม' });
    mockSummarize.mockRejectedValue(new SummarizerUnavailableError('ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY'));
    const res = await post(admin, { meetingId: MEETING });
    expect(res.status).toBe(503);
  });

  it('โมเดลล้มเหลวได้ 502 โดยไม่เปิดเผยรายละเอียดภายใน', async () => {
    await transcript.appendSegment(MEETING, { speakerId: 'U-001', speakerName: 'สมชาย', startSec: 0, text: 'เปิดประชุม' });
    mockSummarize.mockRejectedValue(new Error('upstream secret detail'));
    const res = await post(admin, { meetingId: MEETING });
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});
