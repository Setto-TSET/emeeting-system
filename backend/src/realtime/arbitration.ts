// ═══════════════════════════════════════════
// Active speaker arbitration — ตัดสินว่าเสียงของใครได้เข้า ASR
//
// Azure free tier (F0) เปิดได้ session เดียวพร้อมกันและปรับไม่ได้ ส่วน S0 ได้ 100
// ในประชุมจริงคนพูดทีละคน การเปิด session เฉพาะผู้พูดที่ active จึงทั้งอยู่ในโควตาฟรี
// และทำให้ค่าใช้จ่ายโตตามจำนวนห้อง ไม่ใช่ตามจำนวนคนในห้อง
// ═══════════════════════════════════════════

import type { AsrSession } from './providers/types';

type Slot = {
  speakerId: string;
  session: AsrSession;
  rms: number;
  lastFrameAt: number;
};

const slots = new Map<string, Slot[]>();

function readNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function maxStreams(): number {
  return readNumber('ASR_MAX_STREAMS', 1);
}

export function silenceCloseMs(): number {
  return readNumber('SILENCE_CLOSE_MS', 1500);
}

export function takeoverRatio(): number {
  return readNumber('ARBITRATION_TAKEOVER_RATIO', 1.5);
}

/** ลืมทุกอย่าง — สำหรับเทสต์เท่านั้น */
export function resetArbitration(): void {
  slots.clear();
}

/**
 * ขอสิทธิ์ถอดเสียงให้ผู้พูดคนนี้ คืน session ที่พร้อมรับเสียง หรือ null ถ้าไม่ได้สิทธิ์
 *
 * `openSession` ถูกเรียกเฉพาะตอนที่ต้องเปิด session ใหม่จริง ๆ — ส่งเข้ามาแทนการ import
 * provider ตรง ๆ เพื่อให้ไฟล์นี้ไม่ต้องรู้ว่าเสียงวิ่งไปทางไหน (และเทสต์ได้โดยไม่ต้องมี Azure)
 */
export async function claimSlot(
  meetingId: string,
  speakerId: string,
  rms: number,
  now: number,
  openSession: () => Promise<AsrSession>
): Promise<AsrSession | null> {
  const list = slots.get(meetingId) ?? [];
  slots.set(meetingId, list);

  const held = list.find((slot) => slot.speakerId === speakerId);
  if (held) {
    held.rms = rms;
    held.lastFrameAt = now;
    return held.session;
  }

  if (list.length < maxStreams()) {
    const session = await openSession();
    list.push({ speakerId, session, rms, lastFrameAt: now });
    return session;
  }

  // แย่ง slot จากคนที่เบาที่สุด และต้องดังกว่าเป็นสัดส่วนที่ชัดเจน ไม่ใช่ดังกว่านิดเดียว —
  // สองคนที่ดังพอกันจะสลับ slot กันทุกเฟรม เปิดปิด session รัวจนไม่ได้ข้อความของใครเลย
  // และค่าใช้จ่ายบานเพราะทุกการเปิดใหม่คือ session ใหม่ในบิล
  const weakest = list.reduce((min, slot) => (slot.rms < min.rms ? slot : min), list[0]);
  if (rms <= weakest.rms * takeoverRatio()) return null;

  await weakest.session.close();
  const session = await openSession();
  weakest.speakerId = speakerId;
  weakest.session = session;
  weakest.rms = rms;
  weakest.lastFrameAt = now;
  return session;
}

/** ปิด session ของคนที่หยุดส่งเสียงนานเกินกำหนด แล้วคืน slot ให้คนอื่น */
export async function releaseIdle(now: number): Promise<void> {
  const limit = silenceCloseMs();

  for (const [meetingId, list] of slots) {
    const idle = list.filter((slot) => now - slot.lastFrameAt > limit);
    if (idle.length === 0) continue;

    slots.set(
      meetingId,
      list.filter((slot) => !idle.includes(slot))
    );
    // ปิดทีละตัวและกลืน error — session ที่ปิดไม่สำเร็จต้องไม่กัน slot ของคนอื่นไว้ตลอดประชุม
    for (const slot of idle) {
      await slot.session.close().catch((error) => {
        console.error('[asr] ปิด session ไม่สำเร็จ:', (error as Error).message);
      });
    }
  }
}

/** คนออกจากห้อง — ปิด session ทันทีไม่ต้องรอครบเวลาเงียบ */
export async function releaseSpeaker(meetingId: string, speakerId: string): Promise<void> {
  const list = slots.get(meetingId);
  if (!list) return;

  const slot = list.find((entry) => entry.speakerId === speakerId);
  if (!slot) return;

  slots.set(
    meetingId,
    list.filter((entry) => entry !== slot)
  );
  await slot.session.close().catch((error) => {
    console.error('[asr] ปิด session ไม่สำเร็จ:', (error as Error).message);
  });
}
