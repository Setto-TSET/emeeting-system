import {
  claimSlot,
  releaseIdle,
  releaseSpeaker,
  resetArbitration,
} from '../../src/realtime/arbitration';
import type { AsrSession } from '../../src/realtime/providers/types';

function fakeSession(): AsrSession & { closed: boolean } {
  const session = {
    closed: false,
    push: jest.fn(),
    close: jest.fn(async () => {
      session.closed = true;
    }),
  };
  return session as never;
}

describe('arbitration', () => {
  beforeEach(() => {
    resetArbitration();
    process.env.ASR_MAX_STREAMS = '1';
    process.env.SILENCE_CLOSE_MS = '1500';
    process.env.ARBITRATION_TAKEOVER_RATIO = '1.5';
  });

  it('คนแรกที่พูดได้ slot', async () => {
    const open = jest.fn(async () => fakeSession());
    const session = await claimSlot('M1', 'U1', 0.2, 1000, open);

    expect(session).not.toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('เฟรมถัดไปของคนเดิมใช้ session เดิม ไม่เปิดใหม่', async () => {
    const open = jest.fn(async () => fakeSession());
    const first = await claimSlot('M1', 'U1', 0.2, 1000, open);
    const second = await claimSlot('M1', 'U1', 0.2, 1250, open);

    expect(second).toBe(first);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('slot เต็ม คนที่ดังไม่พอถูกปฏิเสธ', async () => {
    const open = jest.fn(async () => fakeSession());
    await claimSlot('M1', 'U1', 0.2, 1000, open);
    const second = await claimSlot('M1', 'U2', 0.25, 1000, open);

    expect(second).toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('ดังเกินอัตราแย่ง slot ได้ และ session เดิมถูกปิด', async () => {
    const held = fakeSession();
    const taker = fakeSession();
    const open = jest
      .fn<Promise<AsrSession>, []>()
      .mockResolvedValueOnce(held)
      .mockResolvedValueOnce(taker);

    await claimSlot('M1', 'U1', 0.2, 1000, open);
    const second = await claimSlot('M1', 'U2', 0.4, 1000, open);

    expect(second).toBe(taker);
    expect(held.closed).toBe(true);
  });

  it('เงียบเกิน SILENCE_CLOSE_MS แล้วคืน slot ให้คนถัดไป', async () => {
    const first = fakeSession();
    const open = jest.fn<Promise<AsrSession>, []>().mockResolvedValueOnce(first).mockResolvedValueOnce(fakeSession());

    await claimSlot('M1', 'U1', 0.2, 1000, open);
    await releaseIdle(3000);

    expect(first.closed).toBe(true);
    expect(await claimSlot('M1', 'U2', 0.05, 3100, open)).not.toBeNull();
  });

  it('ยังไม่ถึงเวลาเงียบไม่ปิด session', async () => {
    const first = fakeSession();
    const open = jest.fn(async () => first);

    await claimSlot('M1', 'U1', 0.2, 1000, open);
    await releaseIdle(2000);

    expect(first.closed).toBe(false);
  });

  it('ASR_MAX_STREAMS=2 เปิดพร้อมกันได้สองคน', async () => {
    process.env.ASR_MAX_STREAMS = '2';
    const open = jest.fn(async () => fakeSession());

    expect(await claimSlot('M1', 'U1', 0.2, 1000, open)).not.toBeNull();
    expect(await claimSlot('M1', 'U2', 0.2, 1000, open)).not.toBeNull();
    expect(await claimSlot('M1', 'U3', 0.2, 1000, open)).toBeNull();
  });

  it('slot แยกกันตามห้อง', async () => {
    const open = jest.fn(async () => fakeSession());
    await claimSlot('M1', 'U1', 0.2, 1000, open);

    expect(await claimSlot('M2', 'U2', 0.2, 1000, open)).not.toBeNull();
  });

  it('releaseSpeaker ปิด session ตอนคนออกจากห้อง', async () => {
    const session = fakeSession();
    const open = jest.fn(async () => session);

    await claimSlot('M1', 'U1', 0.2, 1000, open);
    await releaseSpeaker('M1', 'U1');

    expect(session.closed).toBe(true);
    expect(await claimSlot('M1', 'U2', 0.05, 1100, open)).not.toBeNull();
  });
});
