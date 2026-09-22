// ═══════════════════════════════════════════
// Audio Frames — แกะเสียงที่ client ส่งมา ถอดเป็นข้อความ แล้วเข้าเส้นทาง subtitle_text เดิม
//
// ตัวตนผู้พูดมาจาก JWT ที่ผูกกับ socket เท่านั้น frame ไม่มีที่ให้ client บอกว่าตัวเองเป็นใคร
// ═══════════════════════════════════════════

import type { RoomClient } from './rooms';
import { send, broadcast } from './server';
import { stripOverlap } from './overlap';
import * as transcript from '../repositories/transcript';
import * as meetings from '../repositories/meetings';
import { claimSlot, releaseIdle, releaseSpeaker, resetArbitration } from './arbitration';
import { selectProvider } from './providers/select';
import { buildPhraseList } from './phrases';

// header: [0..4) timestamp ms, [4..8) RMS — ดู src/services/speech/pcm.ts (ต้องตรงกันทั้งสองฝั่ง)
const HEADER_BYTES = 8;

export function parseAudioFrame(raw: Buffer): { startSec: number; rms: number; pcm: Buffer } | null {
  if (raw.length <= HEADER_BYTES) return null;

  const pcm = raw.subarray(HEADER_BYTES);
  if (pcm.length % 2 !== 0) return null;

  const level = raw.readFloatLE(4);

  return {
    startSec: raw.readUInt32LE(0) / 1000,
    // client ที่ถูกแก้เองส่งค่าอะไรมาก็ได้ ปัดให้อยู่ในช่วงที่ใช้เปรียบเทียบได้เสมอ
    rms: Number.isFinite(level) && level > 0 ? level : 0,
    pcm,
  };
}

// stripOverlap ย้ายไป overlap.ts แล้ว — typhoon provider ต้องใช้มัน และไฟล์นี้ import provider
// กลับมาอีกทอด การ re-export ที่นี่ทำให้เทสต์เดิมไม่ต้องแก้ import
export { stripOverlap } from './overlap';

// เก็บ phrase list ต่อห้อง ไม่ต้องอ่าน MySQL ใหม่ทุกครั้งที่เปิด session
// (ห้องหนึ่งเปิด session ใหม่ทุกครั้งที่มีคนเริ่มพูด ซึ่งบ่อยกว่าที่วาระจะเปลี่ยน)
//
// มีอายุ เพราะผู้จัดยกระดับความลับกลางประชุมได้ ถ้าแคชอยู่ตลอดอายุโปรเซส การเปลี่ยนเป็น
// top_secret จะไม่มีผลจนกว่าจะรีสตาร์ต — เสียงยังวิ่งออก cloud ต่อโดยที่หน้าเว็บบอกว่าลับแล้ว
const MEETING_CACHE_MS = 60_000;
type MeetingContext = { provider: ReturnType<typeof selectProvider>; phrases: string[]; readAt: number };
const meetingCache = new Map<string, MeetingContext>();

export function resetAudioState(): void {
  meetingCache.clear();
  resetArbitration();
}

export async function forgetSpeaker(client: RoomClient): Promise<void> {
  await releaseSpeaker(client.meetingId, client.userId);
}

async function contextFor(meetingId: string, now: number): Promise<MeetingContext> {
  const cached = meetingCache.get(meetingId);
  if (cached && now - cached.readAt < MEETING_CACHE_MS) return cached;

  const meeting = await meetings.getMeeting(meetingId);
  const context: MeetingContext = {
    provider: selectProvider(meeting),
    phrases: meeting ? buildPhraseList(meeting) : [],
    readAt: now,
  };
  meetingCache.set(meetingId, context);
  return context;
}

export async function handleAudioFrame(client: RoomClient, raw: Buffer): Promise<void> {
  const parsed = parseAudioFrame(raw);
  // เฟรมพังคือความผิดของ client ทิ้งเงียบ ๆ ไม่ตอบกลับ ไม่ปิด socket
  // เพราะเสียงหนึ่งก้อนที่เพี้ยนไม่ควรทำให้คนทั้งห้องหลุด
  if (!parsed) return;

  const now = Date.now();
  // เก็บกวาด session ของคนที่หยุดพูดก่อนเสมอ ไม่มี timer แยก — เฟรมที่ไหลเข้ามาตลอดการประชุม
  // คือจังหวะเดินเวลาที่มีอยู่แล้ว การตั้ง setInterval เพิ่มคือ resource ที่ต้องคอยไล่ปิดตอนปิดห้อง
  await releaseIdle(now);

  const { provider, phrases } = await contextFor(client.meetingId, now);

  let session;
  try {
    session = await claimSlot(client.meetingId, client.userId, parsed.rms, now, () =>
      provider.open({
        onPartial: (text) => {
          broadcast(client.meetingId, {
            type: 'subtitle_text',
            senderId: client.userId,
            senderName: client.userName,
            timestamp: Date.now(),
            payload: { text, isFinal: false, lang: 'th-TH' },
          });
        },
        onFinal: (text, startSec) => {
          // ไม่ await — callback นี้ถูกเรียกจากในสตรีมของ provider การรอเขียน DB ตรงนี้
          // จะหน่วงการรับเสียงเฟรมถัดไป
          void transcript
            .appendSegment(client.meetingId, {
              speakerId: client.userId,
              speakerName: client.userName,
              startSec,
              text,
            })
            .catch((error) => console.error('[asr] เขียน transcript ไม่สำเร็จ:', (error as Error).message));

          broadcast(client.meetingId, {
            type: 'subtitle_text',
            senderId: client.userId,
            senderName: client.userName,
            timestamp: Date.now(),
            payload: { text, isFinal: true, lang: 'th-TH', startSec },
          });
        },
        phrases,
      })
    );
  } catch (error) {
    // ผู้ใช้เห็นแค่ "ถอดเสียงไม่สำเร็จ" ซึ่งไม่พอจะรู้ว่าคีย์ผิด, เกินโควตา หรือ sidecar ล่ม
    // สาเหตุจริงต้องไปโผล่ใน log ของ server
    console.error('[asr] เปิด session ไม่สำเร็จ:', provider.name, '-', (error as Error).message);
    return send(client.socket, {
      type: 'signal_error',
      senderId: client.userId,
      senderName: client.userName,
      timestamp: Date.now(),
      payload: { reason: 'ถอดเสียงไม่สำเร็จ ระบบคำบรรยายอาจไม่พร้อมใช้งานชั่วคราว' },
    });
  }

  // ไม่ได้ slot แปลว่ามีคนอื่นพูดดังกว่าอยู่ ทิ้งเฟรมนี้เงียบ ๆ ไม่ใช่ error
  if (!session) return;

  session.push(parsed.pcm, parsed.startSec);
}
