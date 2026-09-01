// ═══════════════════════════════════════════
// Audio Frames — แกะเสียงที่ client ส่งมา ถอดเป็นข้อความ แล้วเข้าเส้นทาง subtitle_text เดิม
//
// ตัวตนผู้พูดมาจาก JWT ที่ผูกกับ socket เท่านั้น frame ไม่มีที่ให้ client บอกว่าตัวเองเป็นใคร
// ═══════════════════════════════════════════

import type { RoomClient } from './rooms';
import { send, broadcast } from './server';
import { asrBaseUrl, transcribePcm } from './asrClient';
import * as transcript from '../repositories/transcript';

const HEADER_BYTES = 4;

// ก้อนเสียงทับซ้อนกัน 0.5 วินาที คำตรงรอยต่อจึงถูกถอดสองครั้ง มองย้อนไม่เกินเท่านี้ก็พอ
// (พูดเร็วสุดราว 20 ตัวอักษรต่อครึ่งวินาที เผื่อไว้เป็น 30)
const MAX_OVERLAP_CHARS = 30;

// ช่วงทับซ้อนครึ่งวินาทีกินเนื้อความหลายตัวอักษรเสมอ การซ้ำกันแค่หนึ่งถึงสองตัวจึงเป็นความบังเอิญ
// ไม่ใช่การถอดซ้ำ — เช่นก้อนก่อนลงท้ายด้วย ก แล้วก้อนใหม่ขึ้นต้นว่า "กลับมาปกติ" ถ้าตัดจะเหลือ
// "ลับมาปกติ" ซึ่งผิดความหมายไปเลย
const MIN_OVERLAP_CHARS = 3;

export function parseAudioFrame(raw: Buffer): { startSec: number; pcm: Buffer } | null {
  if (raw.length <= HEADER_BYTES) return null;

  const pcm = raw.subarray(HEADER_BYTES);
  if (pcm.length % 2 !== 0) return null;

  return { startSec: raw.readUInt32LE(0) / 1000, pcm };
}

function withoutSpaces(value: string): string {
  return value.replace(/\s+/g, '');
}

// สระบนล่างกับวรรณยุกต์ไทยเกาะพยัญชนะตัวหน้าเสมอ ถ้าตัดแล้วส่วนที่เหลือขึ้นต้นด้วยอักขระพวกนี้
// แปลว่าตัดกลางพยางค์ ไม่ใช่รอยต่อของคำ เช่น "วาระที่สาม" กับ "สามัคคีธรรม" ซ้ำกันสามตัวโดยบังเอิญ
// ตัดแล้วเหลือ "ัคคีธรรม" ซึ่งอ่านไม่ออก
// ช่วงในวงเล็บเหลี่ยมคือ U+0E31, U+0E34–U+0E3A และ U+0E47–U+0E4E
const THAI_COMBINING = /^[ัิ-ฺ็-๎]/;

export function stripOverlap(previous: string, next: string): string {
  const tail = withoutSpaces(previous);
  const head = withoutSpaces(next);
  if (!tail || !head) return next;

  const limit = Math.min(MAX_OVERLAP_CHARS, tail.length, head.length);
  for (let size = limit; size >= MIN_OVERLAP_CHARS; size -= 1) {
    if (tail.endsWith(head.slice(0, size))) {
      const remainder = head.slice(size);
      if (THAI_COMBINING.test(remainder)) continue;
      return remainder;
    }
  }

  return head;
}

// ผู้พูดหนึ่งคนส่งก้อนเสียงทุก 2.5 วินาที ปกติจึงมีงานถอดค้างไม่เกินหนึ่งก้อน อนุญาตให้ค้างได้สอง
// เผื่อ sidecar ช้าชั่วคราว เกินกว่านั้นคือ client ยิงถี่ผิดปกติ ทิ้งก้อนใหม่ทันทีไม่ต้องเรียก sidecar
// ไม่งั้นคนเดียวยิงรัวทำให้คิวของ sidecar ตัวเดียวบวมจนคำบรรยายของทั้งเซิร์ฟเวอร์หยุดทำงาน
const MAX_IN_FLIGHT_PER_SPEAKER = 2;

type SpeakerState = {
  // ลำดับของก้อนล่าสุดที่รับเข้ามา ใช้ตัดสินว่าผลที่กลับมาเป็นของก้อนที่ยังใหม่อยู่หรือเปล่า
  latestSeq: number;
  previousText: string;
  // จำนวนก้อนของผู้พูดคนนี้ที่ยังรอ sidecar ตอบอยู่
  inFlight: number;
};

const speakers = new Map<string, SpeakerState>();

function keyFor(client: RoomClient): string {
  return `${client.meetingId}::${client.userId}`;
}

export function resetAudioState(): void {
  speakers.clear();
}

/** ลืมสถานะของผู้พูดเมื่อออกจากห้อง — เรียกจากตอน socket ปิดใน realtime/server.ts */
export function forgetSpeaker(client: RoomClient): void {
  speakers.delete(keyFor(client));
}

export async function handleAudioFrame(client: RoomClient, raw: Buffer): Promise<void> {
  const parsed = parseAudioFrame(raw);
  // เฟรมพังคือความผิดของ client ทิ้งเงียบ ๆ ไม่ตอบกลับ ไม่ปิด socket
  // เพราะเสียงหนึ่งก้อนที่เพี้ยนไม่ควรทำให้คนทั้งห้องหลุด
  if (!parsed) return;

  const key = keyFor(client);
  const state = speakers.get(key) ?? { latestSeq: 0, previousText: '', inFlight: 0 };
  if (state.inFlight >= MAX_IN_FLIGHT_PER_SPEAKER) return;

  const seq = state.latestSeq + 1;
  state.latestSeq = seq;
  state.inFlight += 1;
  speakers.set(key, state);

  let text: string;
  try {
    text = await transcribePcm(parsed.pcm);
  } catch (error) {
    // ผู้ใช้เห็นแค่ว่า "ถอดเสียงไม่สำเร็จ" ซึ่งไม่พอจะรู้ว่า sidecar ล่ม, ASR_URL ผิด
    // หรือ ASR_TOKEN สองฝั่งไม่ตรง — สาเหตุจริงต้องไปโผล่ใน log ของ server
    console.error('[asr] เรียก sidecar ไม่สำเร็จ:', asrBaseUrl(), '-', (error as Error).message);
    return send(client.socket, {
      type: 'signal_error',
      senderId: client.userId,
      senderName: client.userName,
      timestamp: Date.now(),
      payload: { reason: 'ถอดเสียงไม่สำเร็จ ระบบคำบรรยายอาจไม่พร้อมใช้งานชั่วคราว' },
    });
  } finally {
    state.inFlight -= 1;
  }

  // ระหว่างรอถอด มีก้อนใหม่ของคนเดิมเข้ามาแล้ว ผลก้อนนี้เก่าเกินจะมีประโยชน์ ทิ้งทั้งก้อน
  // ห้ามเข้าคิวสะสม เพราะคำบรรยายที่ตามหลังเสียงหลายวินาทีอ่านแล้วสับสนกว่าไม่มีเลย
  const current = speakers.get(key);
  if (!current || current.latestSeq !== seq) return;

  const deduped = stripOverlap(current.previousText, text).trim();
  if (!deduped) return;

  current.previousText = text;
  speakers.set(key, current);

  await transcript.appendSegment(client.meetingId, {
    speakerId: client.userId,
    speakerName: client.userName,
    startSec: parsed.startSec,
    text: deduped,
  });

  // ส่งให้ทุกคนรวมผู้พูดเอง ต่างจากเส้นทาง subtitle_text แบบ JSON ที่ตัดผู้ส่งออก —
  // ผู้พูดไม่ได้ถอดเสียงเองอีกแล้ว ถ้าไม่ส่งกลับ ผู้พูดจะเห็นคำบรรยายของทุกคนยกเว้นตัวเอง
  broadcast(client.meetingId, {
    type: 'subtitle_text',
    senderId: client.userId,
    senderName: client.userName,
    timestamp: Date.now(),
    payload: { text: deduped, isFinal: true, lang: 'th-TH', startSec: parsed.startSec },
  });
}
