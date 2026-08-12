// src/services/speech/webSpeechProvider.ts
//
// เสียงพูด → ข้อความ (Web Speech API) ใช้เพื่อสร้าง subtitle สดในห้องประชุม
// รองรับเฉพาะ Chrome/Edge (webkitSpeechRecognition) — เบราว์เซอร์อื่นจะ isSupported() === false

export type SpeechCallback = (result: { text: string; isFinal: boolean; lang: string }) => void;

export interface SpeechRecognitionService {
  start(lang: string, onResult: SpeechCallback): void;
  stop(): void;
  isSupported(): boolean;
}

// `SpeechRecognition`/`SpeechRecognitionEvent` ไม่อยู่ใน lib.dom.d.ts ของ TS config นี้
// (ไม่ใช่ทุกเวอร์ชันของ TypeScript ที่มี type เหล่านี้) — ใช้ any-typed alias แทน
type SpeechRecognition = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type SpeechRecognitionEvent = any; // eslint-disable-line @typescript-eslint/no-explicit-any

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as typeof window & { webkitSpeechRecognition?: SpeechRecognitionCtor; SpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

class WebSpeechProvider implements SpeechRecognitionService {
  private recognition: SpeechRecognition | null = null;

  isSupported(): boolean {
    return getCtor() !== null;
  }

  start(lang: string, onResult: SpeechCallback): void {
    const Ctor = getCtor();
    if (!Ctor) return;
    this.stop();
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1];
      const text = result[0].transcript.trim();
      if (text.length < 2) return; // filter empty/garbage per spec section 9
      onResult({ text, isFinal: result.isFinal, lang });
    };
    recognition.onerror = () => {
      // swallow — UI shows "ไม่รองรับ/หยุดทำงาน" via isSupported() check at toggle time
    };
    recognition.start();
    this.recognition = recognition;
  }

  stop(): void {
    this.recognition?.stop();
    this.recognition = null;
  }
}

export const webSpeechProvider: SpeechRecognitionService = new WebSpeechProvider();
