# e-Meeting System — Project Status Report

**Project:** ระบบประชุมออนไลน์พร้อมความลับ + สรุปประชุมอัตโนมัติ + ZegoCloud Integration  
**Status:** Phase 0–F Complete (code) — **Frontend (Vercel) + Backend (Render) + MySQL (Aiven) deployed และใช้งานได้จริง** (free tier), backup DB รายวันอัตโนมัติ, Server-Side Thai ASR (Typhoon self-host) implement ครบและรันในเครื่องได้ — เหลือยืนยัน ASR บน production + ทดสอบสองเครื่อง, Email service, AI summary จริง (ยังเป็น mock), Zoom Room SIP bridge (blocked on licensing)  
**Last Updated:** 2026-10-14  
**Repository:** https://github.com/Setto-TSET/emeeting-system  
**Production:** https://meeting-system-features-40fa4d.vercel.app (frontend) · https://emeeting-backend.onrender.com (backend, `/health`)

---

## 📊 Executive Summary

### ✅ ที่ทำเสร็จแล้ว
ระบบประชุมเว็บ **พร้อมใช้งานสาธิตแล้ว พร้อมวิดีโอจริง**:
- ✅ ผู้ใช้ 5 บทบาท (Admin, Secretary, Executive, Staff, External Guest)
- ✅ การจองห้องประชุม / คณะทำงาน / การตรวจสอบสิทธิ์
- ✅ วิดีโอจริงผ่าน **ZegoCloud SDK** (token04 generator + API route + engine + component — ต่อ credential จริงสำเร็จแล้ว, Webex ถูกตัดออกจากระบบทั้งหมด)
- ✅ ความลับระดับการประชุม (watermark + blur-on-blur + right-click block)
- ✅ สรุปประชุมอัตโนมัติจาก AI (pipeline mock สำเร็จ) + notification flow + .ics calendar
- ✅ อัปโหลดเอกสารจริง (เก็บที่ server, MySQL) + preview ด้วย PDF/Markdown viewer
- ✅ การจำหน่ายเอกสารตามสิทธิ์ (4 ระดับการมองเห็น)
- ✅ Guest Join — Magic Link flow (เชิญบุคคลภายนอกเข้าประชุมโดยไม่ต้องสร้างบัญชี, ใช้งานได้จริงแล้ว ไม่ใช่แค่ plan)
- ✅ โหวตแบบ realtime, ยกมือแบบ realtime, ซับไตเติลสด (ถอดเสียงที่ server ด้วย Typhoon ASR self-host ใช้ได้ทุกเบราว์เซอร์ที่รองรับ AudioWorklet), ถอดคำพูด + แชร์เอกสารซิงค์ — ผ่าน WebSocket backend ที่ authenticate ด้วย JWT แล้ว **sync ข้ามเครื่อง/ข้ามเบราว์เซอร์ได้จริง** state ทั้งหมดเก็บที่ server (MySQL) ไม่ใช่ per-tab อีกต่อไป, คนเข้าห้องทีหลังดึง snapshot ปัจจุบันผ่าน `GET /api/rooms/:meetingId/state` (ดู README.md)
- ✅ **การจองห้อง / การประชุม / ไฟล์เอกสาร อยู่ที่ server หมดแล้ว** — ไม่ใช่ localStorage/IndexedDB อีกต่อไป ทุกคนเห็นข้อมูลชุดเดียวกัน; การจองเช็คทับซ้อนใน transaction เดียวกับ insert (`SELECT ... FOR UPDATE`) กันจองชนกัน คืนค่า 409
- ✅ Backend containerised แล้ว — `backend/Dockerfile` + `deploy/docker-compose.yml` (MySQL 8 + backend + Caddy reverse proxy พร้อม TLS อัตโนมัติ) + `deploy/.env.example`; เพิ่ม `render.yaml` (Render blueprint, MySQL ใช้ Aiven ผ่าน `DATABASE_URL`) + คู่มือ `deploy/RENDER.md`, `deploy/KOYEB.md`
- ✅ **Backend deploy จริงแล้ว** — Render (`emeeting-backend.onrender.com`) + Aiven MySQL ตาม `deploy/RENDER.md`; frontend production ชี้มาที่ backend นี้แล้ว (`NEXT_PUBLIC_API_BASE_URL`/`NEXT_PUBLIC_WS_URL`)
- ✅ **Ops บน free tier** — GitHub Actions `keepalive.yml` ปลุก Render + Aiven ทุก 10 นาที, `backup-db.yml` dump Aiven MySQL ทุกวัน 02:00 (เก็บเป็น artifact), สคริปต์ `deploy/warmup.ps1` / `deploy/backup-db.ps1` สำหรับรันมือ
- ✅ **ตั้งแต่ 2026-08-31:** ลิงก์เชิญ guest ย้ายขึ้น server (`backend/src/routes/guestLinks.ts`), ล็อกอินด้วย username ได้, logout ล้าง JWT จริง (ลบ role switcher ฝั่ง client ที่ไม่ตรงกับ JWT), manager/organizer ลบการประชุมได้, export การยอมรับเงื่อนไขความลับเป็น CSV, สคริปต์ `reset-password` สำหรับบัญชี seed, ASR sidecar บังคับ `ASR_TOKEN` เมื่ออยู่บน public URL
- ✅ **Phase F: Server-Side Thai ASR implement ครบแล้ว** — ASR sidecar (`asr/server.py`, FastAPI + typhoon-asr + Dockerfile + tests), backend audio pipeline (`backend/src/realtime/audio.ts`, `asrClient.ts`), frontend PCM capture (`src/services/speech/pcm.ts`, `audioCapture.ts`, `public/pcm-worklet.js`) พร้อม design spec + ผลวัด CER/latency

### ⏳ ยังเลื่อน
- ⏳ ข้อจำกัด free tier — Render หลับเมื่อ idle (ตื่นครั้งแรก ~40–50 วินาที; GitHub cron ของ keepalive ดีเลย์ได้เป็นชั่วโมง จึงยังเจอ cold start), รันได้ instance เดียว (ห้อง realtime อยู่ใน memory), ไฟล์เอกสารเป็น BLOB ใน MySQL กินโควตา Aiven; custom domain ยังไม่ได้ตั้ง
- ⏳ Server-Side Thai ASR (Phase F) — โค้ดครบทุกชั้น, sidecar รันในเครื่องผ่าน `dev-start.ps1` ได้แล้ว (2026-10-14) — ยังไม่ได้ยืนยันว่า production ตั้ง `ASR_URL`/`ASR_TOKEN` บน Render แล้ว, ยังไม่ได้ทดสอบสองเครื่องจริงและวัด CER จากเสียงประชุมจริง
- ❌ AI สรุปการประชุมจริง — pipeline ยังเป็น mock (ต้องใส่ `ANTHROPIC_API_KEY` และต่อของจริง)
- ❌ Email service จริง (template พร้อม, รอเลือก Sendgrid/AWS SES)
- ❌ Zoom Room enterprise SIP bridge (Phase E placeholder UI ทำแล้ว, ตัว SIP bridge จริงรอ ZegoCloud Enterprise Plan)
- ⏳ Server-side audit logging — `backend/` มี `POST /api/audit/log-view` + `GET /api/audit/logs` (admin-only) แล้ว แต่ frontend ยังไม่เรียกใช้จริง; signed URLs ยังไม่ทำ (Phase 2 security) — ส่วน authentication (JWT + bcrypt) และ server-side authorization (ใครเข้าห้องไหนได้, ใครเป็น manager) ทำเสร็จแล้ว

---

## 🎯 Phases Status

### Phase 0: Refactor & Foundation ✅ COMPLETE
| Task | Status | Output |
|------|--------|--------|
| รวม data sources → `src/data/index.ts` | ✅ | Single source of truth สำหรับทุกข้อมูล |
| ลบ hardcode currentUser | ✅ | `useCurrentUser()` hook ทำงานจริง |
| ย้ายจาก string → id mapping | ✅ | `Meeting.id`, `User.userId`, `Committee.id` |
| หน้าจองบันทึกได้จริง | ✅ | `BookingContext` + `addMeeting()` |
| เดวเลยพอที่จะต่อ backend | ✅ | Routes สำเร็จ ข้อมูล single source |

**Code Quality:** TypeScript strict, ESLint clean, no dead code

---

### Phase A: Thai Transcription Testing ✅ COMPLETE
| Task | Status | Outcome |
|------|--------|---------|
| ทดสอบถอดเสียงภาษาไทยจริง | ✅ | ไทยเล็กน้อยแต่ใช้ได้ สำคัญพอสำหรับ proof-of-concept |
| Go/No-Go decision | ✅ | **GO:** Webex + Claude AI → implement (ภายหลังเปลี่ยนเป็น ZegoCloud — ดูหมายเหตุ Phase B) |
| เลือก STT provider | ✅ | **Webex Transcript API** (ถ้าจัดซื้อ) → **Web Speech API** → ปัจจุบัน **Typhoon ASR self-host** ฝั่ง server (ไม่มีค่าใช้จ่ายต่อนาที เสียงไม่ออกนอกองค์กร) |
| เลือก LLM provider | ✅ | **Claude API** (สำเร็จได้ดี) |

---

### Phase B: Video Engine Seam ✅ COMPLETE (superseded — see note)
| Task | Status | Files |
|------|--------|-------|
| `VideoEngine` interface | ✅ | `src/services/video/types.ts` |
| Mock implementation | ✅ | ~~`src/services/video/webexMockEngine.ts`~~ ลบแล้ว |
| Webex placeholder | ✅ | ~~`src/services/video/webex.ts`~~ ลบแล้ว |
| Wire ใน live page | ✅ | `src/app/(app)/live/[id]/page.tsx` |

> **หมายเหตุ (2026-08-13):** Webex ถูกตัดออกจากระบบทั้งหมดแล้ว — `WebexEmbedStage.tsx`,
> `src/services/video/webex.ts`, `webexMock.ts` ถูกลบ, `ConferenceProvider`/`EmbeddedEngineId`
> ไม่มีค่า `"webex"` อีกต่อไป ระบบใช้ **ZegoCloud เป็น video engine เดียว** ถาวร (มี credential จริงแล้ว
> ใน `.env.local`) รายละเอียดด้านล่างเก็บไว้เป็นประวัติการพัฒนาเท่านั้น

---

### Phase C: Production Seams (Transcription + Summarize + Watermark) ✅ COMPLETE

#### C-1: Anti-Leak Layer ✅
| Protection | Implemented | How |
|---|---|---|
| Watermark | ✅ | Grid 6×4, -30° rotation, 20% opacity, dynamic timestamp |
| Blur-on-blur | ✅ | `visibilitychange` + `blur`/`focus` events → opaque z-20 overlay |
| Right-click block | ✅ | `onContextMenu: preventDefault()` + Ctrl/Cmd+P block |
| No download button | ✅ | ไฟล์อยู่ที่ server หลัง JWT (no static URL) |
| Confidentiality badges | ✅ | "ลับ" (restricted) / "ลับมาก" (top_secret) |

**File:** `src/components/meeting/DocumentPreview.tsx` + `Watermark.tsx`

#### C-2: Confidentiality Levels ✅
```typescript
Meeting.confidentialityLevel: "normal" | "restricted" | "top_secret"
- normal:      watermark 1x per 30s
- restricted:  watermark 1x per 15s + orange badge
- top_secret:  watermark 1x per 5s + user-select: none
```
**UI:** Dropdown ตอนสร้าง/แก้ประชุม (`meetings/new/page.tsx`, `meetings/[id]/page.tsx`)

#### C-3: Mock Transcription + Summarizer ✅
| Component | Status | File |
|---|---|---|
| Mock transcript generator | ✅ | `src/services/transcription/mockProvider.ts` |
| Mock summarizer | ✅ | `src/services/summarize/mockSummarizer.ts` |
| Report builder (Markdown + PDF) | ✅ | `src/services/summarize/reportBuilder.ts` |
| Markdown viewer component | ✅ | `src/components/meeting/MarkdownViewer.tsx` |

**Flow:** "ขอ Transcript" (2s) → "สร้างร่างรายงาน" → ไฟล์ type `report_draft` ปรากฏที่ `/documents`

#### C-4: UI สรุปการประชุม ✅
**File:** `src/app/(app)/meetings/[id]/page.tsx`

Section "สรุปการประชุมอัตโนมัติ":
- ปุ่ม "ขอ Transcript" → status processing → ready
- ปุ่ม "สร้างร่างรายงาน" → เรียก API → บันทึก draft
- ไฟล์ draft โผล่ที่ `/documents` + `/reports` ด้วย badge "ร่าง"

#### C-5: Webex Production Seam ✅ (ลบแล้ว — ดูหมายเหตุด้านบน)
| Component | Status | Details |
|---|---|---|
| Container ref | ✅ | ~~`WebexEmbedStage.tsx`~~ ลบแล้ว, แทนที่ด้วย `ZegoCloudEmbedStage.tsx` |
| Credential fetch | ✅ | `requestVideoCredential()` call ก่อนแสดง stage (ยังใช้อยู่ กับ ZegoCloud) |
| Session disposal | ✅ | `session.dispose()` on leave |
| Mock fallback | ❌ ตัดออกแล้ว | ไม่มี "demo mode" badge อีกต่อไป — credential fail แล้วแสดง error state จริง |

**Files (ปัจจุบัน):**
- `src/components/meeting/ZegoCloudEmbedStage.tsx`
- `src/app/(app)/live/[id]/page.tsx`
- `src/lib/zegoToken.ts`, `src/app/api/video/token/route.ts`

#### C-6: Commit & Push ✅
```
✅ e4dd2a7: feat: อัปโหลด+เปิดอ่านเอกสารจริง + ชั้นกันข้อมูลรั่วในเว็บ
✅ 5573f6c: fix: 5 บั๊กจาก code review — race, webcam, roster, form, timer
✅ e20cadc: feat(video): Webex engine จำลอง สำหรับเดโม Phase C
✅ 33f57c6: feat(video): วางโครง interface สำหรับระบบประชุมในเว็บ + ถอดเสียง/สรุป
✅ 77b267f: feat(documents): เอาปุ่มดาวน์โหลดออก เหลือเฉพาะการดูในเว็บ
```

---

### Phase D: Guest Join + Calendar Integration ✅ COMPLETE
| Component | Status | File |
|---|---|---|
| Complete flow documentation | ✅ | `GUEST_JOIN_CALENDAR_PLAN.md` |
| Magic Link flow (invite guest, no account) | ✅ | commit `4bc89a6` |
| End meeting + enable transcript request | ✅ | commit `854d2dc` |
| Guest notification when meeting ends | ✅ | commit `4a585be`, `707574e` |
| Notification flow + .ics calendar + transcript/summary pipeline | ✅ | commit `c199989` |
| Guest link ที่ server | ✅ | `backend/src/routes/guestLinks.ts` (commit 2026-08-31) |
| ส่งอีเมลเชิญอัตโนมัติ | ⏳ | ยังไม่ทำ — รอเลือก email service |

**Key Features (working in demo):**
- Organizer adds guests + sends batch invitations
- Guest receives magic link (click to join, no account needed)
- .ics calendar file generation (RFC 5545)
- Guest notified when meeting ends + transcript flow

---

### ZegoCloud Real SDK Integration ✅ COMPLETE
| Component | Status | File |
|---|---|---|
| Design spec + implementation plan | ✅ | `docs/superpowers/specs/2026-08-06-zegocloud-real-sdk-integration-design.md`, `docs/superpowers/plans/2026-08-06-zegocloud-real-sdk-integration.md` |
| Token04 generator + API route | ✅ | `src/lib/zegoToken.ts` |
| Mock engine (Phase D-1, kept as fallback) | ✅ | `src/services/video/zegoMock.ts` |
| Real engine wired + userId plumbed | ✅ | `src/services/video/zego.ts` |
| Video room component mounted | ✅ | `src/components/meeting/ZegoCloudEmbedStage.tsx` |
| ServerSecret scrubbed from docs | ✅ | fixed in commit `c6b92ad` |

Replaces the earlier Webex mock as the primary video engine seam.

---

### Phase E: Voting / Hand Raise / Subtitle / Zoom Room ✅ COMPLETE (UI/demo layer)
| Component | Status | File |
|---|---|---|
| Design spec (signaling layer, voting, hand raise, subtitle, Zoom Room placeholder) | ✅ | `docs/superpowers/specs/2026-08-11-meeting-system-features-design.md` |
| Implementation plan | ✅ | `docs/superpowers/plans/2026-08-12-meeting-system-features.md` |
| Realtime signaling layer (BroadcastChannel) | ✅ | `src/services/signaling/`, `src/context/RoomSignalingContext.tsx` |
| Voting system | ✅ | `src/services/voting/`, `src/components/meeting/Vote*.tsx` |
| Realtime hand raise | ✅ | `src/components/meeting/HandRaiseList.tsx` + live room wiring |
| ซับไตเติลสด | ✅ | เดิม `webSpeechProvider.ts` (ลบแล้ว) ปัจจุบัน `src/services/speech/audioCapture.ts` + `src/components/meeting/SubtitleBar.tsx` |
| Transcript capture + viewer | ✅ | `src/services/transcript/store.ts`, `src/components/meeting/TranscriptTimeline.tsx` |
| Document sharing sync | ✅ | live room `doc_share`/`doc_share_page`/`doc_share_stop` wiring |
| Zoom Room placeholder (needs enterprise plan for SIP bridge) | ⏳ | `src/components/meeting/ZoomRoomStatus.tsx` shows UI; SIP bridge not implemented, blocked on licensing |

---

### Deployment Packaging ✅ COMPLETE (2026-08-24)
| Component | Status | File |
|---|---|---|
| Backend container image (multi-stage, Node 20) | ✅ | `backend/Dockerfile`, `backend/.dockerignore` |
| Compose stack: MySQL 8 + backend + Caddy reverse proxy | ✅ | `deploy/docker-compose.yml` |
| Reverse proxy + automatic TLS | ✅ | `deploy/Caddyfile` |
| Environment template + เอกสาร backend env | ✅ | `deploy/.env.example`, `backend/.env.example`, `backend/README.md` |
| Render blueprint (backend + Aiven MySQL) | ✅ | `render.yaml`, `deploy/RENDER.md`, `deploy/KOYEB.md` |
| ยกขึ้น host จริง | ✅ | Render + Aiven (`emeeting-backend.onrender.com`) |
| Keep-alive + backup DB รายวัน | ✅ | `.github/workflows/keepalive.yml`, `.github/workflows/backup-db.yml` |
| Custom domain | ⏳ | ยังใช้ `*.onrender.com` / `*.vercel.app` |

---

### Phase F: Server-Side Thai ASR (Typhoon) ✅ CODE COMPLETE — รอทดสอบสองเครื่องจริง
| Component | Status | File |
|---|---|---|
| Design spec (พร้อมผลวัด CER/latency จริง) | ✅ | `docs/superpowers/specs/2026-08-24-server-side-thai-asr-design.md` |
| Implementation plan (task-by-task) | ✅ | `docs/superpowers/plans/2026-08-24-server-side-thai-asr.md` |
| ASR sidecar (Python + FastAPI + typhoon-asr) | ✅ | `asr/server.py`, `asr/Dockerfile`, `asr/requirements.txt`, `asr/tests/` |
| Backend audio pipeline | ✅ | `backend/src/realtime/audio.ts`, `backend/src/realtime/asrClient.ts` |
| Frontend PCM capture (AudioWorklet) | ✅ | `src/services/speech/pcm.ts`, `src/services/speech/audioCapture.ts`, `public/pcm-worklet.js` |
| รันในเครื่อง (`asr/.venv` + `dev-start.ps1`) | ✅ | โหลดโมเดล + `/transcribe` ผ่าน (2026-10-14) |
| ASR บน production (`ASR_URL`/`ASR_TOKEN` บน Render) | ⏳ | ยังไม่ได้ยืนยัน — ดู `deploy/HUGGINGFACE.md` |
| ทดสอบสองเครื่องจริง + วัด CER จากเสียงประชุมจริง | ⏳ | ยังไม่ได้ทำ |

**เหตุผล:** Web Speech API มีเฉพาะ Chromium (Safari/Firefox/มือถือบางรุ่นไม่มีคำบรรยายเลย), คุณภาพภาษาไทยปรับแต่งไม่ได้ และเสียงออกนอกองค์กร (ส่งไปประมวลผลที่ Google) ซึ่งขัดกับจุดขายเรื่องความลับของระบบ — แผนคือ self-host Typhoon ASR บน VM เดียวกับ backend แล้วเข้าเส้นทาง `subtitle_text` เดิม

---

## 📁 Project Structure

```
D:\Internship\meeting Porject/
├── src/                          # Next.js frontend (React + TypeScript)
│   ├── app/(app)/                # Route group (protected pages)
│   │   ├── dashboard/            # Dashboard with meetings overview
│   │   ├── meetings/             # Meeting list + detail + edit
│   │   ├── live/[id]/            # Video room + documents
│   │   ├── documents/            # File browser
│   │   ├── reports/              # Report drafts + final
│   │   ├── portal/               # External guest document access
│   │   └── committees/           # Committee management
│   ├── components/               # Reusable React components
│   │   ├── meeting/              # Meeting-specific components
│   │   │   ├── ZegoCloudEmbedStage # Video playback (Webex ตัดออกแล้ว)
│   │   │   ├── DocumentPreview   # PDF/Image/Markdown viewer
│   │   │   ├── Watermark         # Anti-leak overlay
│   │   │   └── MarkdownViewer    # Markdown → HTML renderer
│   │   ├── ui/                   # Shadcn UI components
│   │   └── layout/               # Navigation, sidebar
│   ├── lib/                      # Utilities
│   │   ├── authz.ts              # Capability model (pure function)
│   │   ├── access.ts             # Route-level access (binary)
│   │   ├── clock.ts              # Date/time utilities
│   │   ├── conference.ts         # Conference room link parsing
│   │   └── ...
│   ├── services/                 # Business logic
│   │   ├── video/                # Video engine seam — ZegoCloud เท่านั้น (Webex ตัดออกแล้ว)
│   │   │   ├── types.ts
│   │   │   ├── index.ts
│   │   │   └── zego.ts
│   │   ├── transcription/        # Transcription seam
│   │   │   ├── types.ts
│   │   │   ├── index.ts
│   │   │   └── mockProvider.ts
│   │   ├── summarize/            # Summarization seam
│   │   │   ├── types.ts
│   │   │   ├── mockSummarizer.ts
│   │   │   ├── reportBuilder.ts
│   │   │   └── index.ts
│   │   ├── fileStorage.ts        # ไฟล์เอกสารผ่าน backend API
│   │   ├── api/                  # client, meetings, bookings
│   │   ├── session.ts            # Session management
│   │   └── ...
│   ├── contexts/                 # React Context
│   │   ├── UserContext           # Current user + sign in
│   │   ├── MeetingContext        # Meetings + CRUD
│   │   ├── BookingContext        # Room booking
│   │   └── ...
│   └── data/                     # seed/reference data (users, committees)
│       └── index.ts
│
├── backend/                      # Node.js + Express API — deploy บน Render แล้ว
│   ├── src/
│   │   ├── server.ts             # Express entry point
│   │   ├── middleware/           # Auth, error handler
│   │   ├── routes/               # API endpoints
│   │   │   ├── transcription.ts  # /api/transcription/* (video.ts ลบแล้ว — ดูหมายเหตุด้านล่าง)
│   │   │   └── summarize.ts      # POST /api/summarize
│   │   ├── services/             # Business logic (webex.ts ลบแล้ว)
│   │   │   └── claude.ts         # Claude API wrapper
│   │   └── database/             # MySQL connection + migrations
│   ├── package.json
│   ├── .env.example
│   └── README.md
│
├── docs/                         # Documentation
│   ├── SECURITY_PLAN.md          # 4-layer security model
│   ├── GUEST_JOIN_CALENDAR_PLAN.md # Guest invite feature
│   └── PROJECT_STATUS.md         # This file
│
├── .env.example                  # Environment template
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```

---

## 🔐 Security Architecture

### 4-Layer Model (Implemented: Layer 1–2, Planned: Layer 3–4)

| Layer | Status | Implementation |
|-------|--------|-----------------|
| **Layer 1: Access Control** | ✅ | JWT + session + `can()` capability model + guest magic token (24h) |
| **Layer 2: Client-Side Deterrent** | ✅ | Watermark + blur-on-blur + right-click block + confidentiality levels |
| **Layer 3: Server-Side Protection** | ⏳ | Audit logging (`backend/src/routes/audit.ts` มีแล้ว แต่ frontend ยังไม่เรียก) + signed URLs (60s) + single-active session ยังไม่ทำ |
| **Layer 4: Policy & Legal** | 📋 | NDA template, data classification, incident response (org responsibility) |

**Key Protections:**
- ✅ Watermark shows viewer name + timestamp (survives screenshot)
- ✅ Blur-on-blur when window inactive
- ✅ Confidentiality levels (normal/restricted/top_secret) control watermark refresh rate
- ✅ Documents เก็บที่ server หลัง JWT + สิทธิ์ (ไม่มี static URL ให้แชร์)
- ✅ Permissions checked per action + per resource

**Cannot Prevent (Accepted Risk):**
- OS screen recording (Win+G, OBS)
- PrintScreen / Snipping Tool
- Mobile camera recording
- DevTools inspect
- Insider threat (password sharing)

**Mitigations:**
- 📋 Legal accountability (NDA)
- 📋 Audit trail (log who accessed what when)
- 📋 Organizational training

**File:** `SECURITY_PLAN.md`

---

## 🏗️ Backend Architecture ✅ IMPLEMENTED + DEPLOYED (Render + Aiven)

> **หมายเหตุ (2026-08-31):** Video token ยังออกจาก Next.js API route โดยตรง
> (`src/app/api/video/token/route.ts`) ส่วน backend Express (`backend/`) implement แล้วจริง:
> auth, meetings, bookings, rooms/realtime state, transcription, summarize, audit
> โค้ดจริงอยู่ที่ `backend/src/routes/` และ `backend/src/repositories/` มี test ครบ

### Database Schema
Schema จริงอยู่ที่ `backend/src/database/schema.sql` (+ `migrations.ts`, `seed.ts`) —
ครอบคลุม users, meetings, meeting_files, bookings, votes, hand_raises, transcript, doc_share,
guest invites และ audit logs

### API Endpoints
Implement แล้ว (`backend/src/routes/`): `auth.ts`, `meetings.ts`, `bookings.ts`, `rooms.ts`
(รวม `GET /api/rooms/:meetingId/state`), `transcription.ts`, `summarize.ts`, `audit.ts`
พร้อม WebSocket realtime (`backend/src/realtime/`)

Video token ไม่อยู่ในรายการนี้แล้ว — ทำงานจริงอยู่ที่ `src/app/api/video/token/route.ts` (Next.js, ไม่ผ่าน backend/)

**File:** `backend/README.md`, `backend/ARCHITECTURE.md`

### Technology Stack
- **Runtime:** Node.js 18+
- **Framework:** Express.js + TypeScript
- **Database:** MySQL 8.0+
- **External APIs:** Claude, Email (Sendgrid/AWS SES) — Webex ตัดออกแล้ว, ZegoCloud token ไม่ผ่าน backend นี้
- **Authentication:** JWT

---

## 📋 Implementation Checklist

### Phase D: Guest Join (Ready to Start)
- [ ] Frontend: Invite-guests tab + form
- [ ] Frontend: Guest list with status display
- [ ] Backend: POST `/api/guests/invite-batch`
- [ ] Backend: GET `/api/guests/list`
- [ ] Calendar: RFC 5545 `.ics` generation
- [ ] Email: HTML template + attachment handling
- [ ] Email: Integration with Sendgrid/AWS SES
- [ ] Database: `guest_invites` table + schema migration
- [ ] Testing: End-to-end (email → calendar → join)

**Estimated:** 6 days

### Phase 2: Server-Side Audit (Backend Done, Frontend Deferred)
- [x] POST `/api/audit/log-view` (backend/, requires auth)
- [x] GET `/api/audit/logs` (backend/, requires auth + admin role — for forensics)
- [ ] Frontend integration — wire client actions to call these endpoints
- [ ] Signed URL endpoint (60s expiry)
- [ ] Single-active session enforcement
- [ ] Server-side watermark injection (PDF)

### Production Rollout
- [x] Deploy frontend to Vercel — https://meeting-system-features-40fa4d.vercel.app (2026-08-14)
- [x] ตั้ง ZegoCloud credential บน Vercel Environment Variables (Sensitive, ไม่ผ่านโค้ด)
- [ ] Custom domain (ปัจจุบันใช้ *.vercel.app)
- [ ] Setup email service (Sendgrid/AWS SES)
- [x] Containerise backend + compose stack (MySQL + backend + Caddy) — `deploy/` (2026-08-24)
- [x] Deploy backend + database ขึ้น host จริง — Render + Aiven MySQL
- [x] SSL/TLS — Render ออกให้ที่ `*.onrender.com` (Caddy ใช้เฉพาะกรณี self-host ด้วย compose)
- [x] Backup DB รายวัน + keep-alive — GitHub Actions
- [ ] Rate limiting + DDoS protection
- [ ] Log aggregation (ELK/CloudWatch)
- [ ] Monitoring + alerting
- [ ] Organizational training (NDA, security policy)

---

## 🧪 Testing & Verification

### Automated
- ✅ TypeScript strict mode (no errors)
- ✅ ESLint (clean)
- ✅ Unit tests for utilities
- ✅ Component rendering tests

### Manual (Verified)
| Test Case | Status | Notes |
|-----------|--------|-------|
| 5 roles (ล็อกอินแยกบัญชี) | ✅ | Buttons/menus update correctly |
| Create meeting | ✅ | บันทึกที่ server (MySQL) ทุกคนเห็น |
| Upload document | ✅ | ไฟล์เก็บที่ server |
| View document | ✅ | Watermark + blur-on-blur working |
| Change confidentiality | ✅ | Watermark refresh rate updates |
| Generate summary | ✅ | Mock transcript + mock summary |
| Video room loading | ✅ | ZegoCloud engine จริง — ทดสอบ loginRoom ผ่าน token จริงแล้ว (2026-08-13) |

---

## 📈 Development Metrics

| Metric | Value |
|--------|-------|
| **Lines of Code (Frontend)** | ~8,000 (React + TypeScript) |
| **Components** | 40+ reusable |
| **Routes** | 12 protected pages |
| **Data Storage** | MySQL ฝั่ง server (meetings, bookings, files, realtime state) |
| **Commits** | 50+ with clear messages |
| **Code Review** | 5 major bug fixes (race, webcam, roster, form, timer) |
| **Time Investment** | 6 weeks (planning + implementation + iteration) |

---

## 📞 Known Limitations & Future Work

### Current
- ✅ ZegoCloud SDK จริง (ไม่ใช่ placeholder แล้ว — Webex ถูกตัดออกทั้งหมด)
- ✅ Backend API + MySQL จริง (meetings, bookings, files, realtime state) — ไม่ใช่ localStorage/mock แล้ว
- ✅ Backend deploy บน Render + Aiven แล้ว (free tier: cold start, instance เดียว)
- ❌ No email service (template only)
- ⏳ Audit logging — backend routes มีแล้ว (`POST /api/audit/log-view`, `GET /api/audit/logs`) แต่ frontend ยังไม่เรียก
- ✅ Authentication จริง (`POST /api/auth/login` เช็ครหัสผ่านด้วย bcrypt ที่ server, ออก JWT, ทุก request/WebSocket แนบ token)

### Ready to Address (With Backend)
- ✅ ถอดเสียงไทยฝั่ง server ด้วย Typhoon ASR self-host — implement แล้ว รันในเครื่องได้ รอยืนยันบน production
- 🔄 Claude AI summarization (API key ต้องมี)
- 🔄 Email with .ics (Sendgrid/AWS SES)
- 🔄 Signed URLs + wiring frontend to the existing audit trail backend routes
- 🔄 Session management (server-side)

### Nice-to-Have (Phase 2+)
- 📋 Bulk guest upload (CSV)
- 📋 Calendar sync (auto-refresh when meeting changes)
- 📋 Meeting reminders (email before)
- 📋 RSVP tracking (guest confirms)
- 📋 Recording auto-share (post-meeting)
- 📋 Mobile native app (with FLAG_SECURE)

---

## 🚀 How to Run

### Development
```bash
npm install && npm --prefix backend install
# ต้องมี .env.local, backend/.env และ asr/.venv (ถ้าจะใช้คำบรรยายสด) — ดู README.md
powershell -ExecutionPolicy Bypass -File .\dev-start.ps1
# MySQL80 + backend :3001 + frontend :3005 + ASR :8000 — เปิด http://localhost:3005
```

### Test Data Access (ต้องล็อกอินจริงผ่าน backend แล้ว — รหัสผ่านมาจาก `SEED_PASSWORD` ตอนรัน `npm run seed`, ผู้ใช้ทดสอบทุกคนใช้รหัสเดียวกัน)
- **Admin:** admin@e-office.cloud
- **ผู้บริหาร:** prasert@e-office.cloud
- **เลขานุการ:** malee.r@e-office.cloud
- **เจ้าหน้าที่:** somchai.j@e-office.cloud, wipha.s@e-office.cloud, decha@e-office.cloud
- **บุคคลภายนอก:** expert@external.org

### Demo Path
1. Login as **admin** → see all meetings
2. Logout แล้ว login เป็น **secretary** → manage committee meetings
3. Login เป็น **staff** → view assigned meetings only
4. **external guest** → access via magic link only
5. Create meeting → upload document → change confidentiality → view with watermark

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| `PROJECT_STATUS.md` | This file — overall status |
| `SECURITY_PLAN.md` | 4-layer security model + testing + policy |
| `GUEST_JOIN_CALENDAR_PLAN.md` | Guest invite + calendar integration (6 days) |
| `backend/ARCHITECTURE.md` | System diagrams + data flows + scalability (transcription/summarize เท่านั้น) |
| `backend/README.md` | Backend setup + quick start (transcription/summarize เท่านั้น) |
| `README.md` (root) | Project overview |

---

## ✅ Success Criteria (Achieved)

| Goal | Status | Evidence |
|------|--------|----------|
| ✅ ผู้ใช้ 5 บทบาท | ✅ | ล็อกอินจริงแยกบัญชี (JWT), permissions tested |
| ✅ การจองห้องประชุม | ✅ | BookingContext, `/booking/my-bookings` |
| ✅ ความลับเอกสาร | ✅ | Watermark + blur + confidentiality levels |
| ✅ สรุปประชุม AI | ✅ | Mock pipeline (transcript → summary → report) |
| ✅ วิดีโอประชุมจริง | ✅ | ZegoCloud SDK ต่อจริง — ทดสอบ loginRoom สำเร็จ |
| ✅ ดูแล้วไม่ต้องดาวน์โหลด | ✅ | ไฟล์จาก server + PDF/Markdown viewer |
| ✅ Backend implementation | ✅ | `backend/` (auth/meetings/bookings/rooms/transcription/summarize/audit + realtime) |
| ✅ Production seams | ✅ | Services abstracted (video, transcription, summarize) |

---

## 🎯 Next Steps (Priority Order)

### 1️⃣ Short-term (1–2 weeks)
- [x] **Deploy frontend** — Vercel production, ZegoCloud credential ตั้งเป็น env var บน Vercel แล้ว (ไม่ใช่แค่ dev `.env.local`)
- [x] **Setup Backend Project** — Express + MySQL + JWT auth + WebSocket realtime server เขียนและเทสครบแล้ว (transcription/summarize/guest/rooms/realtime)
- [x] **Containerise backend** — Dockerfile + compose stack พร้อมใช้ (`deploy/`)
- [x] **ย้าย meetings/bookings/files ขึ้น server** — MySQL, ไม่มี localStorage/IndexedDB แล้ว
- [x] **Phase F: Server-Side Thai ASR** — implement ครบทุกชั้นแล้ว (sidecar + backend pipeline + frontend capture)
- [x] **Deploy backend ขึ้น host จริง** — Render + Aiven MySQL ตาม `deploy/RENDER.md`, frontend ชี้มาแล้ว
- [ ] **ASR บน production** — deploy sidecar (`deploy/HUGGINGFACE.md`) แล้วตั้ง `ASR_URL`/`ASR_TOKEN` บน Render
- [ ] **Email Service Setup** — Sendgrid/AWS SES account

### 2️⃣ Medium-term (2–4 weeks)
- [ ] **ทดสอบ ASR สองเครื่องจริง** — วัด CER/latency จากเสียงประชุมจริงบน host
- [ ] **Phase D Testing** — Email → calendar → join workflow
- [ ] **Phase 2 Security** — Wire frontend to existing audit logging backend routes + signed URLs + session management

### 3️⃣ Long-term (Production)
- [ ] **Deployment Setup** — Docker + Kubernetes + monitoring
- [ ] **Organizational Rollout** — NDA + security training + incident response
- [ ] **Phase 2+ Features** — Bulk invites, calendar sync, reminders, mobile

---

## 📞 Support & Contact

**Repository:** https://github.com/Setto-TSET/emeeting-system  
**Issues/PRs:** GitHub issues for bugs/features  
**Documentation:** See `docs/` folder

**Key Stakeholders:**
- 🔵 ผู้พัฒนา backend: เตรียม `/backend` + database setup
- 🟢 IT/Procurement: ติดตามสถานะ ZegoCloud production plan (ปัจจุบันใช้ free/starter plan)
- 🟡 Security team: Review `SECURITY_PLAN.md` + implement policy
- 🟠 End-users: UAT เตรียมก่อนการใช้งานจริง

---

**Last Reviewed:** 2026-08-31 (ตรงกับ commit `49d7ca3`)  
**Prepared by:** Claude Code  
**Next Review:** เมื่อ backend ขึ้น host จริง หรือหลังทดสอบ ASR สองเครื่อง
