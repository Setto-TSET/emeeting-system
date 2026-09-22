// src/services/speech/audioCapture.ts
//
// จับเสียงไมค์ของผู้ใช้คนนี้คนเดียว แล้วส่งเป็นก้อนไปให้ server ถอด
// ผู้พูดถูกระบุจาก JWT ที่ผูกกับ WebSocket อยู่แล้ว ไฟล์นี้จึงไม่ต้องรู้ว่าใครเป็นใคร

import {
  buildAudioFrame,
  downsampleTo16k,
  floatToPcm16,
  rms,
  FRAME_SECONDS,
  SILENCE_RMS_THRESHOLD,
  TARGET_RATE,
} from "./pcm";

export function isCaptureSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.AudioContext !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export async function startCapture(options: {
  sendAudio: (frame: ArrayBuffer) => void;
  startedAt: number;
}): Promise<() => void> {
  // ขอ stream ของตัวเองแยกจากไมค์ที่ ZegoCloud ใช้ ไม่แย่ง track กัน
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  let context: AudioContext;
  let source: MediaStreamAudioSourceNode;
  let collector: AudioWorkletNode;
  try {
    context = new AudioContext();
    await context.audioWorklet.addModule("/pcm-worklet.js");
    source = context.createMediaStreamSource(stream);
    collector = new AudioWorkletNode(context, "pcm-collector");
  } catch (error) {
    // ได้สิทธิ์ไมค์มาแล้วแต่ตั้งค่าต่อไม่สำเร็จ (เช่นโหลด worklet ไม่ได้) ต้องปิดไมค์ทิ้งก่อนโยนต่อ
    // ไม่งั้นผู้ใช้เห็นข้อความว่าเปิดไม่สำเร็จ แต่ไฟไมค์ยังติดค้างจนกว่าจะปิดหน้าเว็บ
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }

  const frameSamples = FRAME_SECONDS * TARGET_RATE;
  let buffer = new Float32Array(0);

  collector.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const downsampled = downsampleTo16k(event.data, context.sampleRate);
    const merged = new Float32Array(buffer.length + downsampled.length);
    merged.set(buffer);
    merged.set(downsampled, buffer.length);
    buffer = merged;

    while (buffer.length >= frameSamples) {
      const frame = buffer.subarray(0, frameSamples);

      // อ่านเวลาจากนาฬิกาจริงทุกเฟรม ไม่ใช่บวกทีละ 250 มิลลิวินาทีจากค่าตั้งต้น — ถ้าเสียงหยุดไหล
      // (แท็บถูกพักบนมือถือ, worklet ตกบล็อกเพราะเครื่องหน่วง) ตัวนับจะเดินช้ากว่าความจริง
      // แล้วคำบรรยายทุกบรรทัดหลังจากนั้นจะติดเวลาที่เร็วกว่าที่พูดจริงไปตลอดทั้งประชุม
      const frameStartMs = Date.now() - options.startedAt - FRAME_SECONDS * 1000;
      const level = rms(frame);

      // เงียบก็ไม่ส่ง — ทั้งประหยัดแบนด์วิดท์และเป็นสัญญาณให้ server รู้ว่าคนนี้หยุดพูดแล้ว
      // (arbitration ปิด session เมื่อไม่มีเฟรมเข้ามาเกิน SILENCE_CLOSE_MS ดู backend/src/realtime/arbitration.ts)
      if (level >= SILENCE_RMS_THRESHOLD) {
        options.sendAudio(buildAudioFrame(floatToPcm16(frame), frameStartMs, level));
      }

      // ไม่เก็บส่วนทับซ้อนไว้แล้ว — Azure ประกอบสตรีมต่อเนื่องเองจึงไม่มีรอยต่อให้กัน
      // ส่วน typhoon provider สร้างการทับซ้อนขึ้นเองตอนสะสมเฟรมเป็นก้อน (ฝั่ง server)
      buffer = buffer.slice(frameSamples);
    }
  };

  source.connect(collector);

  return () => {
    collector.port.onmessage = null;
    collector.disconnect();
    source.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
  };
}
