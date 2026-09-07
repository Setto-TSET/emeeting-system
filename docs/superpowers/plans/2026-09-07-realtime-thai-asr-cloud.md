# Realtime Thai ASR ผ่าน Cloud (Azure) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยนคำบรรยายสดจาก "ยิงเสียงก้อนละ 3 วินาทีไป Typhoon" เป็น streaming ผ่าน Azure AI Speech สำหรับห้อง `normal`/`restricted` (มีผลบางส่วนไหลตามคำพูด) และคง Typhoon self-host ไว้สำหรับห้อง `top_secret`

**Architecture:** ฝั่ง client ส่งเสียงเป็นเฟรมสั้น 250 ms พร้อมค่า RMS ใน header แทนก้อน 3 วินาที ฝั่ง server มี `AsrProvider` เป็น interface เดียวที่มีสอง implementation (Azure streaming, Typhoon แบบสะสมเป็นก้อน) เลือกจาก `confidentialityLevel` ของการประชุม และมี arbitration จำกัดจำนวน session ที่เปิดพร้อมกันต่อห้องตาม `ASR_MAX_STREAMS`

**Tech Stack:** TypeScript, Node.js, `ws`, `microsoft-cognitiveservices-speech-sdk`, Jest (backend), Vitest (frontend), MySQL

**Spec:** `docs/superpowers/specs/2026-09-07-realtime-thai-asr-cloud-design.md`

## Global Constraints

- ตัดสินใจว่าจะใช้ provider ไหน **ที่ server เท่านั้น** — เฟรมจาก client ไม่มีที่ให้บอก provider
- `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` เป็น env ฝั่ง backend เท่านั้น ห้ามมี `NEXT_PUBLIC_` และห้ามส่งถึง browser
- ห้าม fallback จาก Azure ไป Typhoon อัตโนมัติ — ล้มแล้วให้ล้มพร้อม log สาเหตุจริง
- ผลบางส่วน (`isFinal: false`) **ห้ามเขียนลง `transcript_segments`**
- วาระที่มี `secretGroupId` ห้ามหลุดเข้า phrase list
- ค่าตั้งต้น: `ASR_MAX_STREAMS=1`, `SILENCE_CLOSE_MS=1500`, `ARBITRATION_TAKEOVER_RATIO=1.5`, `AZURE_SPEECH_REGION=southeastasia`
- คอมเมนต์ในโค้ดเขียนภาษาไทยตามแบบไฟล์รอบข้าง อธิบาย "ทำไม" ไม่ใช่ "ทำอะไร"
- backend test: `cd backend && npx jest <path>` — ใช้ MySQL จริง (`tests/setup.ts`) และรัน worker เดียว
- frontend test: `npx vitest run <path>`

---

## File Structure

**สร้างใหม่ (backend):**

| ไฟล์ | ความรับผิดชอบ |
|---|---|
| `backend/src/realtime/providers/types.ts` | `AsrProvider` / `AsrSession` interface อย่างเดียว ไม่มี implementation |
| `backend/src/realtime/providers/typhoon.ts` | ห่อ `transcribePcm` เดิม สะสมเฟรมเป็นก้อน 3 วินาที ยิง `onFinal` |
| `backend/src/realtime/providers/azure.ts` | Azure Speech SDK, push stream, `recognizing`/`recognized`, phrase list |
| `backend/src/realtime/providers/select.ts` | แปลง `confidentialityLevel` เป็น provider |
| `backend/src/realtime/phrases.ts` | ประกอบ phrase list จาก `MeetingPayload` |
| `backend/src/realtime/arbitration.ts` | จัดสรร slot ต่อห้อง เปิด/ปิด session ตาม RMS และความเงียบ |
| `backend/src/realtime/overlap.ts` | `stripOverlap()` ย้ายมาจาก `audio.ts` — ตัดวงจร import (ดู Task 3) |

**แก้ไข:**

| ไฟล์ | แก้อะไร |
|---|---|
| `src/services/speech/pcm.ts` | เฟรม 250 ms, header มี RMS, ตัด overlap ฝั่ง client |
| `src/services/speech/audioCapture.ts` | ใช้ค่าคงที่ใหม่ ไม่เก็บ overlap |
| `backend/src/realtime/audio.ts` | ต่อ arbitration + provider แทนการเรียก `transcribePcm` ตรง |
| `src/components/meeting/SubtitleBar.tsx` | partial ของผู้พูดเดิมแทนที่บรรทัดเดิม |
| `render.yaml` | env ใหม่ |
| `deploy/RENDER.md`, `PROJECT_STATUS.md` | เอกสาร |

**ไม่ลบ:** `backend/src/realtime/asrClient.ts`, `stripOverlap()`, `asr/` — กลายเป็นรายละเอียดภายในของ typhoon provider

---

## Task 1: เฟรมเสียงแบบใหม่ (250 ms + RMS ใน header)

Azure ให้ partial ได้เร็วก็ต่อเมื่อได้เสียงถี่กว่าทุก 3 วินาที และ arbitration ต้องรู้ว่าใครดังกว่าใครจากตัวเฟรมเอง งานนี้แก้ทั้งสองฝั่งพร้อมกันเพราะรูปแบบเฟรมต้องตรงกัน แยกทำแล้วระบบพังระหว่างทาง

**Files:**
- Modify: `src/services/speech/pcm.ts`
- Modify: `src/services/speech/audioCapture.ts:47-77`
- Modify: `backend/src/realtime/audio.ts:12-30` (`HEADER_BYTES`, `parseAudioFrame`)
- Test: `src/services/speech/pcm.test.ts` (สร้างใหม่ถ้ายังไม่มี)
- Test: `backend/tests/realtime/audioPure.test.ts` (มีอยู่แล้ว — เพิ่มเคส)

**Interfaces:**
- Consumes: `rms()`, `floatToPcm16()`, `downsampleTo16k()` เดิมใน `pcm.ts`
- Produces:
  - `FRAME_SECONDS = 0.25` (แทน `CHUNK_SECONDS`)
  - `buildAudioFrame(pcm: Int16Array, startMs: number, level: number): ArrayBuffer`
  - `parseAudioFrame(raw: Buffer): { startSec: number; rms: number; pcm: Buffer } | null`

- [ ] **Step 1: เขียนเทสต์ฝั่ง client ที่ยังไม่ผ่าน**

สร้าง `src/services/speech/pcm.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildAudioFrame, FRAME_SECONDS, TARGET_RATE } from "./pcm";

describe("buildAudioFrame", () => {
  it("เขียน timestamp กับ RMS ลง header 8 ไบต์แล้วตามด้วย PCM", () => {
    const pcm = Int16Array.from([1, -2, 3]);
    const frame = buildAudioFrame(pcm, 1234, 0.25);
    const view = new DataView(frame);

    expect(view.getUint32(0, true)).toBe(1234);
    expect(view.getFloat32(4, true)).toBeCloseTo(0.25, 5);
    expect(frame.byteLength).toBe(8 + pcm.byteLength);
    expect(new Int16Array(frame, 8)).toEqual(pcm);
  });

  it("RMS ติดลบหรือ NaN ถูกปัดเป็น 0 — ค่าเพี้ยนจากไมค์ต้องไม่ทำให้ arbitration เลือกผิด", () => {
    const view = new DataView(buildAudioFrame(Int16Array.from([0]), 0, Number.NaN));
    expect(view.getFloat32(4, true)).toBe(0);
  });

  it("เฟรมยาว 250 มิลลิวินาที", () => {
    expect(FRAME_SECONDS * TARGET_RATE).toBe(4000);
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run src/services/speech/pcm.test.ts`
Expected: FAIL — `FRAME_SECONDS` ยังไม่มี (`does not provide an export named 'FRAME_SECONDS'`)

- [ ] **Step 3: แก้ `pcm.ts`**

แทนที่บล็อกค่าคงที่และ `buildAudioFrame`:

```ts
export const TARGET_RATE = 16000;

// เฟรมสั้นพอให้ Azure ยิงผลบางส่วนได้ทันคำพูด (เป้าหมาย partial แรก < 500 ms)
// ก้อนใหญ่กว่านี้ไม่ได้ช่วยความแม่นเพราะฝั่ง Azure ประกอบสตรีมเองอยู่แล้ว
export const FRAME_SECONDS = 0.25;

// noise floor ของไมค์แต่ละตัวกับห้องประชุมแต่ละห้องไม่เท่ากัน ค่านี้ตั้งไว้กลาง ๆ
// และต้องแก้ได้จากที่เดียว ไม่ฝังกระจายไปตามไฟล์อื่น
export const SILENCE_RMS_THRESHOLD = 0.01;
```

ลบ `CHUNK_SECONDS` และ `OVERLAP_SECONDS` ออก (การทับซ้อนย้ายไปทำที่ typhoon provider ฝั่ง server — ดู Task 3)

```ts
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
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/services/speech/pcm.test.ts`
Expected: PASS ทั้ง 3 เคส

- [ ] **Step 5: แก้ `audioCapture.ts` ให้ใช้เฟรมใหม่**

แก้ import และเนื้อใน `collector.port.onmessage`:

```ts
import {
  buildAudioFrame,
  downsampleTo16k,
  floatToPcm16,
  rms,
  FRAME_SECONDS,
  SILENCE_RMS_THRESHOLD,
  TARGET_RATE,
} from "./pcm";
```

```ts
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
```

- [ ] **Step 6: เขียนเทสต์ฝั่ง server ที่ยังไม่ผ่าน**

เพิ่มใน `backend/tests/realtime/audioPure.test.ts`:

```ts
describe('parseAudioFrame (header v2)', () => {
  function frame(startMs: number, level: number, samples = 4): Buffer {
    const header = Buffer.alloc(8);
    header.writeUInt32LE(startMs, 0);
    header.writeFloatLE(level, 4);
    return Buffer.concat([header, Buffer.alloc(samples * 2)]);
  }

  it('อ่าน timestamp, RMS และ PCM ออกมาได้', () => {
    const parsed = parseAudioFrame(frame(2000, 0.5));
    expect(parsed).not.toBeNull();
    expect(parsed!.startSec).toBe(2);
    expect(parsed!.rms).toBeCloseTo(0.5, 5);
    expect(parsed!.pcm.length).toBe(8);
  });

  it('เฟรมที่สั้นกว่า header คืน null ไม่ throw', () => {
    expect(parseAudioFrame(Buffer.alloc(6))).toBeNull();
  });

  it('PCM ที่มีจำนวนไบต์เป็นเลขคี่คืน null — ครึ่งตัวอย่างแปลว่าเฟรมพัง', () => {
    expect(parseAudioFrame(Buffer.concat([Buffer.alloc(8), Buffer.alloc(3)]))).toBeNull();
  });
});
```

- [ ] **Step 7: รันให้เห็นว่าไม่ผ่าน**

Run: `cd backend && npx jest tests/realtime/audioPure.test.ts -t "header v2"`
Expected: FAIL — `parsed.rms` เป็น `undefined` และเคส 8 ไบต์อ่าน startSec ผิด

- [ ] **Step 8: แก้ `parseAudioFrame` ใน `backend/src/realtime/audio.ts`**

```ts
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
```

- [ ] **Step 9: รันเทสต์ทั้งสองฝั่งให้ผ่าน**

Run: `cd backend && npx jest tests/realtime/audioPure.test.ts`
Expected: PASS

Run: `npx vitest run src/services/speech/pcm.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/services/speech/pcm.ts src/services/speech/pcm.test.ts src/services/speech/audioCapture.ts backend/src/realtime/audio.ts backend/tests/realtime/audioPure.test.ts
git commit -m "feat(asr): send 250ms frames carrying their own loudness"
```

---

## Task 2: `AsrProvider` interface

ไฟล์นี้มีแต่ type ไม่มีโค้ดทำงาน จึงไม่มีเทสต์ของตัวเอง — Task 3 กับ 5 เป็นคนพิสูจน์ว่ารูปร่างนี้ใช้ได้จริง

**Files:**
- Create: `backend/src/realtime/providers/types.ts`

**Interfaces:**
- Produces: `AsrSession`, `AsrProvider`, `AsrOpenOptions`

- [ ] **Step 1: เขียนไฟล์**

```ts
// ═══════════════════════════════════════════
// ASR Provider — สัญญาเดียวที่ audio.ts รู้จัก
//
// เปลี่ยนผู้ให้บริการถอดเสียงให้เพิ่มไฟล์ใหม่ในโฟลเดอร์นี้ ไม่ต้องแตะ audio.ts
// ═══════════════════════════════════════════

export type AsrOpenOptions = {
  /** ผลระหว่างพูด — ยิงได้หลายครั้งต่อประโยค ห้ามเขียนลงฐานข้อมูล */
  onPartial(text: string): void;
  /** ผลสุดท้ายของประโยค — เขียนลง transcript ได้ */
  onFinal(text: string, startSec: number): void;
  /** ศัพท์เฉพาะของการประชุมนี้ (ชื่อคน ชื่อคณะ วาระ) provider ที่ไม่รองรับให้เมิน */
  phrases?: string[];
};

export type AsrSession = {
  /** ป้อนเสียงเฟรมถัดไป — ไม่คืนผล ผลมาทาง callback */
  push(pcm: Buffer, startSec: number): void;
  /** ปิด session และรอผลสุดท้ายที่ค้างอยู่ให้ยิงครบก่อน */
  close(): Promise<void>;
};

export type AsrProvider = {
  /** ชื่อสำหรับ log — ต้องบอกได้ว่าเสียงห้องนี้วิ่งไปทางไหน */
  readonly name: 'azure' | 'typhoon';
  open(options: AsrOpenOptions): Promise<AsrSession>;
};
```

- [ ] **Step 2: ตรวจว่า typecheck ผ่าน**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add backend/src/realtime/providers/types.ts
git commit -m "feat(asr): define the provider seam"
```

---

## Task 3: Typhoon provider

ห่อพฤติกรรมเดิมทั้งหมด (ก้อน 3 วินาที ทับซ้อน 0.5 วินาที ตัดคำซ้ำด้วย `stripOverlap`) ไว้หลัง interface ใหม่ ตอนนี้เฟรมเข้ามาทีละ 250 ms จึงต้องสะสมเองที่ฝั่ง server

**Files:**
- Create: `backend/src/realtime/overlap.ts`
- Create: `backend/src/realtime/providers/typhoon.ts`
- Modify: `backend/src/realtime/audio.ts` (ย้าย `stripOverlap` ออก แล้ว re-export)
- Test: `backend/tests/realtime/typhoonProvider.test.ts`

**Interfaces:**
- Consumes: `AsrProvider`, `AsrSession`, `AsrOpenOptions` (Task 2), `transcribePcm` จาก `backend/src/realtime/asrClient.ts`
- Produces: `typhoonProvider: AsrProvider`; `stripOverlap` ย้ายไปอยู่ที่ `backend/src/realtime/overlap.ts` (`audio.ts` re-export ชื่อเดิมไว้)

- [ ] **Step 1: ย้าย `stripOverlap` ออกจาก `audio.ts` ก่อน — ตัดวงจร import**

ถ้า typhoon provider import `stripOverlap` จาก `audio.ts` จะเกิดวงจร `audio.ts` → `providers/select.ts`
→ `providers/typhoon.ts` → `audio.ts` (Task 8 เป็นคนเพิ่ม import ขาหน้า) Node รันผ่านได้แต่ค่าที่ถูกอ่าน
ตอนโมดูลโหลดจะเป็น `undefined` แบบเงียบ ๆ ตัดวงจรตอนนี้ถูกกว่าไล่ดีบักทีหลังมาก

ย้าย `MAX_OVERLAP_CHARS`, `MIN_OVERLAP_CHARS`, `withoutSpaces`, `THAI_COMBINING` และ `stripOverlap`
พร้อมคอมเมนต์ทั้งหมดจาก `backend/src/realtime/audio.ts` ไปไว้ที่ `backend/src/realtime/overlap.ts`
โดยไม่แก้เนื้อ แล้วให้ `audio.ts` re-export เพื่อให้ `audioPure.test.ts` ที่ import จากที่เดิมยังทำงานได้:

```ts
// stripOverlap ย้ายไป overlap.ts แล้ว — typhoon provider ต้องใช้มัน และไฟล์นี้ import provider
// กลับมาอีกทอด การ re-export ที่นี่ทำให้เทสต์เดิมไม่ต้องแก้ import
export { stripOverlap } from './overlap';
```

- [ ] **Step 2: ตรวจว่าเทสต์เดิมยังผ่าน**

Run: `cd backend && npx jest tests/realtime/audioPure.test.ts`
Expected: PASS — ย้ายไฟล์อย่างเดียว พฤติกรรมไม่เปลี่ยน

- [ ] **Step 3: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `backend/tests/realtime/typhoonProvider.test.ts`:

```ts
jest.mock('../../src/realtime/asrClient', () => ({
  transcribePcm: jest.fn(),
  asrBaseUrl: () => 'http://localhost:8000',
}));

import { transcribePcm } from '../../src/realtime/asrClient';
import { typhoonProvider } from '../../src/realtime/providers/typhoon';

const mockTranscribe = transcribePcm as jest.MockedFunction<typeof transcribePcm>;

// 250 ms ที่ 16 kHz = 4000 ตัวอย่าง = 8000 ไบต์
const FRAME = Buffer.alloc(8000);

describe('typhoon provider', () => {
  beforeEach(() => mockTranscribe.mockReset());

  it('ไม่เรียก sidecar จนกว่าจะสะสมครบ 3 วินาที', async () => {
    const session = await typhoonProvider.open({ onPartial: jest.fn(), onFinal: jest.fn() });

    for (let i = 0; i < 11; i += 1) session.push(FRAME, i * 0.25);
    expect(mockTranscribe).not.toHaveBeenCalled();

    session.push(FRAME, 2.75);
    await session.close();
    expect(mockTranscribe).toHaveBeenCalledTimes(1);
  });

  it('ยิง onFinal พร้อมเวลาเริ่มของก้อน ไม่ใช่เวลาที่ถอดเสร็จ', async () => {
    mockTranscribe.mockResolvedValue('สวัสดีครับ');
    const onFinal = jest.fn();
    const session = await typhoonProvider.open({ onPartial: jest.fn(), onFinal });

    for (let i = 0; i < 12; i += 1) session.push(FRAME, 10 + i * 0.25);
    await session.close();

    expect(onFinal).toHaveBeenCalledWith('สวัสดีครับ', 10);
  });

  it('ตัดคำที่ซ้ำตรงรอยต่อของสองก้อนติดกัน', async () => {
    mockTranscribe.mockResolvedValueOnce('วาระที่หนึ่งงบประมาณ').mockResolvedValueOnce('งบประมาณปีหน้า');
    const onFinal = jest.fn();
    const session = await typhoonProvider.open({ onPartial: jest.fn(), onFinal });

    for (let i = 0; i < 24; i += 1) session.push(FRAME, i * 0.25);
    await session.close();

    expect(onFinal).toHaveBeenNthCalledWith(1, 'วาระที่หนึ่งงบประมาณ', 0);
    expect(onFinal.mock.calls[1][0]).toBe('ปีหน้า');
  });

  it('ไม่เคยยิง onPartial — provider นี้ไม่มีผลระหว่างพูด', async () => {
    mockTranscribe.mockResolvedValue('ข้อความ');
    const onPartial = jest.fn();
    const session = await typhoonProvider.open({ onPartial, onFinal: jest.fn() });

    for (let i = 0; i < 12; i += 1) session.push(FRAME, i * 0.25);
    await session.close();

    expect(onPartial).not.toHaveBeenCalled();
  });

  it('sidecar ล้มแล้วโยน error ออกมา ไม่กลืนเงียบ', async () => {
    mockTranscribe.mockRejectedValue(new Error('boom'));
    const session = await typhoonProvider.open({ onPartial: jest.fn(), onFinal: jest.fn() });

    for (let i = 0; i < 12; i += 1) session.push(FRAME, i * 0.25);
    await expect(session.close()).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 4: รันให้เห็นว่าไม่ผ่าน**

Run: `cd backend && npx jest tests/realtime/typhoonProvider.test.ts`
Expected: FAIL — `Cannot find module '../../src/realtime/providers/typhoon'`

- [ ] **Step 5: เขียน `backend/src/realtime/providers/typhoon.ts`**

```ts
// ═══════════════════════════════════════════
// Typhoon provider — เส้นทางเดิมของ Phase F ห่อไว้หลัง AsrProvider
//
// ใช้กับห้อง top_secret เท่านั้น เสียงไม่ออกนอกองค์กร (ดู providers/select.ts)
// ═══════════════════════════════════════════

import { transcribePcm } from '../asrClient';
import { stripOverlap } from '../overlap';
import type { AsrOpenOptions, AsrProvider, AsrSession } from './types';

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;

// ขนาดก้อนที่ Phase F วัดแล้วว่าได้สมดุลดีที่สุด (CER 0.0438 หน่วง 185 ms)
// ก้อน 2 วินาที CER แย่ลงเกือบเท่าตัวโดยที่หน่วงไม่ได้ลดลงจริง
const CHUNK_BYTES = 3 * SAMPLE_RATE * BYTES_PER_SAMPLE;
// ทับซ้อนกันครึ่งวินาทีเพื่อกันคำขาดตรงรอยต่อ ข้อความที่ซ้ำถูกตัดด้วย stripOverlap
const OVERLAP_BYTES = 0.5 * SAMPLE_RATE * BYTES_PER_SAMPLE;

export const typhoonProvider: AsrProvider = {
  name: 'typhoon',

  async open(options: AsrOpenOptions): Promise<AsrSession> {
    let buffer = Buffer.alloc(0);
    let chunkStartSec: number | null = null;
    let previousText = '';
    // งานถอดของก้อนก่อนหน้า — ต่อคิวกันเป็นสายเดียวเพื่อให้ onFinal ออกตามลำดับเวลาเสมอ
    // ถ้าปล่อยขนานกัน ก้อนที่ถอดเร็วกว่าจะแซงก้อนก่อนหน้า แล้ว transcript เรียงสลับ
    let pending: Promise<void> = Promise.resolve();

    function flush(): void {
      const chunk = buffer.subarray(0, CHUNK_BYTES);
      const startSec = chunkStartSec ?? 0;
      buffer = buffer.subarray(CHUNK_BYTES - OVERLAP_BYTES);
      chunkStartSec = startSec + (CHUNK_BYTES - OVERLAP_BYTES) / (SAMPLE_RATE * BYTES_PER_SAMPLE);

      pending = pending.then(async () => {
        const text = await transcribePcm(chunk);
        const deduped = stripOverlap(previousText, text).trim();
        previousText = text;
        if (deduped) options.onFinal(deduped, startSec);
      });
    }

    return {
      push(pcm: Buffer, startSec: number): void {
        if (chunkStartSec === null) chunkStartSec = startSec;
        buffer = Buffer.concat([buffer, pcm]);
        while (buffer.length >= CHUNK_BYTES) flush();
      },

      async close(): Promise<void> {
        // เศษเสียงที่ไม่ครบก้อนก็ยังมีคำอยู่ ถ้าทิ้งไปประโยคสุดท้ายของทุกคนจะหายเสมอ
        if (buffer.length > 0) {
          const tail = buffer;
          const startSec = chunkStartSec ?? 0;
          buffer = Buffer.alloc(0);
          pending = pending.then(async () => {
            const text = await transcribePcm(tail);
            const deduped = stripOverlap(previousText, text).trim();
            previousText = text;
            if (deduped) options.onFinal(deduped, startSec);
          });
        }
        await pending;
      },
    };
  },
};
```

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

Run: `cd backend && npx jest tests/realtime/typhoonProvider.test.ts`
Expected: PASS ทั้ง 5 เคส

- [ ] **Step 7: Commit**

```bash
git add backend/src/realtime/overlap.ts backend/src/realtime/audio.ts backend/src/realtime/providers/typhoon.ts backend/tests/realtime/typhoonProvider.test.ts
git commit -m "feat(asr): wrap the Typhoon path behind the provider seam"
```

---

## Task 4: Phrase list จากข้อมูลประชุม

**Files:**
- Create: `backend/src/realtime/phrases.ts`
- Test: `backend/tests/realtime/phrases.test.ts`

**Interfaces:**
- Consumes: `MeetingPayload` จาก `backend/src/repositories/meetings.ts`
- Produces: `buildPhraseList(meeting: MeetingPayload): string[]`, `MAX_PHRASES = 300`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `backend/tests/realtime/phrases.test.ts`:

```ts
import { buildPhraseList, MAX_PHRASES } from '../../src/realtime/phrases';

const base = {
  id: 'MT-1',
  title: 'การประชุมคณะทำงานงบประมาณ ครั้งที่ 3',
  shortName: 'คทง.งบประมาณ',
  committee: 'คณะทำงานกลั่นกรองงบประมาณ',
  participants: [
    { userId: 'U-1', name: 'มาลี รักเรียน' },
    { userId: 'U-2', name: 'สมชาย ใจดี' },
  ],
  agenda: [
    { id: 'A-1', title: 'รับรองรายงานการประชุม', secretGroupId: null },
    { id: 'A-2', title: 'จัดซื้อระบบสารบรรณ', secretGroupId: 'SG-1' },
  ],
  description: 'พิจารณากรอบวงเงินปีงบประมาณ 2570',
};

describe('buildPhraseList', () => {
  it('เอาชื่อผู้เข้าร่วมมาก่อนเสมอ', () => {
    const phrases = buildPhraseList(base as never);
    expect(phrases[0]).toBe('มาลี รักเรียน');
    expect(phrases[1]).toBe('สมชาย ใจดี');
  });

  it('ตัดวาระที่มี secretGroupId ออก — วาระลับห้ามออก cloud', () => {
    const phrases = buildPhraseList(base as never);
    expect(phrases).toContain('รับรองรายงานการประชุม');
    expect(phrases).not.toContain('จัดซื้อระบบสารบรรณ');
  });

  it('รวมชื่อคณะทำงานกับชื่อย่อ', () => {
    const phrases = buildPhraseList(base as never);
    expect(phrases).toContain('คณะทำงานกลั่นกรองงบประมาณ');
    expect(phrases).toContain('คทง.งบประมาณ');
  });

  it('ตัดที่เพดานโดยชื่อคนต้องรอด', () => {
    const many = {
      ...base,
      agenda: Array.from({ length: MAX_PHRASES + 50 }, (_, i) => ({
        id: `A-${i}`,
        title: `วาระที่ ${i}`,
        secretGroupId: null,
      })),
    };
    const phrases = buildPhraseList(many as never);

    expect(phrases.length).toBe(MAX_PHRASES);
    expect(phrases).toContain('มาลี รักเรียน');
    expect(phrases).toContain('สมชาย ใจดี');
  });

  it('ไม่มีค่าซ้ำและไม่มีสตริงว่าง', () => {
    const messy = {
      ...base,
      committee: 'มาลี รักเรียน',
      description: '   ',
      participants: [{ userId: 'U-1', name: 'มาลี รักเรียน' }, { userId: 'U-3', name: '' }],
    };
    const phrases = buildPhraseList(messy as never);

    expect(phrases.filter((p) => p === 'มาลี รักเรียน')).toHaveLength(1);
    expect(phrases).not.toContain('');
    expect(phrases.every((p) => p.trim() === p && p.length > 0)).toBe(true);
  });

  it('ประชุมที่ไม่มีข้อมูลเลยคืนอาร์เรย์ว่าง ไม่ throw', () => {
    expect(buildPhraseList({ id: 'MT-2' } as never)).toEqual([]);
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `cd backend && npx jest tests/realtime/phrases.test.ts`
Expected: FAIL — `Cannot find module '../../src/realtime/phrases'`

- [ ] **Step 3: เขียน `backend/src/realtime/phrases.ts`**

```ts
// ═══════════════════════════════════════════
// Phrase list — บอก ASR ล่วงหน้าว่าจะได้ยินชื่อและศัพท์อะไรในห้องนี้
//
// นี่คือส่วนที่ทำให้ชื่อคนกับศัพท์เฉพาะขององค์กรถอดออกมาถูก ซึ่ง base model
// ของผู้ให้บริการไหนก็ไม่รู้จักมาก่อน
// ═══════════════════════════════════════════

import type { MeetingPayload } from '../repositories/meetings';

// เพดานที่ Azure รับต่อ session — เกินแล้วรายการท้าย ๆ ถูกเมินทั้งชุด ไม่ใช่แค่ส่วนที่เกิน
export const MAX_PHRASES = 300;

function pushClean(out: string[], seen: Set<string>, value: unknown): void {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed || seen.has(trimmed)) return;
  seen.add(trimmed);
  out.push(trimmed);
}

/**
 * เรียงตามความสำคัญ: ชื่อคน > ชื่อคณะ/หน่วยงาน > หัวข้อวาระ > คำอธิบาย
 * เกินเพดานแล้วตัดจากท้าย เพราะชื่อคนผิดคือความผิดพลาดที่คนอ่านรู้สึกแรงที่สุด
 *
 * วาระที่มี secretGroupId ถูกตัดทิ้งเสมอ — วาระลับอยู่ในห้องที่ระดับความลับเป็น
 * normal/restricted ได้ การส่งหัวข้อของมันเข้า phrase list คือการส่งข้อความนั้นออก
 * นอกองค์กรโดยที่ไม่มีใครสั่ง
 */
export function buildPhraseList(meeting: MeetingPayload): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const participants = Array.isArray(meeting.participants) ? meeting.participants : [];
  for (const p of participants) pushClean(out, seen, (p as { name?: unknown })?.name);

  pushClean(out, seen, meeting.committee);
  pushClean(out, seen, meeting.shortName);
  pushClean(out, seen, meeting.title);

  const agenda = Array.isArray(meeting.agenda) ? meeting.agenda : [];
  for (const item of agenda) {
    const entry = item as { title?: unknown; secretGroupId?: unknown };
    if (entry?.secretGroupId) continue;
    pushClean(out, seen, entry?.title);
  }

  pushClean(out, seen, meeting.description);

  return out.slice(0, MAX_PHRASES);
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `cd backend && npx jest tests/realtime/phrases.test.ts`
Expected: PASS ทั้ง 6 เคส

- [ ] **Step 5: Commit**

```bash
git add backend/src/realtime/phrases.ts backend/tests/realtime/phrases.test.ts
git commit -m "feat(asr): teach the recognizer the names it is about to hear"
```

---

## Task 5: Azure provider

**Files:**
- Create: `backend/src/realtime/providers/azure.ts`
- Modify: `backend/package.json` (เพิ่ม dependency)
- Test: `backend/tests/realtime/azureProvider.test.ts`

**Interfaces:**
- Consumes: `AsrProvider`, `AsrSession`, `AsrOpenOptions` (Task 2)
- Produces: `azureProvider: AsrProvider`, `isAzureConfigured(): boolean`

- [ ] **Step 1: ติดตั้ง SDK**

```bash
cd backend && npm install microsoft-cognitiveservices-speech-sdk
```

- [ ] **Step 2: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `backend/tests/realtime/azureProvider.test.ts` — mock ตัว SDK ทั้งก้อนเพราะเทสต์นี้พิสูจน์การต่อสาย ไม่ได้พิสูจน์ว่า Azure ถอดเสียงได้ (อันนั้นวัดด้วยมือ ดู Task 9):

```ts
const handlers: Record<string, Function> = {};
const mockPush = jest.fn();
const mockClose = jest.fn();
const mockStartContinuous = jest.fn((cb: Function) => cb());
const mockStopContinuous = jest.fn((cb: Function) => cb());
const mockAddPhrase = jest.fn();

jest.mock('microsoft-cognitiveservices-speech-sdk', () => ({
  AudioInputStream: { createPushStream: () => ({ write: mockPush, close: mockClose }) },
  AudioConfig: { fromStreamInput: () => ({}) },
  AudioStreamFormat: { getWaveFormatPCM: () => ({}) },
  SpeechConfig: { fromSubscription: () => ({ speechRecognitionLanguage: '' }) },
  ResultReason: { RecognizedSpeech: 3 },
  PhraseListGrammar: { fromRecognizer: () => ({ addPhrase: mockAddPhrase }) },
  SpeechRecognizer: class {
    set recognizing(fn: Function) { handlers.recognizing = fn; }
    set recognized(fn: Function) { handlers.recognized = fn; }
    set canceled(fn: Function) { handlers.canceled = fn; }
    startContinuousRecognitionAsync = mockStartContinuous;
    stopContinuousRecognitionAsync = mockStopContinuous;
    close = jest.fn();
  },
}));

import { azureProvider, isAzureConfigured } from '../../src/realtime/providers/azure';

describe('azure provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AZURE_SPEECH_KEY = 'test-key';
    process.env.AZURE_SPEECH_REGION = 'southeastasia';
  });

  it('isAzureConfigured เป็น false เมื่อไม่มีคีย์', () => {
    delete process.env.AZURE_SPEECH_KEY;
    expect(isAzureConfigured()).toBe(false);
  });

  it('ส่ง phrase list เข้า recognizer ทุกคำ', async () => {
    await azureProvider.open({ onPartial: jest.fn(), onFinal: jest.fn(), phrases: ['มาลี', 'สมชาย'] });
    expect(mockAddPhrase).toHaveBeenCalledWith('มาลี');
    expect(mockAddPhrase).toHaveBeenCalledWith('สมชาย');
  });

  it('recognizing ยิง onPartial, recognized ยิง onFinal', async () => {
    const onPartial = jest.fn();
    const onFinal = jest.fn();
    const session = await azureProvider.open({ onPartial, onFinal });

    session.push(Buffer.alloc(8000), 4.5);
    handlers.recognizing({}, { result: { text: 'สวัส' } });
    expect(onPartial).toHaveBeenCalledWith('สวัส');

    handlers.recognized({}, { result: { reason: 3, text: 'สวัสดีครับ' } });
    expect(onFinal).toHaveBeenCalledWith('สวัสดีครับ', 4.5);
  });

  it('ข้อความว่างไม่ถูกส่งต่อ — Azure ยิง recognized ว่างตอนเงียบ', async () => {
    const onFinal = jest.fn();
    const session = await azureProvider.open({ onPartial: jest.fn(), onFinal });
    session.push(Buffer.alloc(8000), 1);

    handlers.recognized({}, { result: { reason: 3, text: '   ' } });
    expect(onFinal).not.toHaveBeenCalled();
  });

  it('push เขียนลง push stream', async () => {
    const session = await azureProvider.open({ onPartial: jest.fn(), onFinal: jest.fn() });
    session.push(Buffer.alloc(16), 0);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('close ปิดสตรีมและหยุด recognizer', async () => {
    const session = await azureProvider.open({ onPartial: jest.fn(), onFinal: jest.fn() });
    await session.close();
    expect(mockStopContinuous).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: รันให้เห็นว่าไม่ผ่าน**

Run: `cd backend && npx jest tests/realtime/azureProvider.test.ts`
Expected: FAIL — `Cannot find module '../../src/realtime/providers/azure'`

- [ ] **Step 4: เขียน `backend/src/realtime/providers/azure.ts`**

```ts
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
```

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

Run: `cd backend && npx jest tests/realtime/azureProvider.test.ts`
Expected: PASS ทั้ง 6 เคส

- [ ] **Step 6: Commit**

```bash
git add backend/src/realtime/providers/azure.ts backend/tests/realtime/azureProvider.test.ts backend/package.json backend/package-lock.json
git commit -m "feat(asr): stream Thai audio to Azure with the meeting's own vocabulary"
```

---

## Task 6: เลือก provider จากระดับความลับ

เทสต์ในงานนี้คือด่านกันเสียงประชุมลับหลุดออก cloud — ถ้ามันแดง ห้าม merge

**Files:**
- Create: `backend/src/realtime/providers/select.ts`
- Test: `backend/tests/realtime/select.test.ts`

**Interfaces:**
- Consumes: `azureProvider`, `isAzureConfigured` (Task 5), `typhoonProvider` (Task 3), `MeetingPayload`
- Produces: `selectProvider(meeting: MeetingPayload | null): AsrProvider`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `backend/tests/realtime/select.test.ts`:

```ts
jest.mock('../../src/realtime/providers/azure', () => ({
  azureProvider: { name: 'azure', open: jest.fn() },
  isAzureConfigured: jest.fn(() => true),
}));

import { isAzureConfigured } from '../../src/realtime/providers/azure';
import { selectProvider } from '../../src/realtime/providers/select';

const mockConfigured = isAzureConfigured as jest.MockedFunction<typeof isAzureConfigured>;

describe('selectProvider', () => {
  beforeEach(() => mockConfigured.mockReturnValue(true));

  it('top_secret ได้ typhoon เสมอ แม้ Azure พร้อมใช้งาน', () => {
    expect(selectProvider({ id: 'M', confidentialityLevel: 'top_secret' } as never).name).toBe('typhoon');
  });

  it('normal และ restricted ได้ azure', () => {
    expect(selectProvider({ id: 'M', confidentialityLevel: 'normal' } as never).name).toBe('azure');
    expect(selectProvider({ id: 'M', confidentialityLevel: 'restricted' } as never).name).toBe('azure');
  });

  it('ไม่ระบุระดับความลับได้ azure — ค่าตั้งต้นของระบบคือ normal', () => {
    expect(selectProvider({ id: 'M' } as never).name).toBe('azure');
  });

  it('ค่าที่ไม่รู้จักได้ typhoon — ค่าแปลกปลอมต้องตกไปทางที่ปลอดภัยกว่า', () => {
    expect(selectProvider({ id: 'M', confidentialityLevel: 'ลับสุดยอด' } as never).name).toBe('typhoon');
  });

  it('อ่านการประชุมไม่ได้ (null) ได้ typhoon — ไม่รู้ว่าลับหรือเปล่าคือถือว่าลับ', () => {
    expect(selectProvider(null).name).toBe('typhoon');
  });

  it('ไม่ได้ตั้งคีย์ Azure ได้ typhoon', () => {
    mockConfigured.mockReturnValue(false);
    expect(selectProvider({ id: 'M', confidentialityLevel: 'normal' } as never).name).toBe('typhoon');
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `cd backend && npx jest tests/realtime/select.test.ts`
Expected: FAIL — `Cannot find module '../../src/realtime/providers/select'`

- [ ] **Step 3: เขียน `backend/src/realtime/providers/select.ts`**

```ts
// ═══════════════════════════════════════════
// เลือกเส้นทางถอดเสียงจากระดับความลับของการประชุม
//
// ตัดสินที่ server เท่านั้น เฟรมจาก client ไม่มีที่ให้บอกว่าจะใช้ provider ไหน —
// ถ้าให้ client เลือกได้ คนที่แก้ payload เองก็ส่งเสียงประชุมลับออก cloud ได้
// ═══════════════════════════════════════════

import type { MeetingPayload } from '../repositories/meetings';
import { azureProvider, isAzureConfigured } from './azure';
import { typhoonProvider } from './typhoon';
import type { AsrProvider } from './types';

// ระดับที่ยอมให้เสียงออกไปประมวลผลนอกองค์กร — นอกจากสองค่านี้ไปทาง self-host ทั้งหมด
const CLOUD_LEVELS = new Set(['normal', 'restricted']);

export function selectProvider(meeting: MeetingPayload | null): AsrProvider {
  // อ่านการประชุมไม่ได้แปลว่าไม่รู้ว่าห้องนี้ลับแค่ไหน ค่าตั้งต้นต้องเป็นทางที่ปลอดภัยกว่าเสมอ
  if (!meeting) return typhoonProvider;

  const level = typeof meeting.confidentialityLevel === 'string' ? meeting.confidentialityLevel : 'normal';
  if (!CLOUD_LEVELS.has(level)) return typhoonProvider;

  // ไม่มีคีย์ก็ไปทาง typhoon ตามปกติ ไม่ใช่การ fallback อัตโนมัติจาก Azure ที่ล้ม —
  // ตรงนี้คือ "ยังไม่ได้ตั้งค่า" ซึ่งต่างจาก "ตั้งแล้วแต่พัง" (ดู audio.ts)
  return isAzureConfigured() ? azureProvider : typhoonProvider;
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `cd backend && npx jest tests/realtime/select.test.ts`
Expected: PASS ทั้ง 6 เคส

- [ ] **Step 5: Commit**

```bash
git add backend/src/realtime/providers/select.ts backend/tests/realtime/select.test.ts
git commit -m "feat(asr): keep top-secret rooms off the cloud path"
```

---

## Task 7: Active speaker arbitration

**Files:**
- Create: `backend/src/realtime/arbitration.ts`
- Test: `backend/tests/realtime/arbitration.test.ts`

**Interfaces:**
- Consumes: `AsrProvider`, `AsrSession` (Task 2)
- Produces:
  - `claimSlot(meetingId, speakerId, level, now, openSession): Promise<AsrSession | null>`
  - `releaseIdle(now): Promise<void>`
  - `releaseSpeaker(meetingId, speakerId): Promise<void>`
  - `resetArbitration(): void`
  - `maxStreams(): number`, `silenceCloseMs(): number`, `takeoverRatio(): number`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `backend/tests/realtime/arbitration.test.ts`:

```ts
import {
  claimSlot,
  releaseIdle,
  releaseSpeaker,
  resetArbitration,
} from '../../src/realtime/arbitration';
import type { AsrSession } from '../../src/realtime/providers/types';

function fakeSession(): AsrSession & { closed: boolean } {
  const session = {
    closed: false,
    push: jest.fn(),
    close: jest.fn(async () => {
      session.closed = true;
    }),
  };
  return session as never;
}

describe('arbitration', () => {
  beforeEach(() => {
    resetArbitration();
    process.env.ASR_MAX_STREAMS = '1';
    process.env.SILENCE_CLOSE_MS = '1500';
    process.env.ARBITRATION_TAKEOVER_RATIO = '1.5';
  });

  it('คนแรกที่พูดได้ slot', async () => {
    const open = jest.fn(async () => fakeSession());
    const session = await claimSlot('M1', 'U1', 0.2, 1000, open);

    expect(session).not.toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('เฟรมถัดไปของคนเดิมใช้ session เดิม ไม่เปิดใหม่', async () => {
    const open = jest.fn(async () => fakeSession());
    const first = await claimSlot('M1', 'U1', 0.2, 1000, open);
    const second = await claimSlot('M1', 'U1', 0.2, 1250, open);

    expect(second).toBe(first);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('slot เต็ม คนที่ดังไม่พอถูกปฏิเสธ', async () => {
    const open = jest.fn(async () => fakeSession());
    await claimSlot('M1', 'U1', 0.2, 1000, open);
    const second = await claimSlot('M1', 'U2', 0.25, 1000, open);

    expect(second).toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('ดังเกินอัตราแย่ง slot ได้ และ session เดิมถูกปิด', async () => {
    const held = fakeSession();
    const taker = fakeSession();
    const open = jest
      .fn<Promise<AsrSession>, []>()
      .mockResolvedValueOnce(held)
      .mockResolvedValueOnce(taker);

    await claimSlot('M1', 'U1', 0.2, 1000, open);
    const second = await claimSlot('M1', 'U2', 0.4, 1000, open);

    expect(second).toBe(taker);
    expect(held.closed).toBe(true);
  });

  it('เงียบเกิน SILENCE_CLOSE_MS แล้วคืน slot ให้คนถัดไป', async () => {
    const first = fakeSession();
    const open = jest.fn<Promise<AsrSession>, []>().mockResolvedValueOnce(first).mockResolvedValueOnce(fakeSession());

    await claimSlot('M1', 'U1', 0.2, 1000, open);
    await releaseIdle(3000);

    expect(first.closed).toBe(true);
    expect(await claimSlot('M1', 'U2', 0.05, 3100, open)).not.toBeNull();
  });

  it('ยังไม่ถึงเวลาเงียบไม่ปิด session', async () => {
    const first = fakeSession();
    const open = jest.fn(async () => first);

    await claimSlot('M1', 'U1', 0.2, 1000, open);
    await releaseIdle(2000);

    expect(first.closed).toBe(false);
  });

  it('ASR_MAX_STREAMS=2 เปิดพร้อมกันได้สองคน', async () => {
    process.env.ASR_MAX_STREAMS = '2';
    const open = jest.fn(async () => fakeSession());

    expect(await claimSlot('M1', 'U1', 0.2, 1000, open)).not.toBeNull();
    expect(await claimSlot('M1', 'U2', 0.2, 1000, open)).not.toBeNull();
    expect(await claimSlot('M1', 'U3', 0.2, 1000, open)).toBeNull();
  });

  it('slot แยกกันตามห้อง', async () => {
    const open = jest.fn(async () => fakeSession());
    await claimSlot('M1', 'U1', 0.2, 1000, open);

    expect(await claimSlot('M2', 'U2', 0.2, 1000, open)).not.toBeNull();
  });

  it('releaseSpeaker ปิด session ตอนคนออกจากห้อง', async () => {
    const session = fakeSession();
    const open = jest.fn(async () => session);

    await claimSlot('M1', 'U1', 0.2, 1000, open);
    await releaseSpeaker('M1', 'U1');

    expect(session.closed).toBe(true);
    expect(await claimSlot('M1', 'U2', 0.05, 1100, open)).not.toBeNull();
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `cd backend && npx jest tests/realtime/arbitration.test.ts`
Expected: FAIL — `Cannot find module '../../src/realtime/arbitration'`

- [ ] **Step 3: เขียน `backend/src/realtime/arbitration.ts`**

```ts
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
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `cd backend && npx jest tests/realtime/arbitration.test.ts`
Expected: PASS ทั้ง 9 เคส

- [ ] **Step 5: Commit**

```bash
git add backend/src/realtime/arbitration.ts backend/tests/realtime/arbitration.test.ts
git commit -m "feat(asr): give the floor to one speaker at a time"
```

---

## Task 8: ต่อสายใน `audio.ts`

**Files:**
- Modify: `backend/src/realtime/audio.ts:60-147` (แทน `handleAudioFrame`, `forgetSpeaker`, `resetAudioState`)
- Modify: `backend/src/realtime/server.ts:55-70` (ปิด session ตอน socket ปิด)
- Test: `backend/tests/realtime/audio.test.ts` (มีอยู่แล้ว — เพิ่มเคส)

**Interfaces:**
- Consumes: `claimSlot`, `releaseIdle`, `releaseSpeaker`, `resetArbitration` (Task 7); `selectProvider` (Task 6); `buildPhraseList` (Task 4); `parseAudioFrame` (Task 1); `getMeeting` จาก `backend/src/repositories/meetings.ts`
- Produces: `handleAudioFrame(client, raw)`, `forgetSpeaker(client)`, `resetAudioState()` — ชื่อเดิมทั้งหมด `server.ts` ไม่ต้องเปลี่ยน import

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

แก้ `backend/tests/realtime/audio.test.ts` (ไฟล์นี้ต่อ WebSocket จริงกับ MySQL จริง — ดูรูปแบบที่ไฟล์ใช้อยู่แล้วด้านบนของไฟล์)

ลบ `jest.mock('../../src/realtime/asrClient', ...)` เดิมออก แล้วใส่ provider ปลอมแทน — ตอนนี้ `audio.ts`
คุยกับ provider ไม่ใช่ `asrClient` ตรง ๆ แล้ว `openedProviders` เก็บชื่อ provider ที่ถูกเปิดจริงตามลำดับ
ซึ่งเป็นวิธีเดียวที่เทสต์จะพิสูจน์ได้ว่าเสียงวิ่งไปทางไหน:

```ts
const openedProviders: string[] = [];

function fakeProvider(name: 'azure' | 'typhoon') {
  return {
    name,
    open: jest.fn(async (options: { onPartial(t: string): void; onFinal(t: string, s: number): void }) => {
      openedProviders.push(name);
      return {
        // เฟรมแรกยิง partial แล้วตามด้วย final ทันที เพื่อให้เทสต์ตรวจได้ทั้งสองเส้นทาง
        // ในหนึ่งเฟรมโดยไม่ต้องรอเวลาจริง
        push: (_pcm: Buffer, startSec: number) => {
          if (startSec < 2) options.onPartial('สวัส');
          else options.onFinal('สวัสดีครับ', startSec);
        },
        close: jest.fn(async () => {}),
      };
    }),
  };
}

jest.mock('../../src/realtime/providers/azure', () => ({
  azureProvider: fakeProvider('azure'),
  isAzureConfigured: () => true,
}));
jest.mock('../../src/realtime/providers/typhoon', () => ({
  typhoonProvider: fakeProvider('typhoon'),
}));
```

เรียก `openedProviders.length = 0` ใน `beforeEach` ของ describe นี้ และ `resetAudioState()` ตามเดิม

จากนั้นเปลี่ยน `audioFrame()` ให้ใช้ header 8 ไบต์:

```ts
function audioFrame(startMs: number, level = 0.2, sampleCount = 4000): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(startMs, 0);
  header.writeFloatLE(level, 4);
  return Buffer.concat([header, Buffer.alloc(sampleCount * 2)]);
}
```

แล้วเพิ่มเคสใหม่:

```ts
  it('ผลบางส่วนถูกกระจายแต่ไม่ถูกเขียนลง transcript', async () => {
    const socket = await openClient('U-001', 'มาลี');
    const before = (await query('SELECT COUNT(*) AS n FROM transcript_segments WHERE meeting_id = ?', [MEETING])) as any[];

    // provider ปลอมยิง partial เมื่อ startSec < 2 (ดู fakeProvider ด้านบนของไฟล์)
    socket.send(audioFrame(1000));
    const signal = await nextMessage(socket);

    expect(signal.type).toBe('subtitle_text');
    expect(signal.payload.isFinal).toBe(false);

    const after = (await query('SELECT COUNT(*) AS n FROM transcript_segments WHERE meeting_id = ?', [MEETING])) as any[];
    expect(after[0].n).toBe(before[0].n);

    socket.close();
  });

  it('ผลสุดท้ายถูกเขียนลง transcript พร้อมเวลาเริ่มของประโยค', async () => {
    const socket = await openClient('U-001', 'มาลี');

    socket.send(audioFrame(4000));
    await nextMessage(socket);

    const rows = (await query(
      'SELECT text, start_sec FROM transcript_segments WHERE meeting_id = ? ORDER BY id DESC LIMIT 1',
      [MEETING]
    )) as any[];
    expect(rows[0].text).toBe('สวัสดีครับ');
    expect(Number(rows[0].start_sec)).toBe(4);

    socket.close();
  });

  it('ยกระดับเป็น top_secret กลางประชุมแล้วเสียงเลิกวิ่งออก cloud ภายในหนึ่งนาที', async () => {
    // เทสต์นี้คุมกฎที่แคชละเมิดได้ง่ายที่สุด: การเปลี่ยนระดับความลับต้องมีผลจริง
    // ไม่ใช่รอรีสตาร์ต backend
    const socket = await openClient('U-001', 'มาลี');
    socket.send(audioFrame(1000));
    await nextMessage(socket);

    await query("UPDATE meetings SET payload = JSON_SET(payload, '$.confidentialityLevel', 'top_secret') WHERE id = ?", [MEETING]);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);

    socket.send(audioFrame(5000));
    await nextMessage(socket);

    // เฟรมหลังยกระดับต้องเปิด typhoon ไม่ใช่ azure
    expect(openedProviders.at(-1)).toBe('typhoon');

    jest.restoreAllMocks();
    socket.close();
  });

  it('เฟรมที่ header พังถูกทิ้งเงียบ ไม่ปิด socket', async () => {
    const socket = await openClient('U-001', 'มาลี');
    socket.send(Buffer.alloc(4));

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(socket.readyState).toBe(WebSocket.OPEN);

    socket.close();
  });
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `cd backend && npx jest tests/realtime/audio.test.ts`
Expected: FAIL — ยังเรียก `transcribePcm` ตรง จึงไม่มีสัญญาณ `isFinal: false` เลย

- [ ] **Step 3: เขียน `handleAudioFrame` ใหม่**

แทนที่ตั้งแต่ `const MAX_IN_FLIGHT_PER_SPEAKER` จนจบไฟล์ (เก็บ `parseAudioFrame`, `stripOverlap`, `withoutSpaces`, `THAI_COMBINING` และค่าคงที่ของมันไว้ — typhoon provider ใช้อยู่):

```ts
import * as meetings from '../repositories/meetings';
import { claimSlot, releaseIdle, releaseSpeaker, resetArbitration } from './arbitration';
import { selectProvider } from './providers/select';
import { buildPhraseList } from './phrases';

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
```

ลบ `import { asrBaseUrl, transcribePcm } from './asrClient';` และ type `SpeakerState` กับ `speakers` map ที่ไม่ได้ใช้แล้วออก

หลังงานนี้ `audio.ts` เหลือเฉพาะ `parseAudioFrame`, บรรทัด re-export ของ `stripOverlap` (จาก Task 3) และการต่อสายด้านบน

- [ ] **Step 4: แก้ `server.ts` ให้รอ `forgetSpeaker`**

`forgetSpeaker` เป็น async แล้ว ที่ `backend/src/realtime/server.ts:61` และ `:65` เปลี่ยนเป็น:

```ts
      void forgetSpeaker(client);
```

- [ ] **Step 5: รันเทสต์ทั้งชุด realtime**

Run: `cd backend && npx jest tests/realtime`
Expected: PASS ทุกไฟล์ (audio, audioPure, arbitration, phrases, select, typhoonProvider, azureProvider, asrClient, handlers, connection)

- [ ] **Step 6: ตรวจ typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add backend/src/realtime/audio.ts backend/src/realtime/server.ts backend/tests/realtime/audio.test.ts
git commit -m "feat(asr): route live audio through the provider seam"
```

---

## Task 9: `SubtitleBar` แสดงผลบางส่วน

**Files:**
- Modify: `src/components/meeting/SubtitleBar.tsx:16-27`
- Test: `src/components/meeting/SubtitleBar.test.tsx`

**Interfaces:**
- Consumes: `RoomSignal<"subtitle_text">` จาก `src/services/signaling/types.ts`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `src/components/meeting/SubtitleBar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SubtitleBar } from "./SubtitleBar";
import type { RoomSignal } from "@/services/signaling/types";

function signal(senderId: string, text: string, isFinal: boolean): RoomSignal<"subtitle_text"> {
  return {
    type: "subtitle_text",
    senderId,
    senderName: senderId === "U-1" ? "มาลี" : "สมชาย",
    timestamp: Date.now(),
    payload: { text, isFinal, lang: "th-TH" },
  } as RoomSignal<"subtitle_text">;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SubtitleBar", () => {
  it("partial ของผู้พูดคนเดิมแทนที่บรรทัดเดิม ไม่สะสม", () => {
    act(() => root.render(<SubtitleBar latest={signal("U-1", "สวัส", false)} />));
    act(() => root.render(<SubtitleBar latest={signal("U-1", "สวัสดีค", false)} />));
    act(() => root.render(<SubtitleBar latest={signal("U-1", "สวัสดีครับ", false)} />));

    const lines = container.querySelectorAll("p");
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toContain("สวัสดีครับ");
  });

  it("final ปิดบรรทัดนั้น แล้ว partial ถัดไปขึ้นบรรทัดใหม่", () => {
    act(() => root.render(<SubtitleBar latest={signal("U-1", "สวัสดีครับ", true)} />));
    act(() => root.render(<SubtitleBar latest={signal("U-1", "วาระแรก", false)} />));

    const lines = container.querySelectorAll("p");
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain("สวัสดีครับ");
    expect(lines[1].textContent).toContain("วาระแรก");
  });

  it("partial ของคนละคนไม่ทับกัน", () => {
    act(() => root.render(<SubtitleBar latest={signal("U-1", "ผมขอ", false)} />));
    act(() => root.render(<SubtitleBar latest={signal("U-2", "เห็นด้วย", false)} />));

    const lines = container.querySelectorAll("p");
    expect(lines).toHaveLength(2);
  });

  it("แสดงไม่เกินสองบรรทัด", () => {
    act(() => root.render(<SubtitleBar latest={signal("U-1", "หนึ่ง", true)} />));
    act(() => root.render(<SubtitleBar latest={signal("U-1", "สอง", true)} />));
    act(() => root.render(<SubtitleBar latest={signal("U-1", "สาม", true)} />));

    expect(container.querySelectorAll("p")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run src/components/meeting/SubtitleBar.test.tsx`
Expected: FAIL — เคสแรกได้ 2 บรรทัด (ค่าสูงสุดที่โค้ดเดิมเก็บ) แทนที่จะเป็น 1

- [ ] **Step 3: แก้ `SubtitleBar.tsx`**

เพิ่ม `senderId` ลงใน entry แล้วเปลี่ยนตรรกะการต่อบรรทัด:

```tsx
type SubtitleEntry = { senderId: string; senderName: string; text: string; isFinal: boolean; at: number };
```

```tsx
  if (latest && latest !== processedLatest) {
    setProcessedLatest(latest);
    setLines((prev) => {
      const fresh = prev.filter((l) => Date.now() - l.at < 5000);
      const next: SubtitleEntry = {
        senderId: latest.senderId,
        senderName: latest.senderName,
        text: latest.payload.text,
        isFinal: latest.payload.isFinal,
        at: latest.timestamp,
      };

      // ผลบางส่วนไหลมาวินาทีละหลายครั้ง ถ้าต่อท้ายทุกครั้งจะกลายเป็นสิบบรรทัดของประโยคเดียว
      // บรรทัดที่ยังไม่ final ของผู้พูดคนเดิมจึงถูกแทนที่ ส่วนบรรทัดที่ final แล้วค้างไว้ตามเดิม
      const open = fresh.findIndex((l) => l.senderId === next.senderId && !l.isFinal);
      const merged = open === -1 ? [...fresh, next] : fresh.map((l, i) => (i === open ? next : l));

      return merged.slice(-2); // keep max 2 lines
    });
  }
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/components/meeting/SubtitleBar.test.tsx`
Expected: PASS ทั้ง 4 เคส

- [ ] **Step 5: Commit**

```bash
git add src/components/meeting/SubtitleBar.tsx src/components/meeting/SubtitleBar.test.tsx
git commit -m "feat(asr): let a partial line rewrite itself as the speaker talks"
```

---

## Task 10: env, เอกสาร และการวัดผลด้วยมือ

**Files:**
- Modify: `render.yaml`
- Modify: `deploy/RENDER.md`
- Modify: `PROJECT_STATUS.md`
- Create: `docs/superpowers/plans/2026-09-07-asr-measurement.md`

- [ ] **Step 1: เพิ่ม env ใน `render.yaml`**

ต่อท้ายบล็อก `envVars`:

```yaml
      # คีย์ Azure AI Speech — ห้องระดับ normal/restricted ใช้เส้นทางนี้ถอดเสียง
      # ไม่ตั้ง = ทุกห้องตกไปทาง typhoon (ซึ่งบน Render free รันไม่ได้ คำบรรยายจึงเงียบ)
      - key: AZURE_SPEECH_KEY
        sync: false
      - key: AZURE_SPEECH_REGION
        value: southeastasia
      # F0 (ฟรี) เปิดได้ session เดียวพร้อมกันและปรับไม่ได้ ขึ้น S0 แล้วเพิ่มเป็น 4-8 ได้
      - key: ASR_MAX_STREAMS
        value: "1"
      # เงียบเกินเท่านี้ปิด session คืน slot — ทั้งประหยัดค่าใช้จ่ายและปล่อยคิวให้คนถัดไป
      - key: SILENCE_CLOSE_MS
        value: "1500"
      # ต้องดังเป็นกี่เท่าของคนที่ถือ slot อยู่ถึงจะแย่งได้ กันสองคนสลับ slot กันทุกเฟรม
      - key: ARBITRATION_TAKEOVER_RATIO
        value: "1.5"
```

- [ ] **Step 2: เขียนหัวข้อใหม่ใน `deploy/RENDER.md`**

แทรกก่อนหัวข้อ "## 3. frontend บน Vercel":

```markdown
## 2.5 คำบรรยายสด (Azure AI Speech)

ห้องระดับ `normal` กับ `restricted` ถอดเสียงผ่าน Azure ส่วน `top_secret` ใช้ Typhoon
self-host เหมือนเดิม (ดู `deploy/HUGGINGFACE.md`)

1. https://portal.azure.com → Create resource → **Speech** → region **Southeast Asia**
   → pricing tier **F0 (ฟรี 5 ชั่วโมงเสียงต่อเดือน)**
2. หน้า **Keys and Endpoint** คัดลอก **KEY 1**
3. ที่ Render → service `emeeting-backend` → **Environment**

   | ตัวแปร | ค่า |
   |---|---|
   | `AZURE_SPEECH_KEY` | KEY 1 จากข้อ 2 |
   | `AZURE_SPEECH_REGION` | `southeastasia` |

4. ตรวจว่าใช้ได้: เข้าห้องประชุมสองเบราว์เซอร์ กดปุ่มคำบรรยาย พูดภาษาไทย
   ตัวอักษรควรเริ่มไหลภายในราวครึ่งวินาที และประโยคจะ "แก้ตัวเอง" จนกว่าจะจบ

> **F0 เปิดได้ session เดียวพร้อมกัน** ระบบจึงเปิดให้เฉพาะคนที่พูดดังที่สุดในห้อง
> คนที่พูดแทรกจะไม่มีคำบรรยายจนกว่าคนแรกจะหยุด ขึ้น S0 แล้วตั้ง `ASR_MAX_STREAMS`
> เป็น 4-8 เพื่อให้ถอดพร้อมกันหลายคนได้ **ห้ามตั้งเกิน 100** ซึ่งเป็นเพดานของ S0
>
> ค่าใช้จ่ายหลังเกินโควตาฟรีอยู่ที่ราว $0.146 ต่อชั่วโมงเสียง และคิดตามจำนวน session
> ที่เปิด ไม่ใช่จำนวนคนในห้อง — ประชุมหนึ่งชั่วโมงที่ `ASR_MAX_STREAMS=1` คิดหนึ่งชั่วโมง
```

- [ ] **Step 3: อัปเดต `PROJECT_STATUS.md`**

ในหัวข้อ "### ⏳ ยังเลื่อน" แทนบรรทัด Server-Side Thai ASR เดิมด้วย:

```markdown
- ⏳ คำบรรยายสด — ห้อง `normal`/`restricted` ถอดผ่าน Azure AI Speech (streaming, มีผลบางส่วน), ห้อง `top_secret` ใช้ Typhoon self-host ตามเดิม — โค้ดครบแล้ว เหลือตั้งคีย์ Azure บน Render กับวัด CER จากเสียงประชุมจริง (ดู `docs/superpowers/specs/2026-09-07-realtime-thai-asr-cloud-design.md`)
```

- [ ] **Step 4: เขียนขั้นตอนการวัดผลด้วยมือ**

สร้าง `docs/superpowers/plans/2026-09-07-asr-measurement.md`:

```markdown
# วัดผล ASR ก่อนประกาศว่าเสร็จ

เกณฑ์เหล่านี้มาจาก spec (`2026-09-07-realtime-thai-asr-cloud-design.md`) และเป็น
ตัวตัดสินว่าการเปลี่ยนมาใช้ Azure คุ้มจริงหรือไม่ ถ้าไม่ผ่าน ให้กลับไปทบทวน spec
ไม่ใช่ปรับเกณฑ์ให้ผ่าน

## เตรียมเสียง

อัดเสียงประชุมจริง (ไม่ใช่ TTS) อย่างน้อย 5 นาที มีผู้พูดอย่างน้อย 3 คน
พร้อมข้อความถอดที่คนพิมพ์เอง เก็บไว้ที่ `asr/tests/fixtures/meeting-real/`

**ห้ามใช้เสียง TTS** — Phase F วัดด้วย TTS แล้วได้ CER 0.024-0.044 ซึ่งต่ำกว่า
ความจริงมาก (ผู้พัฒนา Typhoon ประกาศ 0.0984 บนข้อมูลจริง) ถ้ารอบนี้ใช้ TTS อีก
ตัวเลขที่ได้ก็เทียบอะไรไม่ได้

## ตารางที่ต้องกรอกให้ครบ

| วัด | เกณฑ์ผ่าน | ผลจริง |
|---|---|---|
| CER — Azure + phrase list | < 0.0438 | |
| CER — Azure ไม่มี phrase list | (บันทึกไว้เทียบ) | |
| CER — Typhoon (ค่าอ้างอิงเดิม) | 0.0438 | |
| หน่วง partial แรกหลังเริ่มพูด | < 500 ms | |
| หน่วง final หลังจบประโยค | < 1500 ms | |
| ค่าใช้จ่ายประชุม 1 ชม. 5 คน | ใกล้ 1 stream-hour | |

ช่องที่สองมีไว้พิสูจน์ว่า phrase list คุ้มจริง ถ้าสองแถวแรกต่างกันไม่ถึง 10%
แปลว่า phrase list ไม่ได้ช่วย และควรตัดโค้ดส่วนนั้นทิ้งแทนที่จะดูแลมันต่อไป

## วิธีวัดค่าใช้จ่าย

Azure portal → resource → **Metrics** → `SpeechSessionDuration` ระหว่างช่วงที่ประชุม
ค่าที่ได้ต้องใกล้ความยาวประชุม ไม่ใช่ความยาวประชุม × จำนวนคน ถ้าโตตามจำนวนคน
แปลว่า arbitration ไม่ทำงาน — ไล่ดูว่า `ASR_MAX_STREAMS` ถูกตั้งเกิน 1 หรือเปล่า
```

- [ ] **Step 5: ตรวจว่าทุกอย่างยังผ่าน**

Run: `cd backend && npx jest`
Expected: PASS ทั้งหมด

Run: `npx vitest run`
Expected: PASS ทั้งหมด

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add render.yaml deploy/RENDER.md PROJECT_STATUS.md docs/superpowers/plans/2026-09-07-asr-measurement.md
git commit -m "docs(asr): how to turn on live captions and prove they are better"
```

---

## หลังทำครบทุก Task

1. Deploy: ตั้ง `AZURE_SPEECH_KEY` บน Render (ดู `deploy/RENDER.md` หัวข้อ 2.5) รอ redeploy
2. วัดผลตาม `docs/superpowers/plans/2026-09-07-asr-measurement.md` แล้วกรอกตารางให้ครบ
3. ถ้า CER ไม่ผ่านเกณฑ์ อย่าเพิ่งประกาศว่าเสร็จ — กลับไปที่ spec

**สิ่งที่แผนนี้ไม่ได้ทำ (ตามขอบเขตใน spec):** Custom Speech แบบเทรนโมเดล, speaker diarization ของ Azure, fallback อัตโนมัติระหว่าง provider, การลบ Typhoon ทิ้ง, deploy Typhoon ขึ้น HF Spaces
