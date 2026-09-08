import { parseAudioFrame, stripOverlap } from '../../src/realtime/audio';

function frame(startMs: number, samples: number[]): Buffer {
  // header ตอนนี้ยาว 8 ไบต์ (timestamp + RMS) ตรงกับ parseAudioFrame เวอร์ชันใหม่ — ดูเคส "header v2" ด้านล่าง
  const header = Buffer.alloc(8);
  header.writeUInt32LE(startMs, 0);
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => pcm.writeInt16LE(s, i * 2));
  return Buffer.concat([header, pcm]);
}

describe('parseAudioFrame', () => {
  test('อ่าน offset จาก header แล้วแปลงเป็นวินาที', () => {
    const parsed = parseAudioFrame(frame(90_500, [1, -1]));

    expect(parsed).not.toBeNull();
    expect(parsed!.startSec).toBeCloseTo(90.5, 3);
    expect(parsed!.pcm).toHaveLength(4);
  });

  test('frame ที่สั้นกว่า header ถูกปฏิเสธ', () => {
    expect(parseAudioFrame(Buffer.from([0x00, 0x01]))).toBeNull();
  });

  test('frame ที่มีแต่ header ไม่มีเสียง ถูกปฏิเสธ', () => {
    expect(parseAudioFrame(frame(0, []))).toBeNull();
  });

  test('PCM ความยาวเป็นเลขคี่ ถูกปฏิเสธ', () => {
    const bad = Buffer.concat([frame(0, [1]), Buffer.from([0x7f])]);
    expect(parseAudioFrame(bad)).toBeNull();
  });
});

describe('parseAudioFrame (header v2)', () => {
  function frame(startMs: number, level: number, samples = 4): Buffer {
    const header = Buffer.alloc(8);
    header.writeUInt32LE(startMs, 0);
    header.writeFloatLE(level, 4);
    return Buffer.concat([header, Buffer.alloc(samples * 2)]);
  }

  it('อ่าน timestamp, RMS และ PCM ออกมาได้', () => {
    const parsed = parseAudioFrame(frame(2000, 0.5));
    expect(parsed).not.toBeNull();
    expect(parsed!.startSec).toBe(2);
    expect(parsed!.rms).toBeCloseTo(0.5, 5);
    expect(parsed!.pcm.length).toBe(8);
  });

  it('เฟรมที่สั้นกว่า header คืน null ไม่ throw', () => {
    expect(parseAudioFrame(Buffer.alloc(6))).toBeNull();
  });

  it('PCM ที่มีจำนวนไบต์เป็นเลขคี่คืน null — ครึ่งตัวอย่างแปลว่าเฟรมพัง', () => {
    expect(parseAudioFrame(Buffer.concat([Buffer.alloc(8), Buffer.alloc(3)]))).toBeNull();
  });
});

describe('stripOverlap', () => {
  test('ตัดส่วนหัวที่ซ้ำกับท้ายของข้อความก่อนหน้า', () => {
    expect(stripOverlap('มติที่ประชุมเห็นชอบ', 'เห็นชอบตามที่เสนอ')).toBe('ตามที่เสนอ');
  });

  test('ไม่มีส่วนซ้ำ ต่อตรง ๆ', () => {
    expect(stripOverlap('วาระที่หนึ่ง', 'ประธานแจ้งให้ทราบ')).toBe('ประธานแจ้งให้ทราบ');
  });

  test('ไม่มีข้อความก่อนหน้า คืนข้อความใหม่ทั้งก้อน', () => {
    expect(stripOverlap('', 'เริ่มประชุม')).toBe('เริ่มประชุม');
  });

  test('เทียบโดยไม่สนช่องว่าง เพราะโมเดลวางช่องว่างไม่คงที่ระหว่างก้อน', () => {
    expect(stripOverlap('มติ ที่ประชุม', 'ที่ ประชุมเห็นชอบ')).toBe('เห็นชอบ');
  });

  test('ส่วนซ้ำยาวเกิน 30 ตัวอักษร ตัดได้ไม่เกินขอบเขตที่กำหนด', () => {
    const shared = 'ก'.repeat(40);
    const result = stripOverlap(shared, shared + 'จบ');
    // ตัดได้มากสุด 30 ตัว จึงเหลือ ก อีก 10 ตัวบวกท้าย
    expect(result).toBe('ก'.repeat(10) + 'จบ');
  });

  test('ข้อความใหม่ซ้ำกับของเดิมทั้งก้อน คืนสตริงว่าง', () => {
    expect(stripOverlap('เห็นชอบ', 'เห็นชอบ')).toBe('');
  });

  test('ตัวอักษรเดียวที่บังเอิญตรงกัน ไม่ถือว่าซ้ำ', () => {
    // ก้อนก่อนลงท้ายด้วย ก และก้อนใหม่ขึ้นต้นด้วย ก เหมือนกัน แต่เป็นคนละคำ
    expect(stripOverlap('ล้มระหว่างบันทึก', 'กลับมาปกติ')).toBe('กลับมาปกติ');
  });

  test('ซ้ำกันสองตัวก็ยังไม่ตัด เพราะช่วงทับซ้อนจริงยาวกว่านั้นเสมอ', () => {
    expect(stripOverlap('วาระที่สาม', 'สามัคคีธรรม')).toBe('สามัคคีธรรม');
  });
});
