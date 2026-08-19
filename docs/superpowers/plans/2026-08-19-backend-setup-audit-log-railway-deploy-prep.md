# Backend Setup + Audit Log + Railway Deploy Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `backend/` (Express + TypeScript skeleton for the e-Meeting System) run for real against local MySQL, add audit-log endpoints backed by the existing `audit_logs` table, turn on real JWT auth on every API route, make DB connection Railway-ready, and document the Railway deploy steps — without pushing to Railway.

**Architecture:** No structural change to the existing Express app. One new route file (`audit.ts`) mounted like the existing two; `server.ts` flips auth middleware from commented-out to active; `connection.ts` gains a `DATABASE_URL`-first branch with the existing host/port fallback kept for local dev; `README.md` gains a deploy section. All verification is manual curl against a locally running server — no test framework is added.

**Tech Stack:** Node.js, Express 4, TypeScript, mysql2/promise, jsonwebtoken, dotenv. MySQL 8 (local, already installed on dev machine).

## Global Constraints

- Auth: every `/api/*` route (transcription, summarize, audit) requires `Authorization: Bearer <jwt>`; `/health` stays open. (spec §2)
- `audit_logs` schema is fixed as already migrated: `id, user_id, action, meeting_id, resource, ip_address, created_at` — do not alter columns. (spec §1, existing `migrations.ts`)
- `POST /api/audit/log-view` requires `action` in body; 400 if missing. (spec §1)
- `GET /api/audit/logs` accepts optional `meetingId`, `userId`, `limit` (default 50, max 200), `offset` (default 0); response shape `{ logs: [...], total: number }`. (spec §1)
- `DATABASE_URL` env var, when present, takes priority over `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`. (spec §3)
- No automated tests this pass — verification is manual curl (spec "Testing" section, 10 numbered checks).
- Do not push to Railway or create a Railway project — only prepare docs/config. (spec "Out of Scope")
- Every request/response JSON shape shown below is exact — engineers must match field names verbatim.

---

### Task 1: Local environment — install, `.env`, migrate, boot

**Files:**
- Create: `backend/.env` (local only, git-ignored via root `/.env` pattern — verify, don't recreate `.gitignore`)
- Modify: none (uses existing `backend/package.json`, `backend/.env.example`, `backend/src/database/migrations.ts`, `backend/src/server.ts`)

**Interfaces:**
- Consumes: existing `npm run migrate` (`ts-node src/database/migrations.ts`), existing `npm run dev` (`ts-node src/server.ts`), existing `GET /health` route in `server.ts` (already implemented, returns `{ status: 'ok', timestamp }`)
- Produces: a running local MySQL database `emeeting_db` with 3 tables, and a running backend process on `http://localhost:3001` — later tasks curl against this.

- [ ] **Step 1: Install dependencies**

Run: `cd backend && npm install`
Expected: exits 0, `node_modules/` created, no `npm ERR!` lines.

- [ ] **Step 2: Create local database**

Run (adjust user/password to match the local MySQL install):
```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS emeeting_db;"
```
Expected: no error output. If it prompts for a password, enter the local MySQL root password.

- [ ] **Step 3: Create `backend/.env` from the example**

Run: `cp .env.example .env` (from inside `backend/`)

Then edit `backend/.env` so these lines match the local MySQL install (leave everything else as-is):
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<your local mysql root password>
DB_NAME=emeeting_db
JWT_SECRET=dev-secret-change-me
```
Leave `CLAUDE_API_KEY=sk-ant-your_api_key` as the placeholder unless a real key is available — Task 5 covers the no-key error path explicitly, so a placeholder is fine here.

- [ ] **Step 4: Confirm `.env` is git-ignored**

Run: `cd .. && git check-ignore -v backend/.env`
Expected: prints a match against the root `.gitignore`'s `.env` line (e.g. `.gitignore:20:.env	backend/.env`). If it prints nothing, STOP and fix `.gitignore` before continuing — do not proceed with an untracked-but-unignored secret file.

- [ ] **Step 5: Run migrations**

Run: `cd backend && npm run migrate`
Expected output ends with:
```
✅ transcriptions table created
✅ summaries table created
✅ audit_logs table created
✅ All migrations completed successfully
```

- [ ] **Step 6: Verify tables exist**

Run:
```bash
mysql -u root -p emeeting_db -e "SHOW TABLES;"
```
Expected: lists `audit_logs`, `summaries`, `transcriptions`.

- [ ] **Step 7: Boot the server**

Run: `npm run dev` (leave running in this terminal; use a second terminal for the next step)
Expected output includes:
```
✅ Database connection successful
✅ Server running on http://localhost:3001
```

- [ ] **Step 8: Health check**

Run (second terminal): `curl -s http://localhost:3001/health`
Expected: `{"status":"ok","timestamp":"..."}` with HTTP 200.

- [ ] **Step 9: Commit the ignore-check evidence (no code changes yet)**

Nothing to commit in this task — `.env` is git-ignored by design and no source files changed. Move to Task 2 with the server left running (restart it after each later task's edits).

---

### Task 2: DB connection — support `DATABASE_URL`

**Files:**
- Modify: `backend/src/database/connection.ts:1-16` (the `mysql.createPool(...)` block)

**Interfaces:**
- Consumes: `process.env.DATABASE_URL` (new), `process.env.DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` (existing, unchanged fallback)
- Produces: same exported `pool`, `initDatabase()`, `query()`, `queryOne()`, `close()` signatures — no consumer of this module changes.

- [ ] **Step 1: Replace the pool construction with a `DATABASE_URL`-first branch**

In `backend/src/database/connection.ts`, replace:
```typescript
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'emeeting_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
```
with:
```typescript
const pool = process.env.DATABASE_URL
  ? mysql.createPool(process.env.DATABASE_URL)
  : mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'emeeting_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
```

- [ ] **Step 2: Restart the server and confirm local dev still connects (fallback path)**

Stop the `npm run dev` process from Task 1 Step 7 (Ctrl+C) and restart it: `npm run dev`
Expected: same as Task 1 Step 7 — `✅ Database connection successful` (this proves the fallback branch still works since `DATABASE_URL` is unset locally).

- [ ] **Step 3: Commit**

```bash
git add src/database/connection.ts
git commit -m "feat(backend): support DATABASE_URL for Railway MySQL"
```

---

### Task 3: Enable real auth middleware on all API routes

**Files:**
- Modify: `backend/src/server.ts:44-49` (the commented-out/temporary route mounting block)

**Interfaces:**
- Consumes: existing `authMiddleware` from `backend/src/middleware/index.ts` (unchanged — verifies `Authorization: Bearer <jwt>` with `process.env.JWT_SECRET`, sets `req.user = { id, email, role }`)
- Produces: every `/api/transcription/*` and `/api/summarize` request now requires a valid Bearer token; Task 4's `/api/audit/*` routes will be mounted the same way.

- [ ] **Step 1: Replace the temporary mounting block**

In `backend/src/server.ts`, replace:
```typescript
// ─── API Routes (ต้องมี auth middleware ก่อน) ───
// video token ไม่ผ่าน backend นี้แล้ว — ZegoCloud token ออกจาก Next.js API route โดยตรง
// (src/app/api/video/token/route.ts) ดู backend/README.md
// app.use('/api/transcription', authMiddleware, transcriptionRoutes);
// app.use('/api/summarize', authMiddleware, summarizeRoutes);

// Temporary: ยังไม่ต้อง auth ตอนทดสอบ
app.use('/api/transcription', transcriptionRoutes);
app.use('/api/summarize', summarizeRoutes);
```
with:
```typescript
// ─── API Routes (ทั้งหมดต้องผ่าน authMiddleware) ───
// video token ไม่ผ่าน backend นี้แล้ว — ZegoCloud token ออกจาก Next.js API route โดยตรง
// (src/app/api/video/token/route.ts) ดู backend/README.md
app.use('/api/transcription', authMiddleware, transcriptionRoutes);
app.use('/api/summarize', authMiddleware, summarizeRoutes);
```
(`/api/audit` mounting is added in Task 4 — do not add it here, since `auditRoutes` does not exist yet and the import would fail to compile.)

- [ ] **Step 2: Restart the server**

Ctrl+C the running `npm run dev`, then `npm run dev` again.
Expected: same clean boot as before (`✅ Server running on http://localhost:3001`).

- [ ] **Step 3: Verify auth is now enforced (no token → 401)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/transcription/request -H "Content-Type: application/json" -d '{"meetingId":"m1"}'`
Expected: `401`

- [ ] **Step 4: Generate a test JWT for later manual verification**

Run (uses the same `JWT_SECRET` set in `backend/.env`):
```bash
node -e "console.log(require('jsonwebtoken').sign({id:'u1',email:'test@example.com',role:'admin'}, 'dev-secret-change-me', {expiresIn:'1h'}))"
```
Copy the printed token — Task 5 and Task 6 use it as `$TOKEN`. If `JWT_SECRET` in `.env` differs from `dev-secret-change-me`, use that value instead in the command above.

- [ ] **Step 5: Verify auth passes with a valid token**

Run (replace `$TOKEN` with the value from Step 4):
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/transcription/request \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"meetingId":"m1"}'
```
Expected: `200`

- [ ] **Step 6: Commit**

```bash
git add src/server.ts
git commit -m "feat(backend): enforce JWT auth on all API routes"
```

---

### Task 4: Audit log routes

**Files:**
- Create: `backend/src/routes/audit.ts`
- Modify: `backend/src/server.ts` (import + mount, continuing from Task 3)

**Interfaces:**
- Consumes: `query()` and `queryOne()` from `backend/src/database/connection.ts` (existing, unchanged signatures: `query(sql: string, values?: any[]): Promise<any>`, `queryOne(sql, values?): Promise<any>`), `asyncHandler` from `backend/src/middleware/index.ts` (existing), `req.user` set by `authMiddleware` (existing, `{ id, email, role }`)
- Produces: `POST /api/audit/log-view` → `201 { ok: true, id: number }`; `GET /api/audit/logs` → `200 { logs: Array<{ id, user_id, action, meeting_id, resource, ip_address, created_at }>, total: number }`

- [ ] **Step 1: Create the route file**

Create `backend/src/routes/audit.ts`:
```typescript
// ═══════════════════════════════════════════
// Routes — Audit Log
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware';
import { query, queryOne } from '../database/connection';

const router = Router();

/**
 * POST /api/audit/log-view
 * บันทึก audit log 1 แถว (ใครทำอะไรกับ resource ไหน เมื่อไหร่)
 */
router.post('/log-view', asyncHandler(async (req: Request, res: Response) => {
  const { action, meetingId, resource } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Missing action' });
  }

  const result = await query(
    'INSERT INTO audit_logs (user_id, action, meeting_id, resource, ip_address) VALUES (?, ?, ?, ?, ?)',
    [req.user?.id || null, action, meetingId || null, resource || null, req.ip]
  );

  res.status(201).json({ ok: true, id: (result as any).insertId });
}));

/**
 * GET /api/audit/logs
 * ดึง audit trail (filter + pagination)
 */
router.get('/logs', asyncHandler(async (req: Request, res: Response) => {
  const { meetingId, userId } = req.query;
  const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 200);
  const offset = parseInt((req.query.offset as string) || '0', 10);

  const conditions: string[] = [];
  const values: any[] = [];

  if (meetingId) {
    conditions.push('meeting_id = ?');
    values.push(meetingId);
  }
  if (userId) {
    conditions.push('user_id = ?');
    values.push(userId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const logs = await query(
    `SELECT id, user_id, action, meeting_id, resource, ip_address, created_at
     FROM audit_logs ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  const countRow = await queryOne(
    `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`,
    values
  );

  res.json({ logs, total: countRow.total });
}));

export default router;
```

- [ ] **Step 2: Mount the route in `server.ts`**

Add the import near the other route imports:
```typescript
import auditRoutes from './routes/audit';
```
Then add the mount line right after the summarize mount from Task 3:
```typescript
app.use('/api/transcription', authMiddleware, transcriptionRoutes);
app.use('/api/summarize', authMiddleware, summarizeRoutes);
app.use('/api/audit', authMiddleware, auditRoutes);
```

- [ ] **Step 3: Restart the server**

Ctrl+C, then `npm run dev`.
Expected: clean boot, no TypeScript compile errors.

- [ ] **Step 4: Verify `POST /api/audit/log-view` inserts a row**

Run (reuse `$TOKEN` from Task 3 Step 4):
```bash
curl -s -X POST http://localhost:3001/api/audit/log-view \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"action":"view_document","meetingId":"m1","resource":"doc-42"}'
```
Expected: `{"ok":true,"id":1}` (id may differ if run more than once) with HTTP 201.

- [ ] **Step 5: Verify missing `action` returns 400**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/audit/log-view \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{}'
```
Expected: `400`

- [ ] **Step 6: Verify `GET /api/audit/logs` returns the inserted row**

Run:
```bash
curl -s "http://localhost:3001/api/audit/logs?meetingId=m1" -H "Authorization: Bearer $TOKEN"
```
Expected: `{"logs":[{"id":1,"user_id":"u1","action":"view_document","meeting_id":"m1","resource":"doc-42","ip_address":"...","created_at":"..."}],"total":1}`

- [ ] **Step 7: Verify no-token request is rejected**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/audit/logs`
Expected: `401`

- [ ] **Step 8: Commit**

```bash
git add src/routes/audit.ts src/server.ts
git commit -m "feat(backend): add audit log routes (POST /log-view, GET /logs)"
```

---

### Task 5: Full manual verification pass (transcription + summarize + audit)

**Files:** none created or modified — this task only runs curl commands against the server from Tasks 1–4 to confirm the spec's 10-point testing checklist end-to-end.

**Interfaces:**
- Consumes: every endpoint built/enabled in Tasks 1–4, plus the existing `GET /api/transcription/result` and `POST /api/summarize` (unmodified this pass).

- [ ] **Step 1: Confirm server is running with all changes**

Ctrl+C any running `npm run dev`, then start fresh: `npm run dev`
Expected: `✅ Database connection successful` and `✅ Server running on http://localhost:3001`, no compile errors.

- [ ] **Step 2: `POST /api/transcription/request` with token**

```bash
curl -s -X POST http://localhost:3001/api/transcription/request \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"meetingId":"m1"}'
```
Expected: `{"status":"processing","estimatedTime":120,"jobId":"transcript-job-m1"}` with HTTP 200.

- [ ] **Step 3: `GET /api/transcription/result` with token**

```bash
curl -s "http://localhost:3001/api/transcription/result?meetingId=m1" -H "Authorization: Bearer $TOKEN"
```
Expected: HTTP 200, body `{"meetingId":"m1","status":"processing","language":"th","segments":[]}` (status reflects whatever Step 2 set).

- [ ] **Step 4: `POST /api/summarize` without a real `CLAUDE_API_KEY` — confirm clean 500, not a crash**

```bash
curl -s -X POST http://localhost:3001/api/summarize \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"meetingId":"m1","transcript":[{"speakerId":"s1","speakerName":"A","startSec":0,"endSec":5,"text":"hello"}],"agendas":[]}'
```
Expected: HTTP 500, body `{"error":"CLAUDE_API_KEY not configured"}`, and the `npm run dev` terminal keeps running (no process exit/crash).

- [ ] **Step 5: Re-run the full no-token 401 sweep**

```bash
curl -s -o /dev/null -w "transcription/request: %{http_code}\n" -X POST http://localhost:3001/api/transcription/request -d '{}'
curl -s -o /dev/null -w "transcription/result: %{http_code}\n" http://localhost:3001/api/transcription/result?meetingId=m1
curl -s -o /dev/null -w "summarize: %{http_code}\n" -X POST http://localhost:3001/api/summarize -d '{}'
curl -s -o /dev/null -w "audit/log-view: %{http_code}\n" -X POST http://localhost:3001/api/audit/log-view -d '{}'
curl -s -o /dev/null -w "audit/logs: %{http_code}\n" http://localhost:3001/api/audit/logs
```
Expected: all five lines print `401`.

- [ ] **Step 6: `GET /health` still open (no token)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/health
```
Expected: `200`

- [ ] **Step 7: No commit** — this task is verification-only. If any step fails, fix the relevant task's code and re-run this task from Step 1 before proceeding to Task 6.

---

### Task 6: Railway deploy documentation

**Files:**
- Modify: `backend/README.md` (add a new section; do not remove existing content)

**Interfaces:**
- Consumes: nothing new — documents the env vars already defined in `backend/.env.example` plus `DATABASE_URL` from Task 2.
- Produces: a documented, repeatable deploy procedure a human can follow with their own Railway account — this plan does not execute it.

- [ ] **Step 1: Read the current README to find the right insertion point**

Run: `grep -n "^## " backend/README.md`
Note the heading list — the new section goes after the last existing `## ` heading, before any trailing footer content.

- [ ] **Step 2: Append the deploy section**

Add to the end of `backend/README.md`:
```markdown
## Deploy to Railway

1. Create a new Railway project, set root directory to `backend/` (Nixpacks auto-detects `npm run build && npm start` from `package.json` — no `railway.json` needed).
2. Add the Railway MySQL plugin to the project. It injects `DATABASE_URL` automatically — do not set `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` on Railway; `src/database/connection.ts` prefers `DATABASE_URL` when present.
3. Set these environment variables on the Railway service:
   - `JWT_SECRET` — a strong random secret (not the local dev value)
   - `CLAUDE_API_KEY` — real Anthropic API key
   - `CORS_ORIGIN=https://meeting-system-features-40fa4d.vercel.app`
   - `NODE_ENV=production`
4. Deploy. After the first successful deploy, run the migration once via Railway's one-off command / shell:
   ```bash
   npm run migrate
   ```
5. Verify: `curl https://<railway-app-url>/health` returns `{"status":"ok",...}`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(backend): add Railway deploy steps"
```

---

## Self-Review Notes

- Spec coverage: audit routes (Task 4), auth enablement (Task 3), `DATABASE_URL` support (Task 2), local install/migrate/run (Task 1), 10-point manual test checklist (Tasks 3 Steps 3/5, 4 Steps 4-7, 5 Steps 2-6 — all 10 spec checks covered), Railway deploy docs without pushing (Task 6). No gaps found.
- Placeholder scan: no TBD/TODO introduced; all code blocks are complete and runnable as written.
- Type consistency: `query()`/`queryOne()` signatures match `backend/src/database/connection.ts` exactly as they exist today; `req.user` shape matches `backend/src/middleware/index.ts`'s `Express.Request` augmentation (`{ id, email, role }`); audit response field names (`logs`, `total`) match spec §1 verbatim.
