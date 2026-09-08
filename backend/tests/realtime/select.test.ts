jest.mock('../../src/realtime/providers/azure', () => ({
  azureProvider: { name: 'azure', open: jest.fn() },
  isAzureConfigured: jest.fn(() => true),
}));

import { isAzureConfigured } from '../../src/realtime/providers/azure';
import { selectProvider } from '../../src/realtime/providers/select';

const mockConfigured = isAzureConfigured as jest.MockedFunction<typeof isAzureConfigured>;

describe('selectProvider', () => {
  beforeEach(() => mockConfigured.mockReturnValue(true));

  it('top_secret ได้ typhoon เสมอ แม้ Azure พร้อมใช้งาน', () => {
    expect(selectProvider({ id: 'M', confidentialityLevel: 'top_secret' } as never).name).toBe('typhoon');
  });

  it('normal และ restricted ได้ azure', () => {
    expect(selectProvider({ id: 'M', confidentialityLevel: 'normal' } as never).name).toBe('azure');
    expect(selectProvider({ id: 'M', confidentialityLevel: 'restricted' } as never).name).toBe('azure');
  });

  it('ไม่ระบุระดับความลับได้ azure — ค่าตั้งต้นของระบบคือ normal', () => {
    expect(selectProvider({ id: 'M' } as never).name).toBe('azure');
  });

  it('ค่าที่ไม่รู้จักได้ typhoon — ค่าแปลกปลอมต้องตกไปทางที่ปลอดภัยกว่า', () => {
    expect(selectProvider({ id: 'M', confidentialityLevel: 'ลับสุดยอด' } as never).name).toBe('typhoon');
  });

  it('อ่านการประชุมไม่ได้ (null) ได้ typhoon — ไม่รู้ว่าลับหรือเปล่าคือถือว่าลับ', () => {
    expect(selectProvider(null).name).toBe('typhoon');
  });

  it('ไม่ได้ตั้งคีย์ Azure ได้ typhoon', () => {
    mockConfigured.mockReturnValue(false);
    expect(selectProvider({ id: 'M', confidentialityLevel: 'normal' } as never).name).toBe('typhoon');
  });
});
