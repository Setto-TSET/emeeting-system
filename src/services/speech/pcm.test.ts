import { describe, it, expect } from "vitest";
import { buildAudioFrame, FRAME_SECONDS, TARGET_RATE } from "./pcm";

describe("buildAudioFrame", () => {
  it("เขียน timestamp กับ RMS ลง header 8 ไบต์แล้วตามด้วย PCM", () => {
    const pcm = Int16Array.from([1, -2, 3]);
    const frame = buildAudioFrame(pcm, 1234, 0.25);
    const view = new DataView(frame);

    expect(view.getUint32(0, true)).toBe(1234);
    expect(view.getFloat32(4, true)).toBeCloseTo(0.25, 5);
    expect(frame.byteLength).toBe(8 + pcm.byteLength);
    expect(new Int16Array(frame, 8)).toEqual(pcm);
  });

  it("RMS ติดลบหรือ NaN ถูกปัดเป็น 0 — ค่าเพี้ยนจากไมค์ต้องไม่ทำให้ arbitration เลือกผิด", () => {
    const view = new DataView(buildAudioFrame(Int16Array.from([0]), 0, Number.NaN));
    expect(view.getFloat32(4, true)).toBe(0);
  });

  it("เฟรมยาว 250 มิลลิวินาที", () => {
    expect(FRAME_SECONDS * TARGET_RATE).toBe(4000);
  });
});
