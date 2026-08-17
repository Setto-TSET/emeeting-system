# ZegoCloud Video-Token Backend — Design

> **สถานะ:** Approved
> **วันที่:** 2026-08-06
> **ขอบเขต:** เฉพาะการย้าย ZegoCloud token generation จาก client ไป backend — ไม่รวม auth/DB/full backend

## Context

ระบบปัจจุบันไม่มี backend เลย (ดู `docs/backend-design.md` สำหรับแผนเต็มระบบ 5 phases) จุดที่อันตรายที่สุดในเชิง security คือ `src/services/video/zegoToken.ts` — hardcode `ZEGO_SERVER_SECRET` และรัน AES-CBC token algorithm ทั้งหมดฝั่ง client ทุกคนที่เปิด DevTools เห็น secret ได้ทันที

งานนี้แก้เฉพาะจุดนี้จุดเดียว: สร้าง Next.js API route ที่ออก ZegoCloud token ฝั่ง server แล้วให้ client เรียกผ่าน `fetch` แทนการคำนวณเอง — ไม่แตะระบบ auth/DB เพราะยังไม่มีอยู่ในระบบ (นอกขอบเขตงานนี้ ดู `docs/backend-design.md` Phase 1-2 สำหรับตอนที่จะทำ)

**ระบบ auth ปัจจุบันยังเป็น prototype** (`src/lib/session.ts` — ตรวจแค่อีเมล ไม่มี JWT/cookie) ดังนั้น endpoint ที่ออกมาจากงานนี้จะ**ไม่มี auth check และ token ที่เซ็นออกมาก็ไม่ได้ผูกกับห้องใดห้องหนึ่ง** — ใครก็เรียกขอ token สำหรับ `user_id` ใดก็ได้ และใช้เข้าห้องประชุมใดก็ได้ในระบบ ไม่ใช่แค่ห้องที่ส่ง `roomKey` มา (ยอมรับความเสี่ยงนี้ไปก่อนเพราะระบบยังไม่มี auth จริง) เมื่อ auth จริงมาในอนาคต ค่อยเพิ่ม `requireAuth()` และผูก token เข้ากับห้องผ่าน privilege payload ของ ZegoCloud

## Observed Existing Issue (ไม่แก้ในงานนี้)

`src/services/video/zego.ts` และ `embeddedEngines` registry ใน `src/services/video/index.ts` เป็น **dead code** — ไม่มีจุดไหนเรียก `.mount()` จริง flow จริงที่ใช้งานคือ:

```
live/[id]/page.tsx → requestVideoCredential() (credentials.ts) → credential
                    → ส่งเข้า <ZegoCloudEmbedStage> ซึ่ง init SDK เองตรงๆ ในคอมโพเนนต์
```

งานนี้แก้เฉพาะจุดที่อยู่ใน call path จริง (`credentials.ts`, `zegoToken.ts`) ไม่แตะ `zego.ts`/`index.ts` เพราะไม่กระทบงานนี้และเป็น refactor แยกเรื่อง

## Architecture

```
┌─────────────────┐     POST /api/video/token      ┌──────────────────────┐
│ credentials.ts    │ ───────{roomKey,userID}────▶  │ src/app/api/video/    │
│ (client)          │                                │  token/route.ts       │
│                    │ ◀──{token,appId,userID,exp}── │  (Node runtime)       │
└─────────┬─────────┘                                └──────────┬────────────┘
          │                                                       │
          │ credential                                imports     │ process.env
          ▼                                                       ▼ (server-only)
┌──────────────────────┐                            ┌──────────────────────────┐
│ ZegoCloudEmbedStage    │                            │ src/lib/zegoServerToken.ts │
│ (ใช้ ZEGO_APP_ID       │                            │  generateZegoToken()      │
│  จาก env, ใช้ credential│                            │  (ย้ายจาก zegoToken.ts)   │
│  ไปเปิด SDK จริง)      │                            └──────────────────────────┘
└──────────────────────┘
```

`ZEGO_SERVER_SECRET` อยู่ใน `.env.local` เท่านั้น โค้ดที่ import มันอยู่ใน route handler (server-only module) ไม่มีทางถูก bundle ไปฝั่ง client

## Endpoint Contract

**`POST /api/video/token`**

Request body:
```json
{ "roomKey": "string (required)", "displayName": "string (optional)" }
```

Response `200`:
```json
{
  "token": "04...",
  "appId": 1698621897,
  "userID": "user_ab12cd",
  "roomKey": "...",
  "expiresAt": 1234567890000
}
```

- `userID`: sanitize จาก `displayName` เหมือน logic เดิมใน `credentials.ts` (ตัด whitespace, จำกัดความยาว, fallback เป็นสุ่มถ้าไม่ส่งมา) — ย้าย logic นี้ไป server ตรงๆ ไม่เปลี่ยนพฤติกรรม
- Validation: `roomKey` ต้องไม่ว่าง (string, trim แล้ว length > 0) → ถ้าไม่ผ่าน คืน `400 { error: "roomKey is required" }`
- ไม่มี auth check
- Runtime: Node.js (default ของ route handler) — ใช้ `crypto.subtle` เหมือนเดิม ย้าย algorithm ทั้งดุ้นจาก `zegoToken.ts` ไม่เขียนใหม่
- Config ไม่ครบ (`ZEGO_APP_ID`/`ZEGO_SERVER_SECRET` ไม่ได้ตั้งใน env) → คืน `500 { error: "ZegoCloud not configured" }`

## File Changes

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/lib/zegoServerToken.ts` **(ใหม่)** | ย้าย `generateZegoToken()` + AES-CBC token algorithm จาก `zegoToken.ts` มาทั้งดุ้น อ่าน `ZEGO_APP_ID`/`ZEGO_SERVER_SECRET` จาก `process.env` (ไม่มี prefix `NEXT_PUBLIC_` — server-only, throw/return error ชัดเจนถ้า env ไม่ครบ) |
| `src/app/api/video/token/route.ts` **(ใหม่)** | `POST` handler: parse body → validate `roomKey` → sanitize `userID` จาก `displayName` → เรียก `generateZegoToken()` → คืน JSON ตาม contract ด้านบน |
| `src/services/video/zegoToken.ts` | ลบ algorithm + `ZEGO_SERVER_SECRET` ทิ้งทั้งหมด เหลือแค่ `export const ZEGO_APP_ID = Number(process.env.NEXT_PUBLIC_ZEGO_APP_ID)` (client-safe) |
| `src/services/credentials.ts` | `requestVideoCredential()`: เปลี่ยนจากเรียก `generateZegoToken()` ตรงๆ → `fetch("/api/video/token", { method: "POST", body: JSON.stringify({ roomKey, displayName: userID }) })` แล้ว map response เป็น `VideoCredential` เดิม (shape ไม่เปลี่ยน จึงไม่กระทบผู้เรียกที่ `live/[id]/page.tsx`) |
| `src/services/video/zego.ts` | ไม่ต้องแก้ logic ยังคง import `ZEGO_APP_ID` จาก `zegoToken.ts` เหมือนเดิม (ค่าที่ได้เปลี่ยนจาก hardcode เป็น env-backed อัตโนมัติ) |
| `.env.local` **(ใหม่, gitignored อยู่แล้วจาก `.gitignore` ที่มี `.env*.local`)** | `ZEGO_APP_ID=1698621897`<br>`ZEGO_SERVER_SECRET=your-zego-server-secret-here`<br>`NEXT_PUBLIC_ZEGO_APP_ID=1698621897` |
| `.env.example` **(ใหม่, commit เข้า git)** | เหมือนกันแต่ secret เป็น placeholder เช่น `ZEGO_SERVER_SECRET=your-server-secret-here` — บอก dev คนอื่นว่าต้องตั้งอะไร |

`ZegoCloudEmbedStage.tsx` ที่ import `ZEGO_APP_ID` จาก `zegoToken.ts` **ไม่ต้องแก้** — import path เดิม ค่าที่ได้เปลี่ยนจาก hardcode เป็น env-backed โดยอัตโนมัติ

## Error Handling

- `roomKey` ว่างหรือไม่ส่งมา → API `400 { error: "roomKey is required" }` → `requestVideoCredential()` คืน `null` (เหมือนพฤติกรรมเดิมตอน `engineId !== "zegocloud"`) → `ZegoCloudEmbedStage` fallback เป็น demo mode (component รองรับ `credential == null` อยู่แล้ว)
- Config ไม่ครบ → API `500 { error: "ZegoCloud not configured" }` → เช่นเดียวกัน คืน `null` ให้ client, ไม่ throw ที่หน้าประชุม
- Network error ตอน fetch → catch แล้วคืน `null` เหมือนกัน (ไม่ crash หน้า live)

## Testing / Verification Plan

1. `curl -X POST localhost:3000/api/video/token -H "Content-Type: application/json" -d '{"roomKey":"test-room"}'` → ได้ `token` ที่ขึ้นต้นด้วย `"04"` ตามฟอร์แมตเดิม
2. `curl -X POST localhost:3000/api/video/token -H "Content-Type: application/json" -d '{}'` → ได้ `400`
3. Build (`npm run build`) แล้ว `grep -r "ZEGO_SERVER_SECRET\|your-zego-server-secret-here" .next/static` → ต้องไม่เจอ (ยืนยัน secret ไม่ถูก bundle ไป client)
4. เปิดหน้า `/live/[id]` จริง (meeting ที่ provider เป็น zegocloud) → เข้าห้องได้ปกติเหมือนก่อนแก้ (regression check ว่า credential flow ยังทำงาน)
5. `npx tsc --noEmit` ผ่าน (type-check ทั้งโปรเจกต์)

## Out of Scope

- Auth/session จริง (JWT, DB) — รอ `docs/backend-design.md` Phase 1-2
- แก้ dead code ใน `zego.ts` / `embeddedEngines` registry
- Rate limiting / abuse protection บน endpoint นี้
- Production file storage, meetings/bookings API อื่นๆ ทั้งหมดใน `docs/backend-design.md`
