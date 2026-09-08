const handlers: Record<string, Function> = {};
const mockPush = jest.fn();
const mockClose = jest.fn();
const mockStartContinuous = jest.fn((cb: Function) => cb());
const mockStopContinuous = jest.fn((cb: Function) => cb());
const mockAddPhrase = jest.fn();

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
  },
}));

import { azureProvider, isAzureConfigured } from '../../src/realtime/providers/azure';

describe('azure provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('push เขียนลง push stream', async () => {
    const session = await azureProvider.open({ onPartial: jest.fn(), onFinal: jest.fn() });
    session.push(Buffer.alloc(16), 0);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('close ปิดสตรีมและหยุด recognizer', async () => {
    const session = await azureProvider.open({ onPartial: jest.fn(), onFinal: jest.fn() });
    await session.close();
    expect(mockStopContinuous).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });
});
