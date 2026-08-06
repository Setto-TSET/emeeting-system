# ZegoCloud Real SDK Integration — Design Spec

**Date:** 2026-08-06
**Status:** Approved
**Scope:** Connect real ZegoCloud video SDK to existing e-Meeting system

---

## Context

System has full mock engine for ZegoCloud (`zegoMock.ts`, `ZegoCloudEmbedStage.tsx`).
Architecture seams in place — `EmbeddedEngine` interface, `credentials.ts`, registry in `index.ts`.
Have production credentials (AppID, ServerSecret, Server URL).
Need to wire real SDK without breaking demo mode fallback.

## Approach

Next.js API Route for token generation (not separate Express backend).
ServerSecret stays server-side only. Client receives signed token + appId + serverUrl.

---

## 1. Environment Variables

**File:** `.env.local` (new, gitignored)

```
ZEGO_APP_ID=1698621897
ZEGO_SERVER_SECRET=<32-char hex>
ZEGO_SERVER_URL=wss://webliveroom1698621897-api.coolzcloud.com/ws
```

No `NEXT_PUBLIC_` prefix — server-side access only.

## 2. API Route

**File:** `src/app/api/video/token/route.ts` (new)

### Contract

```
POST /api/video/token
Content-Type: application/json

Request:  { roomId: string, userId: string, userName: string }
Response: { token: string, appId: number, serverUrl: string, expiresAt: number }
```

### Behavior

- Validate: `roomId`, `userId`, `userName` non-empty — 400 if missing
- Validate: env vars `ZEGO_APP_ID`, `ZEGO_SERVER_SECRET` present — 500 if missing
- Generate ZegoCloud UserToken using official `generateToken04()` algorithm (AES-CBC, not HMAC)
- Token expiry: 1800 seconds (30 minutes)
- Generate **privilege token** (not identity-only) with room_id + login/publish privileges
- Return `appId` and `serverUrl` so client can construct `ZegoExpressEngine`
- Never return `ServerSecret`

### Token Algorithm

ZegoCloud **token04** format (from official `zego_server_assistant` repo):
1. Build tokenInfo: `{ app_id, user_id, nonce, ctime, expire, payload }`
2. payload = JSON `{ room_id, privilege: { 1: 1, 2: 1 }, stream_id_list: null }`
   - privilege key 1 = loginRoom (1=allow)
   - privilege key 2 = publishStream (1=allow)
3. **AES-256-CBC encrypt** tokenInfo with ServerSecret (32-char hex = 32 bytes = AES-256)
4. Pack: [expire(8B)] + [iv_len(2B)] + [iv] + [encrypted_len(2B)] + [encrypted]
5. Base64 encode + prefix `"04"`

Implementation: copy `generateToken04()` from
`github.com/ZEGOCLOUD/zego_server_assistant/token/nodejs/server/zegoServerAssistant.js`
into `src/lib/zegoToken.ts` (rewrite as ESM + TypeScript). Uses only Node.js `crypto` — no extra deps.

## 3. Credentials Service

**File:** `src/services/credentials.ts` (edit)

### Changes

- `VideoCredential` type: add `appId: number`, `serverUrl: string`
- `requestVideoCredential()` signature: add `userId: string`, `userName: string` params
- Body: `fetch("/api/video/token", { method: "POST", body: JSON.stringify({ roomId: roomKey, userId, userName }) })`
- On fetch error or non-ok response: return `null` (UI falls back to demo mode)

## 4. ZegoCloud Real Engine

**File:** `src/services/video/zego.ts` (edit — replace placeholder)

### Behavior

Export `zegoEngine: EmbeddedEngine` with:
- `id: "zegocloud"`
- `requiresBackend: true`
- `mount(container, ctx)`:
  1. Receive credential from component (passed via `ctx` or separate param — see Component section)
  2. `new ZegoExpressEngine(appId, serverUrl)`
  3. `loginRoom(roomId, token, { userID, userName })`
  4. `createStream({ camera: { video: true, audio: true } })`
  5. `startPublishingStream(streamID, localStream)`
  6. Attach local stream to container
  7. Listen `roomStreamUpdate` — on ADD: `startPlayingStream()`, attach to container; on DELETE: remove
  8. Listen `roomStateChanged` — log connection status
  9. Return `EmbeddedSession` with proper `dispose()` and `onLeft()`

### dispose()

1. `stopPublishingStream(streamID)`
2. `destroyStream(localStream)`
3. `logoutRoom(roomId)`
4. `destroyEngine()`

### Error handling

`mount()` wrapped in try/catch — on failure, log error, return noopSession (same as mock).

## 5. Engine Registry

**File:** `src/services/video/index.ts` (edit)

Change: `zegocloud: zegoMockEngine` → `zegocloud: zegoEngine` (import from `./zego`)

Keep `zegoMockEngine` import available but not in registry.

## 6. Component Integration

**File:** `src/components/meeting/ZegoCloudEmbedStage.tsx` (edit)

### Changes

- `Props.credential` type updated to include `appId`, `serverUrl`
- When `credential` is not null:
  - Import and call `zegoEngine.mount(containerRef.current, joinContext)` with credential data
  - Store returned `EmbeddedSession` in `sessionRef`
  - SDK renders into `containerRef` div — real video replaces mock avatars
  - Control buttons (mic/camera) call SDK methods: `muteMicrophone()`, `muteVideo()`
- When `credential` is null:
  - Keep existing mock UI (avatars, simulated speaker rotation)
  - Show "demo mode" badge

### Cleanup

- `useEffect` cleanup calls `sessionRef.current?.dispose()`
- Handles component unmount and route navigation

## 7. Live Page

**File:** `src/app/(app)/live/[id]/page.tsx` (edit)

Change `requestVideoCredential()` call to pass `userId` and `userName`:

```typescript
requestVideoCredential(surface.engineId, roomKey, currentUser.id, currentUser.name)
```

## 8. Dependencies

**Install:**
```
npm install zego-express-engine-webrtc
```

Single package. Token generation uses Node.js built-in `crypto`.

## 9. Error Handling Summary

| Layer | Failure | Behavior |
|-------|---------|----------|
| API Route | env vars missing | 500 + error message |
| API Route | invalid body | 400 + error message |
| API Route | token generation error | 500 + error message |
| credentials.ts | fetch fails / non-200 | return null → demo mode |
| zego.ts mount() | SDK error | catch → return noopSession → demo mode |
| SDK runtime | disconnect | log via `roomStateChanged` listener |

## 10. Files Changed

| File | Action |
|------|--------|
| `.env.local` | New |
| `src/lib/zegoToken.ts` | New — token04 generator (TypeScript port) |
| `src/app/api/video/token/route.ts` | New |
| `src/services/credentials.ts` | Edit |
| `src/services/video/zego.ts` | Edit |
| `src/services/video/index.ts` | Edit |
| `src/services/video/types.ts` | Edit (credential fields in JoinContext or separate) |
| `src/components/meeting/ZegoCloudEmbedStage.tsx` | Edit |
| `src/app/(app)/live/[id]/page.tsx` | Edit |

## 11. Not In Scope

- Backend Express migration (future)
- Auth/JWT on API route (no auth system yet)
- Token refresh before expiry (30 min sufficient for meetings)
- Recording API
- Screen sharing via SDK (keep simulated for now)
