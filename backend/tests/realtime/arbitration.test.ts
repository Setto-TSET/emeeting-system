import {
  activeRoomCount,
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

/** promise ที่ควบคุม resolve/reject เองได้ — ใช้บังคับลำดับการชนกันของ claim สอง call ให้แน่นอน */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

  it('claim ชนกันของสองคนต่างกัน เปิด session แค่ครั้งเดียว คนนึงได้คนนึงไม่ได้', async () => {
    const gate = deferred<AsrSession>();
    const open = jest.fn(() => gate.promise);

    const p1 = claimSlot('M1', 'U1', 0.2, 1000, open);
    const p2 = claimSlot('M1', 'U2', 0.2, 1000, open);

    const session = fakeSession();
    gate.resolve(session);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(open).toHaveBeenCalledTimes(1);
    const results = [r1, r2];
    expect(results.filter((r) => r === session)).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(1);
  });

  it('claim ชนกันของคนเดียวกัน เปิด session แค่ครั้งเดียว ทั้งคู่ได้ session เดียวกัน', async () => {
    const gate = deferred<AsrSession>();
    const open = jest.fn(() => gate.promise);

    const p1 = claimSlot('M1', 'U1', 0.2, 1000, open);
    const p2 = claimSlot('M1', 'U1', 0.2, 1000, open);

    const session = fakeSession();
    gate.resolve(session);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(open).toHaveBeenCalledTimes(1);
    expect(r1).toBe(session);
    expect(r2).toBe(session);
  });

  it('แย่ง slot ชนกันตอนห้องเต็ม ไม่มี session ไหนถูกเปิดค้างโดยไม่มีใครถืออยู่', async () => {
    const held = fakeSession();
    const openHeld = jest.fn(async () => held);
    await claimSlot('M1', 'U1', 0.2, 1000, openHeld);

    const gateA = deferred<AsrSession>();
    const gateB = deferred<AsrSession>();
    const sessionA = fakeSession();
    const sessionB = fakeSession();
    const open = jest
      .fn<Promise<AsrSession>, []>()
      .mockReturnValueOnce(gateA.promise)
      .mockReturnValueOnce(gateB.promise);

    // U2 ดังพอแย่งจาก U1 ได้, U3 ดังกว่านั้นอีกจนแย่งต่อจาก U2 ได้ด้วย — ทั้งคู่ยิง claim
    // ก่อนที่ session ไหนจะ resolve เพื่อบังคับให้ทั้งสอง await เกิดขึ้นพร้อมกันจริง ๆ
    const p1 = claimSlot('M1', 'U2', 0.4, 1000, open);
    const p2 = claimSlot('M1', 'U3', 1.0, 1000, open);

    gateA.resolve(sessionA);
    gateB.resolve(sessionB);
    await Promise.all([p1, p2]);

    // หาว่าตอนนี้ใครถือ slot อยู่จริง โดยไม่แตะ internals — probe ด้วย rms ต่ำมากที่ไม่มีทางแย่ง slot ได้
    // ถ้าไม่ใช่เจ้าของตัวจริงจะโดนปฏิเสธและไม่เรียก open เลย
    const probeOpen = jest.fn();
    const probes = await Promise.all([
      claimSlot('M1', 'U1', 0.0001, 2000, probeOpen),
      claimSlot('M1', 'U2', 0.0001, 2000, probeOpen),
      claimSlot('M1', 'U3', 0.0001, 2000, probeOpen),
    ]);
    expect(probeOpen).not.toHaveBeenCalled();
    const currentlyHeld = probes.find((r) => r !== null);

    for (const session of [held, sessionA, sessionB]) {
      const s = session as unknown as { closed: boolean };
      expect((session as unknown) === currentlyHeld || s.closed).toBe(true);
    }
  });

  it('openSession reject แล้ว claim ถัดไปของคนอื่นยังสำเร็จ — reservation ที่พังถูกเก็บกวาด', async () => {
    const open = jest
      .fn<Promise<AsrSession>, []>()
      .mockRejectedValueOnce(new Error('เปิดไม่สำเร็จ'))
      .mockResolvedValueOnce(fakeSession());

    await expect(claimSlot('M1', 'U1', 0.2, 1000, open)).rejects.toThrow('เปิดไม่สำเร็จ');
    expect(await claimSlot('M1', 'U2', 0.2, 1000, open)).not.toBeNull();
  });

  it('ห้องที่ว่างจาก releaseSpeaker ไม่เหลือ entry ค้างใน map ภายใน', async () => {
    const open = jest.fn(async () => fakeSession());
    await claimSlot('M1', 'U1', 0.2, 1000, open);
    await claimSlot('M2', 'U2', 0.2, 1000, open);
    expect(activeRoomCount()).toBe(2);

    await releaseSpeaker('M1', 'U1');
    expect(activeRoomCount()).toBe(1);

    await releaseSpeaker('M2', 'U2');
    expect(activeRoomCount()).toBe(0);
  });
});
