# ZegoCloud Real SDK Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire real ZegoCloud video SDK into the e-Meeting system so rooms use live video instead of mock avatars, with graceful demo-mode fallback when credentials are absent.

**Architecture:** Next.js API Route generates ZegoCloud token04 tokens server-side (AES-256-CBC). Client fetches token, constructs `ZegoExpressEngine`, joins room. Mock engine remains as fallback when credential is null.

**Tech Stack:** Next.js 16 Route Handlers, `zego-express-engine-webrtc`, Node.js `crypto` (built-in)

## Global Constraints

- ServerSecret NEVER exposed to client — server-side only via `process.env`
- No `NEXT_PUBLIC_` prefix on any ZEGO env var
- All changes must preserve demo-mode fallback (credential = null → mock UI)
- Token expiry: 1800 seconds (30 minutes)
- TypeScript strict mode — no `any` types
- Follow existing code style: Thai comments for business logic, English for interface contracts

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `.env.local` | New | Store ZEGO_APP_ID, ZEGO_SERVER_SECRET, ZEGO_SERVER_URL |
| `src/lib/zegoToken.ts` | New | TypeScript port of official `generateToken04()` — AES-256-CBC token generation |
| `src/app/api/video/token/route.ts` | New | POST endpoint — validate input, generate privilege token, return token+appId+serverUrl |
| `src/services/credentials.ts` | Edit | Add appId/serverUrl to type, add userId/userName params, fetch from API route |
| `src/services/video/zego.ts` | Edit | Replace mock re-export with real ZegoExpressEngine mount/dispose |
| `src/services/video/index.ts` | Edit | Point registry at real engine |
| `src/components/meeting/ZegoCloudEmbedStage.tsx` | Edit | Mount real SDK when credential present, keep mock fallback |
| `src/app/(app)/live/[id]/page.tsx` | Edit | Pass userId+userName to requestVideoCredential |

---

### Task 1: Token Generator + API Route + Environment

Server-side token generation — the security-critical foundation. Everything else depends on this.

**Files:**
- Create: `.env.local`
- Create: `src/lib/zegoToken.ts`
- Create: `src/app/api/video/token/route.ts`

**Interfaces:**
- Consumes: nothing (foundation task)
- Produces:
  - `generateToken04(appId: number, userId: string, secret: string, effectiveTimeInSeconds: number, payload: string): string` from `src/lib/zegoToken.ts`
  - `POST /api/video/token` — request `{ roomId: string, userId: string, userName: string }`, response `{ token: string, appId: number, serverUrl: string, expiresAt: number }`

- [ ] **Step 1: Create `.env.local`**

Create `.env.local` at project root (already gitignored by `.env*.local` in `.gitignore`):

```env
ZEGO_APP_ID=1698621897
ZEGO_SERVER_SECRET=4d5c102c2ef7c4527a72d5c7f9ad94c8
ZEGO_SERVER_URL=wss://webliveroom1698621897-api.coolzcloud.com/ws
```

- [ ] **Step 2: Create `src/lib/zegoToken.ts`**

Port the official `generateToken04()` from `github.com/ZEGOCLOUD/zego_server_assistant/token/nodejs/server/zegoServerAssistant.js` to TypeScript ESM. The original uses CommonJS + `require("crypto")`. Rewrite as:

```typescript
// ═══════════════════════════════════════════
// ZegoCloud Token04 Generator — TypeScript port
// Source: github.com/ZEGOCLOUD/zego_server_assistant
//
// ใช้ AES-256-CBC เข้ารหัส tokenInfo ด้วย ServerSecret
// ═══════════════════════════════════════════

import { createCipheriv, randomInt } from "crypto";

export enum ErrorCode {
  success = 0,
  appIDInvalid = 1,
  userIDInvalid = 3,
  secretInvalid = 5,
  effectiveTimeInSecondsInvalid = 6,
}

function makeRandomIv(): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  const result: string[] = [];
  for (let i = 0; i < 16; i++) {
    result.push(chars.charAt(Math.floor(Math.random() * chars.length)));
  }
  return result.join("");
}

function getAlgorithm(key: Buffer): string {
  switch (key.length) {
    case 16:
      return "aes-128-cbc";
    case 24:
      return "aes-192-cbc";
    case 32:
      return "aes-256-cbc";
    default:
      throw new Error("Invalid key length: " + key.length);
  }
}

function aesEncrypt(plainText: string, key: string, iv: string): ArrayBuffer {
  const cipher = createCipheriv(getAlgorithm(Buffer.from(key)), key, iv);
  cipher.setAutoPadding(true);
  const encrypted = cipher.update(plainText);
  const final = cipher.final();
  const out = Buffer.concat([encrypted, final]);
  return Uint8Array.from(out).buffer;
}

/**
 * Generate ZegoCloud token04
 *
 * @param appId - ZegoCloud App ID
 * @param userId - user identifier
 * @param secret - 32-char ServerSecret
 * @param effectiveTimeInSeconds - token validity period
 * @param payload - JSON string for privilege validation (room_id, privilege, stream_id_list)
 * @returns token string prefixed with "04"
 */
export function generateToken04(
  appId: number,
  userId: string,
  secret: string,
  effectiveTimeInSeconds: number,
  payload: string
): string {
  if (!appId || typeof appId !== "number") {
    throw { errorCode: ErrorCode.appIDInvalid, errorMessage: "appID invalid" };
  }
  if (!userId || typeof userId !== "string") {
    throw { errorCode: ErrorCode.userIDInvalid, errorMessage: "userId invalid" };
  }
  if (!secret || typeof secret !== "string" || secret.length !== 32) {
    throw { errorCode: ErrorCode.secretInvalid, errorMessage: "secret must be a 32 byte string" };
  }
  if (!effectiveTimeInSeconds || typeof effectiveTimeInSeconds !== "number") {
    throw { errorCode: ErrorCode.effectiveTimeInSecondsInvalid, errorMessage: "effectiveTimeInSeconds invalid" };
  }

  const createTime = Math.floor(Date.now() / 1000);
  const tokenInfo = {
    app_id: appId,
    user_id: userId,
    nonce: randomInt(-2147483648, 2147483647),
    ctime: createTime,
    expire: createTime + effectiveTimeInSeconds,
    payload: payload || "",
  };

  const plainText = JSON.stringify(tokenInfo);
  const iv = makeRandomIv();
  const encryptBuf = aesEncrypt(plainText, secret, iv);

  const b1 = new Uint8Array(8);
  const b2 = new Uint8Array(2);
  const b3 = new Uint8Array(2);
  new DataView(b1.buffer).setBigInt64(0, BigInt(tokenInfo.expire), false);
  new DataView(b2.buffer).setUint16(0, iv.length, false);
  new DataView(b3.buffer).setUint16(0, encryptBuf.byteLength, false);

  const buf = Buffer.concat([
    Buffer.from(b1),
    Buffer.from(b2),
    Buffer.from(iv),
    Buffer.from(b3),
    Buffer.from(encryptBuf),
  ]);

  return "04" + Buffer.from(Uint8Array.from(buf).buffer).toString("base64");
}
```

- [ ] **Step 3: Create `src/app/api/video/token/route.ts`**

```typescript
// ═══════════════════════════════════════════
// POST /api/video/token — สร้าง ZegoCloud privilege token
//
// ServerSecret ไม่เคยออกจากฝั่ง server
// ═══════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { generateToken04 } from "@/lib/zegoToken";

const EXPIRY_SECONDS = 1800; // 30 minutes

export async function POST(request: NextRequest) {
  try {
    const appId = Number(process.env.ZEGO_APP_ID);
    const secret = process.env.ZEGO_SERVER_SECRET;
    const serverUrl = process.env.ZEGO_SERVER_URL;

    if (!appId || !secret || !serverUrl) {
      return NextResponse.json(
        { error: "ZegoCloud credentials not configured on server" },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { roomId, userId, userName } = body as {
      roomId?: string;
      userId?: string;
      userName?: string;
    };

    if (!roomId || !userId || !userName) {
      return NextResponse.json(
        { error: "Missing required fields: roomId, userId, userName" },
        { status: 400 }
      );
    }

    // Privilege payload — allow login + publish
    const payload = JSON.stringify({
      room_id: roomId,
      privilege: { 1: 1, 2: 1 },
      stream_id_list: null,
    });

    const token = generateToken04(appId, userId, secret, EXPIRY_SECONDS, payload);
    const expiresAt = Date.now() + EXPIRY_SECONDS * 1000;

    return NextResponse.json({ token, appId, serverUrl, expiresAt });
  } catch (error) {
    console.error("[/api/video/token] Token generation failed:", error);
    return NextResponse.json(
      { error: "Token generation failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Verify API route works**

Restart dev server. Test with curl:

```bash
curl -X POST http://localhost:3000/api/video/token \
  -H "Content-Type: application/json" \
  -d '{"roomId":"test-room","userId":"user-1","userName":"Test User"}'
```

Expected: JSON with `token` (starts with `"04"`), `appId` (number), `serverUrl` (wss://...), `expiresAt` (epoch ms).

Test validation — missing fields:

```bash
curl -X POST http://localhost:3000/api/video/token \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: 400 with `"Missing required fields"`.

- [ ] **Step 5: Commit**

```bash
git add .env.local src/lib/zegoToken.ts src/app/api/video/token/route.ts
git commit -m "feat: ZegoCloud token04 generator + API route

Server-side token generation using AES-256-CBC.
Privilege token with room login + stream publish.
ServerSecret never exposed to client."
```

Note: `.env.local` won't be staged due to `.gitignore` — that's correct. Commit only the code files.

---

### Task 2: Client Credential Flow + Engine Registry

Connect client to the new API route. Update types, credential fetcher, and engine registry.

**Files:**
- Modify: `src/services/credentials.ts`
- Modify: `src/services/video/types.ts:13` (VideoCredential lives in credentials.ts, but JoinContext may need credential fields)
- Modify: `src/services/video/zego.ts`
- Modify: `src/services/video/index.ts`
- Modify: `src/app/(app)/live/[id]/page.tsx:69`

**Interfaces:**
- Consumes: `POST /api/video/token` from Task 1
- Produces:
  - `VideoCredential` type with `appId: number`, `serverUrl: string`, `token: string`, `providerRoomId: string`, `expiresAt: number`
  - `requestVideoCredential(engineId, roomKey, userId, userName): Promise<VideoCredential | null>`
  - `zegoEngine: EmbeddedEngine` (real engine, `requiresBackend: true`)

- [ ] **Step 1: Update `src/services/credentials.ts`**

Replace entire file content:

```typescript
// ═══════════════════════════════════════════
// Credentials Service — จุดเดียวที่ขอ token สำหรับเข้าห้องประชุมฝัง
//
// embedded SDK ทุกตัว ต้องมี token ที่ backend เซ็นด้วย secret
// secret ห้ามอยู่ฝั่งเบราว์เซอร์เด็ดขาด — ใครเปิด DevTools ก็ขโมยได้
//
// fetch จาก /api/video/token → คืน credential พร้อม appId, serverUrl
// fetch ล้มเหลว → คืน null → UI fallback demo mode
// ═══════════════════════════════════════════

import type { EmbeddedEngineId } from "./video/types";

export type VideoCredential = {
  engineId: EmbeddedEngineId;
  /** token ที่ backend เซ็นแล้ว — ส่งให้ SDK ตอน mount */
  token: string;
  /** ห้องจริงของผู้ให้บริการที่ backend แลกมาจาก roomKey */
  providerRoomId: string;
  /** ZegoCloud App ID — client ใช้สร้าง ZegoExpressEngine */
  appId: number;
  /** ZegoCloud Server URL — client ใช้สร้าง ZegoExpressEngine */
  serverUrl: string;
  /** เวลาหมดอายุ (epoch ms) */
  expiresAt: number;
};

/**
 * ขอ credential สำหรับเข้าห้องประชุม
 *
 * @returns null เมื่อ backend ไม่พร้อมหรือ fetch ล้มเหลว
 *          — เป็นสัญญาณให้หน้าจอแสดง demo mode
 */
export async function requestVideoCredential(
  engineId: EmbeddedEngineId,
  roomKey: string,
  userId: string,
  userName: string
): Promise<VideoCredential | null> {
  try {
    const response = await fetch("/api/video/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: roomKey, userId, userName }),
    });

    if (!response.ok) {
      console.warn("[credentials] Token request failed:", response.status);
      return null;
    }

    const data = await response.json();
    return {
      engineId,
      token: data.token,
      providerRoomId: roomKey,
      appId: data.appId,
      serverUrl: data.serverUrl,
      expiresAt: data.expiresAt,
    };
  } catch (error) {
    console.warn("[credentials] Token request error:", error);
    return null;
  }
}
```

- [ ] **Step 2: Install `zego-express-engine-webrtc`**

```bash
npm install zego-express-engine-webrtc
```

- [ ] **Step 3: Replace `src/services/video/zego.ts` with real engine**

```typescript
// ═══════════════════════════════════════════
// ZegoCloud Engine — real SDK integration
//
// mount() สร้าง ZegoExpressEngine จริง แล้ว loginRoom + publish stream
// ถ้า mount ล้มเหลว → คืน noopSession ให้ fallback เป็น demo mode
//
// credential ส่งผ่าน JoinContext.credential (เพิ่มใน types.ts)
// ═══════════════════════════════════════════

import type { EmbeddedEngine, EmbeddedSession, JoinContext } from "./types";

const noopSession: EmbeddedSession = {
  dispose() {},
  onLeft() {},
};

export const zegoEngine: EmbeddedEngine = {
  id: "zegocloud",
  requiresBackend: true,

  async mount(container: HTMLElement, ctx: JoinContext): Promise<EmbeddedSession> {
    // credential ต้องมี — ถ้าไม่มีแปลว่า caller ไม่ควรเรียก mount
    if (!ctx.credential) {
      console.warn("[zegoEngine] No credential provided — returning noop session");
      return noopSession;
    }

    const { token, appId, serverUrl, providerRoomId } = ctx.credential;

    try {
      // Dynamic import — SDK เป็น client-only, ไม่ควร bundle ตอน SSR
      const { ZegoExpressEngine } = await import("zego-express-engine-webrtc");

      const zg = new ZegoExpressEngine(appId, serverUrl);
      const userID = ctx.userId ?? ctx.displayName;
      const streamID = `stream_${providerRoomId}_${userID}_${Date.now()}`;

      // Login room
      await zg.loginRoom(
        providerRoomId,
        token,
        { userID, userName: ctx.displayName },
        { userUpdate: true }
      );

      // Create and publish local stream
      const localStream = await zg.createStream({
        camera: { video: true, audio: true },
      });

      // Attach local video to container
      const localVideo = document.createElement("video");
      localVideo.id = "zego-local-video";
      localVideo.autoplay = true;
      localVideo.playsInline = true;
      localVideo.muted = true;
      localVideo.srcObject = localStream;
      localVideo.style.cssText = "width:100%;height:100%;object-fit:cover;";
      container.appendChild(localVideo);

      await zg.startPublishingStream(streamID, localStream);

      // Handle remote streams
      zg.on("roomStreamUpdate", async (roomID, updateType, streamList) => {
        if (updateType === "ADD") {
          for (const stream of streamList) {
            const remoteStream = await zg.startPlayingStream(stream.streamID);
            const remoteVideo = document.createElement("video");
            remoteVideo.id = `zego-remote-${stream.streamID}`;
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            remoteVideo.srcObject = remoteStream;
            remoteVideo.style.cssText = "width:100%;height:100%;object-fit:cover;";
            container.appendChild(remoteVideo);
          }
        } else if (updateType === "DELETE") {
          for (const stream of streamList) {
            const el = document.getElementById(`zego-remote-${stream.streamID}`);
            el?.remove();
            zg.stopPlayingStream(stream.streamID);
          }
        }
      });

      // Log connection state changes
      zg.on("roomStateChanged", (roomID, reason, errorCode, extendedData) => {
        console.log(`[zegoEngine] Room state: ${reason} (code: ${errorCode})`);
      });

      // Leave callback
      let onLeftCallback: (() => void) | null = null;
      zg.on("roomStateChanged", (_roomID, reason) => {
        if (reason === "KICK_OUT" || reason === "LOGOUT") {
          onLeftCallback?.();
        }
      });

      const session: EmbeddedSession = {
        dispose() {
          try {
            zg.stopPublishingStream(streamID);
            zg.destroyStream(localStream);
            zg.logoutRoom(providerRoomId);
            zg.destroyEngine();
          } catch (err) {
            console.warn("[zegoEngine] dispose error:", err);
          }
          // Clean up DOM
          while (container.firstChild) {
            container.removeChild(container.firstChild);
          }
        },
        onLeft(cb: () => void) {
          onLeftCallback = cb;
        },
      };

      return session;
    } catch (error) {
      console.error("[zegoEngine] mount failed:", error);
      return noopSession;
    }
  },
};
```

- [ ] **Step 4: Add `credential` and `userId` to `JoinContext` in `src/services/video/types.ts`**

Add to `JoinContext` type (after `isHost` field on line 39):

```typescript
  /** credential from backend — null means demo mode */
  credential?: {
    token: string;
    appId: number;
    serverUrl: string;
    providerRoomId: string;
  } | null;
  /** user ID in our system */
  userId?: string;
```

- [ ] **Step 5: Update registry in `src/services/video/index.ts`**

Change import and registry entry:

Replace line 12:
```typescript
import { zegoMockEngine } from "./zegoMock";
```
with:
```typescript
import { zegoMockEngine } from "./zegoMock";
import { zegoEngine } from "./zego";
```

Replace line 24:
```typescript
  zegocloud: zegoMockEngine,
```
with:
```typescript
  zegocloud: zegoEngine,
```

- [ ] **Step 6: Update credential call in `src/app/(app)/live/[id]/page.tsx`**

Replace line 69:
```typescript
    requestVideoCredential(surface.engineId, roomKey).then(setVideoCredential);
```
with:
```typescript
    requestVideoCredential(surface.engineId, roomKey, currentUser.id, currentUser.name).then(setVideoCredential);
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors on the changed files.

- [ ] **Step 8: Commit**

```bash
git add src/services/credentials.ts src/services/video/zego.ts src/services/video/types.ts src/services/video/index.ts "src/app/(app)/live/[id]/page.tsx" package.json package-lock.json
git commit -m "feat: wire real ZegoCloud SDK — credential flow + engine + registry

- credentials.ts fetches from /api/video/token
- zego.ts mounts real ZegoExpressEngine with loginRoom + stream publish
- JoinContext carries credential + userId
- Registry points at real engine
- Live page passes userId/userName to credential request"
```

---

### Task 3: Component Integration + End-to-End Verification

Wire the SDK into the React component and verify the full flow works in the browser.

**Files:**
- Modify: `src/components/meeting/ZegoCloudEmbedStage.tsx`

**Interfaces:**
- Consumes: `zegoEngine.mount()` from Task 2, `VideoCredential` with `appId`/`serverUrl` from Task 2
- Produces: Working video room with real ZegoCloud when credentials present, mock fallback when absent

- [ ] **Step 1: Update `ZegoCloudEmbedStage.tsx` Props type**

Replace the `credential` type in Props (line 13):

```typescript
  credential?: { token: string; providerRoomId: string; appId: number; serverUrl: string } | null;
```

- [ ] **Step 2: Add SDK mount effect**

Add after the existing `useEffect` blocks (after line 44), before the return statement:

```typescript
  // Mount real ZegoCloud SDK when credential is available
  const sdkMounted = useRef(false);
  useEffect(() => {
    if (!credential || !containerRef.current || sdkMounted.current) return;

    const ctx: import("@/services/video/types").JoinContext = {
      meetingId: meeting.id ?? "",
      roomKey: credential.providerRoomId,
      displayName: meeting.participants.find(p => p.present)?.name ?? "User",
      isHost,
      credential: {
        token: credential.token,
        appId: credential.appId,
        serverUrl: credential.serverUrl,
        providerRoomId: credential.providerRoomId,
      },
    };

    import("@/services/video/zego").then(({ zegoEngine }) => {
      zegoEngine.mount(containerRef.current!, ctx).then((session) => {
        sessionRef.current = session;
        sdkMounted.current = true;
        session.onLeft(() => onLeave());
      });
    });

    return () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
      sdkMounted.current = false;
    };
  }, [credential, meeting.id, isHost]);
```

- [ ] **Step 3: Conditionally render mock UI only when no credential**

Wrap the mock video grid (lines 80–113, the `<div className="flex-1 p-4 min-h-0">` block) in a condition:

```typescript
      {/* Video grid — mock UI when no credential, SDK renders into containerRef when credential present */}
      {!credential && (
        <div className="flex-1 p-4 min-h-0">
          {/* ... existing mock grid unchanged ... */}
        </div>
      )}
```

Make the `containerRef` div visible when credential is present by changing its style (line 52):

Replace:
```typescript
      <div ref={containerRef} className="absolute inset-0 pointer-events-none" aria-hidden />
```
With:
```typescript
      <div
        ref={containerRef}
        className={credential
          ? "flex-1 min-h-0 p-2 grid grid-cols-2 md:grid-cols-3 gap-3 auto-rows-fr"
          : "absolute inset-0 pointer-events-none"
        }
        aria-hidden={!credential}
      />
```

- [ ] **Step 4: Wire control buttons to SDK**

Update mic and camera toggle handlers to call SDK methods when mounted. Replace the `ControlButton` onClick handlers in the toolbar (lines 117–130):

For mic button:
```typescript
          onClick={() => {
            setMicOn(!micOn);
            if (sdkMounted.current) {
              import("zego-express-engine-webrtc").then(({ ZegoExpressEngine }) => {
                // SDK mic mute handled through the stream — keeping state sync only
              });
            }
          }}
```

Note: ZegoExpressEngine `muteMicrophone()` / `enableCamera()` operate on the engine instance stored inside `zego.ts`. For MVP, control buttons update UI state; real mute/camera control requires exposing methods from the session. This is acceptable for first integration — refine in follow-up.

- [ ] **Step 5: Verify end-to-end in browser**

1. Start dev server: `npm run dev`
2. Navigate to any meeting with ZegoCloud engine
3. Open browser DevTools Network tab
4. Enter room — verify `POST /api/video/token` returns 200 with token starting `"04"`
5. Verify ZegoCloud SDK initializes (check console for `[zegoEngine]` logs)
6. If another browser/tab joins same room, verify remote stream appears

If no second client available, verify:
- Token generated successfully (Network tab)
- SDK mounts without errors (Console tab)
- `loginRoom` succeeds (Console: `roomStateChanged` with `LOGIN`)
- Local video preview appears in container

- [ ] **Step 6: Test demo mode fallback**

Temporarily rename `.env.local` to `.env.local.bak`. Restart dev server. Enter room.
Expected: API returns 500, credential is null, mock UI shows with "demo mode" badge.
Restore `.env.local`.

- [ ] **Step 7: Commit**

```bash
git add src/components/meeting/ZegoCloudEmbedStage.tsx
git commit -m "feat: mount real ZegoCloud SDK in video room component

SDK renders into container when credential available.
Mock avatar grid remains as fallback when credential is null.
Control buttons sync UI state (SDK mute control in follow-up)."
```

---
