import { describe, expect, test } from 'vitest';
import {
  buildAudioFrame,
  downsampleTo16k,
  floatToPcm16,
  rms,
  SILENCE_RMS_THRESHOLD,
  TARGET_RATE,
} from './pcm';

describe('downsampleTo16k', () => {
  test('ลดอัตราสุ่มจาก 48 kHz เหลือ 16 kHz ได้ความยาวหนึ่งในสาม', () => {
    const input = new Float32Array(4800).fill(0.5);
    const output = downsampleTo16k(input, 48000);

    expect(output).toHaveLength(1600);
    expect(output[0]).toBeCloseTo(0.5, 5);
  });

  test('อัตราสุ่มต่ำกว่าเป้าหมาย เพิ่มความถี่ด้วยการประมาณเชิงเส้น ไม่แทรกความเงียบ', () => {
    const output = downsampleTo16k(new Float32Array([0.5, 0.6, 0.7, 0.8]), 8000);

    expect(output).toHaveLength(8);
    // ค่าที่แทรกต้องอยู่ระหว่างตัวอย่างสองตัวที่ขนาบ ไม่ใช่ศูนย์
    expect(output[1]).toBeCloseTo(0.55, 5);
    expect(Array.from(output).some((v) => v === 0)).toBe(false);
  });

  test('อัตราสุ่มตรงกับเป้าหมายอยู่แล้ว คืนของเดิม', () => {
    const input = new Float32Array([0.1, -0.2, 0.3]);
    // เทียบตัวเดียวกันไปเลย แทนการเทียบค่าทีละตัวกับเลขทศนิยมที่เขียนในเทสต์
    // เพราะ Float32Array เก็บ 0.1 เป็น 0.10000000149 การเทียบค่าจะวัดความคลาดเคลื่อนของ
    // Float32 แทนที่จะวัดว่าฟังก์ชันข้ามขั้นตอนลดอัตราสุ่มจริงหรือไม่
    expect(downsampleTo16k(input, TARGET_RATE)).toBe(input);
  });
});

describe('rms', () => {
  test('ความเงียบสนิทได้ศูนย์ และต่ำกว่าเกณฑ์', () => {
    const value = rms(new Float32Array(100));
    expect(value).toBe(0);
    expect(value).toBeLessThan(SILENCE_RMS_THRESHOLD);
  });

  test('เสียงดังได้ค่าสูงกว่าเกณฑ์', () => {
    expect(rms(new Float32Array(100).fill(0.4))).toBeGreaterThan(SILENCE_RMS_THRESHOLD);
  });
});

describe('floatToPcm16', () => {
  test('แปลงช่วง -1 ถึง 1 เป็นจำนวนเต็ม 16 บิต', () => {
    const pcm = floatToPcm16(new Float32Array([0, 1, -1]));

    expect(pcm[0]).toBe(0);
    expect(pcm[1]).toBe(32767);
    expect(pcm[2]).toBe(-32767);
  });

  test('ค่าที่เกินช่วงถูก clip ไม่ให้ล้นกลับเป็นเสียงแตก', () => {
    const pcm = floatToPcm16(new Float32Array([2.5, -2.5]));

    expect(pcm[0]).toBe(32767);
    expect(pcm[1]).toBe(-32767);
  });
});

describe('buildAudioFrame', () => {
  test('ประกอบ header 4 ไบต์ little-endian ตามด้วย PCM', () => {
    const frame = buildAudioFrame(new Int16Array([1, -1]), 90_500);
    const view = new DataView(frame);

    expect(frame.byteLength).toBe(4 + 4);
    expect(view.getUint32(0, true)).toBe(90_500);
    expect(view.getInt16(4, true)).toBe(1);
    expect(view.getInt16(6, true)).toBe(-1);
  });
});
