import { describe, it, expect } from "vitest";
import {
  buildAudioFrame,
  downsampleTo16k,
  floatToPcm16,
  FRAME_SECONDS,
  rms,
  SILENCE_RMS_THRESHOLD,
  TARGET_RATE,
} from "./pcm";

describe("downsampleTo16k", () => {
  it("ลดอัตราสุ่มจาก 48 kHz เหลือ 16 kHz ได้ความยาวหนึ่งในสาม", () => {
    const input = new Float32Array(4800).fill(0.5);
    const output = downsampleTo16k(input, 48000);

    expect(output).toHaveLength(1600);
    expect(output[0]).toBeCloseTo(0.5, 5);
  });

  it("อัตราสุ่มต่ำกว่าเป้าหมาย เพิ่มความถี่ด้วยการประมาณเชิงเส้น ไม่แทรกความเงียบ", () => {
    const output = downsampleTo16k(new Float32Array([0.5, 0.6, 0.7, 0.8]), 8000);

    expect(output).toHaveLength(8);
    // ค่าที่แทรกต้องอยู่ระหว่างตัวอย่างสองตัวที่ขนาบ ไม่ใช่ศูนย์
    expect(output[1]).toBeCloseTo(0.55, 5);
    expect(Array.from(output).some((v) => v === 0)).toBe(false);
  });

  it("อัตราสุ่มตรงกับเป้าหมายอยู่แล้ว คืนของเดิม", () => {
    const input = new Float32Array([0.1, -0.2, 0.3]);
    // เทียบตัวเดียวกันไปเลย แทนการเทียบค่าทีละตัวกับเลขทศนิยมที่เขียนในเทสต์
    // เพราะ Float32Array เก็บ 0.1 เป็น 0.10000000149 การเทียบค่าจะวัดความคลาดเคลื่อนของ
    // Float32 แทนที่จะวัดว่าฟังก์ชันข้ามขั้นตอนลดอัตราสุ่มจริงหรือไม่
    expect(downsampleTo16k(input, TARGET_RATE)).toBe(input);
  });
});

describe("rms", () => {
  it("ความเงียบสนิทได้ศูนย์ และต่ำกว่าเกณฑ์", () => {
    const value = rms(new Float32Array(100));
    expect(value).toBe(0);
    expect(value).toBeLessThan(SILENCE_RMS_THRESHOLD);
  });

  it("เสียงดังได้ค่าสูงกว่าเกณฑ์", () => {
    expect(rms(new Float32Array(100).fill(0.4))).toBeGreaterThan(SILENCE_RMS_THRESHOLD);
  });
});

describe("floatToPcm16", () => {
  it("แปลงช่วง -1 ถึง 1 เป็นจำนวนเต็ม 16 บิต", () => {
    const pcm = floatToPcm16(new Float32Array([0, 1, -1]));

    expect(pcm[0]).toBe(0);
    expect(pcm[1]).toBe(32767);
    expect(pcm[2]).toBe(-32767);
  });

  it("ค่าที่เกินช่วงถูก clip ไม่ให้ล้นกลับเป็นเสียงแตก", () => {
    const pcm = floatToPcm16(new Float32Array([2.5, -2.5]));

    expect(pcm[0]).toBe(32767);
    expect(pcm[1]).toBe(-32767);
  });
});

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
