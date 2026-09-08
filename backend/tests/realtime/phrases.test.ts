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
});
