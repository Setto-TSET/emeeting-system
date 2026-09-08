// ═══════════════════════════════════════════
// Typhoon provider — เส้นทางเดิมของ Phase F ห่อไว้หลัง AsrProvider
//
// ใช้กับห้อง top_secret เท่านั้น เสียงไม่ออกนอกองค์กร (ดู providers/select.ts)
// ═══════════════════════════════════════════

import { transcribePcm } from '../asrClient';
import { stripOverlap } from '../overlap';
import type { AsrOpenOptions, AsrProvider, AsrSession } from './types';

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;

// ขนาดก้อนที่ Phase F วัดแล้วว่าได้สมดุลดีที่สุด (CER 0.0438 หน่วง 185 ms)
// ก้อน 2 วินาที CER แย่ลงเกือบเท่าตัวโดยที่หน่วงไม่ได้ลดลงจริง
const CHUNK_BYTES = 3 * SAMPLE_RATE * BYTES_PER_SAMPLE;
// ทับซ้อนกันครึ่งวินาทีเพื่อกันคำขาดตรงรอยต่อ ข้อความที่ซ้ำถูกตัดด้วย stripOverlap
const OVERLAP_BYTES = 0.5 * SAMPLE_RATE * BYTES_PER_SAMPLE;

export const typhoonProvider: AsrProvider = {
  name: 'typhoon',

  async open(options: AsrOpenOptions): Promise<AsrSession> {
    let buffer = Buffer.alloc(0);
    let chunkStartSec: number | null = null;
    let previousText = '';
    // งานถอดของก้อนก่อนหน้า — ต่อคิวกันเป็นสายเดียวเพื่อให้ onFinal ออกตามลำดับเวลาเสมอ
    // ถ้าปล่อยขนานกัน ก้อนที่ถอดเร็วกว่าจะแซงก้อนก่อนหน้า แล้ว transcript เรียงสลับ
    let pending: Promise<void> = Promise.resolve();
    // จำนวนไบต์ที่เข้ามาทาง push() นับตั้งแต่ flush() ครั้งล่าสุด รีเซ็ตเป็น 0 ใน flush()
    let bytesSinceFlush = 0;

    function flush(): void {
      const chunk = buffer.subarray(0, CHUNK_BYTES);
      const startSec = chunkStartSec ?? 0;
      buffer = buffer.subarray(CHUNK_BYTES - OVERLAP_BYTES);
      chunkStartSec = startSec + (CHUNK_BYTES - OVERLAP_BYTES) / (SAMPLE_RATE * BYTES_PER_SAMPLE);
      bytesSinceFlush = 0;

      pending = pending.then(async () => {
        const text = (await transcribePcm(chunk)) ?? '';
        const deduped = stripOverlap(previousText, text).trim();
        previousText = text;
        if (deduped) options.onFinal(deduped, startSec);
      });
    }

    return {
      push(pcm: Buffer, startSec: number): void {
        if (chunkStartSec === null) chunkStartSec = startSec;
        buffer = Buffer.concat([buffer, pcm]);
        bytesSinceFlush += pcm.length;
        while (buffer.length >= CHUNK_BYTES) flush();
      },

      async close(): Promise<void> {
        // หลัง flush ก้อนสุดท้าย buffer เหลือแต่ส่วนทับซ้อนที่ถอดไปแล้ว การถอดซ้ำได้ข้อความเดิม
        // ที่ stripOverlap ตัดทิ้งอยู่ดี แต่จ่ายค่าเรียก sidecar เพิ่มจริง
        if (buffer.length > 0 && bytesSinceFlush > 0) {
          const tail = buffer;
          const startSec = chunkStartSec ?? 0;
          buffer = Buffer.alloc(0);
          pending = pending.then(async () => {
            const text = (await transcribePcm(tail)) ?? '';
            const deduped = stripOverlap(previousText, text).trim();
            previousText = text;
            if (deduped) options.onFinal(deduped, startSec);
          });
        }
        await pending;
      },
    };
  },
};
