// src/services/speech/webSpeechProvider.ts
//
// เสียงพูด → ข้อความ (Web Speech API) ใช้เพื่อสร้าง subtitle สดในห้องประชุม
// รองรับเฉพาะ Chrome/Edge (webkitSpeechRecognition) — เบราว์เซอร์อื่นจะ isSupported() === false

export type SpeechCallback = (result: { text: string; isFinal: boolean; lang: string }) => void;
// เรียกเมื่อ recognition หยุดทำงานเอง (permission ถูกปฏิเสธ, เงียบนาน, เครือข่ายหลุด ฯลฯ)
// — ไม่ครอบคลุมตอนที่ผู้ใช้กด stop() เอง
// "not-allowed" = ผู้ใช้ปฏิเสธสิทธิ์ไมค์, "error" = สาเหตุอื่น (เครือข่าย ฯลฯ), "silence" = ไม่มี error แต่ recognition หยุดเอง
export type SpeechEndCallback = (reason: "not-allowed" | "error" | "silence") => void;

export interface SpeechRecognitionService {
  start(lang: string, onResult: SpeechCallback, onEnd?: SpeechEndCallback): void;
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
  // true เมื่อ stop() ถูกเรียกโดยตั้งใจ (ผู้ใช้กดปิดเอง) — ใช้แยกจาก onerror/onend ที่เกิดขึ้นเอง
  private stoppedByUser = false;
  // กัน onEnd ถูกเรียกซ้ำสอง (Chrome ยิง onerror แล้วตามด้วย onend เสมอ)
  private endReported = false;

  isSupported(): boolean {
    return getCtor() !== null;
  }

  start(lang: string, onResult: SpeechCallback, onEnd?: SpeechEndCallback): void {
    const Ctor = getCtor();
    if (!Ctor) return;
    this.stop();
    this.stoppedByUser = false;
    this.endReported = false;
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
    recognition.onerror = (event: { error?: string }) => {
      // recognition หยุดทำงานเอง — เช่นผู้ใช้ปฏิเสธสิทธิ์ไมค์ (not-allowed), เครือข่ายหลุด ฯลฯ
      // แจ้ง caller เพื่อให้ UI สะท้อนสถานะจริง แทนที่จะกลืนเงียบ ๆ เหมือนเดิม
      if (this.endReported) return;
      this.endReported = true;
      onEnd?.(event?.error === "not-allowed" ? "not-allowed" : "error");
    };
    recognition.onend = () => {
      // ปิดเองโดยไม่มี error (เช่นเงียบนานเกินไป) และไม่ใช่การ stop() ที่ผู้ใช้สั่ง
      if (this.stoppedByUser || this.endReported) return;
      this.endReported = true;
      onEnd?.("silence");
    };
    recognition.start();
    this.recognition = recognition;
  }

  stop(): void {
    this.stoppedByUser = true;
    this.recognition?.stop();
    this.recognition = null;
  }
}

export const webSpeechProvider: SpeechRecognitionService = new WebSpeechProvider();
