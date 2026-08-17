# Backend Design — e-Meeting & Room Booking System

> **สถานะ:** Draft — req ยังไม่นิ่ง อาจปรับเปลี่ยนได้
> **อัปเดตล่าสุด:** 2026-08-04
> **เวอร์ชัน:** 1.0

## Context

ระบบ e-Meeting & Room Booking ปัจจุบันไม่มี backend เลย — ข้อมูลทั้งหมดอยู่ใน localStorage/IndexedDB ฝั่งเบราว์เซอร์ ทำให้:
- **ZegoCloud ServerSecret ถูก expose** ใน client bundle (security critical)
- **ไม่มี authentication จริง** — ใครก็สลับ user ได้
- **ข้อมูลหายเมื่อ clear browser** — ไม่มี persistent storage
- **ไม่รองรับ multi-user** — localStorage ไม่ sync ข้ามเครื่อง

ต้องสร้าง backend ที่ใช้ Next.js API Routes + Prisma + SQLite เพื่อแก้ปัญหาเหล่านี้แบบ incremental (ทีละขั้น ไม่ต้องเขียนใหม่ทั้งหมด)

---

## Tech Stack

| Layer | Choice | เหตุผล |
|-------|--------|--------|
| Runtime | Next.js 16 Route Handlers | อยู่ในโปรเจกต์เดิมแล้ว ไม่ต้อง deploy แยก |
| ORM | Prisma | Type-safe, auto-generate types, migration system ดี |
| Database | SQLite (dev) → PostgreSQL (prod) | Zero-config, แค่ไฟล์เดียว; สลับ provider ได้ทีหลัง |
| Auth | jose (JWT in httpOnly cookie) | เบา, ทำงานทั้ง Edge/Node runtime |
| Password | bcryptjs | Pure JS, ไม่ต้อง compile native |
| Validation | zod | TypeScript-native, จับคู่กับ Prisma ได้ดี |
| Data fetching | SWR | Cache + revalidation, ค่อยๆ แทน Context ได้ |
| File storage | Local filesystem (dev) / S3 (prod) | ง่าย, สลับได้ผ่าน env var |

**Dependencies ใหม่:**
```
prisma @prisma/client jose bcryptjs zod swr
@types/bcryptjs (dev)
```

---

## Database Schema (Prisma)

จาก Meeting type ใน `src/data/index.ts` ที่ซ้อน array เยอะมาก → normalize ออกเป็นตารางแยก

### Core Tables

```
User
  id, name, position, department, email (unique), passwordHash,
  systemRole (enum: admin|executive|secretary|staff|external|room),
  roomId?

Room
  id, name, category (enum), categoryLabel, capacity, location, floor,
  amenities (JSON string), status (enum), hasZoomRoom, accountId? → User

Committee
  id, name, meetingsCount, members

UserCommittee (join: userId + committeeId)

Booking
  id, roomId → Room, title, bookedById → User, date, startTime, endTime,
  attendees, purpose, status (enum), extraRooms (JSON)
```

### Meeting (Central Entity) + Related Tables

```
Meeting
  id, name, shortName, type, committeeId → Committee, organizerId → User,
  date, startTime, endTime, location,
  conferenceProvider, conferenceLink, conferenceRoomKey,
  status (enum: prepare|notified|in_progress|waiting_endorse|endorsed),
  displayFormat, description, savedToDrive, createdAt,
  allowGuestJoin, transcriptStatus, summaryDraftId,
  activeAgendaId, confidentialityLevel, notifiedAt, reminderSentAt

MeetingParticipant
  id, meetingId → Meeting, userId? → User, name, position, role,
  department, email, attendance, present, inSystem

MeetingFile
  id, meetingId → Meeting, name, description, size, uploadedAt, uploadedBy,
  type, visibility, allowedPositions (JSON), allowedUserIds (JSON),
  storageKey, mimeType, sizeBytes

MeetingAgendaItem
  id, meetingId → Meeting, no, title, detail, secretGroupId

AgendaComment
  id, agendaItemId → MeetingAgendaItem, by, text, time

MeetingPermission
  id, meetingId → Meeting, userId, name, type (manager|reader)

ChatMessage
  id, meetingId → Meeting, sender, text, time

InviteToken
  token (PK), meetingId → Meeting, guestEmail, guestName,
  createdAt, expiresAt, used, usedAt, createdBy

SecretGroup
  id, meetingId → Meeting, name

SecretGroupMember (join: secretGroupId + participantId)

ZoomRoomDevice
  id, meetingId → Meeting, name, roomId, sipAddress, status
```

### Relationship Summary

```
Committee ──< UserCommittee >── User
Committee ──< Meeting
User ──< Booking
User ──< Meeting (as organizer)
Room ──< Booking
Meeting ──< MeetingParticipant >──? User (nullable for external guests)
Meeting ──< MeetingFile
Meeting ──< MeetingAgendaItem ──< AgendaComment
Meeting ──< MeetingPermission
Meeting ──< ChatMessage
Meeting ──< InviteToken
Meeting ──< SecretGroup ──< SecretGroupMember
Meeting ──< ZoomRoomDevice
```

### Seed Script
`prisma/seed.ts` จะ import ข้อมูลจาก `src/data/index.ts` แล้วใส่ DB โดยตรง
ทุก user ได้ `passwordHash = bcrypt("password")`

---

## API Route Structure (31 endpoints)

```
src/app/api/
├── auth/
│   ├── login/route.ts          POST  email+password → JWT cookie
│   ├── me/route.ts             GET   validate session → user
│   └── logout/route.ts         POST  clear cookie
│
├── meetings/
│   ├── route.ts                GET   list (?q, ?committee, ?status, ?mine)
│   │                           POST  create meeting
│   └── [id]/
│       ├── route.ts            GET   detail (includes all relations)
│       │                       PATCH partial update (status, name, etc.)
│       ├── files/route.ts      POST  upload file to meeting
│       ├── agenda/[agendaId]/
│       │   └── comments/route.ts POST add comment
│       ├── active-agenda/route.ts PATCH set active agenda
│       ├── participants/
│       │   ├── route.ts        POST  add participant
│       │   └── [pid]/route.ts  PATCH update attendance/present
│       ├── join/route.ts       POST  join as participant
│       ├── chat/route.ts       POST  send chat message
│       ├── end/route.ts        POST  host ends meeting
│       ├── invites/
│       │   ├── route.ts        POST  create magic link
│       │   └── [tokenId]/route.ts DELETE revoke
│       ├── transcript/route.ts POST  trigger transcription
│       ├── summary/route.ts    POST  generate AI summary
│       └── report/route.ts     GET   download report
│
├── invite/
│   └── [token]/
│       ├── route.ts            GET   verify token
│       └── join/route.ts       POST  use token + join meeting
│
├── video/
│   └── token/route.ts          POST  generate ZegoCloud token (SERVER-SIDE)
│
├── files/
│   ├── upload/route.ts         POST  multipart upload
│   └── [key]/route.ts          GET/DELETE  download/delete
│
├── bookings/
│   ├── route.ts                GET/POST  list/create
│   └── [id]/route.ts           PATCH  cancel
│
├── rooms/route.ts              GET   list rooms
└── committees/route.ts         GET   list committees
```

---

## Auth Flow

### Login
1. `POST /api/auth/login` → ตรวจ email+password (bcrypt verify)
2. สร้าง JWT ด้วย `jose.SignJWT({ userId, systemRole })` sign ด้วย `JWT_SECRET`
3. ตั้ง **httpOnly, Secure, SameSite=Lax** cookie ชื่อ `session`
4. Return user object (ไม่มี password)

### Session Check
`GET /api/auth/me` → อ่าน cookie → verify JWT → load user จาก DB → return หรือ 401

### Auth Helper (reuse ทุก route)
```typescript
// src/lib/api/auth.ts
export async function requireAuth(): Promise<User | Response> {
  const token = cookies().get("session")?.value;
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { payload } = await jwtVerify(token, secret);
  return prisma.user.findUnique({ where: { id: payload.userId } });
}
```

### Authorization
ใช้ `can()`, `canEditMeeting()`, `canViewFile()` จาก `src/lib/authz.ts` ได้เลย — เป็น pure function ที่รับ user + meeting เป็น argument ไม่ต้องแก้

---

## ZegoCloud Token (Critical Security Fix)

**ก่อน:** Secret hardcode ใน `src/services/video/zegoToken.ts` (client-side)
**หลัง:** Secret อยู่ใน `.env` เท่านั้น → token สร้างที่ server

```env
ZEGO_APP_ID=1698621897
ZEGO_SERVER_SECRET=your-zego-server-secret-here
NEXT_PUBLIC_ZEGO_APP_ID=1698621897   # frontend ใช้ init SDK เท่านั้น
```

`POST /api/video/token`:
1. requireAuth()
2. รับ `{ roomKey }` จาก body
3. ใช้ algorithm เดิมจาก zegoToken.ts แต่อ่าน secret จาก `process.env`
4. Return `{ token, appId, userID, expiresAt }`

Frontend `src/services/credentials.ts` เปลี่ยนจาก `generateZegoToken()` → `fetch("/api/video/token")`

---

## File Storage

สร้าง abstraction `src/lib/api/fileStore.ts`:
- **Dev:** เขียนไฟล์ลง `storage/` directory (gitignored)
- **Prod:** สลับเป็น S3 ผ่าน env var `FILE_STORAGE=s3`

```
POST /api/files/upload → parse formData → save via fileStore → return { storageKey, sizeBytes, mimeType }
GET  /api/files/[key]  → ตรวจสิทธิ์ → stream file กลับ
```

---

## Migration Strategy (5 Phases)

### Phase 1: Foundation (ไม่กระทบ UI)
- Install Prisma, เขียน schema, seed script
- สร้าง `src/lib/db.ts` (Prisma client singleton)
- สร้าง `src/lib/api/auth.ts`, `src/lib/api/fileStore.ts`
- สร้าง `.env`
- Run `npx prisma migrate dev --name init`

### Phase 2: Auth + Video Token (first backend routes)
- Implement auth endpoints (login/me/logout)
- Implement `POST /api/video/token`
- Update `src/lib/session.ts` → call API
- Update `src/services/credentials.ts` → call API
- Update `UserContext.tsx` → validate session on mount
- **ลบ `src/services/video/zegoToken.ts`** (secret หมดจาก client)

> **หลัง Phase 2:** Login จริง, ZegoCloud secret ซ่อนแล้ว — ที่เหลือยังใช้ localStorage

### Phase 3: Read-only APIs + SWR
- Implement GET endpoints: rooms, committees, meetings, bookings
- สร้าง SWR hooks ใน `src/hooks/`:
  - `useMeetingsAPI()` แทน `useMeetings().meetings`
  - `useBookingsAPI()` แทน `useBookings().bookings`
- Page components ค่อยๆ เปลี่ยนจาก Context → SWR

### Phase 4: Write APIs (mutations)
- Implement POST/PATCH/DELETE endpoints ทั้งหมด
- แทน Context mutation functions ด้วย API calls + SWR mutate
- File upload → `POST /api/files/upload`
- Invite tokens → API แทน localStorage

### Phase 5: Live meeting + cleanup
- Implement chat, join, end meeting, active-agenda endpoints
- Implement transcript/summary (mock implementations OK)
- **ลบ** MeetingProvider, BookingProvider (SWR จัดการแทน)
- **ลบ** localStorage version keys, localStore.ts
- เพิ่ม polling สำหรับ live meeting chat (ทุก 3 วินาที)

---

## Folder Structure (New Files)

```
prisma/
  schema.prisma              ← database schema
  seed.ts                    ← seed from src/data/index.ts
  dev.db                     ← SQLite database file (auto-generated)

storage/                     ← local file uploads (gitignored)

src/app/api/                 ← all API routes (structure above)

src/lib/
  db.ts                      ← Prisma client singleton
  api/
    auth.ts                  ← JWT/session helpers
    fileStore.ts             ← file storage abstraction
    validate.ts              ← zod schema helpers

src/hooks/                   ← SWR data-fetching hooks
  useMeetingsAPI.ts
  useBookingsAPI.ts
  useMeetingDetail.ts

.env                         ← secrets
```

### Modified Files
- `src/lib/session.ts` → call API instead of array lookup
- `src/services/credentials.ts` → call `/api/video/token` instead of local generation
- `src/context/UserContext.tsx` → validate session via `GET /api/auth/me`

### Deleted Files (after full migration)
- `src/services/video/zegoToken.ts` (secret removed from client)
- `src/lib/inviteTokens.ts` (replaced by API)
- `src/lib/localStore.ts` (no more localStorage)

---

## Environment Variables (.env)

```env
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="generate-a-random-32-char-secret-here"

ZEGO_APP_ID=1698621897
ZEGO_SERVER_SECRET=your-zego-server-secret-here
NEXT_PUBLIC_ZEGO_APP_ID=1698621897

FILE_STORAGE="local"
```

---

## Key Reusable Code (ไม่ต้องเขียนใหม่)
- `src/lib/authz.ts` — pure authorization functions, ใช้ server-side ได้เลย
- `src/data/index.ts` — type definitions + seed data → Prisma schema + seed script
- `src/lib/conference.ts` — provider detection, ใช้ได้ทั้ง client/server

---

## Verification Plan

### Phase 1:
```bash
npx prisma migrate dev --name init
npx prisma db seed
npx prisma studio                    # เปิด GUI ดูข้อมูลใน DB
```

### Phase 2:
```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"somchai.j@e-office.cloud","password":"password"}'

# Session check
curl http://localhost:3000/api/auth/me -b cookies.txt

# Video token (must NOT expose secret)
curl -X POST http://localhost:3000/api/video/token \
  -H "Content-Type: application/json" \
  -d '{"roomKey":"test-room"}' -b cookies.txt
```

### Phase 3-5:
- เปิดเว็บ → login → ดู dashboard → ข้อมูลมาจาก API (ดู Network tab)
- สร้าง booking/meeting → refresh → ข้อมูลยังอยู่ (persistent)
- เปิด 2 browser → login คนละ user → เห็น data ตัวเอง (multi-user)
- เข้า live meeting → ZegoCloud connect ได้ (token จาก server)
- View Source / DevTools → ไม่เห็น ZEGO_SERVER_SECRET

---

## Design Decisions & Trade-offs

| Decision | เหตุผล | Trade-off |
|----------|--------|-----------|
| Prisma over Drizzle | DX ดีกว่า, docs ดี, Prisma Studio | Performance ช้ากว่า Drizzle เล็กน้อย |
| SQLite for dev | Zero-config, ไม่ต้อง Docker | ไม่รองรับ concurrent writes เยอะ |
| JWT cookies over localStorage tokens | ป้องกัน XSS ขโมย token | ต้อง handle CSRF (SameSite=Lax ช่วย) |
| Polling over WebSocket | ง่าย, ทำงานกับ serverless | Latency 3 วินาที สำหรับ live chat |
| Auth ใน route handler (ไม่ใช่ middleware.ts) | Prisma ไม่ทำงานใน Edge runtime | ต้องเรียก requireAuth() ทุก route |
| Reuse authz.ts | ไม่ต้องเขียน authorization ใหม่ | ต้อง keep types compatible |
