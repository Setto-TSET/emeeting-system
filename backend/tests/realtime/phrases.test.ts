import { buildPhraseList, MAX_PHRASES } from '../../src/realtime/phrases';

const base = {
  id: 'MT-1',
  title: 'การประชุมคณะทำงานงบประมาณ ครั้งที่ 3',
  shortName: 'คทง.งบประมาณ',
  committee: 'คณะทำงานกลั่นกรองงบประมาณ',
  participants: [
    { userId: 'U-1', name: 'มาลี รักเรียน' },
    { userId: 'U-2', name: 'สมชาย ใจดี' },
  ],
  agenda: [
    { id: 'A-1', title: 'รับรองรายงานการประชุม', secretGroupId: null },
    { id: 'A-2', title: 'จัดซื้อระบบสารบรรณ', secretGroupId: 'SG-1' },
  ],
  description: 'พิจารณากรอบวงเงินปีงบประมาณ 2570',
};

describe('buildPhraseList', () => {
  it('เอาชื่อผู้เข้าร่วมมาก่อนเสมอ', () => {
    const phrases = buildPhraseList(base as never);
    expect(phrases[0]).toBe('มาลี รักเรียน');
    expect(phrases[1]).toBe('สมชาย ใจดี');
  });

  it('ตัดวาระที่มี secretGroupId ออก — วาระลับห้ามออก cloud', () => {
    const phrases = buildPhraseList(base as never);
    expect(phrases).toContain('รับรองรายงานการประชุม');
    expect(phrases).not.toContain('จัดซื้อระบบสารบรรณ');
  });

  it('รวมชื่อคณะทำงานกับชื่อย่อ', () => {
    const phrases = buildPhraseList(base as never);
    expect(phrases).toContain('คณะทำงานกลั่นกรองงบประมาณ');
    expect(phrases).toContain('คทง.งบประมาณ');
  });

  it('ตัดที่เพดานโดยชื่อคนต้องรอด', () => {
    const many = {
      ...base,
      agenda: Array.from({ length: MAX_PHRASES + 50 }, (_, i) => ({
        id: `A-${i}`,
        title: `วาระที่ ${i}`,
        secretGroupId: null,
      })),
    };
    const phrases = buildPhraseList(many as never);

    expect(phrases.length).toBe(MAX_PHRASES);
    expect(phrases).toContain('มาลี รักเรียน');
    expect(phrases).toContain('สมชาย ใจดี');
  });

  it('ไม่มีค่าซ้ำและไม่มีสตริงว่าง', () => {
    const messy = {
      ...base,
      committee: 'มาลี รักเรียน',
      description: '   ',
      participants: [{ userId: 'U-1', name: 'มาลี รักเรียน' }, { userId: 'U-3', name: '' }],
    };
    const phrases = buildPhraseList(messy as never);

    expect(phrases.filter((p) => p === 'มาลี รักเรียน')).toHaveLength(1);
    expect(phrases).not.toContain('');
    expect(phrases.every((p) => p.trim() === p && p.length > 0)).toBe(true);
  });

  it('ประชุมที่ไม่มีข้อมูลเลยคืนอาร์เรย์ว่าง ไม่ throw', () => {
    expect(buildPhraseList({ id: 'MT-2' } as never)).toEqual([]);
  });

  it('secretGroupId เป็น object ที่ truthy ก็ต้องถูกตัดทิ้งเหมือนกัน', () => {
    const withObjectSecret = {
      ...base,
      agenda: [
        { id: 'A-3', title: 'วาระลับแบบ object', secretGroupId: { level: 'สูง' } },
      ],
    };
    const phrases = buildPhraseList(withObjectSecret as never);
    expect(phrases).not.toContain('วาระลับแบบ object');
  });

  it('secretGroupId ที่เป็น falsy ทุกแบบ (undefined/ไม่มี field/สตริงว่าง/0/false) ต้องรวมอยู่ด้วย — กติกาคือ truthy check ไม่ใช่ != null', () => {
    const falsySecrets = {
      ...base,
      agenda: [
        { id: 'A-4', title: 'วาระ undefined', secretGroupId: undefined },
        { id: 'A-5', title: 'วาระไม่มี field' },
        { id: 'A-6', title: 'วาระสตริงว่าง', secretGroupId: '' },
        { id: 'A-7', title: 'วาระเลขศูนย์', secretGroupId: 0 },
        { id: 'A-8', title: 'วาระ false', secretGroupId: false },
      ],
    };
    const phrases = buildPhraseList(falsySecrets as never);
    expect(phrases).toContain('วาระ undefined');
    expect(phrases).toContain('วาระไม่มี field');
    expect(phrases).toContain('วาระสตริงว่าง');
    expect(phrases).toContain('วาระเลขศูนย์');
    expect(phrases).toContain('วาระ false');
  });

  it('agenda เป็นรูปร่างประหลาด (ไม่มี, ไม่ใช่ array, มี null/undefined/ที่ไม่ใช่ object ปน) ไม่ throw', () => {
    expect(() => buildPhraseList({ ...base, agenda: undefined } as never)).not.toThrow();

    const notArray = { ...base, agenda: { id: 'A-1', title: 'ไม่ใช่ array' } };
    expect(() => buildPhraseList(notArray as never)).not.toThrow();
    expect(buildPhraseList(notArray as never)).not.toContain('ไม่ใช่ array');

    const messyAgenda = {
      ...base,
      agenda: [null, undefined, 'ไม่ใช่ object', 42, { id: 'A-9', title: 'วาระที่ถูกต้อง', secretGroupId: null }],
    };
    const phrases = buildPhraseList(messyAgenda as never);
    expect(phrases).toContain('วาระที่ถูกต้อง');
  });

  it('ลำดับความสำคัญเต็มรูปแบบ: ชื่อคน > คณะ/ชื่อย่อ/ชื่อเรื่อง > วาระที่ไม่ลับ > คำอธิบาย', () => {
    const phrases = buildPhraseList(base as never);

    const nameIdx = [phrases.indexOf('มาลี รักเรียน'), phrases.indexOf('สมชาย ใจดี')];
    const tierTwoIdx = [
      phrases.indexOf('คณะทำงานกลั่นกรองงบประมาณ'),
      phrases.indexOf('คทง.งบประมาณ'),
      phrases.indexOf('การประชุมคณะทำงานงบประมาณ ครั้งที่ 3'),
    ];
    const agendaIdx = phrases.indexOf('รับรองรายงานการประชุม');
    const descriptionIdx = phrases.indexOf('พิจารณากรอบวงเงินปีงบประมาณ 2570');

    for (const idx of [...nameIdx, ...tierTwoIdx, agendaIdx, descriptionIdx]) {
      expect(idx).toBeGreaterThanOrEqual(0);
    }

    expect(Math.max(...nameIdx)).toBeLessThan(Math.min(...tierTwoIdx));
    expect(Math.max(...tierTwoIdx)).toBeLessThan(agendaIdx);
    expect(agendaIdx).toBeLessThan(descriptionIdx);
  });

  it('ตัดที่เพดานแล้ว description ต้องหายไปก่อน ในขณะที่ชื่อคนกับคณะยังอยู่', () => {
    const many = {
      ...base,
      agenda: Array.from({ length: MAX_PHRASES + 50 }, (_, i) => ({
        id: `A-${i}`,
        title: `วาระที่ ${i}`,
        secretGroupId: null,
      })),
      description: 'คำอธิบายที่ควรถูกตัดทิ้งเพราะความสำคัญต่ำสุด',
    };
    const phrases = buildPhraseList(many as never);

    expect(phrases.length).toBe(MAX_PHRASES);
    expect(phrases).toContain('มาลี รักเรียน');
    expect(phrases).toContain('สมชาย ใจดี');
    expect(phrases).toContain('คณะทำงานกลั่นกรองงบประมาณ');
    expect(phrases).not.toContain('คำอธิบายที่ควรถูกตัดทิ้งเพราะความสำคัญต่ำสุด');
  });
});
