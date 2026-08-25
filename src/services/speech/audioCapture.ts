// src/services/speech/audioCapture.ts
//
// จับเสียงไมค์ของผู้ใช้คนนี้คนเดียว แล้วส่งเป็นก้อนไปให้ server ถอด
// ผู้พูดถูกระบุจาก JWT ที่ผูกกับ WebSocket อยู่แล้ว ไฟล์นี้จึงไม่ต้องรู้ว่าใครเป็นใคร

import {
  buildAudioFrame,
  downsampleTo16k,
  floatToPcm16,
  rms,
  CHUNK_SECONDS,
  OVERLAP_SECONDS,
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
  const context = new AudioContext();
  await context.audioWorklet.addModule("/pcm-worklet.js");

  const source = context.createMediaStreamSource(stream);
  const collector = new AudioWorkletNode(context, "pcm-collector");

  const chunkSamples = CHUNK_SECONDS * TARGET_RATE;
  const keepSamples = Math.floor(OVERLAP_SECONDS * TARGET_RATE);
  let buffer = new Float32Array(0);
  let chunkStartMs = Date.now() - options.startedAt;

  collector.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const downsampled = downsampleTo16k(event.data, context.sampleRate);
    const merged = new Float32Array(buffer.length + downsampled.length);
    merged.set(buffer);
    merged.set(downsampled, buffer.length);
    buffer = merged;

    while (buffer.length >= chunkSamples) {
      const chunk = buffer.subarray(0, chunkSamples);

      // เงียบก็ไม่ต้องส่ง ลดงานของ sidecar และไม่ให้ transcript มีบรรทัดว่าง
      if (rms(chunk) >= SILENCE_RMS_THRESHOLD) {
        options.sendAudio(buildAudioFrame(floatToPcm16(chunk), chunkStartMs));
      }

      // เก็บท้ายก้อนไว้ทับซ้อนกับก้อนถัดไป กันคำขาดตรงรอยต่อ
      // ข้อความที่ซ้ำจากช่วงนี้ถูกตัดที่ฝั่ง server (backend/src/realtime/audio.ts)
      buffer = buffer.slice(chunkSamples - keepSamples);
      chunkStartMs += (CHUNK_SECONDS - OVERLAP_SECONDS) * 1000;
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
