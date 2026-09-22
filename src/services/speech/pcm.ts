// src/services/speech/pcm.ts
//
// แปลงเสียงไมค์เป็นรูปแบบที่ ASR sidecar รับได้ ฟังก์ชันในไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ทั้งหมด
// เพื่อให้ทดสอบได้โดยไม่ต้องมี AudioContext จริง

export const TARGET_RATE = 16000;

// เฟรมสั้นพอให้ Azure ยิงผลบางส่วนได้ทันคำพูด (เป้าหมาย partial แรก < 500 ms)
// ก้อนใหญ่กว่านี้ไม่ได้ช่วยความแม่นเพราะฝั่ง Azure ประกอบสตรีมเองอยู่แล้ว
export const FRAME_SECONDS = 0.25;

// noise floor ของไมค์แต่ละตัวกับห้องประชุมแต่ละห้องไม่เท่ากัน ค่านี้ตั้งไว้กลาง ๆ
// และต้องแก้ได้จากที่เดียว ไม่ฝังกระจายไปตามไฟล์อื่น
export const SILENCE_RMS_THRESHOLD = 0.01;

export function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === TARGET_RATE) return input;

  const ratio = inputRate / TARGET_RATE;

  // ไมค์บางตัว (เช่น Bluetooth โหมด SCO) ทำให้ AudioContext เดินที่ 8 kHz ซึ่งต่ำกว่าเป้าหมาย
  // การเฉลี่ยช่วงด้านล่างใช้ไม่ได้กับกรณีนี้ เพราะช่วงที่ยุบสั้นกว่าหนึ่งตัวอย่าง ผลที่ได้จะเป็น
  // ศูนย์สลับกับค่าจริง (เสียงแตกจนถอดไม่ออก) จึงต้องเพิ่มความถี่ด้วยการประมาณเชิงเส้นแทน
  if (ratio < 1) {
    const upLength = Math.floor(input.length / ratio);
    const up = new Float32Array(upLength);
    for (let i = 0; i < upLength; i += 1) {
      const position = i * ratio;
      const left = Math.floor(position);
      const right = Math.min(left + 1, input.length - 1);
      const fraction = position - left;
      up[i] = input[left] * (1 - fraction) + input[right] * fraction;
    }
    return up;
  }
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);

  // เฉลี่ยค่าในช่วงที่ยุบ แทนการหยิบตัวแรกทิ้งที่เหลือ — การหยิบทิ้งทำให้เกิด aliasing
  // ซึ่งฟังเป็นเสียงแหลมแปลกปลอมและทำให้ผลถอดเสียงแย่ลง
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j];
    output[i] = end > start ? sum / (end - start) : 0;
  }

  return output;
}

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function floatToPcm16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = Math.round(clamped * 32767);
  }
  return pcm;
}

// header: [0..4) timestamp ms, [4..8) RMS ของเฟรมนี้
// RMS ต้องมากับเฟรม ไม่ใช่ให้ server คำนวณเอง เพราะ server ตัดสินใจเรื่อง slot
// ก่อนแตะ PCM และการถอด PCM ทุกเฟรมของทุกคนเพื่อวัดความดังคือการทำงานซ้ำที่ไม่จำเป็น
const HEADER_BYTES = 8;

export function buildAudioFrame(pcm: Int16Array, startMs: number, level: number): ArrayBuffer {
  const buffer = new ArrayBuffer(HEADER_BYTES + pcm.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, Math.max(0, Math.floor(startMs)), true);
  // ค่าเพี้ยน (NaN จากไมค์ที่ส่งตัวอย่างว่าง, ค่าติดลบ) ต้องกลายเป็นศูนย์ ไม่ใช่หลุดเข้าไป
  // เทียบกับความดังของคนอื่น — NaN ชนะทุกการเปรียบเทียบไม่ได้ แต่มันทำให้ทุกการเทียบเป็น false
  // ซึ่งแปลว่าคนนั้นแย่ง slot ไม่ได้เลยตลอดประชุมโดยไม่มีใครรู้สาเหตุ
  view.setFloat32(4, Number.isFinite(level) && level > 0 ? level : 0, true);
  new Int16Array(buffer, HEADER_BYTES).set(pcm);
  return buffer;
}
