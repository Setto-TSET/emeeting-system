import request from 'supertest';
import { signAccessToken } from '../../src/services/auth';

// ไม่แตะ DB/Claude จริง — ทดสอบแค่สัญญาของ route: ดึง transcript จาก DB เอง, เช็คสิทธิ์,
// ตอบ 422 เมื่อไม่มีคำบรรยาย และ 503 เมื่อยังไม่ตั้ง key
jest.mock('../../src/repositories/meetings', () => ({
  ...jest.requireActual('../../src/repositories/meetings'),
  getMeeting: jest.fn(),
}));
jest.mock('../../src/repositories/transcript', () => ({
  listSegments: jest.fn(),
}));
jest.mock('../../src/services/claude', () => {
  const actual = jest.requireActual('../../src/services/claude');
  return { ...actual, summarizeTranscript: jest.fn() };
});

import { createApp } from '../../src/server';
import { getMeeting } from '../../src/repositories/meetings';
import { listSegments } from '../../src/repositories/transcript';
import { summarizeTranscript, SummarizerNotConfiguredError } from '../../src/services/claude';

const app = createApp();
const adminToken = signAccessToken({
  sub: 'U-999',
  email: 'admin@e-office.cloud',
  name: 'IT Admin',
  role: 'admin',
});

const MEETING = {
  id: 'MT-1',
  name: 'ประชุมทดสอบ',
  organizerId: 'U-999',
  agenda: [{ id: 'AG-1', no: '1', title: 'เรื่องแจ้ง' }],
};
const SEGMENTS = [{ speakerId: 'U-1', speakerName: 'มาลี', startSec: 2.5, text: 'ขอเปิดประชุม' }];

const post = (body: object) =>
  request(app).post('/api/summarize').set('Authorization', `Bearer ${adminToken}`).send(body);

describe('POST /api/summarize', () => {
  beforeEach(() => {
    jest.mocked(getMeeting).mockResolvedValue(MEETING as never);
    jest.mocked(listSegments).mockResolvedValue(SEGMENTS);
    jest.mocked(summarizeTranscript).mockReset();
  });

  it('สรุปจากคำบรรยายใน DB พร้อมวาระของประชุม', async () => {
    jest.mocked(summarizeTranscript).mockResolvedValue({ byAgenda: [], overall: 'สรุป' });

    const res = await post({ meetingId: 'MT-1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ meetingId: 'MT-1', isDraft: true, byAgenda: [], overall: 'สรุป' });
    expect(summarizeTranscript).toHaveBeenCalledWith(SEGMENTS, [{ id: 'AG-1', no: '1', title: 'เรื่องแจ้ง' }]);
  });

  it('ไม่มีคำบรรยาย: 422 และไม่เรียก Claude', async () => {
    jest.mocked(listSegments).mockResolvedValue([]);

    const res = await post({ meetingId: 'MT-1' });

    expect(res.status).toBe(422);
    expect(summarizeTranscript).not.toHaveBeenCalled();
  });

  it('ยังไม่ตั้ง CLAUDE_API_KEY: 503', async () => {
    jest.mocked(summarizeTranscript).mockRejectedValue(new SummarizerNotConfiguredError('x'));

    const res = await post({ meetingId: 'MT-1' });

    expect(res.status).toBe(503);
  });

  it('ไม่พบการประชุม: 404', async () => {
    jest.mocked(getMeeting).mockResolvedValue(null);

    const res = await post({ meetingId: 'MT-404' });

    expect(res.status).toBe(404);
  });
});
