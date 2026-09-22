// ก้อนเสียงทับซ้อนกัน 0.5 วินาที คำตรงรอยต่อจึงถูกถอดสองครั้ง มองย้อนไม่เกินเท่านี้ก็พอ
// (พูดเร็วสุดราว 20 ตัวอักษรต่อครึ่งวินาที เผื่อไว้เป็น 30)
const MAX_OVERLAP_CHARS = 30;

// ช่วงทับซ้อนครึ่งวินาทีกินเนื้อความหลายตัวอักษรเสมอ การซ้ำกันแค่หนึ่งถึงสองตัวจึงเป็นความบังเอิญ
// ไม่ใช่การถอดซ้ำ — เช่นก้อนก่อนลงท้ายด้วย ก แล้วก้อนใหม่ขึ้นต้นว่า "กลับมาปกติ" ถ้าตัดจะเหลือ
// "ลับมาปกติ" ซึ่งผิดความหมายไปเลย
const MIN_OVERLAP_CHARS = 3;

function withoutSpaces(value: string): string {
  return value.replace(/\s+/g, '');
}

// สระบนล่างกับวรรณยุกต์ไทยเกาะพยัญชนะตัวหน้าเสมอ ถ้าตัดแล้วส่วนที่เหลือขึ้นต้นด้วยอักขระพวกนี้
// แปลว่าตัดกลางพยางค์ ไม่ใช่รอยต่อของคำ เช่น "วาระที่สาม" กับ "สามัคคีธรรม" ซ้ำกันสามตัวโดยบังเอิญ
// ตัดแล้วเหลือ "ัคคีธรรม" ซึ่งอ่านไม่ออก
// ช่วงในวงเล็บเหลี่ยมคือ U+0E31, U+0E34–U+0E3A และ U+0E47–U+0E4E
const THAI_COMBINING = /^[ัิ-ฺ็-๎]/;

export function stripOverlap(previous: string, next: string): string {
  const tail = withoutSpaces(previous);
  const head = withoutSpaces(next);
  if (!tail || !head) return next;

  const limit = Math.min(MAX_OVERLAP_CHARS, tail.length, head.length);
  for (let size = limit; size >= MIN_OVERLAP_CHARS; size -= 1) {
    if (tail.endsWith(head.slice(0, size))) {
      const remainder = head.slice(size);
      if (THAI_COMBINING.test(remainder)) continue;
      return remainder;
    }
  }

  return head;
}
