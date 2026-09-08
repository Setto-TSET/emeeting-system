jest.mock('../../src/realtime/asrClient', () => ({
  transcribePcm: jest.fn(),
  asrBaseUrl: () => 'http://localhost:8000',
}));

import { transcribePcm } from '../../src/realtime/asrClient';
import { typhoonProvider } from '../../src/realtime/providers/typhoon';

const mockTranscribe = transcribePcm as jest.MockedFunction<typeof transcribePcm>;

// 250 ms ที่ 16 kHz = 4000 ตัวอย่าง = 8000 ไบต์
const FRAME = Buffer.alloc(8000);

describe('typhoon provider', () => {
  beforeEach(() => mockTranscribe.mockReset());

  it('ไม่เรียก sidecar จนกว่าจะสะสมครบ 3 วินาที', async () => {
    const session = await typhoonProvider.open({ onPartial: jest.fn(), onFinal: jest.fn() });

    for (let i = 0; i < 11; i += 1) session.push(FRAME, i * 0.25);
    expect(mockTranscribe).not.toHaveBeenCalled();

    session.push(FRAME, 2.75);
    await session.close();
    expect(mockTranscribe).toHaveBeenCalledTimes(1);
  });

  it('ยิง onFinal พร้อมเวลาเริ่มของก้อน ไม่ใช่เวลาที่ถอดเสร็จ', async () => {
    mockTranscribe.mockResolvedValue('สวัสดีครับ');
    const onFinal = jest.fn();
    const session = await typhoonProvider.open({ onPartial: jest.fn(), onFinal });

    for (let i = 0; i < 12; i += 1) session.push(FRAME, 10 + i * 0.25);
    await session.close();

    expect(onFinal).toHaveBeenCalledWith('สวัสดีครับ', 10);
  });

  it('ตัดคำที่ซ้ำตรงรอยต่อของสองก้อนติดกัน', async () => {
    mockTranscribe.mockResolvedValueOnce('วาระที่หนึ่งงบประมาณ').mockResolvedValueOnce('งบประมาณปีหน้า').mockResolvedValue('');
    const onFinal = jest.fn();
    const session = await typhoonProvider.open({ onPartial: jest.fn(), onFinal });

    for (let i = 0; i < 24; i += 1) session.push(FRAME, i * 0.25);
    await session.close();

    expect(onFinal).toHaveBeenNthCalledWith(1, 'วาระที่หนึ่งงบประมาณ', 0);
    expect(onFinal.mock.calls[1][0]).toBe('ปีหน้า');
  });

  it('ไม่เคยยิง onPartial — provider นี้ไม่มีผลระหว่างพูด', async () => {
    mockTranscribe.mockResolvedValue('ข้อความ');
    const onPartial = jest.fn();
    const session = await typhoonProvider.open({ onPartial, onFinal: jest.fn() });

    for (let i = 0; i < 12; i += 1) session.push(FRAME, i * 0.25);
    await session.close();

    expect(onPartial).not.toHaveBeenCalled();
  });

  it('sidecar ล้มแล้วโยน error ออกมา ไม่กลืนเงียบ', async () => {
    mockTranscribe.mockRejectedValue(new Error('boom'));
    const session = await typhoonProvider.open({ onPartial: jest.fn(), onFinal: jest.fn() });

    for (let i = 0; i < 12; i += 1) session.push(FRAME, i * 0.25);
    await expect(session.close()).rejects.toThrow('boom');
  });
});
