const handlers: Record<string, Function> = {};
const mockPush = jest.fn();
const mockClose = jest.fn();
const mockStartContinuous = jest.fn((cb: Function) => cb());
const mockStopContinuous = jest.fn((cb: Function) => cb());
const mockAddPhrase = jest.fn();
const recognizerInstances: Array<{ close: Function }> = [];

jest.mock('microsoft-cognitiveservices-speech-sdk', () => ({
  AudioInputStream: { createPushStream: () => ({ write: mockPush, close: mockClose }) },
  AudioConfig: { fromStreamInput: () => ({}) },
  AudioStreamFormat: { getWaveFormatPCM: () => ({}) },
  SpeechConfig: { fromSubscription: () => ({ speechRecognitionLanguage: '' }) },
  ResultReason: { RecognizedSpeech: 3 },
  PhraseListGrammar: { fromRecognizer: () => ({ addPhrase: mockAddPhrase }) },
  SpeechRecognizer: class {
    set recognizing(fn: Function) { handlers.recognizing = fn; }
    set recognized(fn: Function) { handlers.recognized = fn; }
    set canceled(fn: Function) { handlers.canceled = fn; }
    startContinuousRecognitionAsync = mockStartContinuous;
    stopContinuousRecognitionAsync = mockStopContinuous;
    close = jest.fn();
    constructor() {
      recognizerInstances.push(this);
    }
  },
}));

import { azureProvider, isAzureConfigured } from '../../src/realtime/providers/azure';

describe('azure provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    recognizerInstances.length = 0;
    mockStartContinuous.mockImplementation((cb: Function) => cb());
    mockStopContinuous.mockImplementation((cb: Function) => cb());
    process.env.AZURE_SPEECH_KEY = 'test-key';
    process.env.AZURE_SPEECH_REGION = 'southeastasia';
  });

  it('isAzureConfigured เป็น false เมื่อไม่มีคีย์', () => {
    delete process.env.AZURE_SPEECH_KEY;
    expect(isAzureConfigured()).toBe(false);
  });

  it('ส่ง phrase list เข้า recognizer ทุกคำ', async () => {
    await azureProvider.open({ onPartial: jest.fn(), onFinal: jest.fn(), phrases: ['มาลี', 'สมชาย'] });
    expect(mockAddPhrase).toHaveBeenCalledWith('มาลี');
    expect(mockAddPhrase).toHaveBeenCalledWith('สมชาย');
  });

  it('recognizing ยิง onPartial, recognized ยิง onFinal', async () => {
    const onPartial = jest.fn();
    const onFinal = jest.fn();
    const session = await azureProvider.open({ onPartial, onFinal });

    session.push(Buffer.alloc(8000), 4.5);
    handlers.recognizing({}, { result: { text: 'สวัส' } });
    expect(onPartial).toHaveBeenCalledWith('สวัส');

    handlers.recognized({}, { result: { reason: 3, text: 'สวัสดีครับ' } });
    expect(onFinal).toHaveBeenCalledWith('สวัสดีครับ', 4.5);
  });

  it('ข้อความว่างไม่ถูกส่งต่อ — Azure ยิง recognized ว่างตอนเงียบ', async () => {
    const onFinal = jest.fn();
    const session = await azureProvider.open({ onPartial: jest.fn(), onFinal });
    session.push(Buffer.alloc(8000), 1);

    handlers.recognized({}, { result: { reason: 3, text: '   ' } });
    expect(onFinal).not.toHaveBeenCalled();
  });

  it('push เขียนลง push stream ด้วยไบต์ของเฟรมเท่านั้น ไม่รั่วจากบัฟเฟอร์ข้างเคียง', async () => {
    const session = await azureProvider.open({ onPartial: jest.fn(), onFinal: jest.fn() });

    // จัดสรรบัฟเฟอร์ก้อนใหญ่ ล้อมรอบด้วยค่า 0xff แล้วฝังเฟรมจริง (0x01..0x10) ไว้ตรงกลาง
    // ด้วย subarray — เพื่อจับกรณีที่โค้ดหยิบช่วง byte ผิดแล้วรั่วไบต์ข้างเคียงเข้าไปด้วย
    const pooled = Buffer.alloc(48, 0xff);
    const frame = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    frame.copy(pooled, 16);
    const view = pooled.subarray(16, 32);

    session.push(view, 0);

    expect(mockPush).toHaveBeenCalledTimes(1);
    const written = mockPush.mock.calls[0][0] as ArrayBuffer;
    expect(written.byteLength).toBe(16);
    expect(Buffer.from(written)).toEqual(frame);
  });

  it('close ปิด push stream ก่อนหยุด recognizer แล้วค่อยปิด recognizer เป็นลำดับสุดท้าย', async () => {
    const order: string[] = [];
    mockClose.mockImplementation(() => order.push('pushStream.close'));
    mockStopContinuous.mockImplementation((cb: Function) => {
      order.push('recognizer.stop');
      cb();
    });

    const session = await azureProvider.open({ onPartial: jest.fn(), onFinal: jest.fn() });
    // แทนที่ recognizer.close ของ instance นี้ด้วย spy ที่บันทึกลำดับได้
    const recognizerInstance = recognizerInstances.at(-1)!;
    const recognizerCloseSpy = jest.fn(() => order.push('recognizer.close'));
    recognizerInstance.close = recognizerCloseSpy;

    await session.close();

    expect(order).toEqual(['pushStream.close', 'recognizer.stop', 'recognizer.close']);
    expect(recognizerCloseSpy).toHaveBeenCalledTimes(1);
  });
});
