// ═══════════════════════════════════════════
// Azure provider — คำบรรยายสดสำหรับห้อง normal/restricted
//
// คีย์อยู่ฝั่ง server เท่านั้น เสียงวิ่งผ่าน backend เสมอ ไม่มีเส้นทางไหนที่เบราว์เซอร์
// คุยกับ Azure ตรง ๆ (ดู providers/select.ts ว่าห้องไหนได้ provider นี้)
// ═══════════════════════════════════════════

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import type { AsrOpenOptions, AsrProvider, AsrSession } from './types';

const SAMPLE_RATE = 16000;

export function isAzureConfigured(): boolean {
  return Boolean(process.env.AZURE_SPEECH_KEY);
}

export const azureProvider: AsrProvider = {
  name: 'azure',

  async open(options: AsrOpenOptions): Promise<AsrSession> {
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.AZURE_SPEECH_KEY ?? '',
      process.env.AZURE_SPEECH_REGION ?? 'southeastasia'
    );
    speechConfig.speechRecognitionLanguage = 'th-TH';

    // 16 kHz 16-bit mono — ตรงกับที่ pcm.ts แปลงมาแล้ว ไม่ต้อง decode ซ้ำ
    const format = sdk.AudioStreamFormat.getWaveFormatPCM(SAMPLE_RATE, 16, 1);
    const pushStream = sdk.AudioInputStream.createPushStream(format);
    const recognizer = new sdk.SpeechRecognizer(
      speechConfig,
      sdk.AudioConfig.fromStreamInput(pushStream)
    );

    if (options.phrases?.length) {
      const grammar = sdk.PhraseListGrammar.fromRecognizer(recognizer);
      for (const phrase of options.phrases) grammar.addPhrase(phrase);
    }

    // เวลาเริ่มของเฟรมล่าสุดที่ป้อนเข้าไป — ใช้ติดให้ผลสุดท้าย เพราะ Azure บอกแต่ offset
    // ภายในสตรีมของตัวเอง ซึ่งไม่ตรงกับนาฬิกาห้องประชุมที่ transcript ใช้เรียงลำดับ
    let latestStartSec = 0;
    // เวลาเริ่มของประโยคที่กำลังพูดอยู่ — จับตอนเฟรมแรกหลังผลสุดท้ายครั้งก่อน
    let utteranceStartSec: number | null = null;

    recognizer.recognizing = (_sender, event) => {
      const text = event.result.text?.trim();
      if (text) options.onPartial(text);
    };

    recognizer.recognized = (_sender, event) => {
      const text = event.result.text?.trim();
      // Azure ยิง recognized ที่ข้อความว่างทุกครั้งที่เจอช่วงเงียบ ปล่อยผ่านจะได้บรรทัดว่างใน transcript
      if (!text) return;
      options.onFinal(text, utteranceStartSec ?? latestStartSec);
      utteranceStartSec = null;
    };

    recognizer.canceled = (_sender, event) => {
      // ล้มแล้วต้องรู้สาเหตุจริงที่ log ผู้ใช้เห็นแค่ "ถอดเสียงไม่สำเร็จ" ซึ่งไม่พอจะไล่ปัญหา
      console.error('[asr] azure ยกเลิก session:', event.errorDetails ?? event.reason);
    };

    await new Promise<void>((resolve, reject) => {
      recognizer.startContinuousRecognitionAsync(() => resolve(), (error) => reject(new Error(String(error))));
    });

    return {
      push(pcm: Buffer, startSec: number): void {
        latestStartSec = startSec;
        if (utteranceStartSec === null) utteranceStartSec = startSec;
        // SDK ต้องการ ArrayBuffer ที่ไม่แชร์หน่วยความจำกับ Buffer ก้อนอื่น
        pushStream.write(
          pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer
        );
      },

      async close(): Promise<void> {
        // ปิด push stream ก่อน เพื่อให้ Azure ยิงผลสุดท้ายของประโยคที่ค้างอยู่ออกมาก่อนหยุด
        pushStream.close();
        await new Promise<void>((resolve) => {
          recognizer.stopContinuousRecognitionAsync(() => resolve(), () => resolve());
        });
        recognizer.close();
      },
    };
  },
};
