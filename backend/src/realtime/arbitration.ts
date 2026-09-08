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
  // เก็บ promise ไม่ใช่ session ที่ resolve แล้ว เพื่อให้ "จอง slot" เกิดขึ้นแบบ synchronous
  // ก่อน await ใด ๆ — สอง claim ที่ชนกันจะไม่มีทางเห็นห้องว่างพร้อมกันทั้งคู่
  sessionPromise: Promise<AsrSession>;
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

/** จำนวนห้องที่ยังมี slot ค้างอยู่ตอนนี้ — สำหรับเทสต์เท่านั้น ไม่ export internals ที่แก้ไขได้ */
export function activeRoomCount(): number {
  return slots.size;
}

function removeFromRoom(meetingId: string, list: Slot[], slot: Slot): void {
  const idx = list.indexOf(slot);
  if (idx === -1) return;
  list.splice(idx, 1);
  if (list.length === 0) slots.delete(meetingId);
}

// เอา slot ออกจากห้องหลัง await ใด ๆ ต้องดึง list ปัจจุบันจาก map ใหม่เสมอ — list ที่ capture
// ไว้ก่อน await อาจไม่ใช่ array ที่ map ถืออยู่จริงแล้ว (เช่นถ้ามีคน mutate map ระหว่างนั้น)
// removeFromRoom เทียบด้วย object identity อยู่แล้ว จึงลบได้แค่ตัวเองแม้ slot ตัวอื่นจะเข้ามาแทนที่
function cleanupFailedSlot(meetingId: string, slot: Slot): void {
  const list = slots.get(meetingId);
  if (!list) return;
  removeFromRoom(meetingId, list, slot);
}

function logCloseFailure(meetingId: string, speakerId: string, error: unknown): void {
  console.error(
    `[asr] ปิด session ไม่สำเร็จ (meeting=${meetingId}, speaker=${speakerId}):`,
    (error as Error).message
  );
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
    return held.sessionPromise;
  }

  if (list.length < maxStreams()) {
    // จองที่ก่อน await — ต้อง push เข้า list ในเทิร์น synchronous เดียวกับการเช็ค capacity
    // ไม่งั้น claim อีกอันที่ชนกันจะเห็น list.length เดิมและเปิด session ซ้ำ
    const slot: Slot = { speakerId, sessionPromise: openSession(), rms, lastFrameAt: now };
    list.push(slot);
    try {
      return await slot.sessionPromise;
    } catch (error) {
      // เปิดไม่สำเร็จ — ต้องคืน slot ปลอมนี้ ไม่งั้นห้องจะค้างเต็มตลอดไปทั้งที่ไม่มี session จริง
      cleanupFailedSlot(meetingId, slot);
      throw error;
    }
  }

  // แย่ง slot จากคนที่เบาที่สุด และต้องดังกว่าเป็นสัดส่วนที่ชัดเจน ไม่ใช่ดังกว่านิดเดียว —
  // สองคนที่ดังพอกันจะสลับ slot กันทุกเฟรม เปิดปิด session รัวจนไม่ได้ข้อความของใครเลย
  // และค่าใช้จ่ายบานเพราะทุกการเปิดใหม่คือ session ใหม่ในบิล
  const weakest = list.reduce((min, slot) => (slot.rms < min.rms ? slot : min), list[0]);
  if (rms <= weakest.rms * takeoverRatio()) return null;

  const displacedSpeakerId = weakest.speakerId;
  const displacedPromise = weakest.sessionPromise;

  // สร้าง slot object ใหม่แทนที่จะเขียนทับตัวเดิม แล้วเสียบแทนที่ตำแหน่งของ weakest ใน list
  // แบบ synchronous ทันที — claim ที่ชนกันจะเห็นเจ้าของใหม่ทันที ไม่มีช่วงที่สอง claim เลือก
  // weakest ตัวเดียวกันแล้วต่างคนต่างเปิด session ใหม่ทับกัน
  //
  // ห้ามใช้ object เดิมซ้ำ (weakest) เพราะถ้า takeover รอบนี้ reject ทีหลัง cleanup จะลบ slot
  // ด้วย object identity — ถ้า object ถูก reuse แล้วมีคนแย่ง slot ต่อจากเราอีกที cleanup ของเรา
  // จะไปลบ slot ของเจ้าของใหม่ (ที่ session ใช้งานได้จริง) ออกจากห้องโดยไม่ได้ตั้งใจ
  const newSlot: Slot = { speakerId, sessionPromise: openSession(), rms, lastFrameAt: now };
  const idx = list.indexOf(weakest);
  list[idx] = newSlot;

  // ปิด session เดิมแยกต่างหาก — ปิดไม่สำเร็จต้องไม่ทำให้ claim ของคนที่แย่ง slot ได้ fail ไปด้วย
  displacedPromise
    .then((session) => session.close())
    .catch((error) => logCloseFailure(meetingId, displacedSpeakerId, error));

  try {
    return await newSlot.sessionPromise;
  } catch (error) {
    // session ใหม่เปิดไม่สำเร็จ — session เดิมถูกสั่งปิดไปแล้ว กู้คืนไม่ได้ ต้องคืน slot นี้แทน
    // ลบด้วย identity ของ newSlot เอง เพื่อไม่ให้ไปโดน slot ของคนที่แย่งต่อจากเราอีกที
    cleanupFailedSlot(meetingId, newSlot);
    throw error;
  }
}

/** ปิด session ของคนที่หยุดส่งเสียงนานเกินกำหนด แล้วคืน slot ให้คนอื่น */
export async function releaseIdle(now: number): Promise<void> {
  const limit = silenceCloseMs();

  for (const [meetingId, list] of slots) {
    const idle = list.filter((slot) => now - slot.lastFrameAt > limit);
    if (idle.length === 0) continue;

    // mutate array เดิมในที่ (แทนการ set array ใหม่ทับใน map) — reference ที่ claimSlot อาจ
    // capture ไว้ก่อน await (เช่นระหว่างเปิด session ใหม่) ต้องยังชี้ไปที่ array ที่ map ถืออยู่จริง
    // ไม่งั้น cleanup ของ claimSlot จะไปแก้ array ที่หลุดจาก map ไปแล้ว ในขณะที่ map ถือ array ใหม่
    const remaining = list.filter((slot) => !idle.includes(slot));
    list.length = 0;
    list.push(...remaining);
    if (list.length === 0) slots.delete(meetingId);

    // ปิดทีละตัวและกลืน error — session ที่ปิดไม่สำเร็จต้องไม่กัน slot ของคนอื่นไว้ตลอดประชุม
    for (const slot of idle) {
      await slot.sessionPromise
        .then((session) => session.close())
        .catch((error) => logCloseFailure(meetingId, slot.speakerId, error));
    }
  }
}

/** คนออกจากห้อง — ปิด session ทันทีไม่ต้องรอครบเวลาเงียบ */
export async function releaseSpeaker(meetingId: string, speakerId: string): Promise<void> {
  const list = slots.get(meetingId);
  if (!list) return;

  const slot = list.find((entry) => entry.speakerId === speakerId);
  if (!slot) return;

  removeFromRoom(meetingId, list, slot);
  await slot.sessionPromise
    .then((session) => session.close())
    .catch((error) => logCloseFailure(meetingId, speakerId, error));
}
