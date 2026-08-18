# ZegoCloud ASR + Claude Summarization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แทนที่ mock transcription provider และ mock summarizer ด้วยของจริง — ถอดคำพูดจาก ZEGOCLOUD Cloud
Real-Time ASR, สรุปประชุมด้วย Claude API — ทั้งหมดผ่าน Next.js API routes โดยไม่ต้อง deploy `backend/`
Express แยก

**Architecture:** Server-side lib (`src/lib/zegoServerApi.ts`, `zegoAsr.ts`, `claudeSummarize.ts`,
`transcriptStore.ts`) ทำงานหนักทั้งหมด — API routes (`src/app/api/transcription/*`, `api/summarize`)
เป็นแค่ตัวเช็ค env/validate input แล้วเรียก lib — client-side provider (`zegoAsrProvider.ts`,
`claudeSummarizer.ts`) implement contract เดิม (`TranscriptionProvider`/`Summarizer`) เรียก route ผ่าน
`fetch` ธรรมดา ตามแพทเทิร์นเดียวกับ `src/services/credentials.ts` ที่มีอยู่แล้วสำหรับวิดีโอ

**Tech Stack:** Next.js 16 API routes (Node runtime), `node:crypto` (MD5 signature — มีอยู่แล้วใน
Node ไม่ต้องเพิ่ม dependency), Vitest (ยังไม่มี test runner ในโปรเจกต์ — ต้องติดตั้งใหม่)

## Global Constraints

- ห้าม silent fallback เป็น mock เมื่อ credential ขาด — ต้อง error ชัดเจน (ตามแพทเทิร์นเดิมใน
  `src/app/api/video/token/route.ts`)
- ห้ามแก้ `TranscriptSegment`, `MeetingTranscript`, `TranscriptionProvider`, `AgendaSummary`,
  `MeetingSummary`, `Summarizer`, `AgendaWindow` type shape เดิม — เพิ่มได้แค่ค่าใน `id` union
- `MeetingSummary.isDraft` ต้องเป็น `true` เสมอ (ห้าม AI รับรองผลเอง — กฎเดิมใน `summarize/types.ts`)
- Roster (ชื่อผู้เข้าร่วม) อยู่ใน client-side mock data เท่านั้น (ระบบนี้ไม่มี session/DB ฝั่ง server) —
  ห้ามพยายาม resolve `speakerName` ฝั่ง server, ต้องทำฝั่ง client หลังดึง transcript ดิบมาแล้ว
- ทุก API route ใหม่ต้องเช็ค `origin` เทียบ `request.nextUrl.origin` แบบเดียวกับ `api/video/token`
  ก่อนทำงานต่อ (กัน cross-origin script ยิงตรง)
- ใช้ `console.error("[/api/...]", error)` + คืน error message ภาษาไทยที่อ่านแล้วรู้เรื่อง ตามแพทเทิร์น
  `api/video/token/route.ts` ทุก route

---

## Task 1: ติดตั้ง Vitest (test runner ยังไม่มีในโปรเจกต์)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/sanity.test.ts` (ลบทิ้งได้หลัง verify — แค่ยืนยันว่า runner ทำงาน)

**Interfaces:**
- Produces: คำสั่ง `npm test` รัน vitest ได้ — ทุก task ถัดไปใช้คำสั่งนี้รัน test

- [ ] **Step 1: ติดตั้ง vitest**

```bash
npm install --save-dev vitest
```

- [ ] **Step 2: สร้าง `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 3: เพิ่ม script ใน `package.json`**

แก้ `"scripts"` เพิ่มบรรทัด:
```json
"test": "vitest run"
```

- [ ] **Step 4: เขียน sanity test**

`src/lib/sanity.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("vitest sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: รัน test ยืนยัน runner ทำงาน**

Run: `npm test`
Expected: PASS 1 test — `vitest sanity > runs`

- [ ] **Step 6: ลบ sanity test แล้ว commit**

```bash
rm src/lib/sanity.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: ติดตั้ง vitest สำหรับ unit test"
```

---

## Task 2: `zegoServerApi.ts` — ตัวเซ็น signature กลางของ ZegoCloud Server API

**Files:**
- Create: `src/lib/zegoServerApi.ts`
- Test: `src/lib/zegoServerApi.test.ts`

**Interfaces:**
- Produces:
  `callZegoServerApi<T>(baseUrl: string, action: string, appId: number, serverSecret: string, params: Record<string, unknown>): Promise<{ Code: number; Message: string; RequestId: string; Data?: T }>`
  `computeSignature(appId: number, nonce: string, serverSecret: string, timestamp: number): string`
  (export แยกเพื่อ unit test ได้โดยไม่ต้อง mock fetch)

อ้างอิงสูตรจาก [Server API Signing](https://docs.zegocloud.com/article/9781):
`Signature = md5(AppId + SignatureNonce + ServerSecret + Timestamp)` (hex, lowercase, 32 ตัว)

- [ ] **Step 1: เขียน test ของ `computeSignature` ก่อน (known-good input/output)**

`src/lib/zegoServerApi.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { computeSignature, callZegoServerApi } from "./zegoServerApi";
import { createHash } from "node:crypto";

describe("computeSignature", () => {
  it("คำนวณ md5(appId + nonce + secret + timestamp) ตรงสูตร ZegoCloud", () => {
    const appId = 123456;
    const nonce = "abcdef0123456789";
    const secret = "01234567890123456789012345678901";
    const timestamp = 1700000000;
    const expected = createHash("md5")
      .update(`${appId}${nonce}${secret}${timestamp}`)
      .digest("hex");
    expect(computeSignature(appId, nonce, secret, timestamp)).toBe(expected);
  });
});

describe("callZegoServerApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ยิง POST ไป baseUrl พร้อม query params (Action/AppId/Signature ฯลฯ) และ body เป็น JSON ของ params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ Code: 0, Message: "Success", RequestId: "r1", Data: { TaskId: "t1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callZegoServerApi<{ TaskId: string }>(
      "https://example.zegotech.cn/",
      "StartRealtimeASRTask",
      123456,
      "01234567890123456789012345678901",
      { RoomId: "room-1" }
    );

    expect(result.Code).toBe(0);
    expect(result.Data?.TaskId).toBe("t1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("Action=StartRealtimeASRTask");
    expect(String(url)).toContain("AppId=123456");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ RoomId: "room-1" });
  });
});
```

- [ ] **Step 2: รัน test ยืนยันว่า fail (ยังไม่มีไฟล์ implementation)**

Run: `npm test -- zegoServerApi`
Expected: FAIL — `Cannot find module './zegoServerApi'`

- [ ] **Step 3: เขียน implementation**

`src/lib/zegoServerApi.ts`:
```typescript
// ═══════════════════════════════════════════
// ZegoCloud Server API — ตัวเซ็น signature กลาง ใช้ร่วมกันทุก ZegoCloud Server API
// (ASR, และในอนาคตตัวอื่นถ้าเพิ่ม) — ไม่ใช้กับ video token04 (คนละ signing scheme, ดู src/lib/zegoToken.ts)
//
// อ้างอิง: https://docs.zegocloud.com/article/9781
// Signature = md5(AppId + SignatureNonce + ServerSecret + Timestamp), hex lowercase 32 ตัว
// ═══════════════════════════════════════════

import { createHash, randomBytes } from "node:crypto";

export type ZegoServerApiResponse<T> = {
  Code: number;
  Message: string;
  RequestId: string;
  Data?: T;
};

export function computeSignature(
  appId: number,
  nonce: string,
  serverSecret: string,
  timestamp: number
): string {
  return createHash("md5")
    .update(`${appId}${nonce}${serverSecret}${timestamp}`)
    .digest("hex");
}

function signatureNonce(): string {
  // 16-bit hexadecimal random string ตามที่เอกสารระบุ
  return randomBytes(8).toString("hex");
}

/**
 * เรียก ZegoCloud Server API ตัวใดก็ได้ที่ใช้ signing scheme นี้
 * public params (Action/AppId/SignatureNonce/Timestamp/SignatureVersion/Signature) ไปใน query string
 * business params (เช่น RoomId, TaskId) ไปใน JSON body — ตามตัวอย่างจริงใน ZegoCloud docs
 */
export async function callZegoServerApi<T>(
  baseUrl: string,
  action: string,
  appId: number,
  serverSecret: string,
  params: Record<string, unknown>
): Promise<ZegoServerApiResponse<T>> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = signatureNonce();
  const signature = computeSignature(appId, nonce, serverSecret, timestamp);

  const query = new URLSearchParams({
    Action: action,
    AppId: String(appId),
    SignatureNonce: nonce,
    Timestamp: String(timestamp),
    SignatureVersion: "2.0",
    Signature: signature,
  });

  const res = await fetch(`${baseUrl}?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  return (await res.json()) as ZegoServerApiResponse<T>;
}
```

- [ ] **Step 4: รัน test ยืนยันผ่าน**

Run: `npm test -- zegoServerApi`
Expected: PASS ทั้ง 2 test

- [ ] **Step 5: Commit**

```bash
git add src/lib/zegoServerApi.ts src/lib/zegoServerApi.test.ts
git commit -m "feat: zegoServerApi — ตัวเซ็น signature กลางของ ZegoCloud Server API"
```

---

## Task 3: `zegoAsr.ts` — เรียก Start/Stop Cloud Real-Time ASR

**Files:**
- Create: `src/lib/zegoAsr.ts`
- Test: `src/lib/zegoAsr.test.ts`

**Interfaces:**
- Consumes: `callZegoServerApi` จาก Task 2
- Produces:
  `startAsrTask(appId: number, serverSecret: string, roomId: string): Promise<string>` (คืน TaskId)
  `stopAsrTask(appId: number, serverSecret: string, taskId: string): Promise<void>`
  ทั้งสอง throw `Error` เมื่อ `Code !== 0`

อ้างอิง: [Start API](https://www.zegocloud.com/docs/cloud-realtime-asr/api-reference/start),
[Stop API](https://www.zegocloud.com/docs/cloud-realtime-asr/api-reference/stop) —
`Action: StartRealtimeASRTask/StopRealtimeASRTask`, path `https://cloud-realtime-asr-api.zegotech.cn/`

- [ ] **Step 1: เขียน test**

`src/lib/zegoAsr.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { startAsrTask, stopAsrTask } from "./zegoAsr";

describe("startAsrTask", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("คืน TaskId เมื่อ Code เป็น 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ Code: 0, Message: "Success", RequestId: "r1", Data: { TaskId: "task-1" } }),
      })
    );
    const taskId = await startAsrTask(1, "s".repeat(32), "room-1");
    expect(taskId).toBe("task-1");
  });

  it("throw เมื่อ Code ไม่ใช่ 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ Code: 1000001, Message: "AppId invalid", RequestId: "r1" }),
      })
    );
    await expect(startAsrTask(1, "s".repeat(32), "room-1")).rejects.toThrow(/1000001/);
  });
});

describe("stopAsrTask", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolve เมื่อ Code เป็น 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ Code: 0, Message: "Success", RequestId: "r1" }),
      })
    );
    await expect(stopAsrTask(1, "s".repeat(32), "task-1")).resolves.toBeUndefined();
  });

  it("throw เมื่อ Code ไม่ใช่ 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ Code: 5000001, Message: "Task not found", RequestId: "r1" }),
      })
    );
    await expect(stopAsrTask(1, "s".repeat(32), "bad-task")).rejects.toThrow(/5000001/);
  });
});
```

- [ ] **Step 2: รัน test ยืนยัน fail**

Run: `npm test -- zegoAsr`
Expected: FAIL — module not found

- [ ] **Step 3: เขียน implementation**

`src/lib/zegoAsr.ts`:
```typescript
// ═══════════════════════════════════════════
// ZegoCloud Cloud Real-Time ASR — Start/Stop task ผูกกับ RTC room
// อ้างอิง: https://www.zegocloud.com/docs/cloud-realtime-asr/api-reference/{start,stop}
// ═══════════════════════════════════════════

import { callZegoServerApi } from "./zegoServerApi";

const ASR_BASE_URL = "https://cloud-realtime-asr-api.zegotech.cn/";

type StartAsrData = { TaskId: string };

/** เริ่มถอดเสียงทั้งห้อง (RecognitionRange: 0 = ทุก stream) — คืน TaskId ใช้ตอน stop */
export async function startAsrTask(
  appId: number,
  serverSecret: string,
  roomId: string
): Promise<string> {
  const res = await callZegoServerApi<StartAsrData>(
    ASR_BASE_URL,
    "StartRealtimeASRTask",
    appId,
    serverSecret,
    { RoomId: roomId, RecognitionRange: 0 }
  );
  if (res.Code !== 0 || !res.Data?.TaskId) {
    throw new Error(`ZegoCloud StartRealtimeASRTask ล้มเหลว: [${res.Code}] ${res.Message}`);
  }
  return res.Data.TaskId;
}

export async function stopAsrTask(
  appId: number,
  serverSecret: string,
  taskId: string
): Promise<void> {
  const res = await callZegoServerApi(ASR_BASE_URL, "StopRealtimeASRTask", appId, serverSecret, {
    TaskId: taskId,
  });
  if (res.Code !== 0) {
    throw new Error(`ZegoCloud StopRealtimeASRTask ล้มเหลว: [${res.Code}] ${res.Message}`);
  }
}
```

- [ ] **Step 4: รัน test ยืนยันผ่าน**

Run: `npm test -- zegoAsr`
Expected: PASS ทั้ง 4 test

- [ ] **Step 5: Commit**

```bash
git add src/lib/zegoAsr.ts src/lib/zegoAsr.test.ts
git commit -m "feat: zegoAsr — เรียก Start/Stop Cloud Real-Time ASR"
```

---

## Task 4: `transcriptStore.ts` — เก็บ transcript ชั่วคราวฝั่ง server ต่อ meetingId

**Files:**
- Create: `src/lib/transcriptStore.ts`
- Test: `src/lib/transcriptStore.test.ts`

**Interfaces:**
- Consumes: `TranscriptSegment`, `MeetingTranscript`, `TranscriptStatus` จาก `@/services/transcription/types`
- Produces:
  `initTranscript(meetingId: string, taskId: string): void`
  `appendSegments(meetingId: string, segments: TranscriptSegment[]): void`
  `markReady(meetingId: string): void`
  `markFailed(meetingId: string): void`
  `getTranscript(meetingId: string): MeetingTranscript`
  `getTaskId(meetingId: string): string | null`

⚠️ In-memory (`Map` ระดับ module) — อยู่รอดแค่ระหว่าง serverless instance เดียวกันมีชีวิต ไม่ persist
ข้าม deploy/restart/หลาย instance พร้อมกัน (out of scope ตาม spec — ต้องมี DB จริงถ้าจะแก้)

- [ ] **Step 1: เขียน test**

`src/lib/transcriptStore.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  initTranscript,
  appendSegments,
  markReady,
  markFailed,
  getTranscript,
  getTaskId,
} from "./transcriptStore";

describe("transcriptStore", () => {
  it("meetingId ที่ไม่เคย init คืน status none, segments ว่าง", () => {
    expect(getTranscript("never-seen")).toEqual({
      meetingId: "never-seen",
      status: "none",
      language: "th",
      segments: [],
    });
    expect(getTaskId("never-seen")).toBeNull();
  });

  it("init → append → markReady ได้ transcript ครบ", () => {
    initTranscript("m1", "task-1");
    expect(getTaskId("m1")).toBe("task-1");
    expect(getTranscript("m1").status).toBe("processing");

    appendSegments("m1", [
      { speakerId: "u1", speakerName: "u1", startSec: 0, endSec: 5, text: "สวัสดี" },
    ]);
    appendSegments("m1", [
      { speakerId: "u2", speakerName: "u2", startSec: 5, endSec: 10, text: "สวัสดีครับ" },
    ]);
    markReady("m1");

    const result = getTranscript("m1");
    expect(result.status).toBe("ready");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[1].text).toBe("สวัสดีครับ");
  });

  it("markFailed เปลี่ยน status เป็น failed", () => {
    initTranscript("m2", "task-2");
    markFailed("m2");
    expect(getTranscript("m2").status).toBe("failed");
  });
});
```

- [ ] **Step 2: รัน test ยืนยัน fail**

Run: `npm test -- transcriptStore`
Expected: FAIL — module not found

- [ ] **Step 3: เขียน implementation**

`src/lib/transcriptStore.ts`:
```typescript
// ═══════════════════════════════════════════
// Transcript Store — เก็บผลถอดเสียงชั่วคราวฝั่ง server ต่อ meetingId
//
// ⚠️ In-memory (module-level Map) — อยู่รอดแค่ระหว่าง serverless instance เดียวกันมีชีวิต
// ไม่ persist ข้าม deploy/restart หรือข้าม instance คนละตัว ถ้าต้องการ sync ข้ามเครื่อง/ถาวร
// ต้องมี DB จริง (out of scope รอบนี้ — ดู docs/superpowers/specs/2026-08-18-zegocloud-asr-summary-design.md)
// ═══════════════════════════════════════════

import type { MeetingTranscript, TranscriptSegment, TranscriptStatus } from "@/services/transcription/types";

type StoreEntry = {
  status: TranscriptStatus;
  language: string;
  segments: TranscriptSegment[];
  taskId: string | null;
};

const store = new Map<string, StoreEntry>();

export function initTranscript(meetingId: string, taskId: string): void {
  store.set(meetingId, { status: "processing", language: "th", segments: [], taskId });
}

export function appendSegments(meetingId: string, segments: TranscriptSegment[]): void {
  const entry = store.get(meetingId);
  if (!entry) {
    store.set(meetingId, { status: "processing", language: "th", segments: [...segments], taskId: null });
    return;
  }
  entry.segments.push(...segments);
}

export function markReady(meetingId: string): void {
  const entry = store.get(meetingId);
  if (entry) entry.status = "ready";
}

export function markFailed(meetingId: string): void {
  const entry = store.get(meetingId);
  if (entry) entry.status = "failed";
  else store.set(meetingId, { status: "failed", language: "th", segments: [], taskId: null });
}

export function getTranscript(meetingId: string): MeetingTranscript {
  const entry = store.get(meetingId);
  if (!entry) return { meetingId, status: "none", language: "th", segments: [] };
  return { meetingId, status: entry.status, language: entry.language, segments: entry.segments };
}

export function getTaskId(meetingId: string): string | null {
  return store.get(meetingId)?.taskId ?? null;
}
```

- [ ] **Step 4: รัน test ยืนยันผ่าน**

Run: `npm test -- transcriptStore`
Expected: PASS ทั้ง 3 test

- [ ] **Step 5: Commit**

```bash
git add src/lib/transcriptStore.ts src/lib/transcriptStore.test.ts
git commit -m "feat: transcriptStore — เก็บผลถอดเสียงชั่วคราวฝั่ง server ต่อ meetingId"
```

---

## Task 5: `claudeSummarize.ts` — logic ล้วนสำหรับสรุปด้วย Claude (prompt/parse/windowing)

**Files:**
- Create: `src/lib/claudeSummarize.ts`
- Test: `src/lib/claudeSummarize.test.ts`

**Interfaces:**
- Consumes: `MeetingTranscript`, `TranscriptSegment` จาก `@/services/transcription/types`;
  `AgendaWindow`, `AgendaSummary`, `MeetingSummary` จาก `@/services/summarize/types`
- Produces:
  `segmentsInWindow(segments: TranscriptSegment[], window: AgendaWindow): TranscriptSegment[]`
  `transcriptToText(segments: TranscriptSegment[]): string`
  `buildOverallPrompt(text: string): string`
  `buildAgendaPrompt(text: string): string`
  `parseAgendaJson(agendaId: string, raw: string): AgendaSummary` (throw ถ้า parse ไม่ได้)
  `callClaude(apiKey: string, prompt: string): Promise<string>` (เดียวที่มี side effect — เรียก
  Claude Messages API ตรง ผ่าน `fetch`, ไม่ใช้ SDK เพิ่ม dependency)

- [ ] **Step 1: เขียน test ของฟังก์ชัน pure ทั้งหมดก่อน (ไม่ต้อง mock fetch)**

`src/lib/claudeSummarize.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  segmentsInWindow,
  transcriptToText,
  buildOverallPrompt,
  buildAgendaPrompt,
  parseAgendaJson,
  callClaude,
} from "./claudeSummarize";
import type { TranscriptSegment } from "@/services/transcription/types";

const segments: TranscriptSegment[] = [
  { speakerId: "u1", speakerName: "ประธาน", startSec: 0, endSec: 10, text: "เปิดประชุม" },
  { speakerId: "u2", speakerName: "เลขาฯ", startSec: 40, endSec: 50, text: "แจ้งวาระ" },
  { speakerId: "u1", speakerName: "ประธาน", startSec: 100, endSec: 110, text: "ปิดประชุม" },
];

describe("segmentsInWindow", () => {
  it("กรองเฉพาะ segment ที่อยู่ในช่วงเวลาที่กำหนด", () => {
    const result = segmentsInWindow(segments, { agendaId: "a1", startSec: 30, endSec: 60 });
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("แจ้งวาระ");
  });
});

describe("transcriptToText", () => {
  it("รวม segment เป็นข้อความ [ชื่อผู้พูด] ข้อความ ต่อบรรทัด", () => {
    expect(transcriptToText(segments.slice(0, 2))).toBe(
      "[ประธาน] เปิดประชุม\n[เลขาฯ] แจ้งวาระ"
    );
  });
});

describe("buildOverallPrompt / buildAgendaPrompt", () => {
  it("prompt มีข้อความ transcript อยู่ในตัว", () => {
    expect(buildOverallPrompt("บทสนทนาทดสอบ")).toContain("บทสนทนาทดสอบ");
    expect(buildAgendaPrompt("บทสนทนาทดสอบ")).toContain("บทสนทนาทดสอบ");
  });
});

describe("parseAgendaJson", () => {
  it("parse JSON ตรง schema ได้", () => {
    const raw = JSON.stringify({
      discussion: "อภิปรายเรื่องงบประมาณ",
      resolutions: ["เห็นชอบ"],
      actionItems: [{ text: "จัดทำรายงาน", ownerName: "เลขาฯ" }],
    });
    const result = parseAgendaJson("ag-1", raw);
    expect(result).toEqual({
      agendaId: "ag-1",
      discussion: "อภิปรายเรื่องงบประมาณ",
      resolutions: ["เห็นชอบ"],
      actionItems: [{ text: "จัดทำรายงาน", ownerName: "เลขาฯ" }],
    });
  });

  it("ตัด code fence ```json ... ``` ออกก่อน parse ได้ (Claude มักตอบแบบนี้)", () => {
    const raw = "```json\n" + JSON.stringify({ discussion: "d", resolutions: [], actionItems: [] }) + "\n```";
    expect(parseAgendaJson("ag-2", raw).discussion).toBe("d");
  });

  it("throw เมื่อ raw ไม่ใช่ JSON ที่ parse ได้", () => {
    expect(() => parseAgendaJson("ag-3", "ไม่ใช่ JSON")).toThrow();
  });
});

describe("callClaude", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ยิง POST ไป Claude Messages API พร้อม header ที่ถูกต้อง คืน content[0].text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: "text", text: "สรุปผลลัพธ์" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callClaude("test-key", "prompt ทดสอบ");
    expect(result).toBe("สรุปผลลัพธ์");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("test-key");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    expect(JSON.parse(init.body).messages[0].content).toBe("prompt ทดสอบ");
  });

  it("throw เมื่อ HTTP ไม่ ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve("unauthorized") })
    );
    await expect(callClaude("bad-key", "prompt")).rejects.toThrow(/401/);
  });
});
```

- [ ] **Step 2: รัน test ยืนยัน fail**

Run: `npm test -- claudeSummarize`
Expected: FAIL — module not found

- [ ] **Step 3: เขียน implementation**

`src/lib/claudeSummarize.ts`:
```typescript
// ═══════════════════════════════════════════
// Claude Summarize — logic ล้วนของการสรุปประชุมด้วย Claude API
// เรียก Claude Messages API ตรงผ่าน fetch (ไม่ใช้ @anthropic-ai/sdk — โปรเจกต์นี้ไม่มี SDK
// ผู้ให้บริการอื่นติดตั้งอยู่แล้ว เรียก REST ตรงตามแพทเทิร์นเดียวกับ zegoAsr.ts)
// ═══════════════════════════════════════════

import type { TranscriptSegment } from "@/services/transcription/types";
import type { AgendaWindow, AgendaSummary } from "@/services/summarize/types";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-5";

export function segmentsInWindow(
  segments: TranscriptSegment[],
  window: AgendaWindow
): TranscriptSegment[] {
  return segments.filter((s) => s.startSec >= window.startSec && s.endSec <= window.endSec);
}

export function transcriptToText(segments: TranscriptSegment[]): string {
  return segments.map((s) => `[${s.speakerName}] ${s.text}`).join("\n");
}

export function buildOverallPrompt(transcriptText: string): string {
  return (
    "คุณคือเลขานุการช่วยสรุปประชุมภาษาไทย สรุปบทสนทนาทั้งหมดต่อไปนี้เป็นย่อหน้าเดียว กระชับ ใจความครบ " +
    "ตอบเป็นข้อความล้วน ไม่ต้องมี JSON หรือ markdown:\n\n" +
    transcriptText
  );
}

export function buildAgendaPrompt(transcriptText: string): string {
  return [
    "คุณคือเลขานุการช่วยสรุปประชุมภาษาไทย สรุปบทสนทนาต่อไปนี้เป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON:",
    '{"discussion": string, "resolutions": string[], "actionItems": [{"text": string, "ownerName"?: string}]}',
    "บทสนทนา:",
    transcriptText,
  ].join("\n\n");
}

export function parseAgendaJson(agendaId: string, raw: string): AgendaSummary {
  const cleaned = raw.trim().replace(/^```json\s*|\s*```$/g, "");
  const parsed = JSON.parse(cleaned) as {
    discussion?: unknown;
    resolutions?: unknown;
    actionItems?: unknown;
  };
  return {
    agendaId,
    discussion: String(parsed.discussion ?? ""),
    resolutions: Array.isArray(parsed.resolutions) ? parsed.resolutions.map(String) : [],
    actionItems: Array.isArray(parsed.actionItems)
      ? parsed.actionItems.map((a) => {
          const item = a as { text?: unknown; ownerName?: unknown };
          return {
            text: String(item.text ?? ""),
            ownerName: item.ownerName ? String(item.ownerName) : undefined,
          };
        })
      : [],
  };
}

export async function callClaude(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API HTTP ${res.status}: ${body}`);
  }

  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = json.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Claude API ตอบกลับไม่มี content[0].text");
  }
  return text;
}
```

- [ ] **Step 4: รัน test ยืนยันผ่าน**

Run: `npm test -- claudeSummarize`
Expected: PASS ทั้ง 8 test

- [ ] **Step 5: Commit**

```bash
git add src/lib/claudeSummarize.ts src/lib/claudeSummarize.test.ts
git commit -m "feat: claudeSummarize — logic สรุปประชุมด้วย Claude API (prompt/parse/windowing)"
```

---

## Task 6: API routes — `/api/transcription/{start,stop,callback,result}`

**Files:**
- Create: `src/app/api/transcription/start/route.ts`
- Create: `src/app/api/transcription/stop/route.ts`
- Create: `src/app/api/transcription/callback/route.ts`
- Create: `src/app/api/transcription/result/route.ts`
- Test: `src/app/api/transcription/callback/route.test.ts`

**Interfaces:**
- Consumes: `startAsrTask`/`stopAsrTask` (Task 3), `initTranscript`/`appendSegments`/`markReady`/
  `markFailed`/`getTranscript`/`getTaskId` (Task 4)
- Produces: 4 HTTP endpoint ตามตารางใน spec — `start`/`stop` รับ `{ meetingId, roomId }` (`stop` รับแค่
  `meetingId`), `callback` รับ payload ดิบจาก ZegoCloud, `result` รับ `?meetingId=` คืน `MeetingTranscript`

- [ ] **Step 1: เขียน `start/route.ts`**

```typescript
// ═══════════════════════════════════════════
// POST /api/transcription/start — เริ่มถอดเสียงห้องประชุมด้วย ZegoCloud Cloud Real-Time ASR
// เรียกครั้งเดียวโดย host ตอนเข้าห้อง (ดู live/[id]/page.tsx)
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { startAsrTask } from "@/lib/zegoAsr";
import { initTranscript } from "@/lib/transcriptStore";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  const appId = Number(process.env.ZEGO_APP_ID);
  const secret = process.env.ZEGO_SERVER_SECRET;
  if (!appId || !secret) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้งค่า ZEGO_APP_ID / ZEGO_SERVER_SECRET ใน .env.local — ไม่มี mock ให้ fallback" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const meetingId = body?.meetingId as string | undefined;
  const roomId = body?.roomId as string | undefined;
  if (!meetingId || !roomId) {
    return NextResponse.json({ error: "Missing required fields: meetingId, roomId" }, { status: 400 });
  }

  try {
    const taskId = await startAsrTask(appId, secret, roomId);
    initTranscript(meetingId, taskId);
    return NextResponse.json({ taskId });
  } catch (error) {
    console.error("[/api/transcription/start] failed:", error);
    const detail = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: `เริ่มถอดเสียงไม่สำเร็จ: ${detail}` }, { status: 500 });
  }
}
```

- [ ] **Step 2: เขียน `stop/route.ts`**

```typescript
// ═══════════════════════════════════════════
// POST /api/transcription/stop — หยุดถอดเสียง ตอน host ออกจากห้อง/ประชุมจบ
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { stopAsrTask } from "@/lib/zegoAsr";
import { getTaskId, markReady } from "@/lib/transcriptStore";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  const appId = Number(process.env.ZEGO_APP_ID);
  const secret = process.env.ZEGO_SERVER_SECRET;
  if (!appId || !secret) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้งค่า ZEGO_APP_ID / ZEGO_SERVER_SECRET ใน .env.local — ไม่มี mock ให้ fallback" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const meetingId = body?.meetingId as string | undefined;
  if (!meetingId) {
    return NextResponse.json({ error: "Missing required field: meetingId" }, { status: 400 });
  }

  const taskId = getTaskId(meetingId);
  if (!taskId) {
    return NextResponse.json(
      { error: `ไม่พบ ASR task ที่กำลังทำงานสำหรับ meetingId=${meetingId}` },
      { status: 404 }
    );
  }

  try {
    await stopAsrTask(appId, secret, taskId);
    markReady(meetingId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[/api/transcription/stop] failed:", error);
    const detail = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: `หยุดถอดเสียงไม่สำเร็จ: ${detail}` }, { status: 500 });
  }
}
```

- [ ] **Step 3: เขียน test ของ `callback/route.ts` ก่อน implementation**

`src/app/api/transcription/callback/route.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { getTranscript, initTranscript } from "@/lib/transcriptStore";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/transcription/callback", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/transcription/callback", () => {
  beforeEach(() => {
    initTranscript("meeting-1", "task-1");
  });

  it("event ASRResult ที่มี Text ต่อ segment เข้า store ของ meetingId (=RoomId)", async () => {
    const res = await POST(
      makeRequest({
        Event: "ASRResult",
        RoomId: "meeting-1",
        Data: { UserId: "u1", Text: "สวัสดีครับ", StartTime: 1000, EndTime: 2000 },
      })
    );
    expect(res.status).toBe(200);

    const transcript = getTranscript("meeting-1");
    expect(transcript.segments).toHaveLength(1);
    expect(transcript.segments[0]).toEqual({
      speakerId: "u1",
      speakerName: "u1",
      startSec: 1,
      endSec: 2,
      text: "สวัสดีครับ",
    });
  });

  it("event Exception ทำให้ status เป็น failed", async () => {
    const res = await POST(makeRequest({ Event: "Exception", RoomId: "meeting-1" }));
    expect(res.status).toBe(200);
    expect(getTranscript("meeting-1").status).toBe("failed");
  });

  it("ไม่มี RoomId → 400", async () => {
    const res = await POST(makeRequest({ Event: "ASRResult" }));
    expect(res.status).toBe(400);
  });

  it("body ไม่ใช่ JSON → 400", async () => {
    const req = new NextRequest("http://localhost/api/transcription/callback", {
      method: "POST",
      body: "ไม่ใช่ JSON",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4: รัน test ยืนยัน fail**

Run: `npm test -- callback/route`
Expected: FAIL — module not found

- [ ] **Step 5: เขียน `callback/route.ts`**

```typescript
// ═══════════════════════════════════════════
// POST /api/transcription/callback — webhook รับผลถอดเสียงจาก ZegoCloud
//
// ⚠️ Callback URL ต้องตั้งค่าฝั่ง ZegoCloud console ก่อน (ติดต่อ ZegoCloud support ผูก URL นี้เข้ากับ
// AppId — ไม่ใช่ parameter ต่อ request) ดู docs/superpowers/specs/2026-08-18-zegocloud-asr-summary-design.md
//
// ⚠️ Schema ของ Data field (event ASRResult) ไม่ได้ระบุ field ละเอียดในเอกสารสาธารณะของ ZegoCloud
// (ตรวจสอบแล้ว 2026-08-18) — log payload ดิบไว้เสมอ ปรับ mapping ด้านล่างตอน manual test ครั้งแรกที่ได้
// payload จริง ถ้า field ไม่ตรงที่สมมติไว้ (UserId/Text/StartTime/EndTime)
//
// ต้องคืน HTTP 2XX เสมอไม่งั้น ZegoCloud retry 5 ครั้ง (2s,4s,8s,16s,32s)
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { appendSegments, markFailed } from "@/lib/transcriptStore";
import type { TranscriptSegment } from "@/services/transcription/types";

type AsrResultData = {
  UserId?: string;
  Text?: string;
  StartTime?: number; // มิลลิวินาที
  EndTime?: number;
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log("[/api/transcription/callback] raw payload:", JSON.stringify(body));

  const meetingId = body.RoomId as string | undefined; // roomId ผูกกับ meetingId 1:1 (conferenceRoomKey ?? meeting.id)
  if (!meetingId) {
    return NextResponse.json({ error: "Missing RoomId in callback payload" }, { status: 400 });
  }

  const event = body.Event as string | undefined;

  if (event === "Exception") {
    markFailed(meetingId);
    return NextResponse.json({ ok: true });
  }

  if (event === "ASRResult") {
    const data = body.Data as AsrResultData | undefined;
    if (data?.Text) {
      const segment: TranscriptSegment = {
        speakerId: data.UserId ?? null,
        speakerName: data.UserId ?? "ไม่ทราบผู้พูด", // ชื่อจริงถูกเติมทีหลังฝั่ง client จาก roster — ดู zegoAsrProvider.ts
        startSec: (data.StartTime ?? 0) / 1000,
        endSec: (data.EndTime ?? 0) / 1000,
        text: data.Text,
      };
      appendSegments(meetingId, [segment]);
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: รัน test ยืนยันผ่าน**

Run: `npm test -- callback/route`
Expected: PASS ทั้ง 4 test

- [ ] **Step 7: เขียน `result/route.ts`**

```typescript
// ═══════════════════════════════════════════
// GET /api/transcription/result?meetingId= — อ่าน transcript ที่สะสมไว้จาก callback
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getTranscript } from "@/lib/transcriptStore";

export async function GET(request: NextRequest) {
  const meetingId = request.nextUrl.searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json({ error: "Missing required query param: meetingId" }, { status: 400 });
  }
  return NextResponse.json(getTranscript(meetingId));
}
```

- [ ] **Step 8: Commit**

```bash
git add src/app/api/transcription
git commit -m "feat: API routes /api/transcription/{start,stop,callback,result}"
```

---

## Task 7: API route — `/api/summarize`

**Files:**
- Create: `src/app/api/summarize/route.ts`

**Interfaces:**
- Consumes: ทุกฟังก์ชันจาก Task 5 (`claudeSummarize.ts`)
- Produces: `POST /api/summarize` รับ `{ transcript: MeetingTranscript, windows: AgendaWindow[] }` คืน
  `MeetingSummary` (`isDraft: true` เสมอ)

- [ ] **Step 1: เขียน implementation**

```typescript
// ═══════════════════════════════════════════
// POST /api/summarize — สรุปประชุมด้วย Claude API
// windows ว่าง = ยังไม่มี agenda-change history (out of scope รอบนี้) → สรุปภาพรวมอย่างเดียว
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import type { MeetingTranscript } from "@/services/transcription/types";
import type { AgendaWindow, AgendaSummary, MeetingSummary } from "@/services/summarize/types";
import {
  segmentsInWindow,
  transcriptToText,
  buildOverallPrompt,
  buildAgendaPrompt,
  parseAgendaJson,
  callClaude,
} from "@/lib/claudeSummarize";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้งค่า CLAUDE_API_KEY ใน .env.local — ไม่มี mock ให้ fallback" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const transcript = body?.transcript as MeetingTranscript | undefined;
  if (!transcript) {
    return NextResponse.json({ error: "Missing required field: transcript" }, { status: 400 });
  }
  const windows = (body?.windows ?? []) as AgendaWindow[];

  try {
    if (windows.length === 0) {
      const raw = await callClaude(apiKey, buildOverallPrompt(transcriptToText(transcript.segments)));
      const summary: MeetingSummary = {
        meetingId: transcript.meetingId,
        isDraft: true,
        byAgenda: [],
        overall: raw.trim(),
      };
      return NextResponse.json(summary);
    }

    const byAgenda: AgendaSummary[] = [];
    for (const w of windows) {
      const segs = segmentsInWindow(transcript.segments, w);
      const raw = await callClaude(apiKey, buildAgendaPrompt(transcriptToText(segs)));
      byAgenda.push(parseAgendaJson(w.agendaId, raw));
    }

    const overallLine = byAgenda.map((a) => a.resolutions[0] ?? "รับทราบ").join(" · ");
    const summary: MeetingSummary = {
      meetingId: transcript.meetingId,
      isDraft: true,
      byAgenda,
      overall: `สรุปผลการประชุม: ${overallLine}`,
    };
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[/api/summarize] failed:", error);
    const detail = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: `สรุปประชุมไม่สำเร็จ: ${detail}` }, { status: 500 });
  }
}
```

- [ ] **Step 2: manual smoke test ด้วย mock env**

Run:
```bash
CLAUDE_API_KEY=test npm run dev
```
เปิด terminal อีกอันยิง:
```bash
curl -X POST http://localhost:3000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{"transcript":{"meetingId":"m1","status":"ready","language":"th","segments":[]},"windows":[]}'
```
Expected: HTTP 500 พร้อม error message ที่มี "Claude API" อยู่ในนั้น (เพราะ `test` ไม่ใช่ API key จริง) —
ยืนยันว่า route ทำงานถึงจุดเรียก Claude จริง ไม่ error ก่อนหน้านั้น (เช่น validation/origin check)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/summarize
git commit -m "feat: API route POST /api/summarize — สรุปประชุมด้วย Claude API"
```

---

## Task 8: `zegoAsrProvider.ts` — client-side `TranscriptionProvider`

**Files:**
- Modify: `src/services/transcription/types.ts:36` (เพิ่ม `"zego_asr"` เข้า `TranscriptionProvider["id"]` union)
- Create: `src/services/transcription/zegoAsrProvider.ts`

**Interfaces:**
- Consumes: `MeetingTranscript` type, `Meeting` type จาก `@/data`
- Produces:
  `fetchRawTranscript(meetingId: string): Promise<MeetingTranscript>`
  `resolveSpeakerNames(transcript: MeetingTranscript, meeting: Meeting): MeetingTranscript`
  `zegoAsrProvider: TranscriptionProvider` (`id: "zego_asr"`)

- [ ] **Step 1: แก้ union type**

ใน `src/services/transcription/types.ts` แก้บรรทัด 36:
```typescript
  id: "web_speech" | "assemblyai" | "azure" | "mock" | "zego_asr";
```

- [ ] **Step 2: เขียน `zegoAsrProvider.ts`**

```typescript
// ═══════════════════════════════════════════
// ZegoCloud ASR Provider — client-side, implements TranscriptionProvider
//
// server (api/transcription/callback) ไม่รู้จัก roster ของประชุม (ระบบนี้ auth เป็น client-side
// mock ทั้งหมด ไม่มี DB ฝั่ง server) segment ที่ได้จาก server จึงมีแค่ speakerId ดิบ (=ZegoCloud UserId)
// resolveSpeakerNames() ทำหน้าที่เติมชื่อจริงจาก roster ฝั่ง client ก่อนส่งให้ UI/summarizer ใช้
// ═══════════════════════════════════════════

import type { TranscriptionProvider, MeetingTranscript } from "./types";
import type { Meeting } from "@/data";

export async function fetchRawTranscript(meetingId: string): Promise<MeetingTranscript> {
  const res = await fetch(`/api/transcription/result?meetingId=${encodeURIComponent(meetingId)}`);
  if (!res.ok) {
    throw new Error(`ดึง transcript ไม่สำเร็จ: HTTP ${res.status}`);
  }
  return (await res.json()) as MeetingTranscript;
}

export function resolveSpeakerNames(transcript: MeetingTranscript, meeting: Meeting): MeetingTranscript {
  return {
    ...transcript,
    segments: transcript.segments.map((seg) => {
      const participant = meeting.participants.find((p) => p.userId === seg.speakerId);
      return participant ? { ...seg, speakerName: participant.name } : seg;
    }),
  };
}

export const zegoAsrProvider: TranscriptionProvider = {
  id: "zego_asr",
  async getTranscript(meetingId: string): Promise<MeetingTranscript> {
    return fetchRawTranscript(meetingId);
  },
};
```

- [ ] **Step 3: type-check**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ใหม่จากไฟล์นี้

- [ ] **Step 4: Commit**

```bash
git add src/services/transcription/types.ts src/services/transcription/zegoAsrProvider.ts
git commit -m "feat: zegoAsrProvider — client-side TranscriptionProvider ผูก ZegoCloud ASR"
```

---

## Task 9: `claudeSummarizer.ts` — client-side `Summarizer`

**Files:**
- Modify: `src/services/summarize/types.ts:40` (เพิ่ม `"claude"` เข้า `Summarizer["id"]` union)
- Create: `src/services/summarize/claudeSummarizer.ts`

**Interfaces:**
- Produces: `claudeSummarizer: Summarizer` (`id: "claude"`)

- [ ] **Step 1: แก้ union type**

ใน `src/services/summarize/types.ts` แก้บรรทัด 40:
```typescript
  id: "llm" | "mock" | "claude";
```

- [ ] **Step 2: เขียน `claudeSummarizer.ts`**

```typescript
// ═══════════════════════════════════════════
// Claude Summarizer — client-side, implements Summarizer, เรียก /api/summarize
// ═══════════════════════════════════════════

import type { Summarizer, MeetingSummary, AgendaWindow } from "./types";
import type { MeetingTranscript } from "@/services/transcription/types";

export const claudeSummarizer: Summarizer = {
  id: "claude",
  async summarizeByAgenda(
    transcript: MeetingTranscript,
    windows: AgendaWindow[]
  ): Promise<MeetingSummary> {
    const res = await fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, windows }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        typeof body?.error === "string" ? body.error : `สรุปประชุมไม่สำเร็จ: HTTP ${res.status}`
      );
    }
    return (await res.json()) as MeetingSummary;
  },
};
```

- [ ] **Step 3: type-check**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ใหม่จากไฟล์นี้

- [ ] **Step 4: Commit**

```bash
git add src/services/summarize/types.ts src/services/summarize/claudeSummarizer.ts
git commit -m "feat: claudeSummarizer — client-side Summarizer เรียก /api/summarize"
```

---

## Task 10: Wire เข้า `live/[id]/page.tsx` — เริ่ม/หยุด ASR ตามการเข้า/ออกห้องของ host

**Files:**
- Modify: `src/app/(app)/live/[id]/page.tsx:268` (ต่อจากบรรทัด `const isHost = ...`)

**Interfaces:**
- Consumes: `resolveVideoSurface` (import อยู่แล้วในไฟล์นี้), `meeting.conferenceRoomKey`

- [ ] **Step 1: เพิ่ม useEffect ต่อจากบรรทัด `const isHost = meeting ? can(currentUser, "meeting.host", meeting) : false;`**

```tsx
  // Phase D: ZegoCloud ASR — เฉพาะ host เป็นคน trigger start/stop กันเรียกซ้ำจากผู้เข้าร่วมหลายคน
  useEffect(() => {
    if (!meeting || !hasJoined || !isHost) return;
    const surface = resolveVideoSurface(meeting);
    if (surface.kind !== "embed") return;

    const meetingId = meeting.id;
    const roomId = meeting.conferenceRoomKey ?? meeting.id;
    let started = false;

    fetch("/api/transcription/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId, roomId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${res.status}`);
        }
        started = true;
      })
      .catch((err) => {
        console.error("[live] เริ่มถอดเสียงอัตโนมัติไม่สำเร็จ:", err);
        toast.error("เริ่มถอดเสียงอัตโนมัติไม่สำเร็จ", {
          description: err instanceof Error ? err.message : undefined,
        });
      });

    return () => {
      if (!started) return;
      fetch("/api/transcription/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId }),
      }).catch((err) => console.error("[live] หยุดถอดเสียงไม่สำเร็จ:", err));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting?.id, hasJoined, isHost]);
```

- [ ] **Step 2: type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: ไม่มี error ใหม่

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/live/[id]/page.tsx"
git commit -m "feat: เริ่ม/หยุด ZegoCloud ASR อัตโนมัติเมื่อ host เข้า/ออกห้องประชุม"
```

---

## Task 11: Wire เข้า `meetings/[id]/page.tsx` — แทน mock ด้วย provider จริง

**Files:**
- Modify: `src/app/(app)/meetings/[id]/page.tsx:30-31` (import), `:167-209` (`requestTranscript`,
  `generateSummary`)

**Interfaces:**
- Consumes: `fetchRawTranscript`, `resolveSpeakerNames` (Task 8), `claudeSummarizer` (Task 9)

- [ ] **Step 1: แก้ import — ลบ mock, ใช้ของจริง**

แทนที่บรรทัด 30-31:
```typescript
import { generateMockTranscript } from "@/services/transcription/mockProvider";
import { mockSummarizer } from "@/services/summarize/mockSummarizer";
```
ด้วย:
```typescript
import { fetchRawTranscript, resolveSpeakerNames } from "@/services/transcription/zegoAsrProvider";
import { claudeSummarizer } from "@/services/summarize/claudeSummarizer";
```

- [ ] **Step 2: แก้ `requestTranscript` (บรรทัด 167-174) — ดึงจาก store จริงแทนการ sleep จำลอง**

แทนที่:
```typescript
  const requestTranscript = async () => {
    setTranscriptBusy(true);
    updateMeeting(meeting.id, { transcriptStatus: "processing" });
    await new Promise(r => setTimeout(r, 2000));
    updateMeeting(meeting.id, { transcriptStatus: "ready" });
    setTranscriptBusy(false);
    toast.success("ได้รับ Transcript แล้ว", { description: "สามารถสร้างร่างรายงานสรุปได้" });
  };
```
ด้วย:
```typescript
  const requestTranscript = async () => {
    setTranscriptBusy(true);
    updateMeeting(meeting.id, { transcriptStatus: "processing" });
    try {
      const raw = await fetchRawTranscript(meeting.id);
      if (raw.status !== "ready" || raw.segments.length === 0) {
        updateMeeting(meeting.id, { transcriptStatus: raw.status === "failed" ? "failed" : "processing" });
        toast.info("ยังไม่มี Transcript พร้อมใช้งาน", { description: "ลองใหม่อีกครั้งหลังประชุมจบ" });
        return;
      }
      updateMeeting(meeting.id, { transcriptStatus: "ready" });
      toast.success("ได้รับ Transcript แล้ว", { description: "สามารถสร้างร่างรายงานสรุปได้" });
    } catch (error) {
      updateMeeting(meeting.id, { transcriptStatus: "failed" });
      toast.error("ดึง Transcript ไม่สำเร็จ", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setTranscriptBusy(false);
    }
  };
```

- [ ] **Step 3: แก้ `generateSummary` (บรรทัด 176-180) — ใช้ transcript จริง + claudeSummarizer**

แทนที่:
```typescript
      const transcript = generateMockTranscript(meeting);
      const summary    = await mockSummarizer.summarizeByAgenda(transcript, []);
```
ด้วย:
```typescript
      const rawTranscript = await fetchRawTranscript(meeting.id);
      const transcript    = resolveSpeakerNames(rawTranscript, meeting);
      const summary        = await claudeSummarizer.summarizeByAgenda(transcript, []);
```

- [ ] **Step 4: type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: ไม่มี error ใหม่ (ตรวจว่าไม่มี import mock เหลือค้างที่ไหนอีก:
`grep -rn "mockProvider\|mockSummarizer" src/app` ต้องไม่มีผลลัพธ์)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/meetings/[id]/page.tsx"
git commit -m "feat: แทน mock transcript/summary ด้วย ZegoCloud ASR + Claude summarizer จริง"
```

---

## Task 12: env vars, README, และ verification รวม

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:** ไม่มี (documentation + final verification)

- [ ] **Step 1: เพิ่ม env vars ใน `.env.example`**

ต่อท้ายไฟล์:
```
# ZegoCloud Cloud Real-Time ASR (ถอดคำพูดประชุมอัตโนมัติ) — ใช้ ZEGO_APP_ID/ZEGO_SERVER_SECRET ชุดเดียวกับ
# ด้านบน (ZegoCloud Server API ทุกตัวเซ็น signature ด้วย secret เดียวกันของ AppId เดียวกัน)
# ⚠️ ต้องติดต่อ ZegoCloud console/support ผูก callback URL "<production-domain>/api/transcription/callback"
# ก่อน ASR ถึงจะส่งผลถอดเสียงกลับมาได้จริง — ไม่มีค่านี้ก็ยังเริ่ม/หยุด ASR ได้ปกติ แค่จะไม่มี segment ส่งกลับมา

# Claude API — ใช้สรุปประชุมจาก transcript (POST /api/summarize)
# ไม่มีค่านี้ = ปุ่ม "สร้างร่างรายงานสรุป" จะ error ชัดเจน (ไม่มี mock ให้ fallback แล้ว)
CLAUDE_API_KEY=your_claude_api_key
```

- [ ] **Step 2: แก้ README.md ส่วน "Local Development" ให้กล่าวถึง `CLAUDE_API_KEY`**

หา:
```
cp .env.example .env.local   # ใส่ ZEGO_APP_ID / ZEGO_SERVER_SECRET / ZEGO_SERVER_URL จริง
```
แทนที่ด้วย:
```
cp .env.example .env.local   # ใส่ ZEGO_APP_ID / ZEGO_SERVER_SECRET / ZEGO_SERVER_URL / CLAUDE_API_KEY จริง
```

- [ ] **Step 3: รัน test suite ทั้งหมด**

Run: `npm test`
Expected: PASS ทุก test (Task 2-6 รวมกัน — 20 test)

- [ ] **Step 4: type-check + lint + build เต็มโปรเจกต์**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: ทั้งสามคำสั่งผ่านไม่มี error

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md
git commit -m "docs: เพิ่ม CLAUDE_API_KEY และหมายเหตุ ZegoCloud ASR callback setup ใน env/README"
```

- [ ] **Step 6: Manual verification checklist (ทำหลัง deploy ขึ้น Vercel + ตั้งค่า credential จริงแล้ว)**

1. ติดต่อ ZegoCloud console/support ผูก callback URL `https://<production-domain>/api/transcription/callback`
2. ตั้ง `CLAUDE_API_KEY` ใน Vercel Project Settings
3. Host เปิดห้องประชุมทดสอบ → เช็ค log เห็น `[/api/transcription/start]` ไม่ error
4. พูดในห้อง → เช็ค Vercel function log ของ `/api/transcription/callback` เห็น raw payload จริง →
   เทียบ field กับที่ mapping ไว้ใน `callback/route.ts` (ข้อจำกัดข้อ 2 ในสเปก) ปรับถ้าไม่ตรง
   commit เป็น follow-up
5. Host ออกจากห้อง → เช็ค `/api/transcription/stop` เรียกสำเร็จ
6. เปิดหน้ารายละเอียดประชุม → กด "ขอ Transcript" → เห็น transcript จริง (ไม่ใช่ข้อความ mock)
7. กด "สร้างร่างรายงานสรุป" → เห็นร่างรายงานที่มาจาก Claude จริง (ไม่ใช่ข้อความสุ่มจาก mock)

---

## Self-Review Summary

- **Spec coverage:** ครบทุกหัวข้อในสเปก — provider ใหม่ (Task 8-9), API routes ครบ 5 endpoint
  (Task 6-7), data flow เต็ม (Task 10-11), error handling (ทุก route คืน error ชัดเจนไม่ fallback mock),
  testing (unit ทุก lib + integration callback route), env vars + ข้อจำกัด callback URL/schema
  (Task 12), out-of-scope ระบุชัดในสเปกแล้วไม่ implement เพิ่มที่นี่ (DB ถาวร, agenda history, translation)
- **Placeholder scan:** ไม่มี TBD/TODO — จุดเดียวที่ยังไม่ยืนยัน 100% คือ field ละเอียดใน ASR callback
  `Data` object (ไม่มีในเอกสารสาธารณะ) ซึ่งจัดการด้วยขั้นตอน manual-verify ที่ทำงานได้จริงใน Task 12
  Step 6 ข้อ 4 ไม่ใช่ placeholder เชิงโค้ด
- **Type consistency:** `TranscriptSegment`/`MeetingTranscript`/`AgendaWindow`/`AgendaSummary`/
  `MeetingSummary` ใช้ signature เดียวกันทุก task ที่อ้างถึง — ตรวจไขว้แล้ว
