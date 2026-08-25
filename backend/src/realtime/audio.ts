// ═══════════════════════════════════════════
// Audio Frames — แกะเสียงที่ client ส่งมา ถอดเป็นข้อความ แล้วเข้าเส้นทาง subtitle_text เดิม
//
// ตัวตนผู้พูดมาจาก JWT ที่ผูกกับ socket เท่านั้น frame ไม่มีที่ให้ client บอกว่าตัวเองเป็นใคร
// ═══════════════════════════════════════════

import type { RoomClient } from './rooms';
import { send, broadcast } from './server';
import { transcribePcm } from './asrClient';
import * as transcript from '../repositories/transcript';

const HEADER_BYTES = 4;

// ก้อนเสียงทับซ้อนกัน 0.5 วินาที คำตรงรอยต่อจึงถูกถอดสองครั้ง มองย้อนไม่เกินเท่านี้ก็พอ
// (พูดเร็วสุดราว 20 ตัวอักษรต่อครึ่งวินาที เผื่อไว้เป็น 30)
const MAX_OVERLAP_CHARS = 30;

export function parseAudioFrame(raw: Buffer): { startSec: number; pcm: Buffer } | null {
  if (raw.length <= HEADER_BYTES) return null;

  const pcm = raw.subarray(HEADER_BYTES);
  if (pcm.length % 2 !== 0) return null;

  return { startSec: raw.readUInt32LE(0) / 1000, pcm };
}

function withoutSpaces(value: string): string {
  return value.replace(/\s+/g, '');
}

export function stripOverlap(previous: string, next: string): string {
  const tail = withoutSpaces(previous);
  const head = withoutSpaces(next);
  if (!tail || !head) return next;

  const limit = Math.min(MAX_OVERLAP_CHARS, tail.length, head.length);
  for (let size = limit; size > 0; size -= 1) {
    if (tail.endsWith(head.slice(0, size))) {
      return head.slice(size);
    }
  }

  return head;
}

type SpeakerState = {
  // ลำดับของก้อนล่าสุดที่รับเข้ามา ใช้ตัดสินว่าผลที่กลับมาเป็นของก้อนที่ยังใหม่อยู่หรือเปล่า
  latestSeq: number;
  previousText: string;
};

const speakers = new Map<string, SpeakerState>();

function keyFor(client: RoomClient): string {
  return `${client.meetingId}::${client.userId}`;
}

export function resetAudioState(): void {
  speakers.clear();
}

export async function handleAudioFrame(client: RoomClient, raw: Buffer): Promise<void> {
  const parsed = parseAudioFrame(raw);
  // เฟรมพังคือความผิดของ client ทิ้งเงียบ ๆ ไม่ตอบกลับ ไม่ปิด socket
  // เพราะเสียงหนึ่งก้อนที่เพี้ยนไม่ควรทำให้คนทั้งห้องหลุด
  if (!parsed) return;

  const key = keyFor(client);
  const state = speakers.get(key) ?? { latestSeq: 0, previousText: '' };
  const seq = state.latestSeq + 1;
  state.latestSeq = seq;
  speakers.set(key, state);

  let text: string;
  try {
    text = await transcribePcm(parsed.pcm);
  } catch {
    return send(client.socket, {
      type: 'signal_error',
      senderId: client.userId,
      senderName: client.userName,
      timestamp: Date.now(),
      payload: { reason: 'ถอดเสียงไม่สำเร็จ ระบบคำบรรยายอาจไม่พร้อมใช้งานชั่วคราว' },
    });
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
