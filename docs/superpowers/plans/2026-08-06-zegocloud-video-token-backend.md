# ZegoCloud Video-Token Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ZegoCloud token generation from the client (where `ZEGO_SERVER_SECRET` is currently exposed) to a Next.js API route, so the secret never reaches the browser.

**Architecture:** A new server-only module (`src/lib/zegoServerToken.ts`) holds the AES-CBC token algorithm and reads `ZEGO_APP_ID`/`ZEGO_SERVER_SECRET` from `process.env`. A new route handler (`POST /api/video/token`) calls it and returns the token as JSON. The client's `src/services/credentials.ts` calls that route via `fetch` instead of generating the token itself. `src/services/video/zegoToken.ts` shrinks to just the public `ZEGO_APP_ID` constant.

**Tech Stack:** Next.js 16 Route Handlers (Node.js runtime), Web Crypto (`crypto.subtle`), no new dependencies.

## Global Constraints

- Endpoint has **no auth check** — this system has no real auth yet (`src/lib/session.ts` is a prototype), and the signed token is not bound to a specific room — any caller can mint a token valid for any room in the app. This is accepted for now because the system has no real auth yet; when real auth lands, add `requireAuth()` and bind the token to the room via ZegoCloud's privilege payload. Do not add auth logic in this plan.
- Env var names (exact, per `docs/backend-design.md`): `ZEGO_APP_ID`, `ZEGO_SERVER_SECRET`, `NEXT_PUBLIC_ZEGO_APP_ID`.
- Do not modify `src/services/video/zego.ts` or `src/services/video/index.ts` (`embeddedEngines` registry) — confirmed dead code, out of scope for this plan.
- No test framework exists in this repo (no jest/vitest, `package.json` has no test script) — verification steps use `curl`, `npm run build`, `grep`, and manual browser checks instead of unit tests. Do not add a test framework as part of this plan.
- The project has no `src/lib/zegoServerToken.ts`-style "server-only" enforcement package (e.g. `server-only`) installed — do not add one; correctness is guaranteed by only importing the module from `src/app/api/**`.
- This project uses Git Bash / PowerShell on Windows — `grep`/`curl` commands in verification steps assume Git Bash (available per environment).

---

## Task 1: Server-only token module + API route + env files

**Files:**
- Create: `src/lib/zegoServerToken.ts`
- Create: `src/app/api/video/token/route.ts`
- Create: `.env.local` (gitignored — matches `.env*.local` in `.gitignore`)
- Create: `.env.example` (committed)

**Interfaces:**
- Consumes: nothing from other tasks (first task).
- Produces:
  - `export class ZegoConfigError extends Error {}` from `src/lib/zegoServerToken.ts`
  - `export async function generateZegoToken(userID: string, effectiveTimeInSeconds?: number): Promise<{ token: string; appId: number }>` from `src/lib/zegoServerToken.ts` — throws `ZegoConfigError` if env vars missing, throws plain `Error` if `userID` is empty.
  - `POST /api/video/token` route accepting `{ roomKey: string; userID?: string }`, returning `{ token: string; appId: number; userID: string; roomKey: string; expiresAt: number }` on 200, `{ error: string }` on 400/500. Task 3 depends on this exact response shape.

- [ ] **Step 1: Create `.env.local`**

```env
ZEGO_APP_ID=1698621897
ZEGO_SERVER_SECRET=your-zego-server-secret-here
NEXT_PUBLIC_ZEGO_APP_ID=1698621897
```

- [ ] **Step 2: Create `.env.example`**

```env
ZEGO_APP_ID=your-zego-app-id
ZEGO_SERVER_SECRET=your-zego-server-secret
NEXT_PUBLIC_ZEGO_APP_ID=your-zego-app-id
```

- [ ] **Step 3: Create `src/lib/zegoServerToken.ts`**

```typescript
// ═══════════════════════════════════════════
// ZegoCloud Token Generator — SERVER ONLY
//
// ⚠️ Import เฉพาะจาก route handler (src/app/api/**)
//    ห้าม import จาก client component — มี ZEGO_SERVER_SECRET อยู่ในนี้
//
// อัลกอริทึม: ZegoCloud "04" token format
// Ref: github.com/Match-Yang/zegocloud_token_assistant
// ═══════════════════════════════════════════

export class ZegoConfigError extends Error {}

function getConfig(): { appId: number; serverSecret: string } {
  const appId = Number(process.env.ZEGO_APP_ID);
  const serverSecret = process.env.ZEGO_SERVER_SECRET;
  if (!appId || !serverSecret) {
    throw new ZegoConfigError(
      "ZegoCloud not configured — set ZEGO_APP_ID and ZEGO_SERVER_SECRET in .env.local"
    );
  }
  return { appId, serverSecret };
}

export async function generateZegoToken(
  userID: string,
  effectiveTimeInSeconds: number = 3600
): Promise<{ token: string; appId: number }> {
  if (!userID) throw new Error("userID is required");
  const { appId, serverSecret } = getConfig();

  const time = (Date.now() / 1000) | 0;
  const body = {
    app_id: appId,
    user_id: userID,
    nonce: (Math.random() * 2147483647) | 0,
    ctime: time,
    expire: time + effectiveTimeInSeconds,
  };

  // AES key = ServerSecret as UTF-8
  const key = new TextEncoder().encode(serverSecret);

  // IV = 16 ASCII digits from Math.random()
  let ivStr = Math.random().toString().substring(2, 18);
  if (ivStr.length < 16) ivStr += ivStr.substring(0, 16 - ivStr.length);
  const iv = new TextEncoder().encode(ivStr);

  // Encrypt body JSON with AES-CBC + PKCS7 padding (Web Crypto does PKCS7 by default)
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer,
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );
  const plaintext = new TextEncoder().encode(JSON.stringify(body));
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer },
    cryptoKey,
    plaintext.buffer.slice(plaintext.byteOffset, plaintext.byteOffset + plaintext.byteLength) as ArrayBuffer
  );
  const ciphert = new Uint8Array(encryptedBuf);
  const lenCiphert = ciphert.length;

  // Assemble token binary (big-endian, matching official SDK)
  const uint8 = new Uint8Array(8 + 2 + 16 + 2 + lenCiphert);

  // expire: 8 bytes — first 4 zero, then expire as big-endian int32
  uint8[0] = 0; uint8[1] = 0; uint8[2] = 0; uint8[3] = 0;
  const expireArr = new Uint8Array(new Int32Array([body.expire]).buffer);
  uint8[4] = expireArr[3]; uint8[5] = expireArr[2]; uint8[6] = expireArr[1]; uint8[7] = expireArr[0];

  // IV length: 2 bytes big-endian
  uint8[8] = iv.length >> 8;
  uint8[9] = iv.length & 0xff;

  // IV: 16 bytes
  uint8.set(iv, 10);

  // ciphertext length: 2 bytes big-endian
  uint8[26] = lenCiphert >> 8;
  uint8[27] = lenCiphert & 0xff;

  // ciphertext
  uint8.set(ciphert, 28);

  const token = "04" + Buffer.from(uint8).toString("base64");
  return { token, appId };
}
```

- [ ] **Step 4: Create `src/app/api/video/token/route.ts`**

```typescript
// ═══════════════════════════════════════════
// POST /api/video/token — ออก ZegoCloud token ฝั่ง server
//
// ไม่มี auth check (ระบบยังไม่มี auth จริง) — พึ่ง roomKey ที่เดาไม่ได้
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { generateZegoToken, ZegoConfigError } from "@/lib/zegoServerToken";

const TOKEN_TTL_SECONDS = 3600;

export async function POST(req: NextRequest) {
  let body: { roomKey?: string; userID?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const roomKey = body.roomKey?.trim();
  if (!roomKey) {
    return NextResponse.json({ error: "roomKey is required" }, { status: 400 });
  }

  const userID = body.userID?.trim() || `user_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const { token, appId } = await generateZegoToken(userID, TOKEN_TTL_SECONDS);
    return NextResponse.json({
      token,
      appId,
      userID,
      roomKey,
      expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000,
    });
  } catch (e) {
    if (e instanceof ZegoConfigError) {
      return NextResponse.json({ error: "ZegoCloud not configured" }, { status: 500 });
    }
    return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Start the dev server**

Run: `npm run dev` (leave running in background)
Expected: server starts on `http://localhost:3000` with no compile errors

- [ ] **Step 6: Verify success case with curl**

Run:
```bash
curl -s -X POST http://localhost:3000/api/video/token \
  -H "Content-Type: application/json" \
  -d '{"roomKey":"test-room"}'
```
Expected: JSON response with `"token"` starting with `"04"`, `"appId":1698621897`, `"userID"` starting with `"user_"`, `"roomKey":"test-room"`, and a numeric `"expiresAt"`.

- [ ] **Step 7: Verify validation error with curl**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/video/token \
  -H "Content-Type: application/json" -d '{}'
```
Expected: `400`

- [ ] **Step 8: Commit**

```bash
git add .env.example src/lib/zegoServerToken.ts "src/app/api/video/token/route.ts"
git commit -m "feat: add server-side ZegoCloud token endpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Note: `.env.local` is gitignored and must NOT be committed — verify with `git status` that it does not appear as staged/tracked before running the commit above.

---

## Task 2: Strip client-side secret out of `src/services/video/zegoToken.ts`

**Files:**
- Modify: `src/services/video/zegoToken.ts` (full rewrite — currently 79 lines, becomes ~8 lines)

**Interfaces:**
- Consumes: nothing new (no runtime dependency on Task 1).
- Produces: `export const ZEGO_APP_ID: number` — same export name/type as before, so `src/services/video/zego.ts` and `src/components/meeting/ZegoCloudEmbedStage.tsx` (which both `import { ZEGO_APP_ID } from "@/services/video/zegoToken"` / `"./zegoToken"`) need no changes.

- [ ] **Step 1: Replace the contents of `src/services/video/zegoToken.ts`**

```typescript
// ═══════════════════════════════════════════
// ZegoCloud App ID — ค่า public ที่ client ใช้ init SDK เท่านั้น
//
// Token generation (ต้องใช้ ZEGO_SERVER_SECRET) ย้ายไปแล้วที่
// src/lib/zegoServerToken.ts (server-only) — เรียกผ่าน POST /api/video/token
// ดู src/services/credentials.ts
// ═══════════════════════════════════════════

export const ZEGO_APP_ID = Number(process.env.NEXT_PUBLIC_ZEGO_APP_ID);
```

- [ ] **Step 2: Type-check the project**

Run: `npx tsc --noEmit`
Expected: no errors (in particular, no errors in `src/services/video/zego.ts` or `src/components/meeting/ZegoCloudEmbedStage.tsx` about a missing `generateZegoToken` export — neither file imports it)

- [ ] **Step 3: Build for production**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 4: Verify the secret is not in the client bundle**

Run:
```bash
grep -r "your-zego-server-secret-here" .next/static
```
Expected: no output (no matches — the raw secret string does not appear anywhere in client-shipped files)

- [ ] **Step 5: Commit**

```bash
git add src/services/video/zegoToken.ts
git commit -m "fix: remove ZegoCloud ServerSecret and token algorithm from client bundle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Point `credentials.ts` at the new API route

**Files:**
- Modify: `src/services/credentials.ts` (full rewrite)

**Interfaces:**
- Consumes: `POST /api/video/token` from Task 1 — request `{ roomKey: string; userID?: string }`, response `{ token: string; appId: number; userID: string; roomKey: string; expiresAt: number }` on 200.
- Produces: `export type VideoCredential = { engineId: EmbeddedEngineId; token: string; providerRoomId: string; userID: string; expiresAt: number }` and `export async function requestVideoCredential(engineId: EmbeddedEngineId, roomKey: string, userID?: string): Promise<VideoCredential | null>` — **unchanged signature and return shape** from before this task, so `src/app/(app)/live/[id]/page.tsx:70` (`requestVideoCredential(surface.engineId, roomKey, currentUser.id).then(setVideoCredential)`) needs no changes.

- [ ] **Step 1: Replace the contents of `src/services/credentials.ts`**

```typescript
// ═══════════════════════════════════════════
// Credentials Service — จุดเดียวที่ขอ token สำหรับเข้าห้องประชุมฝัง
//
// เรียก POST /api/video/token — token generation อยู่ฝั่ง server เท่านั้น
// (ดู src/lib/zegoServerToken.ts)
// ═══════════════════════════════════════════

import type { EmbeddedEngineId } from "./video/types";

export type VideoCredential = {
  engineId: EmbeddedEngineId;
  token: string;
  providerRoomId: string;
  userID: string;
  expiresAt: number;
};

type TokenResponse = {
  token: string;
  appId: number;
  userID: string;
  roomKey: string;
  expiresAt: number;
};

export async function requestVideoCredential(
  engineId: EmbeddedEngineId,
  roomKey: string,
  userID?: string
): Promise<VideoCredential | null> {
  if (engineId !== "zegocloud") return null;

  try {
    const res = await fetch("/api/video/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomKey, userID }),
    });

    if (!res.ok) {
      console.error("Failed to get video credential:", await res.text());
      return null;
    }

    const data: TokenResponse = await res.json();

    return {
      engineId,
      token: data.token,
      providerRoomId: data.roomKey,
      userID: data.userID,
      expiresAt: data.expiresAt,
    };
  } catch (e) {
    console.error("Video credential request failed:", e);
    return null;
  }
}
```

- [ ] **Step 2: Type-check the project**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual regression check — happy path**

Run: `npm run dev`, then in a browser log in as any demo account (see `demoAccounts()` in `src/lib/session.ts` for emails) and navigate to a meeting whose conference provider is `zegocloud`, then open its `/live/[id]` page.
Expected: the ZegoCloud stage badge moves from `"connecting..."` to `"connected"` (matches pre-existing behavior in `src/components/meeting/ZegoCloudEmbedStage.tsx`) — confirms the credential returned by the new API round-trip still lets the SDK log into the room.

- [ ] **Step 4: Manual regression check — network tab**

In the browser DevTools Network tab, find the request to `/api/video/token`.
Expected: request payload is `{"roomKey":"...", "userID":"<currentUser.id>"}`; response body contains `token`, `appId`, `userID`, `roomKey`, `expiresAt`; no `ZEGO_SERVER_SECRET` value appears anywhere in the request or response.

- [ ] **Step 5: Commit**

```bash
git add src/services/credentials.ts
git commit -m "refactor: fetch ZegoCloud credential from backend instead of generating client-side

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Final Verification

- [ ] **Run the full spec verification checklist from the design doc**

1. `curl -X POST localhost:3000/api/video/token -H "Content-Type: application/json" -d '{"roomKey":"test-room"}'` → token starting with `"04"` ✓ (done in Task 1)
2. `curl -X POST localhost:3000/api/video/token -H "Content-Type: application/json" -d '{}'` → `400` ✓ (done in Task 1)
3. `npm run build` then `grep -r "your-zego-server-secret-here" .next/static` → no output ✓ (done in Task 2)
4. Manual `/live/[id]` check → connects ✓ (done in Task 3)
5. `npx tsc --noEmit` → passes ✓ (done in Tasks 2 and 3)

All five verification points from `docs/superpowers/specs/2026-08-06-zegocloud-video-token-backend-design.md` are covered by Tasks 1–3. No further action needed.
