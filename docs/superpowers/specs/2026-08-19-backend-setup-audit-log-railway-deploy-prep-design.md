# Backend Setup + Audit Log + Railway Deploy Prep — Design

**Date:** 2026-08-19
**Status:** Approved

## Context

`backend/` มี Express + TypeScript skeleton อยู่แล้ว (routes สำหรับ transcription/summarize,
Claude summarizer ต่อจริงแล้ว, migrations สร้างตาราง `transcriptions`/`summaries`/`audit_logs`)
แต่ยังไม่เคย `npm install`/run จริง, auth middleware ปิดอยู่ ("Temporary: ยังไม่ต้อง auth"),
และไม่มี route สำหรับ audit log แม้ตารางมีอยู่แล้ว ดู `PROJECT_STATUS.md` §Phase 2 (Server-Side Audit — Deferred).

เป้าหมายรอบนี้: ทำให้ backend รันได้จริงบนเครื่อง dev (มี MySQL ติดตั้งอยู่แล้ว), เพิ่ม audit-log
endpoints, เปิด auth middleware จริง, และเตรียม config ให้ deploy Railway ได้ทันทีที่ผู้ใช้ login
เอง (ไม่ push จริงรอบนี้ — ต้องใช้ Railway account ของผู้ใช้).

## Scope

ทำ: transcription + summarize (ของเดิม, แค่เปิด auth) + audit log (ใหม่) + DB connection รองรับ
`DATABASE_URL` + local run/verify + deploy config เตรียมพร้อม

ไม่ทำรอบนี้: guest invite endpoints, STT provider จริง (AssemblyAI/Azure — ยังเป็น TODO ตามเดิม),
push deploy จริงไป Railway, automated tests (jest มีอยู่แต่ไม่ใช้รอบนี้)

## Components

### 1. `src/routes/audit.ts` (ใหม่)
- `POST /api/audit/log-view` — insert แถวเดียวลง `audit_logs`
  - body: `{ action: string, meetingId?: string, resource?: string }`
  - `user_id` มาจาก `req.user.id` (authMiddleware ต้องรันมาก่อน), `ip_address` จาก `req.ip`
  - 400 ถ้าไม่มี `action`
- `GET /api/audit/logs` — query audit trail
  - query params: `meetingId?`, `userId?`, `limit?` (default 50, max 200), `offset?` (default 0)
  - `ORDER BY created_at DESC`
  - คืน `{ logs: [...], total: number }`

### 2. `server.ts` — เปิด auth middleware จริง
- ลบ comment "Temporary" block, ใช้ `app.use('/api/transcription', authMiddleware, transcriptionRoutes)`
  และเหมือนกันกับ `summarize`
- เพิ่ม mount ใหม่: `app.use('/api/audit', authMiddleware, auditRoutes)`
- `/health` ไม่ต้อง auth (คงเดิม)

### 3. `src/database/connection.ts` — รองรับ `DATABASE_URL`
- ถ้า `process.env.DATABASE_URL` มีค่า → `mysql.createPool(process.env.DATABASE_URL)`
- ไม่งั้น fallback ไปใช้ host/port/user/password/database แยก (ของเดิม, สำหรับ local dev)
- Railway MySQL plugin inject `DATABASE_URL` ให้อัตโนมัติ — ไม่ต้องตั้ง `DB_HOST` ฯลฯ เองบน Railway

### 4. `.env` (local, ไม่ commit)
- copy จาก `.env.example`, ตั้ง `DB_*` ชี้ MySQL เครื่องผู้ใช้, `DB_NAME=emeeting_db`
- `JWT_SECRET` ค่าใดก็ได้สำหรับ dev
- `CLAUDE_API_KEY` ใส่ถ้ามี (ไม่มีก็ยังรันได้ แค่ summarize endpoint จะ error ตาม design เดิม)

### 5. Railway deploy prep (ไม่ push จริง)
- เอกสารใน `backend/README.md` เพิ่ม section "Deploy to Railway":
  - New Project → root directory `backend/`
  - Add MySQL plugin (inject `DATABASE_URL`)
  - Env vars: `JWT_SECRET`, `CLAUDE_API_KEY`, `CORS_ORIGIN=https://meeting-system-features-40fa4d.vercel.app`, `NODE_ENV=production`
  - Nixpacks auto-detect `npm run build && npm start` จาก `package.json` (มีอยู่แล้ว ไม่ต้องเพิ่ม railway.json)
  - หลัง deploy: รัน `npm run migrate` ผ่าน Railway shell/one-off command ครั้งแรก

## Data Flow

Dev เครื่อง: curl/Postman → JWT ที่ sign เองด้วย script ทดสอบ (ไม่มี frontend auth ต่อจริงรอบนี้)
→ `authMiddleware` verify → route handler → `query()`/`queryOne()` → MySQL local

## Error Handling

คงของเดิมทั้งหมด: `asyncHandler` wrap ทุก route, `errorHandler` กลางท้าย stack คืน JSON
`{ error, stack? }` (stack เฉพาะ `NODE_ENV=development`). Audit route เพิ่ม:
- 400 ขาด `action` ใน `POST /log-view`
- 401 จาก `authMiddleware` ถ้าไม่มี/ผิด token (ใช้ mechanism เดิม ไม่เปลี่ยน)

## Testing (Manual — ไม่มี automated test รอบนี้)

1. `npm install` ผ่าน ไม่มี error
2. `npm run migrate` สร้าง 3 ตารางสำเร็จ
3. `npm run dev` server ขึ้น, `/health` คืน 200
4. sign JWT ทดสอบด้วย script เล็ก ๆ (`node -e` หรือ scratch script) ใช้ `JWT_SECRET` เดียวกับ `.env`
5. curl `POST /api/transcription/request` (พร้อม Bearer token) → 200 processing
6. curl `GET /api/transcription/result?meetingId=...` → 200 หรือ 404 ตามข้อมูล
7. curl `POST /api/summarize` → ถ้าไม่มี `CLAUDE_API_KEY` ต้องคืน 500 message ชัดเจน (ไม่ crash)
8. curl `POST /api/audit/log-view` → 200, ยืนยันแถวถูก insert (query ตรงผ่าน mysql client)
9. curl `GET /api/audit/logs?meetingId=...` → คืน `{ logs, total }` ถูกต้อง
10. curl ทุก endpoint ข้างต้น **ไม่มี** Bearer token → ต้องได้ 401 (ยืนยัน auth เปิดจริง)

## Out of Scope / Follow-up

- Frontend ยังไม่ต่อ backend จริง (ทุกอย่างยัง localStorage/IndexedDB ฝั่ง Next.js) — เป็นงานถัดไปแยกต่างหาก
- STT provider จริง, guest invite endpoints, Railway push จริง — ตามที่ระบุใน Scope
