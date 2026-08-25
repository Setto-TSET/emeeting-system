// ═══════════════════════════════════════════
// Audio Frames — แกะเสียงที่ client ส่งมา ถอดเป็นข้อความ แล้วเข้าเส้นทาง subtitle_text เดิม
//
// ตัวตนผู้พูดมาจาก JWT ที่ผูกกับ socket เท่านั้น frame ไม่มีที่ให้ client บอกว่าตัวเองเป็นใคร
// ═══════════════════════════════════════════

const HEADER_BYTES = 4;

// ก้อนเสียงทับซ้อนกัน 0.5 วินาที คำตรงรอยต่อจึงถูกถอดสองครั้ง มองย้อนไม่เกินเท่านี้ก็พอ
// (พูดเร็วสุดราว 20 ตัวอักษรต่อครึ่งวินาที เผื่อไว้เป็น 30)
const MAX_OVERLAP_CHARS = 30;

export function parseAudioFrame(raw: Buffer): { startSec: number; pcm: Buffer } | null {
  if (raw.length <= HEADER_BYTES) return null;

  const pcm = raw.subarray(HEADER_BYTES);
  if (pcm.length % 2 !== 0) return null;

  return { startSec: raw.readUInt32LE(0) / 1000, pcm };
}

function withoutSpaces(value: string): string {
  return value.replace(/\s+/g, '');
}

export function stripOverlap(previous: string, next: string): string {
  const tail = withoutSpaces(previous);
  const head = withoutSpaces(next);
  if (!tail || !head) return next;

  const limit = Math.min(MAX_OVERLAP_CHARS, tail.length, head.length);
  for (let size = limit; size > 0; size -= 1) {
    if (tail.endsWith(head.slice(0, size))) {
      return head.slice(size);
    }
  }

  return head;
}
