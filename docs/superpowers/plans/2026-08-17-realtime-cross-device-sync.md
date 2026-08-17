# Realtime Cross-Device Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every realtime meeting feature (voting, hand raise, live subtitle/transcript, document sharing) off per-browser `BroadcastChannel` + IndexedDB and onto an authenticated WebSocket server with MySQL as the single source of truth, so participants on different machines see the same room state.

**Architecture:** The existing Express backend in `backend/` gains (a) a real login endpoint issuing JWTs backed by bcrypt password hashes, and (b) a `ws` WebSocket server mounted on the same HTTP server at `/ws`. Clients connect with `?meetingId=<id>&token=<jwt>`; the server verifies the JWT, checks meeting membership against MySQL, and joins the socket to a room. Every state-changing signal is sent to the server, which writes MySQL first and then fans the authoritative result out to the room — clients never trust each other's payloads, and `senderId` is taken from the JWT, never from the message body. On join, a client fetches `GET /api/rooms/:meetingId/state` to catch up on everything it missed. On the frontend, only `src/services/signaling/channel.ts`, `src/context/RoomSignalingContext.tsx`, and the four feature stores change; the components (`VotePanel`, `HandRaiseList`, `SubtitleBar`, doc-share wiring) keep their current props and are not touched.

**Tech Stack:** Node.js 20, TypeScript 5 (strict), Express 4.18, `ws` 8, mysql2 3.6, jsonwebtoken 9, bcryptjs 2.4, Jest 29 + ts-jest + supertest (backend tests), Next.js 16.2.9 + React 19.2.4 (frontend), Vitest 3 + jsdom (frontend transport tests).

## Global Constraints

- Node.js 20 LTS. Do not use Node APIs newer than Node 20.
- TypeScript `strict: true` in both `tsconfig.json` and `backend/tsconfig.json`. No `any` in new code except where quoting the existing `backend/src/database/connection.ts` helpers, which return `any` today.
- Backend dependency floors, already in `backend/package.json` — do not bump: `express@^4.18.2`, `mysql2@^3.6.5`, `jsonwebtoken@^9.1.0`, `bcryptjs@^2.4.3`, `jest@^29.7.0`, `ts-jest@^29.1.1`.
- New backend dependencies allowed by this plan, exact versions: `ws@^8.18.0`, `@types/ws@^8.5.12`, `supertest@^7.0.0`, `@types/supertest@^6.0.2`.
- New frontend dev dependencies allowed by this plan, exact versions: `vitest@^3.0.0`, `jsdom@^25.0.0`, `@vitejs/plugin-react@^4.3.0`.
- Frontend runtime dependencies must not change. No Supabase, no Socket.io, no Pusher.
- All server-visible identity comes from the verified JWT. A handler that reads a user id, name, or role out of a request body or WebSocket message payload is a defect.
- Thai user-facing copy stays Thai. Code comments in this codebase are Thai where they explain product decisions — match the surrounding file.
- Every SQL statement uses parameterised `?` placeholders via `query()` / `queryOne()`. String-concatenated SQL is a defect.
- `meeting_id` columns are `VARCHAR(64)`, not foreign keys to an auto-increment id, because meeting ids in this system are strings like `MT-2569-007`.
- JWT access token lifetime: 8 hours for staff accounts, 24 hours for guest accounts (matches the existing magic-link window documented in `SECURITY_PLAN.md`).
- The frontend talks to the backend through `NEXT_PUBLIC_API_BASE_URL` (HTTP) and `NEXT_PUBLIC_WS_URL` (WebSocket). No hardcoded hostnames.

---

## File Structure

**Backend — created**

| File | Responsibility |
|---|---|
| `backend/src/database/schema.sql` | Table definitions for users, meetings, participants, votes, hand raises, transcript, doc share |
| `backend/src/database/seed.ts` | One-off import of `src/data/index.ts` mock users + meetings into MySQL |
| `backend/src/services/auth.ts` | Password verification, JWT signing/verification — pure functions, no Express |
| `backend/src/routes/auth.ts` | `POST /api/auth/login`, `POST /api/auth/guest`, `GET /api/auth/me` |
| `backend/src/routes/rooms.ts` | `GET /api/rooms/:meetingId/state` late-join snapshot |
| `backend/src/realtime/server.ts` | `ws` server: connection auth, room registry, fan-out |
| `backend/src/realtime/rooms.ts` | In-memory room→socket registry, no business logic |
| `backend/src/realtime/handlers.ts` | One handler per signal type: validate → persist → decide fan-out |
| `backend/src/repositories/votes.ts` | All vote SQL |
| `backend/src/repositories/handRaises.ts` | All hand-raise SQL |
| `backend/src/repositories/transcript.ts` | All transcript SQL |
| `backend/src/repositories/docShare.ts` | All doc-share SQL |
| `backend/src/repositories/meetings.ts` | Membership check used by WebSocket auth |

**Backend — modified**

| File | Change |
|---|---|
| `backend/src/server.ts` | Mount auth + rooms routes, create HTTP server explicitly, attach WebSocket server |
| `backend/src/middleware/index.ts` | `authMiddleware` gains `name` on `req.user` |
| `backend/package.json` | New deps, `test` script wired to ts-jest |
| `backend/tsconfig.json` | Path mapping so the seed script can import frontend mock data |

**Frontend — modified**

| File | Change |
|---|---|
| `src/lib/session.ts` | `signIn()` calls the API, stores/reads the JWT |
| `src/services/signaling/channel.ts` | `BroadcastChannel` → authenticated WebSocket transport with reconnect |
| `src/context/RoomSignalingContext.tsx` | Uses the new transport, exposes unchanged `broadcast` / `useSignal` / `connected` |
| `src/services/voting/store.ts` | IndexedDB → REST reads, WebSocket writes |
| `src/services/transcript/store.ts` | IndexedDB → REST reads |
| `src/components/meeting/HandRaiseList.tsx` | Reads hand-raise state from the room snapshot instead of local state |
| `src/app/(app)/live/[id]/page.tsx` | Fetches the room snapshot on mount |

**Frontend — created**

| File | Responsibility |
|---|---|
| `src/services/api/client.ts` | `fetch` wrapper that attaches the JWT and normalises errors |
| `src/services/rooms/snapshot.ts` | Types + fetch for `GET /api/rooms/:meetingId/state` |

---

## Phase 1 — Authentication and database foundation

### Task 1: Database schema

**Files:**
- Create: `backend/src/database/schema.sql`
- Modify: `backend/src/database/migrations.ts`
- Test: `backend/tests/database/schema.test.ts`

**Interfaces:**
- Consumes: `query()` from `backend/src/database/connection.ts`
- Produces: `runMigrations(): Promise<void>` exported from `backend/src/database/migrations.ts`; tables `app_users`, `meetings`, `meeting_participants`, `vote_topics`, `vote_options`, `vote_records`, `hand_raises`, `transcript_segments`, `doc_shares`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/database/schema.test.ts`:

```typescript
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';

const TABLES = [
  'app_users',
  'meetings',
  'meeting_participants',
  'vote_topics',
  'vote_options',
  'vote_records',
  'hand_raises',
  'transcript_segments',
  'doc_shares',
];

describe('schema', () => {
  beforeAll(async () => {
    await runMigrations();
  });

  afterAll(async () => {
    await close();
  });

  it.each(TABLES)('creates table %s', async (table) => {
    const rows = (await query(
      'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
      [table]
    )) as { n: number }[];
    expect(rows[0].n).toBe(1);
  });

  it('is idempotent', async () => {
    await expect(runMigrations()).resolves.toBeUndefined();
  });

  it('stores a vote record keyed by meeting and topic', async () => {
    await query('DELETE FROM vote_records');
    await query('DELETE FROM vote_options');
    await query('DELETE FROM vote_topics');
    await query(
      'INSERT INTO vote_topics (id, meeting_id, title, created_by, created_by_name, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['vote-test-1', 'MT-TEST', 'หัวข้อทดสอบ', 'U-001', 'ทดสอบ', Date.now(), 'open']
    );
    await query('INSERT INTO vote_options (id, topic_id, label, sort_order) VALUES (?, ?, ?, ?)', [
      'opt-1',
      'vote-test-1',
      'เห็นด้วย',
      0,
    ]);
    await query(
      'INSERT INTO vote_records (topic_id, user_id, user_name, option_id, voted_at) VALUES (?, ?, ?, ?, ?)',
      ['vote-test-1', 'U-001', 'ทดสอบ', 'opt-1', Date.now()]
    );
    const rows = (await query('SELECT user_id FROM vote_records WHERE topic_id = ?', ['vote-test-1'])) as {
      user_id: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe('U-001');
  });

  it('allows only one vote row per user per topic', async () => {
    await expect(
      query('INSERT INTO vote_records (topic_id, user_id, user_name, option_id, voted_at) VALUES (?, ?, ?, ?, ?)', [
        'vote-test-1',
        'U-001',
        'ทดสอบ',
        'opt-1',
        Date.now(),
      ])
    ).rejects.toThrow(/Duplicate entry/);
  });
});
```

- [ ] **Step 2: Add backend test tooling and run the test to verify it fails**

```bash
cd backend
npm install --save-dev supertest@^7.0.0 @types/supertest@^6.0.2
```

Create `backend/jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
};
```

Create `backend/tests/setup.ts`:

```typescript
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });
```

Create `backend/.env.test` (not committed — add `.env.test` to `backend/.gitignore`):

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=emeeting_test
JWT_SECRET=test-secret-do-not-use-in-production
```

Create the test database once:

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS emeeting_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Run: `cd backend && npx jest tests/database/schema.test.ts`
Expected: FAIL with "runMigrations is not a function" or a missing-table assertion.

- [ ] **Step 3: Write the schema**

Create `backend/src/database/schema.sql`:

```sql
-- ผู้ใช้ระบบ — รหัสผ่านเก็บเป็น bcrypt hash เท่านั้น ห้ามเก็บ plaintext
CREATE TABLE IF NOT EXISTS app_users (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  position      VARCHAR(255) NOT NULL DEFAULT '',
  department    VARCHAR(255) NOT NULL DEFAULT '',
  email         VARCHAR(255) NOT NULL UNIQUE,
  system_role   VARCHAR(32)  NOT NULL,
  room_id       VARCHAR(64)  NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    BIGINT       NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- การประชุม — id เป็นสตริงของระบบเดิม เช่น MT-2569-007
CREATE TABLE IF NOT EXISTS meetings (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  title         VARCHAR(512) NOT NULL,
  organizer_id  VARCHAR(64)  NOT NULL,
  meeting_date  VARCHAR(16)  NOT NULL,
  start_time    VARCHAR(8)   NOT NULL,
  end_time      VARCHAR(8)   NOT NULL,
  status        VARCHAR(32)  NOT NULL,
  allow_guest_join TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ใครเข้าประชุมไหนได้ — WebSocket ใช้ตารางนี้ตัดสินตอนต่อห้อง
CREATE TABLE IF NOT EXISTS meeting_participants (
  meeting_id VARCHAR(64) NOT NULL,
  user_id    VARCHAR(64) NOT NULL,
  role       VARCHAR(32) NOT NULL DEFAULT 'participant',
  PRIMARY KEY (meeting_id, user_id),
  INDEX idx_participants_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vote_topics (
  id              VARCHAR(64)  NOT NULL PRIMARY KEY,
  meeting_id      VARCHAR(64)  NOT NULL,
  title           VARCHAR(512) NOT NULL,
  description     TEXT         NULL,
  created_by      VARCHAR(64)  NOT NULL,
  created_by_name VARCHAR(255) NOT NULL,
  created_at      BIGINT       NOT NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'open',
  INDEX idx_vote_topics_meeting (meeting_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vote_options (
  id         VARCHAR(64)  NOT NULL,
  topic_id   VARCHAR(64)  NOT NULL,
  label      VARCHAR(512) NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (topic_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- กฎ "1 คน 1 เสียง" บังคับด้วย PRIMARY KEY — ไม่ใช่ด้วยโค้ดฝั่ง client เหมือนเดิม
CREATE TABLE IF NOT EXISTS vote_records (
  topic_id  VARCHAR(64)  NOT NULL,
  user_id   VARCHAR(64)  NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  option_id VARCHAR(64)  NOT NULL,
  voted_at  BIGINT       NOT NULL,
  PRIMARY KEY (topic_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hand_raises (
  meeting_id VARCHAR(64)  NOT NULL,
  user_id    VARCHAR(64)  NOT NULL,
  user_name  VARCHAR(255) NOT NULL,
  raised_at  BIGINT       NOT NULL,
  PRIMARY KEY (meeting_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transcript_segments (
  id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  meeting_id   VARCHAR(64)  NOT NULL,
  speaker_id   VARCHAR(64)  NOT NULL,
  speaker_name VARCHAR(255) NOT NULL,
  start_sec    INT          NOT NULL,
  text         TEXT         NOT NULL,
  created_at   BIGINT       NOT NULL,
  INDEX idx_transcript_meeting (meeting_id, start_sec)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- แชร์เอกสารได้ทีละไฟล์ต่อห้อง — meeting_id เป็น primary key จึงทับของเดิมเสมอ
CREATE TABLE IF NOT EXISTS doc_shares (
  meeting_id  VARCHAR(64)  NOT NULL PRIMARY KEY,
  file_id     VARCHAR(64)  NOT NULL,
  file_name   VARCHAR(512) NOT NULL,
  page        INT          NOT NULL DEFAULT 1,
  shared_by   VARCHAR(64)  NOT NULL,
  shared_name VARCHAR(255) NOT NULL,
  updated_at  BIGINT       NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Replace the contents of `backend/src/database/migrations.ts`:

```typescript
// ═══════════════════════════════════════════
// Migrations — รัน schema.sql ทีละคำสั่ง
// ทุกคำสั่งเป็น CREATE TABLE IF NOT EXISTS จึงรันซ้ำได้ปลอดภัย
// ═══════════════════════════════════════════

import { readFileSync } from 'fs';
import { join } from 'path';
import { query, close } from './connection';

export async function runMigrations(): Promise<void> {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    await query(statement);
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('✅ Migrations complete');
      return close();
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}
```

`schema.sql` is not TypeScript, so `tsc` will not copy it into `dist/`. Add a copy step to `backend/package.json` scripts:

```json
"build": "tsc && node -e \"require('fs').copyFileSync('src/database/schema.sql','dist/database/schema.sql')\"",
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/database/schema.test.ts`
Expected: PASS, 12 tests (9 table checks + idempotency + insert + duplicate rejection).

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/schema.sql backend/src/database/migrations.ts backend/jest.config.js backend/tests/ backend/package.json backend/package-lock.json backend/.gitignore
git commit -m "feat(backend): MySQL schema for realtime meeting state"
```

---

### Task 2: Seed users and meetings from the frontend mock data

**Files:**
- Create: `backend/src/database/seed.ts`
- Modify: `backend/tsconfig.json`
- Test: `backend/tests/database/seed.test.ts`

**Interfaces:**
- Consumes: `runMigrations()` from Task 1; `users`, `meetings` exported from `src/data/index.ts` at the repo root
- Produces: `seedFromMockData(defaultPassword: string): Promise<{ users: number; meetings: number; participants: number }>`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/database/seed.test.ts`:

```typescript
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import bcrypt from 'bcryptjs';

describe('seedFromMockData', () => {
  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM meeting_participants');
    await query('DELETE FROM meetings');
    await query('DELETE FROM app_users');
  });

  afterAll(async () => {
    await close();
  });

  it('inserts every mock user with a bcrypt hash, never the plaintext', async () => {
    const result = await seedFromMockData('Meeting@2569');
    expect(result.users).toBeGreaterThanOrEqual(7);

    const rows = (await query('SELECT email, password_hash FROM app_users WHERE email = ?', [
      'admin@e-office.cloud',
    ])) as { email: string; password_hash: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].password_hash).not.toBe('Meeting@2569');
    expect(await bcrypt.compare('Meeting@2569', rows[0].password_hash)).toBe(true);
  });

  it('inserts meetings and their participants', async () => {
    const meetings = (await query('SELECT COUNT(*) AS n FROM meetings')) as { n: number }[];
    expect(meetings[0].n).toBeGreaterThan(0);

    const participants = (await query('SELECT COUNT(*) AS n FROM meeting_participants')) as { n: number }[];
    expect(participants[0].n).toBeGreaterThan(0);
  });

  it('is idempotent — running twice does not duplicate or change hashes', async () => {
    const before = (await query('SELECT password_hash FROM app_users WHERE email = ?', [
      'admin@e-office.cloud',
    ])) as { password_hash: string }[];

    await seedFromMockData('Meeting@2569');

    const after = (await query('SELECT password_hash FROM app_users WHERE email = ?', [
      'admin@e-office.cloud',
    ])) as { password_hash: string }[];
    expect(after).toHaveLength(1);
    expect(after[0].password_hash).toBe(before[0].password_hash);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/database/seed.test.ts`
Expected: FAIL with "Cannot find module '../../src/database/seed'".

- [ ] **Step 3: Let the backend import the frontend mock data, then write the seed**

`src/data/index.ts` has one import and it is `import type`, which TypeScript erases at runtime — so ts-node can load the file directly as long as the path alias resolves. Modify `backend/tsconfig.json` so both work. Set `compilerOptions` to include:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "baseUrl": "..",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*", "../src/data/index.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Add `tsconfig-paths` so ts-node and ts-jest honour the `@/*` mapping:

```bash
cd backend
npm install --save-dev tsconfig-paths@^4.2.0
```

Add to `backend/jest.config.js`:

```javascript
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/../src/$1',
},
```

Create `backend/src/database/seed.ts`:

```typescript
// ═══════════════════════════════════════════
// Seed — ย้ายผู้ใช้/การประชุมจาก mock data ฝั่งหน้าเว็บเข้า MySQL
//
// ⚠️ รหัสผ่านตั้งต้นเป็นค่าเดียวกันทุกบัญชี ใช้เฉพาะตอนพัฒนา/สาธิต
//    ก่อนใช้งานจริงต้องบังคับเปลี่ยนรหัสผ่านทุกบัญชี
// ═══════════════════════════════════════════

import bcrypt from 'bcryptjs';
import { query, queryOne } from './connection';
import { users, meetings } from '../../../src/data/index';

export type SeedResult = { users: number; meetings: number; participants: number };

export async function seedFromMockData(defaultPassword: string): Promise<SeedResult> {
  const now = Date.now();
  let userCount = 0;

  for (const user of users) {
    const existing = await queryOne('SELECT id FROM app_users WHERE id = ?', [user.id]);
    if (existing) {
      userCount += 1;
      continue;
    }
    const hash = await bcrypt.hash(defaultPassword, 10);
    await query(
      `INSERT INTO app_users (id, name, position, department, email, system_role, room_id, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.name,
        user.position,
        user.department,
        user.email,
        user.systemRole,
        user.roomId ?? null,
        hash,
        now,
      ]
    );
    userCount += 1;
  }

  let meetingCount = 0;
  let participantCount = 0;

  for (const meeting of meetings) {
    await query(
      `INSERT INTO meetings (id, title, organizer_id, meeting_date, start_time, end_time, status, allow_guest_join)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), status = VALUES(status),
         allow_guest_join = VALUES(allow_guest_join)`,
      [
        meeting.id,
        meeting.title,
        meeting.organizerId,
        meeting.date,
        meeting.startTime,
        meeting.endTime,
        meeting.status,
        meeting.allowGuestJoin ? 1 : 0,
      ]
    );
    meetingCount += 1;

    for (const participant of meeting.participants) {
      if (!participant.userId) continue;
      await query(
        `INSERT INTO meeting_participants (meeting_id, user_id, role)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE role = VALUES(role)`,
        [meeting.id, participant.userId, participant.role ?? 'participant']
      );
      participantCount += 1;
    }

    // ผู้จัดต้องเข้าห้องได้เสมอ แม้ไม่ได้อยู่ในรายชื่อผู้เข้าร่วม
    await query(
      `INSERT INTO meeting_participants (meeting_id, user_id, role)
       VALUES (?, ?, 'organizer')
       ON DUPLICATE KEY UPDATE role = 'organizer'`,
      [meeting.id, meeting.organizerId]
    );
  }

  return { users: userCount, meetings: meetingCount, participants: participantCount };
}

if (require.main === module) {
  const password = process.env.SEED_PASSWORD;
  if (!password) {
    console.error('❌ SEED_PASSWORD is required');
    process.exit(1);
  }
  seedFromMockData(password)
    .then((result) => {
      console.log(`✅ Seeded ${result.users} users, ${result.meetings} meetings`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}
```

Add the script to `backend/package.json`:

```json
"seed": "ts-node -r tsconfig-paths/register src/database/seed.ts",
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/database/seed.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/seed.ts backend/tests/database/seed.test.ts backend/tsconfig.json backend/jest.config.js backend/package.json backend/package-lock.json
git commit -m "feat(backend): seed users and meetings from frontend mock data"
```

---

### Task 3: Auth service — password check and JWT

**Files:**
- Create: `backend/src/services/auth.ts`
- Test: `backend/tests/services/auth.test.ts`

**Interfaces:**
- Consumes: `queryOne()` from `backend/src/database/connection.ts`; `app_users` table from Task 1
- Produces:
  - `type TokenClaims = { sub: string; email: string; name: string; role: string; roomId?: string; meetingId?: string }`
  - `verifyPassword(email: string, password: string): Promise<TokenClaims | null>`
  - `signAccessToken(claims: TokenClaims): string`
  - `signGuestToken(claims: { sub: string; name: string; meetingId: string }): string`
  - `verifyAccessToken(token: string): TokenClaims | null`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/services/auth.test.ts`:

```typescript
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import {
  verifyPassword,
  signAccessToken,
  signGuestToken,
  verifyAccessToken,
} from '../../src/services/auth';

describe('auth service', () => {
  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM meeting_participants');
    await query('DELETE FROM meetings');
    await query('DELETE FROM app_users');
    await seedFromMockData('Meeting@2569');
  });

  afterAll(async () => {
    await close();
  });

  it('accepts the correct password and returns claims', async () => {
    const claims = await verifyPassword('admin@e-office.cloud', 'Meeting@2569');
    expect(claims).not.toBeNull();
    expect(claims!.sub).toBe('U-999');
    expect(claims!.role).toBe('admin');
  });

  it('rejects the wrong password', async () => {
    expect(await verifyPassword('admin@e-office.cloud', 'wrong-password')).toBeNull();
  });

  it('rejects an unknown email', async () => {
    expect(await verifyPassword('nobody@e-office.cloud', 'Meeting@2569')).toBeNull();
  });

  it('is case-insensitive on email', async () => {
    const claims = await verifyPassword('ADMIN@E-OFFICE.CLOUD', 'Meeting@2569');
    expect(claims).not.toBeNull();
  });

  it('round-trips an access token', () => {
    const token = signAccessToken({
      sub: 'U-001',
      email: 'somchai.j@e-office.cloud',
      name: 'นาย สมชาย ใจดี',
      role: 'staff',
    });
    const decoded = verifyAccessToken(token);
    expect(decoded!.sub).toBe('U-001');
    expect(decoded!.role).toBe('staff');
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken({
      sub: 'U-001',
      email: 'somchai.j@e-office.cloud',
      name: 'นาย สมชาย ใจดี',
      role: 'staff',
    });
    expect(verifyAccessToken(token.slice(0, -3) + 'aaa')).toBeNull();
  });

  it('marks guest tokens with role guest and the meeting they are scoped to', () => {
    const token = signGuestToken({ sub: 'guest-abc', name: 'ผู้เข้าร่วมภายนอก', meetingId: 'MT-2569-007' });
    const decoded = verifyAccessToken(token);
    expect(decoded!.role).toBe('guest');
    expect(decoded!.meetingId).toBe('MT-2569-007');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/services/auth.test.ts`
Expected: FAIL with "Cannot find module '../../src/services/auth'".

- [ ] **Step 3: Write the auth service**

Create `backend/src/services/auth.ts`:

```typescript
// ═══════════════════════════════════════════
// Auth — ตรวจรหัสผ่านและออก JWT
//
// ตัวตนของผู้ใช้ทุกจุดในระบบมาจาก token ที่ verify แล้วเท่านั้น
// ห้ามอ่าน userId/role จาก request body หรือ payload ของ WebSocket
// ═══════════════════════════════════════════

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryOne } from '../database/connection';

export type TokenClaims = {
  sub: string;
  email: string;
  name: string;
  role: string;
  roomId?: string;
  meetingId?: string;
};

const STAFF_TOKEN_TTL = '8h';
const GUEST_TOKEN_TTL = '24h';

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET is not set');
  return value;
}

export async function verifyPassword(email: string, password: string): Promise<TokenClaims | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return null;

  const row = (await queryOne(
    'SELECT id, email, name, system_role, room_id, password_hash FROM app_users WHERE LOWER(email) = ?',
    [normalized]
  )) as
    | { id: string; email: string; name: string; system_role: string; room_id: string | null; password_hash: string }
    | undefined;

  if (!row) return null;
  if (!(await bcrypt.compare(password, row.password_hash))) return null;

  return {
    sub: row.id,
    email: row.email,
    name: row.name,
    role: row.system_role,
    ...(row.room_id ? { roomId: row.room_id } : {}),
  };
}

export function signAccessToken(claims: TokenClaims): string {
  return jwt.sign(claims, secret(), { expiresIn: STAFF_TOKEN_TTL });
}

export function signGuestToken(claims: { sub: string; name: string; meetingId: string }): string {
  return jwt.sign(
    { sub: claims.sub, email: '', name: claims.name, role: 'guest', meetingId: claims.meetingId },
    secret(),
    { expiresIn: GUEST_TOKEN_TTL }
  );
}

export function verifyAccessToken(token: string): TokenClaims | null {
  try {
    const decoded = jwt.verify(token, secret());
    if (typeof decoded === 'string') return null;
    const { sub, email, name, role, roomId, meetingId } = decoded as Record<string, unknown>;
    if (typeof sub !== 'string' || typeof role !== 'string' || typeof name !== 'string') return null;
    return {
      sub,
      email: typeof email === 'string' ? email : '',
      name,
      role,
      ...(typeof roomId === 'string' ? { roomId } : {}),
      ...(typeof meetingId === 'string' ? { meetingId } : {}),
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/services/auth.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/auth.ts backend/tests/services/auth.test.ts
git commit -m "feat(backend): password verification and JWT issuing"
```

---

### Task 4: Auth routes

**Files:**
- Create: `backend/src/routes/auth.ts`
- Modify: `backend/src/server.ts`, `backend/src/middleware/index.ts`
- Test: `backend/tests/routes/auth.test.ts`

**Interfaces:**
- Consumes: `verifyPassword`, `signAccessToken`, `signGuestToken`, `verifyAccessToken` from Task 3
- Produces: `POST /api/auth/login` → `{ token, user }`; `POST /api/auth/guest` → `{ token, user }`; `GET /api/auth/me` → `{ user }`; `createApp(): Express` exported from `backend/src/server.ts` so tests can mount the app without listening

- [ ] **Step 1: Write the failing test**

Create `backend/tests/routes/auth.test.ts`:

```typescript
import request from 'supertest';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { createApp } from '../../src/server';

const app = createApp();

describe('auth routes', () => {
  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM meeting_participants');
    await query('DELETE FROM meetings');
    await query('DELETE FROM app_users');
    await seedFromMockData('Meeting@2569');
  });

  afterAll(async () => {
    await close();
  });

  it('logs in with a correct password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@e-office.cloud', password: 'Meeting@2569' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.id).toBe('U-999');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('rejects a wrong password with 401 and no detail about which field failed', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@e-office.cloud', password: 'nope' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  });

  it('rejects an unknown email with the same 401 message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@e-office.cloud', password: 'Meeting@2569' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  });

  it('rejects a missing body with 400', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('returns the caller from GET /api/auth/me', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'malee.r@e-office.cloud', password: 'Meeting@2569' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe('U-003');
    expect(res.body.user.systemRole).toBe('secretary');
  });

  it('rejects GET /api/auth/me without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('issues a guest token for a meeting that allows guest join', async () => {
    const res = await request(app)
      .post('/api/auth/guest')
      .send({ meetingId: 'MT-2569-010', name: 'ผู้เข้าร่วมภายนอก' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.systemRole).toBe('guest');
  });

  it('refuses a guest token for a meeting that does not allow guest join', async () => {
    await query('UPDATE meetings SET allow_guest_join = 0 WHERE id = ?', ['MT-2569-007']);
    const res = await request(app)
      .post('/api/auth/guest')
      .send({ meetingId: 'MT-2569-007', name: 'ผู้เข้าร่วมภายนอก' });

    expect(res.status).toBe(403);
  });
});
```

Note on the guest test: `MT-2569-010` is the ZegoCloud test meeting in `src/data/index.ts` (line 408), the one with `allowGuestJoin: true`. `MT-2569-007` is a different meeting and the second guest test flips its `allow_guest_join` to 0 first, so the two tests do not interfere.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/routes/auth.test.ts`
Expected: FAIL with "createApp is not exported" / "Cannot find module '../../src/routes/auth'".

- [ ] **Step 3: Write the routes and split app creation out of server start**

Create `backend/src/routes/auth.ts`:

```typescript
// ═══════════════════════════════════════════
// Auth Routes — เข้าสู่ระบบด้วยรหัสผ่านจริง
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { queryOne } from '../database/connection';
import { verifyPassword, signAccessToken, signGuestToken } from '../services/auth';
import { authMiddleware, asyncHandler } from '../middleware';

const router = Router();

const INVALID_CREDENTIALS = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';

router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' });
    }

    const claims = await verifyPassword(email, password);
    if (!claims) {
      return res.status(401).json({ error: INVALID_CREDENTIALS });
    }

    res.json({
      token: signAccessToken(claims),
      user: {
        id: claims.sub,
        name: claims.name,
        email: claims.email,
        systemRole: claims.role,
        ...(claims.roomId ? { roomId: claims.roomId } : {}),
      },
    });
  })
);

router.post(
  '/guest',
  asyncHandler(async (req: Request, res: Response) => {
    const { meetingId, name } = req.body ?? {};
    if (typeof meetingId !== 'string' || typeof name !== 'string' || !meetingId || !name.trim()) {
      return res.status(400).json({ error: 'ต้องระบุรหัสการประชุมและชื่อผู้เข้าร่วม' });
    }

    const meeting = (await queryOne('SELECT id, allow_guest_join FROM meetings WHERE id = ?', [meetingId])) as
      | { id: string; allow_guest_join: number }
      | undefined;

    if (!meeting) return res.status(404).json({ error: 'ไม่พบการประชุมนี้' });
    if (!meeting.allow_guest_join) {
      return res.status(403).json({ error: 'การประชุมนี้ไม่เปิดให้บุคคลภายนอกเข้าร่วม' });
    }

    const guestId = `guest-${randomUUID()}`;
    res.json({
      token: signGuestToken({ sub: guestId, name: name.trim(), meetingId }),
      user: { id: guestId, name: name.trim(), email: '', systemRole: 'guest' },
    });
  })
);

router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json({
    user: {
      id: req.user!.id,
      name: req.user!.name,
      email: req.user!.email,
      systemRole: req.user!.role,
    },
  });
});

export default router;
```

Modify `backend/src/middleware/index.ts` — the global `Express.Request` augmentation currently lacks `name`, and `authMiddleware` must use the shared verifier instead of calling `jwt.verify` itself. Replace the declaration block and `authMiddleware`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        meetingId?: string;
      };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const claims = verifyAccessToken(authHeader.slice(7));
  if (!claims) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.user = {
    id: claims.sub,
    email: claims.email,
    name: claims.name,
    role: claims.role,
    ...(claims.meetingId ? { meetingId: claims.meetingId } : {}),
  };
  next();
}
```

Delete the now-unused `import jwt from 'jsonwebtoken';` at the top of that file. Leave `errorHandler`, `validateBody`, and `asyncHandler` unchanged.

Restructure `backend/src/server.ts` so the Express app can be built without listening. Replace everything from `const app: Express = express();` down to `export default app;` with:

```typescript
export function createApp(): Express {
  const app: Express = express();

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/transcription', transcriptionRoutes);
  app.use('/api/summarize', summarizeRoutes);

  app.use(errorHandler);
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
  });

  return app;
}

async function start() {
  try {
    console.log('🚀 Initializing database...');
    await initDatabase();
    console.log('✅ Database connected');

    const app = createApp();
    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}
```

Add `import authRoutes from './routes/auth';` to the imports at the top of the file.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/routes/auth.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/auth.ts backend/src/server.ts backend/src/middleware/index.ts backend/tests/routes/auth.test.ts
git commit -m "feat(backend): login, guest, and me auth endpoints"
```

---

### Task 5: Frontend login against the real API

**Files:**
- Create: `src/services/api/client.ts`
- Modify: `src/lib/session.ts`, `.env.example`
- Test: `src/lib/session.test.ts`

**Interfaces:**
- Consumes: `POST /api/auth/login` from Task 4
- Produces:
  - `apiFetch<T>(path: string, init?: RequestInit): Promise<T>` from `src/services/api/client.ts`
  - `getAccessToken(): string | null`, `setAccessToken(token: string | null): void` from `src/services/api/client.ts`
  - `signIn(email, password): Promise<SignInResult>` keeps its existing shape so `src/app/page.tsx` does not change

- [ ] **Step 1: Add the frontend test runner and write the failing test**

```bash
npm install --save-dev vitest@^3.0.0 jsdom@^25.0.0 @vitejs/plugin-react@^4.3.0
```

Create `vitest.config.ts` at the repo root:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
```

Add to the root `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
```

Create `src/lib/session.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { signIn } from './session';
import { getAccessToken, setAccessToken } from '@/services/api/client';

describe('signIn', () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://api.test');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('stores the token and returns the user on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            token: 'jwt-token-value',
            user: { id: 'U-999', name: 'IT Admin', email: 'admin@e-office.cloud', systemRole: 'admin' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    const result = await signIn('admin@e-office.cloud', 'Meeting@2569');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.id).toBe('U-999');
    expect(getAccessToken()).toBe('jwt-token-value');
  });

  it('surfaces the server message and stores no token on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    const result = await signIn('admin@e-office.cloud', 'wrong');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    expect(getAccessToken()).toBeNull();
  });

  it('rejects an empty email without calling the API', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await signIn('', 'Meeting@2569');

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports a network failure as a readable Thai message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    const result = await signIn('admin@e-office.cloud', 'Meeting@2569');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/session.test.ts`
Expected: FAIL with "Cannot find module '@/services/api/client'".

- [ ] **Step 3: Write the API client and rewrite signIn**

Create `src/services/api/client.ts`:

```typescript
// ═══════════════════════════════════════════
// API Client — จุดเดียวที่แนบ JWT เข้ากับทุก request
//
// token เก็บใน sessionStorage เหมือนตัวตนผู้ใช้ (ดู UserContext)
// เพื่อให้เปิดหลายแท็บเป็นคนละบัญชีทดสอบพร้อมกันได้
// ═══════════════════════════════════════════

const TOKEN_KEY = "meeting_system_access_token";

let memoryToken: string | null = null;

export function getAccessToken(): string | null {
  if (memoryToken) return memoryToken;
  if (typeof window === "undefined") return null;
  memoryToken = sessionStorage.getItem(TOKEN_KEY);
  return memoryToken;
}

export function setAccessToken(token: string | null): void {
  memoryToken = token;
  if (typeof window === "undefined") return;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์";
    throw new ApiError(response.status, message);
  }
  return body as T;
}
```

Replace `signIn` in `src/lib/session.ts` (keep `SignInResult` and `demoAccounts` as they are; `demoAccounts` still reads the mock `users` list, which is fine — it only fills in the demo buttons):

```typescript
import { users, AppUser } from "@/data";
import { apiFetch, setAccessToken, ApiError } from "@/services/api/client";

export type SignInResult =
  | { ok: true; user: AppUser }
  | { ok: false; reason: string };

type LoginResponse = {
  token: string;
  user: { id: string; name: string; email: string; systemRole: string; roomId?: string };
};

/**
 * เข้าสู่ระบบผ่าน backend จริง — ตรวจรหัสผ่านที่ server ด้วย bcrypt
 * แล้วเก็บ JWT ไว้ให้ทุก request และ WebSocket ใช้ต่อ
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { ok: false, reason: "กรุณากรอกอีเมล" };
  if (!password) return { ok: false, reason: "กรุณากรอกรหัสผ่าน" };

  try {
    const result = await apiFetch<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: normalized, password }),
    });

    setAccessToken(result.token);

    // ข้อมูลโปรไฟล์เต็ม (คณะที่สังกัด ฯลฯ) ยังมาจาก mock data จนกว่าจะย้าย meetings ขึ้น server ครบ
    const local = users.find((u) => u.id === result.user.id);
    const user: AppUser = local ?? {
      id: result.user.id,
      name: result.user.name,
      position: "",
      department: "",
      email: result.user.email,
      systemRole: result.user.systemRole as AppUser["systemRole"],
      committeeIds: [],
      ...(result.user.roomId ? { roomId: result.user.roomId } : {}),
    };

    return { ok: true, user };
  } catch (error) {
    setAccessToken(null);
    if (error instanceof ApiError) return { ok: false, reason: error.message };
    return { ok: false, reason: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}
```

Add to `.env.example`:

```
# Backend API + realtime — ต้องชี้ไปที่ backend ที่ deploy จริงตอน production
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/session.test.ts`
Expected: PASS, 4 tests.

Then run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/services/api/client.ts src/lib/session.ts src/lib/session.test.ts vitest.config.ts package.json package-lock.json .env.example
git commit -m "feat(auth): log in against the backend instead of matching emails locally"
```

---

## Phase 2 — WebSocket transport

### Task 6: WebSocket server with authenticated room join

**Files:**
- Create: `backend/src/realtime/rooms.ts`, `backend/src/realtime/server.ts`, `backend/src/repositories/meetings.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/realtime/connection.test.ts`

**Interfaces:**
- Consumes: `verifyAccessToken` from Task 3; `meeting_participants` from Task 1
- Produces:
  - `isMeetingMember(meetingId: string, userId: string): Promise<boolean>` from `backend/src/repositories/meetings.ts`
  - `type RoomClient = { socket: WebSocket; meetingId: string; userId: string; userName: string; role: string }`
  - `addClient(client: RoomClient): void`, `removeClient(client: RoomClient): void`, `clientsIn(meetingId: string): RoomClient[]` from `backend/src/realtime/rooms.ts`
  - `attachRealtime(server: http.Server): WebSocketServer` from `backend/src/realtime/server.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/realtime/connection.test.ts`:

```typescript
import http from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { signAccessToken } from '../../src/services/auth';
import { createApp } from '../../src/server';
import { attachRealtime } from '../../src/realtime/server';

let server: http.Server;
let port: number;

function connect(url: string): Promise<{ socket: WebSocket; opened: boolean; closeCode?: number }> {
  return new Promise((resolve) => {
    const socket = new WebSocket(url);
    socket.on('open', () => resolve({ socket, opened: true }));
    socket.on('close', (code) => resolve({ socket, opened: false, closeCode: code }));
  });
}

describe('realtime connection', () => {
  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM meeting_participants');
    await query('DELETE FROM meetings');
    await query('DELETE FROM app_users');
    await seedFromMockData('Meeting@2569');

    server = http.createServer(createApp());
    attachRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await close();
  });

  it('rejects a connection with no token', async () => {
    const result = await connect(`ws://localhost:${port}/ws?meetingId=MT-2569-007`);
    expect(result.opened).toBe(false);
    expect(result.closeCode).toBe(4401);
  });

  it('rejects a connection with an invalid token', async () => {
    const result = await connect(`ws://localhost:${port}/ws?meetingId=MT-2569-007&token=garbage`);
    expect(result.opened).toBe(false);
    expect(result.closeCode).toBe(4401);
  });

  it('rejects a valid token for a meeting the user is not a member of', async () => {
    await query('DELETE FROM meeting_participants WHERE meeting_id = ? AND user_id = ?', [
      'MT-2569-007',
      'U-005',
    ]);
    const token = signAccessToken({
      sub: 'U-005',
      email: 'decha@e-office.cloud',
      name: 'นาย เดชา เก่งจริง',
      role: 'staff',
    });
    const result = await connect(`ws://localhost:${port}/ws?meetingId=MT-2569-007&token=${token}`);
    expect(result.opened).toBe(false);
    expect(result.closeCode).toBe(4403);
  });

  it('accepts a member and lets an admin in without a membership row', async () => {
    const memberRow = (await query(
      'SELECT user_id FROM meeting_participants WHERE meeting_id = ? LIMIT 1',
      ['MT-2569-007']
    )) as { user_id: string }[];
    expect(memberRow.length).toBe(1);

    const adminToken = signAccessToken({
      sub: 'U-999',
      email: 'admin@e-office.cloud',
      name: 'IT Admin',
      role: 'admin',
    });
    const result = await connect(`ws://localhost:${port}/ws?meetingId=MT-2569-007&token=${adminToken}`);
    expect(result.opened).toBe(true);
    result.socket.close();
  });

  it('confirms the join with a room_joined message carrying the identity from the token', async () => {
    const token = signAccessToken({
      sub: 'U-999',
      email: 'admin@e-office.cloud',
      name: 'IT Admin',
      role: 'admin',
    });
    const socket = new WebSocket(`ws://localhost:${port}/ws?meetingId=MT-2569-007&token=${token}`);

    const message = await new Promise<Record<string, unknown>>((resolve) => {
      socket.on('message', (raw) => resolve(JSON.parse(raw.toString())));
    });

    expect(message.type).toBe('room_joined');
    expect((message.payload as Record<string, unknown>).userId).toBe('U-999');
    socket.close();
  });
});
```

- [ ] **Step 2: Install `ws` and run the test to verify it fails**

```bash
cd backend
npm install ws@^8.18.0
npm install --save-dev @types/ws@^8.5.12
```

Run: `cd backend && npx jest tests/realtime/connection.test.ts`
Expected: FAIL with "Cannot find module '../../src/realtime/server'".

- [ ] **Step 3: Write the room registry, membership check, and WebSocket server**

Create `backend/src/repositories/meetings.ts`:

```typescript
import { queryOne } from '../database/connection';

/** admin เข้าได้ทุกห้องอยู่แล้ว — ตรงกับ can() ฝั่งหน้าเว็บ */
export async function isMeetingMember(meetingId: string, userId: string): Promise<boolean> {
  const row = await queryOne(
    'SELECT user_id FROM meeting_participants WHERE meeting_id = ? AND user_id = ?',
    [meetingId, userId]
  );
  return Boolean(row);
}

export async function meetingExists(meetingId: string): Promise<boolean> {
  const row = await queryOne('SELECT id FROM meetings WHERE id = ?', [meetingId]);
  return Boolean(row);
}
```

Create `backend/src/realtime/rooms.ts`:

```typescript
// ═══════════════════════════════════════════
// Room Registry — ใครต่ออยู่ห้องไหน (in-memory เท่านั้น)
// ไม่มี business logic ในไฟล์นี้
// ═══════════════════════════════════════════

import type { WebSocket } from 'ws';

export type RoomClient = {
  socket: WebSocket;
  meetingId: string;
  userId: string;
  userName: string;
  role: string;
};

const rooms = new Map<string, Set<RoomClient>>();

export function addClient(client: RoomClient): void {
  let set = rooms.get(client.meetingId);
  if (!set) {
    set = new Set();
    rooms.set(client.meetingId, set);
  }
  set.add(client);
}

export function removeClient(client: RoomClient): void {
  const set = rooms.get(client.meetingId);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) rooms.delete(client.meetingId);
}

export function clientsIn(meetingId: string): RoomClient[] {
  return Array.from(rooms.get(meetingId) ?? []);
}
```

Create `backend/src/realtime/server.ts`:

```typescript
// ═══════════════════════════════════════════
// WebSocket Server — แทน BroadcastChannel ที่คุยข้ามเครื่องไม่ได้
//
// ตัวตนผู้ส่งมาจาก JWT เท่านั้น payload ที่ client ส่งมาไม่มีสิทธิ์บอกว่าตัวเองเป็นใคร
// ═══════════════════════════════════════════

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAccessToken } from '../services/auth';
import { isMeetingMember } from '../repositories/meetings';
import { addClient, removeClient, clientsIn, RoomClient } from './rooms';
import { handleSignal } from './handlers';

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FORBIDDEN = 4403;
const CLOSE_BAD_REQUEST = 4400;

export function send(socket: WebSocket, message: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
}

export function broadcast(meetingId: string, message: unknown, exceptUserId?: string): void {
  for (const client of clientsIn(meetingId)) {
    if (exceptUserId && client.userId === exceptUserId) continue;
    send(client.socket, message);
  }
}

export function attachRealtime(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (socket, request) => {
    const url = new URL(request.url ?? '', 'http://localhost');
    const meetingId = url.searchParams.get('meetingId');
    const token = url.searchParams.get('token');

    if (!meetingId) return socket.close(CLOSE_BAD_REQUEST, 'meetingId required');
    if (!token) return socket.close(CLOSE_UNAUTHORIZED, 'token required');

    const claims = verifyAccessToken(token);
    if (!claims) return socket.close(CLOSE_UNAUTHORIZED, 'invalid token');

    // guest token ผูกกับการประชุมเดียวตอนออก token — เข้าห้องอื่นไม่ได้
    if (claims.role === 'guest') {
      if (claims.meetingId !== meetingId) return socket.close(CLOSE_FORBIDDEN, 'not your meeting');
    } else if (claims.role !== 'admin') {
      const member = await isMeetingMember(meetingId, claims.sub);
      if (!member) return socket.close(CLOSE_FORBIDDEN, 'not a participant');
    }

    const client: RoomClient = {
      socket,
      meetingId,
      userId: claims.sub,
      userName: claims.name,
      role: claims.role,
    };
    addClient(client);

    send(socket, {
      type: 'room_joined',
      senderId: 'server',
      senderName: 'server',
      timestamp: Date.now(),
      payload: { userId: client.userId, userName: client.userName, meetingId },
    });

    socket.on('message', async (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      await handleSignal(client, parsed);
    });

    socket.on('close', () => removeClient(client));
    socket.on('error', () => removeClient(client));
  });

  return wss;
}
```

Create a placeholder `backend/src/realtime/handlers.ts` — Task 7 fills it in:

```typescript
import type { RoomClient } from './rooms';

export async function handleSignal(client: RoomClient, message: unknown): Promise<void> {
  void client;
  void message;
}
```

Modify `start()` in `backend/src/server.ts` to create the HTTP server explicitly and attach the WebSocket server:

```typescript
import http from 'http';
import { attachRealtime } from './realtime/server';

async function start() {
  try {
    console.log('🚀 Initializing database...');
    await initDatabase();
    console.log('✅ Database connected');

    const server = http.createServer(createApp());
    attachRealtime(server);

    server.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`✅ WebSocket listening on ws://localhost:${PORT}/ws`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/realtime/connection.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/realtime/ backend/src/repositories/meetings.ts backend/src/server.ts backend/tests/realtime/ backend/package.json backend/package-lock.json
git commit -m "feat(realtime): authenticated WebSocket rooms"
```

---

### Task 7: Signal handlers — server-authoritative fan-out

**Files:**
- Create: `backend/src/repositories/votes.ts`, `backend/src/repositories/handRaises.ts`, `backend/src/repositories/transcript.ts`, `backend/src/repositories/docShare.ts`
- Modify: `backend/src/realtime/handlers.ts`
- Test: `backend/tests/realtime/handlers.test.ts`

**Interfaces:**
- Consumes: `RoomClient` and `broadcast` from Task 6; all tables from Task 1
- Produces:
  - `backend/src/repositories/votes.ts`: `createTopic(input)`, `castVote(topicId, userId, userName, optionId)`, `closeTopic(topicId)`, `getTopic(topicId)`, `listTopics(meetingId)` — `VoteTopic` shape matches the frontend type in `src/services/voting/types.ts` exactly: `{ id, meetingId, title, description?, options: {id,label}[], createdBy, createdByName, createdAt, status, votes: {userId,userName,optionId,timestamp}[] }`
  - `backend/src/repositories/handRaises.ts`: `raiseHand(meetingId, userId, userName)`, `lowerHand(meetingId, userId)`, `listRaised(meetingId)`
  - `backend/src/repositories/transcript.ts`: `appendSegment(meetingId, segment)`, `listSegments(meetingId)`
  - `backend/src/repositories/docShare.ts`: `setShare(meetingId, share)`, `setPage(meetingId, page)`, `clearShare(meetingId)`, `getShare(meetingId)`
  - `handleSignal(client, message): Promise<void>` — writes MySQL, then broadcasts the authoritative result

- [ ] **Step 1: Write the failing test**

Create `backend/tests/realtime/handlers.test.ts`:

```typescript
import http from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { signAccessToken } from '../../src/services/auth';
import { createApp } from '../../src/server';
import { attachRealtime } from '../../src/realtime/server';

let server: http.Server;
let port: number;
const MEETING = 'MT-2569-007';

function tokenFor(sub: string, name: string, role: string) {
  return signAccessToken({ sub, email: `${sub}@e-office.cloud`, name, role });
}

async function openClient(sub: string, name: string, role = 'admin'): Promise<WebSocket> {
  const socket = new WebSocket(
    `ws://localhost:${port}/ws?meetingId=${MEETING}&token=${tokenFor(sub, name, role)}`
  );
  await new Promise<void>((resolve) => socket.on('open', () => resolve()));
  // ข้อความแรกคือ room_joined — กินทิ้งเพื่อให้ nextMessage() อ่านสัญญาณจริง
  await nextMessage(socket);
  return socket;
}

function nextMessage(socket: WebSocket): Promise<any> {
  return new Promise((resolve) => socket.once('message', (raw) => resolve(JSON.parse(raw.toString()))));
}

describe('signal handlers', () => {
  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM meeting_participants');
    await query('DELETE FROM meetings');
    await query('DELETE FROM app_users');
    await seedFromMockData('Meeting@2569');

    server = http.createServer(createApp());
    attachRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  beforeEach(async () => {
    await query('DELETE FROM vote_records');
    await query('DELETE FROM vote_options');
    await query('DELETE FROM vote_topics');
    await query('DELETE FROM hand_raises');
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await close();
  });

  it('persists a created vote topic and broadcasts it to the other client', async () => {
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-003', 'นางสาว มาลี รักษาสัตย์');

    const received = nextMessage(b);
    a.send(
      JSON.stringify({
        type: 'vote_create',
        payload: {
          title: 'รับรองวาระที่ 1',
          description: '',
          options: [
            { id: 'opt-1', label: 'เห็นด้วย' },
            { id: 'opt-2', label: 'ไม่เห็นด้วย' },
          ],
        },
      })
    );

    const message = await received;
    expect(message.type).toBe('vote_state');
    expect(message.payload.topic.title).toBe('รับรองวาระที่ 1');
    expect(message.payload.topic.createdBy).toBe('U-999');

    const rows = (await query('SELECT id FROM vote_topics WHERE meeting_id = ?', [MEETING])) as unknown[];
    expect(rows).toHaveLength(1);

    a.close();
    b.close();
  });

  it('records the sender from the token, ignoring any senderId in the payload', async () => {
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-003', 'นางสาว มาลี รักษาสัตย์');

    const created = nextMessage(b);
    a.send(
      JSON.stringify({
        type: 'vote_create',
        senderId: 'U-001',
        payload: { title: 'ทดสอบการปลอมตัว', options: [{ id: 'opt-1', label: 'เห็นด้วย' }] },
      })
    );
    const message = await created;

    expect(message.payload.topic.createdBy).toBe('U-999');
    expect(message.senderId).toBe('U-999');

    a.close();
    b.close();
  });

  it('keeps one vote per user — voting twice replaces the earlier choice', async () => {
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-003', 'นางสาว มาลี รักษาสัตย์');

    const created = nextMessage(b);
    a.send(
      JSON.stringify({
        type: 'vote_create',
        payload: {
          title: 'มติที่ 2',
          options: [
            { id: 'opt-1', label: 'เห็นด้วย' },
            { id: 'opt-2', label: 'ไม่เห็นด้วย' },
          ],
        },
      })
    );
    const topicId = (await created).payload.topic.id;

    const firstCast = nextMessage(a);
    b.send(JSON.stringify({ type: 'vote_cast', payload: { topicId, optionId: 'opt-1' } }));
    await firstCast;

    const secondCast = nextMessage(a);
    b.send(JSON.stringify({ type: 'vote_cast', payload: { topicId, optionId: 'opt-2' } }));
    const message = await secondCast;

    expect(message.payload.topic.votes).toHaveLength(1);
    expect(message.payload.topic.votes[0].optionId).toBe('opt-2');

    a.close();
    b.close();
  });

  it('refuses a vote on a closed topic', async () => {
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-003', 'นางสาว มาลี รักษาสัตย์');

    const created = nextMessage(b);
    a.send(
      JSON.stringify({ type: 'vote_create', payload: { title: 'ปิดแล้ว', options: [{ id: 'opt-1', label: 'ok' }] } })
    );
    const topicId = (await created).payload.topic.id;

    const closed = nextMessage(b);
    a.send(JSON.stringify({ type: 'vote_close', payload: { topicId } }));
    await closed;

    const rejected = nextMessage(b);
    b.send(JSON.stringify({ type: 'vote_cast', payload: { topicId, optionId: 'opt-1' } }));
    const message = await rejected;

    expect(message.type).toBe('signal_error');

    const rows = (await query('SELECT user_id FROM vote_records WHERE topic_id = ?', [topicId])) as unknown[];
    expect(rows).toHaveLength(0);

    a.close();
    b.close();
  });

  it('refuses vote_close from a participant who did not create the topic and is not a manager', async () => {
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-001', 'นาย สมชาย ใจดี', 'staff');

    const created = nextMessage(b);
    a.send(
      JSON.stringify({ type: 'vote_create', payload: { title: 'ของแอดมิน', options: [{ id: 'opt-1', label: 'ok' }] } })
    );
    const topicId = (await created).payload.topic.id;

    const rejected = nextMessage(b);
    b.send(JSON.stringify({ type: 'vote_close', payload: { topicId } }));
    expect((await rejected).type).toBe('signal_error');

    a.close();
    b.close();
  });

  it('persists hand raises and broadcasts the full raised list', async () => {
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-003', 'นางสาว มาลี รักษาสัตย์');

    const raised = nextMessage(a);
    b.send(JSON.stringify({ type: 'hand_raise', payload: { raised: true } }));
    const message = await raised;

    expect(message.type).toBe('hand_state');
    expect(message.payload.raised).toEqual([
      expect.objectContaining({ userId: 'U-003', userName: 'นางสาว มาลี รักษาสัตย์' }),
    ]);

    const lowered = nextMessage(a);
    b.send(JSON.stringify({ type: 'hand_raise', payload: { raised: false } }));
    expect((await lowered).payload.raised).toEqual([]);

    a.close();
    b.close();
  });

  it('relays only final subtitle segments to storage but broadcasts interim ones', async () => {
    const a = await openClient('U-999', 'IT Admin');
    const b = await openClient('U-003', 'นางสาว มาลี รักษาสัตย์');

    const interim = nextMessage(a);
    b.send(
      JSON.stringify({ type: 'subtitle_text', payload: { text: 'กำลังพูด', isFinal: false, lang: 'th-TH' } })
    );
    expect((await interim).payload.text).toBe('กำลังพูด');

    const final = nextMessage(a);
    b.send(
      JSON.stringify({ type: 'subtitle_text', payload: { text: 'พูดจบแล้ว', isFinal: true, lang: 'th-TH' } })
    );
    await final;

    const rows = (await query('SELECT text FROM transcript_segments WHERE meeting_id = ?', [MEETING])) as {
      text: string;
    }[];
    expect(rows.map((r) => r.text)).toEqual(['พูดจบแล้ว']);

    a.close();
    b.close();
  });

  it('ignores an unknown signal type without closing the socket', async () => {
    const a = await openClient('U-999', 'IT Admin');
    a.send(JSON.stringify({ type: 'not_a_real_signal', payload: {} }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(a.readyState).toBe(WebSocket.OPEN);
    a.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/realtime/handlers.test.ts`
Expected: FAIL — every assertion times out because `handleSignal` is still the no-op placeholder.

- [ ] **Step 3: Write the repositories and handlers**

Create `backend/src/repositories/votes.ts`:

```typescript
import { query, queryOne } from '../database/connection';

export type VoteOption = { id: string; label: string };
export type VoteRecord = { userId: string; userName: string; optionId: string; timestamp: number };
export type VoteTopic = {
  id: string;
  meetingId: string;
  title: string;
  description?: string;
  options: VoteOption[];
  createdBy: string;
  createdByName: string;
  createdAt: number;
  status: 'open' | 'closed';
  votes: VoteRecord[];
};

export async function createTopic(input: {
  id: string;
  meetingId: string;
  title: string;
  description?: string;
  options: VoteOption[];
  createdBy: string;
  createdByName: string;
}): Promise<VoteTopic> {
  const createdAt = Date.now();
  await query(
    `INSERT INTO vote_topics (id, meeting_id, title, description, created_by, created_by_name, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
    [
      input.id,
      input.meetingId,
      input.title,
      input.description ?? null,
      input.createdBy,
      input.createdByName,
      createdAt,
    ]
  );

  for (let i = 0; i < input.options.length; i += 1) {
    const option = input.options[i];
    await query('INSERT INTO vote_options (id, topic_id, label, sort_order) VALUES (?, ?, ?, ?)', [
      option.id,
      input.id,
      option.label,
      i,
    ]);
  }

  const topic = await getTopic(input.id);
  if (!topic) throw new Error('topic disappeared right after insert');
  return topic;
}

export async function getTopic(topicId: string): Promise<VoteTopic | null> {
  const row = (await queryOne(
    `SELECT id, meeting_id, title, description, created_by, created_by_name, created_at, status
     FROM vote_topics WHERE id = ?`,
    [topicId]
  )) as
    | {
        id: string;
        meeting_id: string;
        title: string;
        description: string | null;
        created_by: string;
        created_by_name: string;
        created_at: number;
        status: 'open' | 'closed';
      }
    | undefined;

  if (!row) return null;

  const options = (await query(
    'SELECT id, label FROM vote_options WHERE topic_id = ? ORDER BY sort_order ASC',
    [topicId]
  )) as VoteOption[];

  const records = (await query(
    'SELECT user_id, user_name, option_id, voted_at FROM vote_records WHERE topic_id = ?',
    [topicId]
  )) as { user_id: string; user_name: string; option_id: string; voted_at: number }[];

  return {
    id: row.id,
    meetingId: row.meeting_id,
    title: row.title,
    ...(row.description ? { description: row.description } : {}),
    options,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: Number(row.created_at),
    status: row.status,
    votes: records.map((r) => ({
      userId: r.user_id,
      userName: r.user_name,
      optionId: r.option_id,
      timestamp: Number(r.voted_at),
    })),
  };
}

export async function listTopics(meetingId: string): Promise<VoteTopic[]> {
  const rows = (await query(
    'SELECT id FROM vote_topics WHERE meeting_id = ? ORDER BY created_at ASC',
    [meetingId]
  )) as { id: string }[];

  const topics: VoteTopic[] = [];
  for (const row of rows) {
    const topic = await getTopic(row.id);
    if (topic) topics.push(topic);
  }
  return topics;
}

/** คืน null เมื่อหัวข้อปิดแล้วหรือไม่มีจริง — ตัวเรียกต้องแจ้ง error กลับไปที่ client */
export async function castVote(
  topicId: string,
  userId: string,
  userName: string,
  optionId: string
): Promise<VoteTopic | null> {
  const topic = await getTopic(topicId);
  if (!topic || topic.status !== 'open') return null;
  if (!topic.options.some((o) => o.id === optionId)) return null;

  await query(
    `INSERT INTO vote_records (topic_id, user_id, user_name, option_id, voted_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE option_id = VALUES(option_id), voted_at = VALUES(voted_at)`,
    [topicId, userId, userName, optionId, Date.now()]
  );

  return getTopic(topicId);
}

export async function closeTopic(topicId: string): Promise<VoteTopic | null> {
  const topic = await getTopic(topicId);
  if (!topic) return null;
  await query("UPDATE vote_topics SET status = 'closed' WHERE id = ?", [topicId]);
  return getTopic(topicId);
}
```

Create `backend/src/repositories/handRaises.ts`:

```typescript
import { query } from '../database/connection';

export type RaisedHand = { userId: string; userName: string; raisedAt: number };

export async function raiseHand(meetingId: string, userId: string, userName: string): Promise<void> {
  await query(
    `INSERT INTO hand_raises (meeting_id, user_id, user_name, raised_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_name = VALUES(user_name)`,
    [meetingId, userId, userName, Date.now()]
  );
}

export async function lowerHand(meetingId: string, userId: string): Promise<void> {
  await query('DELETE FROM hand_raises WHERE meeting_id = ? AND user_id = ?', [meetingId, userId]);
}

export async function listRaised(meetingId: string): Promise<RaisedHand[]> {
  const rows = (await query(
    'SELECT user_id, user_name, raised_at FROM hand_raises WHERE meeting_id = ? ORDER BY raised_at ASC',
    [meetingId]
  )) as { user_id: string; user_name: string; raised_at: number }[];

  return rows.map((r) => ({ userId: r.user_id, userName: r.user_name, raisedAt: Number(r.raised_at) }));
}
```

Create `backend/src/repositories/transcript.ts`:

```typescript
import { query } from '../database/connection';

export type TranscriptSegment = {
  speakerId: string;
  speakerName: string;
  startSec: number;
  text: string;
};

export async function appendSegment(meetingId: string, segment: TranscriptSegment): Promise<void> {
  await query(
    `INSERT INTO transcript_segments (meeting_id, speaker_id, speaker_name, start_sec, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [meetingId, segment.speakerId, segment.speakerName, segment.startSec, segment.text, Date.now()]
  );
}

export async function listSegments(meetingId: string): Promise<TranscriptSegment[]> {
  const rows = (await query(
    'SELECT speaker_id, speaker_name, start_sec, text FROM transcript_segments WHERE meeting_id = ? ORDER BY start_sec ASC, id ASC',
    [meetingId]
  )) as { speaker_id: string; speaker_name: string; start_sec: number; text: string }[];

  return rows.map((r) => ({
    speakerId: r.speaker_id,
    speakerName: r.speaker_name,
    startSec: Number(r.start_sec),
    text: r.text,
  }));
}
```

Create `backend/src/repositories/docShare.ts`:

```typescript
import { query, queryOne } from '../database/connection';

export type DocShare = {
  fileId: string;
  fileName: string;
  page: number;
  sharedBy: string;
  sharedName: string;
};

export async function setShare(
  meetingId: string,
  share: Omit<DocShare, 'page'> & { page?: number }
): Promise<void> {
  await query(
    `INSERT INTO doc_shares (meeting_id, file_id, file_name, page, shared_by, shared_name, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE file_id = VALUES(file_id), file_name = VALUES(file_name),
       page = VALUES(page), shared_by = VALUES(shared_by), shared_name = VALUES(shared_name),
       updated_at = VALUES(updated_at)`,
    [meetingId, share.fileId, share.fileName, share.page ?? 1, share.sharedBy, share.sharedName, Date.now()]
  );
}

export async function setPage(meetingId: string, page: number): Promise<void> {
  await query('UPDATE doc_shares SET page = ?, updated_at = ? WHERE meeting_id = ?', [
    page,
    Date.now(),
    meetingId,
  ]);
}

export async function clearShare(meetingId: string): Promise<void> {
  await query('DELETE FROM doc_shares WHERE meeting_id = ?', [meetingId]);
}

export async function getShare(meetingId: string): Promise<DocShare | null> {
  const row = (await queryOne(
    'SELECT file_id, file_name, page, shared_by, shared_name FROM doc_shares WHERE meeting_id = ?',
    [meetingId]
  )) as
    | { file_id: string; file_name: string; page: number; shared_by: string; shared_name: string }
    | undefined;

  if (!row) return null;
  return {
    fileId: row.file_id,
    fileName: row.file_name,
    page: Number(row.page),
    sharedBy: row.shared_by,
    sharedName: row.shared_name,
  };
}
```

Replace `backend/src/realtime/handlers.ts`:

```typescript
// ═══════════════════════════════════════════
// Signal Handlers — เขียน MySQL ก่อน แล้วค่อยกระจายผลที่ยืนยันแล้วออกไป
//
// ผู้ส่งมาจาก client.userId (ซึ่งมาจาก JWT) เสมอ
// ไม่เคยอ่าน senderId จาก message ที่ client ส่งมา
// ═══════════════════════════════════════════

import { randomUUID } from 'crypto';
import type { RoomClient } from './rooms';
import { send, broadcast } from './server';
import * as votes from '../repositories/votes';
import * as hands from '../repositories/handRaises';
import * as transcript from '../repositories/transcript';
import * as docShare from '../repositories/docShare';

const MANAGER_ROLES = new Set(['admin', 'secretary', 'executive']);

function envelope(client: RoomClient, type: string, payload: unknown) {
  return { type, senderId: client.userId, senderName: client.userName, timestamp: Date.now(), payload };
}

function fail(client: RoomClient, reason: string) {
  send(client.socket, envelope(client, 'signal_error', { reason }));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export async function handleSignal(client: RoomClient, message: unknown): Promise<void> {
  const { type, payload } = asRecord(message);
  const data = asRecord(payload);

  switch (type) {
    case 'vote_create': {
      if (!MANAGER_ROLES.has(client.role)) return fail(client, 'ไม่มีสิทธิ์สร้างโหวต');
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      const rawOptions = Array.isArray(data.options) ? data.options : [];
      const options = rawOptions
        .map((o) => asRecord(o))
        .filter((o) => typeof o.id === 'string' && typeof o.label === 'string')
        .map((o) => ({ id: o.id as string, label: o.label as string }));

      if (!title || options.length < 1) return fail(client, 'หัวข้อและตัวเลือกไม่ครบ');

      const topic = await votes.createTopic({
        id: `vote-${Date.now()}-${randomUUID().slice(0, 8)}`,
        meetingId: client.meetingId,
        title,
        ...(typeof data.description === 'string' && data.description ? { description: data.description } : {}),
        options,
        createdBy: client.userId,
        createdByName: client.userName,
      });

      return broadcast(client.meetingId, envelope(client, 'vote_state', { topic }));
    }

    case 'vote_cast': {
      const topicId = typeof data.topicId === 'string' ? data.topicId : '';
      const optionId = typeof data.optionId === 'string' ? data.optionId : '';
      if (!topicId || !optionId) return fail(client, 'ข้อมูลโหวตไม่ครบ');

      const topic = await votes.castVote(topicId, client.userId, client.userName, optionId);
      if (!topic) return fail(client, 'โหวตไม่สำเร็จ — หัวข้อปิดแล้วหรือไม่มีตัวเลือกนี้');

      return broadcast(client.meetingId, envelope(client, 'vote_state', { topic }));
    }

    case 'vote_close': {
      const topicId = typeof data.topicId === 'string' ? data.topicId : '';
      if (!topicId) return fail(client, 'ไม่ระบุหัวข้อ');

      const existing = await votes.getTopic(topicId);
      if (!existing) return fail(client, 'ไม่พบหัวข้อโหวตนี้');
      if (existing.createdBy !== client.userId && !MANAGER_ROLES.has(client.role)) {
        return fail(client, 'ไม่มีสิทธิ์ปิดโหวตนี้');
      }

      const topic = await votes.closeTopic(topicId);
      return broadcast(client.meetingId, envelope(client, 'vote_state', { topic }));
    }

    case 'hand_raise': {
      if (data.raised === true) await hands.raiseHand(client.meetingId, client.userId, client.userName);
      else await hands.lowerHand(client.meetingId, client.userId);

      const raised = await hands.listRaised(client.meetingId);
      return broadcast(client.meetingId, envelope(client, 'hand_state', { raised }));
    }

    case 'hand_lower': {
      // ประธาน/เลขาเอามือคนอื่นลงได้ คนทั่วไปลงได้เฉพาะของตัวเอง
      const targetUserId = typeof data.targetUserId === 'string' ? data.targetUserId : '';
      if (!targetUserId) return fail(client, 'ไม่ระบุผู้ใช้');
      if (targetUserId !== client.userId && !MANAGER_ROLES.has(client.role)) {
        return fail(client, 'ไม่มีสิทธิ์เอามือผู้อื่นลง');
      }

      await hands.lowerHand(client.meetingId, targetUserId);
      const raised = await hands.listRaised(client.meetingId);
      return broadcast(client.meetingId, envelope(client, 'hand_state', { raised }));
    }

    case 'subtitle_text': {
      const text = typeof data.text === 'string' ? data.text : '';
      const isFinal = data.isFinal === true;
      const lang = typeof data.lang === 'string' ? data.lang : 'th-TH';
      if (!text) return;

      // ข้อความระหว่างพูดกระจายอย่างเดียว ไม่บันทึก — บันทึกเฉพาะประโยคที่จบแล้ว
      if (isFinal) {
        await transcript.appendSegment(client.meetingId, {
          speakerId: client.userId,
          speakerName: client.userName,
          startSec: typeof data.startSec === 'number' ? data.startSec : 0,
          text,
        });
      }

      return broadcast(client.meetingId, envelope(client, 'subtitle_text', { text, isFinal, lang }), client.userId);
    }

    case 'doc_share': {
      const fileId = typeof data.fileId === 'string' ? data.fileId : '';
      const fileName = typeof data.fileName === 'string' ? data.fileName : '';
      if (!fileId || !fileName) return fail(client, 'ข้อมูลไฟล์ไม่ครบ');

      await docShare.setShare(client.meetingId, {
        fileId,
        fileName,
        sharedBy: client.userId,
        sharedName: client.userName,
        page: 1,
      });
      const share = await docShare.getShare(client.meetingId);
      return broadcast(client.meetingId, envelope(client, 'doc_share_state', { share }));
    }

    case 'doc_share_page': {
      const page = typeof data.page === 'number' ? data.page : 0;
      if (page < 1) return fail(client, 'เลขหน้าไม่ถูกต้อง');

      const current = await docShare.getShare(client.meetingId);
      if (!current) return fail(client, 'ยังไม่มีเอกสารที่แชร์อยู่');
      if (current.sharedBy !== client.userId && !MANAGER_ROLES.has(client.role)) {
        return fail(client, 'ไม่มีสิทธิ์เปลี่ยนหน้าเอกสารของผู้อื่น');
      }

      await docShare.setPage(client.meetingId, page);
      const share = await docShare.getShare(client.meetingId);
      return broadcast(client.meetingId, envelope(client, 'doc_share_state', { share }));
    }

    case 'doc_share_stop': {
      const current = await docShare.getShare(client.meetingId);
      if (!current) return;
      if (current.sharedBy !== client.userId && !MANAGER_ROLES.has(client.role)) {
        return fail(client, 'ไม่มีสิทธิ์หยุดแชร์ของผู้อื่น');
      }

      await docShare.clearShare(client.meetingId);
      return broadcast(client.meetingId, envelope(client, 'doc_share_state', { share: null }));
    }

    default:
      // สัญญาณที่ไม่รู้จัก — ปล่อยผ่าน ไม่ปิด socket เพื่อให้ deploy คนละเวอร์ชันอยู่ร่วมกันได้
      return;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/realtime/handlers.test.ts`
Expected: PASS, 8 tests.

Then run the whole backend suite: `cd backend && npx jest`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/ backend/src/realtime/handlers.ts backend/tests/realtime/handlers.test.ts
git commit -m "feat(realtime): server-authoritative vote, hand raise, subtitle, and doc-share handlers"
```

---

### Task 8: Room snapshot endpoint for late join

**Files:**
- Create: `backend/src/routes/rooms.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/routes/rooms.test.ts`

**Interfaces:**
- Consumes: repositories from Task 7; `authMiddleware` from Task 4; `isMeetingMember` from Task 6
- Produces: `GET /api/rooms/:meetingId/state` → `{ voteTopics: VoteTopic[]; raisedHands: RaisedHand[]; transcript: TranscriptSegment[]; docShare: DocShare | null }`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/routes/rooms.test.ts`:

```typescript
import request from 'supertest';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { signAccessToken } from '../../src/services/auth';
import { createApp } from '../../src/server';
import * as votes from '../../src/repositories/votes';
import * as hands from '../../src/repositories/handRaises';

const app = createApp();
const MEETING = 'MT-2569-007';

const adminToken = signAccessToken({
  sub: 'U-999',
  email: 'admin@e-office.cloud',
  name: 'IT Admin',
  role: 'admin',
});

describe('GET /api/rooms/:meetingId/state', () => {
  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM meeting_participants');
    await query('DELETE FROM meetings');
    await query('DELETE FROM app_users');
    await seedFromMockData('Meeting@2569');

    await query('DELETE FROM vote_records');
    await query('DELETE FROM vote_options');
    await query('DELETE FROM vote_topics');
    await query('DELETE FROM hand_raises');

    await votes.createTopic({
      id: 'vote-snapshot-1',
      meetingId: MEETING,
      title: 'มติทดสอบ',
      options: [{ id: 'opt-1', label: 'เห็นด้วย' }],
      createdBy: 'U-999',
      createdByName: 'IT Admin',
    });
    await votes.castVote('vote-snapshot-1', 'U-003', 'นางสาว มาลี รักษาสัตย์', 'opt-1');
    await hands.raiseHand(MEETING, 'U-003', 'นางสาว มาลี รักษาสัตย์');
  });

  afterAll(async () => {
    await close();
  });

  it('returns every piece of room state a late joiner needs', async () => {
    const res = await request(app)
      .get(`/api/rooms/${MEETING}/state`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.voteTopics).toHaveLength(1);
    expect(res.body.voteTopics[0].votes).toHaveLength(1);
    expect(res.body.raisedHands).toHaveLength(1);
    expect(res.body.docShare).toBeNull();
    expect(Array.isArray(res.body.transcript)).toBe(true);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get(`/api/rooms/${MEETING}/state`);
    expect(res.status).toBe(401);
  });

  it('rejects a user who is not in the meeting', async () => {
    await query('DELETE FROM meeting_participants WHERE meeting_id = ? AND user_id = ?', [MEETING, 'U-005']);
    const token = signAccessToken({
      sub: 'U-005',
      email: 'decha@e-office.cloud',
      name: 'นาย เดชา เก่งจริง',
      role: 'staff',
    });

    const res = await request(app).get(`/api/rooms/${MEETING}/state`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/routes/rooms.test.ts`
Expected: FAIL with 404 on the route.

- [ ] **Step 3: Write the route**

Create `backend/src/routes/rooms.ts`:

```typescript
// ═══════════════════════════════════════════
// Room State — สแนปช็อตสำหรับคนที่เข้าห้องทีหลัง
// ต่อ WebSocket แล้วต้องเรียกอันนี้ก่อน ไม่งั้นจะไม่เห็นของที่เกิดก่อนหน้า
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { authMiddleware, asyncHandler } from '../middleware';
import { isMeetingMember, meetingExists } from '../repositories/meetings';
import { listTopics } from '../repositories/votes';
import { listRaised } from '../repositories/handRaises';
import { listSegments } from '../repositories/transcript';
import { getShare } from '../repositories/docShare';

const router = Router();

router.get(
  '/:meetingId/state',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { meetingId } = req.params;
    const user = req.user!;

    if (!(await meetingExists(meetingId))) {
      return res.status(404).json({ error: 'ไม่พบการประชุมนี้' });
    }

    const allowed =
      user.role === 'admin' ||
      (user.role === 'guest' ? user.meetingId === meetingId : await isMeetingMember(meetingId, user.id));

    if (!allowed) return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงการประชุมนี้' });

    const [voteTopics, raisedHands, transcript, docShare] = await Promise.all([
      listTopics(meetingId),
      listRaised(meetingId),
      listSegments(meetingId),
      getShare(meetingId),
    ]);

    res.json({ voteTopics, raisedHands, transcript, docShare });
  })
);

export default router;
```

Add to `createApp()` in `backend/src/server.ts`, next to the other route mounts:

```typescript
app.use('/api/rooms', roomsRoutes);
```

with `import roomsRoutes from './routes/rooms';` at the top.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/routes/rooms.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/rooms.ts backend/src/server.ts backend/tests/routes/rooms.test.ts
git commit -m "feat(backend): room state snapshot endpoint for late joiners"
```

---

### Task 9: Frontend transport swap — WebSocket instead of BroadcastChannel

**Files:**
- Modify: `src/services/signaling/types.ts`, `src/services/signaling/channel.ts`, `src/context/RoomSignalingContext.tsx`
- Test: `src/services/signaling/channel.test.ts`

**Interfaces:**
- Consumes: WebSocket server from Task 6; `getAccessToken` from Task 5
- Produces:
  - `SignalType` gains `"room_joined" | "signal_error" | "vote_state" | "hand_state" | "doc_share_state"`; `SignalPayloadMap` gains matching entries
  - `openTransport(meetingId: string, handlers: { onMessage: (signal: RoomSignal) => void; onStatus: (connected: boolean) => void }): RoomTransport` from `channel.ts`, where `RoomTransport = { send: (type: SignalType, payload: unknown) => void; close: () => void }`
  - `RoomSignalingContext` keeps `broadcast`, `useSignal`, `connected` with unchanged signatures — no component changes

- [ ] **Step 1: Write the failing test**

Create `src/services/signaling/channel.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openTransport } from './channel';
import { setAccessToken } from '@/services/api/client';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  readyState = 0;
  sent: string[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  simulateOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

describe('openTransport', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubEnv('NEXT_PUBLIC_WS_URL', 'ws://api.test/ws');
    setAccessToken('jwt-token-value');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('connects with the meeting id and the stored token', () => {
    openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus: vi.fn() });

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toBe(
      'ws://api.test/ws?meetingId=MT-2569-007&token=jwt-token-value'
    );
  });

  it('reports connected only after the socket opens', () => {
    const onStatus = vi.fn();
    openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus });

    expect(onStatus).toHaveBeenLastCalledWith(false);
    FakeWebSocket.instances[0].simulateOpen();
    expect(onStatus).toHaveBeenLastCalledWith(true);
  });

  it('queues sends made before the socket is open, then flushes them', () => {
    const transport = openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus: vi.fn() });

    transport.send('hand_raise', { raised: true });
    expect(FakeWebSocket.instances[0].sent).toHaveLength(0);

    FakeWebSocket.instances[0].simulateOpen();
    expect(FakeWebSocket.instances[0].sent).toHaveLength(1);
    expect(JSON.parse(FakeWebSocket.instances[0].sent[0])).toEqual({
      type: 'hand_raise',
      payload: { raised: true },
    });
  });

  it('forwards parsed messages to onMessage', () => {
    const onMessage = vi.fn();
    openTransport('MT-2569-007', { onMessage, onStatus: vi.fn() });
    FakeWebSocket.instances[0].simulateOpen();

    FakeWebSocket.instances[0].simulateMessage({
      type: 'hand_state',
      senderId: 'U-003',
      senderName: 'มาลี',
      timestamp: 1,
      payload: { raised: [] },
    });

    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'hand_state', senderId: 'U-003' })
    );
  });

  it('ignores malformed messages instead of throwing', () => {
    const onMessage = vi.fn();
    openTransport('MT-2569-007', { onMessage, onStatus: vi.fn() });
    FakeWebSocket.instances[0].simulateOpen();

    FakeWebSocket.instances[0].onmessage?.({ data: 'not json' });
    FakeWebSocket.instances[0].simulateMessage({ nope: true });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('reconnects with backoff after an unexpected close', () => {
    const onStatus = vi.fn();
    openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus });
    FakeWebSocket.instances[0].simulateOpen();

    FakeWebSocket.instances[0].close();
    expect(onStatus).toHaveBeenLastCalledWith(false);
    expect(FakeWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('does not reconnect after an explicit close()', () => {
    const transport = openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus: vi.fn() });
    FakeWebSocket.instances[0].simulateOpen();

    transport.close();
    vi.advanceTimersByTime(10_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/services/signaling/channel.test.ts`
Expected: FAIL with "openTransport is not exported".

- [ ] **Step 3: Extend the signal types and rewrite the transport**

Replace `src/services/signaling/types.ts`:

```typescript
// src/services/signaling/types.ts
//
// สัญญาณแบ่งเป็นสองทาง:
//   client → server: hand_raise, hand_lower, vote_create, vote_cast, vote_close,
//                    subtitle_text, doc_share, doc_share_page, doc_share_stop
//   server → client: room_joined, signal_error, vote_state, hand_state,
//                    doc_share_state, subtitle_text
// server เป็นคนตัดสินสถานะจริงเสมอ — client ส่ง "เจตนา" ไป ไม่ได้ส่ง "ผลลัพธ์"

export type SignalType =
  | "hand_raise"
  | "hand_lower"
  | "vote_create"
  | "vote_cast"
  | "vote_close"
  | "subtitle_text"
  | "doc_share"
  | "doc_share_page"
  | "doc_share_stop"
  | "room_joined"
  | "signal_error"
  | "vote_state"
  | "hand_state"
  | "doc_share_state";

export type VoteOptionDto = { id: string; label: string };
export type VoteRecordDto = { userId: string; userName: string; optionId: string; timestamp: number };
export type VoteTopicDto = {
  id: string;
  meetingId: string;
  title: string;
  description?: string;
  options: VoteOptionDto[];
  createdBy: string;
  createdByName: string;
  createdAt: number;
  status: "open" | "closed";
  votes: VoteRecordDto[];
};
export type RaisedHandDto = { userId: string; userName: string; raisedAt: number };
export type DocShareDto = {
  fileId: string;
  fileName: string;
  page: number;
  sharedBy: string;
  sharedName: string;
};

export type RoomSignal<T extends SignalType = SignalType> = {
  type: T;
  senderId: string;
  senderName: string;
  timestamp: number;
  payload: SignalPayloadMap[T];
};

export interface SignalPayloadMap {
  hand_raise: { raised: boolean };
  hand_lower: { targetUserId: string };
  vote_create: { title: string; description?: string; options: VoteOptionDto[] };
  vote_cast: { topicId: string; optionId: string };
  vote_close: { topicId: string };
  subtitle_text: { text: string; isFinal: boolean; lang: string; startSec?: number };
  doc_share: { fileId: string; fileName: string };
  doc_share_page: { fileId: string; page: number };
  doc_share_stop: Record<string, never>;
  room_joined: { userId: string; userName: string; meetingId: string };
  signal_error: { reason: string };
  vote_state: { topic: VoteTopicDto };
  hand_state: { raised: RaisedHandDto[] };
  doc_share_state: { share: DocShareDto | null };
}
```

Replace `src/services/signaling/channel.ts`:

```typescript
// src/services/signaling/channel.ts
//
// เดิมใช้ BroadcastChannel ซึ่งคุยได้แค่ระหว่างแท็บของเบราว์เซอร์เดียวกันบนเครื่องเดียวกัน
// ตอนนี้ต่อ WebSocket ไปที่ backend จริง — sync ข้ามเครื่องได้
// token แนบไปกับ query string เพราะ WebSocket ฝั่งเบราว์เซอร์ตั้ง header เองไม่ได้

import type { RoomSignal, SignalType } from "./types";
import { getAccessToken } from "@/services/api/client";

export type RoomTransport = {
  send: (type: SignalType, payload: unknown) => void;
  close: () => void;
};

export type TransportHandlers = {
  onMessage: (signal: RoomSignal) => void;
  onStatus: (connected: boolean) => void;
};

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export function wsBaseUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";
}

export function isRoomSignal(data: unknown): data is RoomSignal {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    "senderId" in data &&
    "timestamp" in data &&
    "payload" in data
  );
}

export function openTransport(meetingId: string, handlers: TransportHandlers): RoomTransport {
  let socket: WebSocket | null = null;
  let closedByCaller = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const queue: string[] = [];

  const flush = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    while (queue.length > 0) socket.send(queue.shift()!);
  };

  const connect = () => {
    const token = getAccessToken();
    if (!token) {
      handlers.onStatus(false);
      return;
    }

    const url = `${wsBaseUrl()}?meetingId=${encodeURIComponent(meetingId)}&token=${encodeURIComponent(token)}`;
    socket = new WebSocket(url);
    handlers.onStatus(false);

    socket.onopen = () => {
      attempt = 0;
      handlers.onStatus(true);
      flush();
    };

    socket.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof event.data === "string" ? event.data : "");
      } catch {
        return;
      }
      if (!isRoomSignal(parsed)) return;
      handlers.onMessage(parsed);
    };

    socket.onclose = () => {
      handlers.onStatus(false);
      if (closedByCaller) return;
      attempt += 1;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS);
      reconnectTimer = setTimeout(connect, delay);
    };

    socket.onerror = () => {
      // onclose จะตามมาเสมอ ปล่อยให้ตรงนั้นจัดการ reconnect ที่เดียว
    };
  };

  connect();

  return {
    send(type, payload) {
      const body = JSON.stringify({ type, payload });
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(body);
      else queue.push(body);
    },
    close() {
      closedByCaller = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    },
  };
}
```

Replace the body of `RoomSignalingProvider` in `src/context/RoomSignalingContext.tsx` (imports and the `Ctx` type stay as they are, except the channel import):

```typescript
import { openTransport, type RoomTransport } from "@/services/signaling/channel";

export function RoomSignalingProvider({ meetingId, children }: { meetingId: string; children: ReactNode }) {
  const transportRef = useRef<RoomTransport | null>(null);
  const listenersRef = useRef<Map<SignalType, Set<Listener>>>(new Map());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const transport = openTransport(meetingId, {
      onMessage: (signal) => {
        const set = listenersRef.current.get(signal.type);
        set?.forEach((fn) => fn(signal));
      },
      onStatus: setConnected,
    });
    transportRef.current = transport;

    return () => {
      transport.close();
      transportRef.current = null;
      setConnected(false);
    };
  }, [meetingId]);

  // senderId/senderName ไม่ส่งไปแล้ว — server เติมจาก JWT เอง client ปลอมตัวไม่ได้
  const broadcast = useCallback<Ctx["broadcast"]>((partial) => {
    transportRef.current?.send(partial.type, partial.payload);
  }, []);

  const useSignal = useCallback<Ctx["useSignal"]>((type, handler) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      let set = listenersRef.current.get(type);
      if (!set) {
        set = new Set();
        listenersRef.current.set(type, set);
      }
      const wrapped: Listener = (signal) => handler(signal as RoomSignal<typeof type>);
      set.add(wrapped);
      return () => {
        set!.delete(wrapped);
      };
    }, [type, handler]);
  }, []);

  return (
    <RoomSignalingContext.Provider value={{ broadcast, useSignal, connected }}>
      {children}
    </RoomSignalingContext.Provider>
  );
}
```

Delete the now-unused `useCurrentUser` import from that file.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/services/signaling/channel.test.ts`
Expected: PASS, 7 tests.

Then run: `npx tsc --noEmit`
Expected: errors in `VotePanel.tsx` and `live/[id]/page.tsx` where `vote_create` payloads changed shape. That is expected and Task 10 fixes them — do not commit until Step 5 passes.

- [ ] **Step 5: Commit**

Fix only the type errors that block compilation by leaving the call sites alone; they are rewritten in Task 10. If `tsc` still fails, complete Task 10 before committing both together. Otherwise:

```bash
git add src/services/signaling/ src/context/RoomSignalingContext.tsx
git commit -m "feat(realtime): replace BroadcastChannel with an authenticated WebSocket transport"
```

---

## Phase 3 — Feature stores on the server

### Task 10: Voting on the server

**Files:**
- Modify: `src/services/voting/types.ts`, `src/services/voting/store.ts`, `src/components/meeting/VotePanel.tsx`
- Test: `src/services/voting/store.test.ts`

**Interfaces:**
- Consumes: `apiFetch` from Task 5; `GET /api/rooms/:meetingId/state` from Task 8; `vote_state` signal from Task 7
- Produces: `listTopics(meetingId): Promise<VoteTopic[]>` reads the server snapshot; `saveTopic`, `castVote`, `closeTopic` are removed — writes go through `broadcast()` and the server answers with `vote_state`

- [ ] **Step 1: Write the failing test**

Create `src/services/voting/store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { listTopics } from './store';
import { setAccessToken } from '@/services/api/client';

describe('voting store', () => {
  beforeEach(() => {
    setAccessToken('jwt-token-value');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://api.test');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('reads topics from the room snapshot endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          voteTopics: [
            {
              id: 'vote-1',
              meetingId: 'MT-2569-007',
              title: 'มติที่ 1',
              options: [{ id: 'opt-1', label: 'เห็นด้วย' }],
              createdBy: 'U-999',
              createdByName: 'IT Admin',
              createdAt: 1,
              status: 'open',
              votes: [],
            },
          ],
          raisedHands: [],
          transcript: [],
          docShare: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const topics = await listTopics('MT-2569-007');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/rooms/MT-2569-007/state',
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    expect(topics).toHaveLength(1);
    expect(topics[0].title).toBe('มติที่ 1');
  });

  it('returns an empty list when the request fails, so the room still renders', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    await expect(listTopics('MT-2569-007')).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/services/voting/store.test.ts`
Expected: FAIL — the current `listTopics` reads IndexedDB and never calls `fetch`.

- [ ] **Step 3: Rewrite the store, types, and panel**

Replace `src/services/voting/types.ts` with a re-export so there is one definition of the vote shape:

```typescript
// src/services/voting/types.ts
//
// รูปร่างของข้อมูลโหวตมาจาก server แล้ว — นิยามไว้ที่ signaling/types.ts จุดเดียว
// ไฟล์นี้เหลือไว้เพื่อไม่ให้ import เดิมของคอมโพเนนต์พัง

export type {
  VoteOptionDto as VoteOption,
  VoteRecordDto as VoteRecord,
  VoteTopicDto as VoteTopic,
} from "@/services/signaling/types";
```

Replace `src/services/voting/store.ts`:

```typescript
// src/services/voting/store.ts
//
// เดิมเก็บโหวตใน IndexedDB ของแต่ละเครื่อง — เครื่องอื่นจึงไม่มีทางเห็นผลโหวตของกัน
// ตอนนี้ server เป็นเจ้าของข้อมูล: อ่านผ่าน snapshot, เขียนผ่าน WebSocket
// (การเขียนไม่ได้อยู่ในไฟล์นี้แล้ว — VotePanel เรียก broadcast() ตรงๆ)

import { apiFetch } from "@/services/api/client";
import type { VoteTopic } from "./types";

type RoomStateResponse = { voteTopics: VoteTopic[] };

export async function listTopics(meetingId: string): Promise<VoteTopic[]> {
  try {
    const state = await apiFetch<RoomStateResponse>(`/api/rooms/${encodeURIComponent(meetingId)}/state`);
    return state.voteTopics ?? [];
  } catch {
    // ห้องต้องเปิดได้แม้ backend ล่ม — ผู้ใช้จะเห็นรายการว่างแทนที่จะเจอหน้าพัง
    return [];
  }
}
```

Rewrite `src/components/meeting/VotePanel.tsx`. The props are unchanged, so `live/[id]/page.tsx:1036` still compiles; what changes is that every write is a `broadcast` and every update arrives as a `vote_state` signal:

```typescript
// src/components/meeting/VotePanel.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { VoteCreateDialog } from "./VoteCreateDialog";
import { VoteTopicCard } from "./VoteTopicCard";
import { VoteResultsDialog } from "./VoteResultsDialog";
import { useRoomSignaling } from "@/context/RoomSignalingContext";
import { useCurrentUser } from "@/context/UserContext";
import { listTopics } from "@/services/voting/store";
import type { VoteTopic } from "@/services/voting/types";

// server เป็นเจ้าของสถานะโหวต: กดโหวตแล้วส่งเจตนาไป แล้วรอ vote_state กลับมาทับของเดิม
// ไม่มีการอัปเดตแบบ optimistic เพราะ server อาจปฏิเสธ (หัวข้อปิดแล้ว/ไม่มีสิทธิ์)
export function VotePanel({
  meetingId,
  canManage,
  voteRefreshToken,
}: {
  meetingId: string;
  canManage: boolean;
  voteRefreshToken: number;
}) {
  const { currentUser } = useCurrentUser();
  const { broadcast, useSignal } = useRoomSignaling();
  const [topics, setTopics] = useState<VoteTopic[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [resultsTopic, setResultsTopic] = useState<VoteTopic | null>(null);

  useEffect(() => {
    listTopics(meetingId).then(setTopics);
  }, [meetingId, voteRefreshToken]);

  const applyTopic = useCallback((incoming: VoteTopic) => {
    setTopics((prev) => {
      const exists = prev.some((t) => t.id === incoming.id);
      return exists ? prev.map((t) => (t.id === incoming.id ? incoming : t)) : [...prev, incoming];
    });
  }, []);

  useSignal(
    "vote_state",
    useCallback((signal) => applyTopic(signal.payload.topic), [applyTopic])
  );

  const handleCreate = (draft: Pick<VoteTopic, "title" | "description" | "options">) => {
    broadcast({
      type: "vote_create",
      payload: {
        title: draft.title,
        ...(draft.description ? { description: draft.description } : {}),
        options: draft.options,
      },
    });
    setCreateOpen(false);
  };

  const handleVote = (topicId: string, optionId: string) => {
    broadcast({ type: "vote_cast", payload: { topicId, optionId } });
  };

  const handleClose = (topicId: string) => {
    broadcast({ type: "vote_close", payload: { topicId } });
  };

  return (
    <div className="space-y-3">
      {canManage && (
        <Button size="sm" className="w-full" onClick={() => setCreateOpen(true)}>
          + สร้างโหวต
        </Button>
      )}
      {topics.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">ยังไม่มีโหวตในการประชุมนี้</p>
      )}
      {topics
        .slice()
        .reverse()
        .map((topic) => (
          <VoteTopicCard
            key={topic.id}
            topic={topic}
            currentUserId={currentUser.id}
            canManage={canManage || topic.createdBy === currentUser.id}
            onVote={(optionId) => handleVote(topic.id, optionId)}
            onClose={() => handleClose(topic.id)}
            onViewResults={() => setResultsTopic(topic)}
          />
        ))}
      <VoteCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      <VoteResultsDialog topic={resultsTopic} onOpenChange={(open) => !open && setResultsTopic(null)} />
    </div>
  );
}
```

`VoteCreateDialog` currently types `onCreate` as returning `Promise<void>`; change its prop type to `(draft: Pick<VoteTopic, "title" | "description" | "options">) => void` to match. Add a `signal_error` toast in `RoomSignalBridge` inside `src/app/(app)/live/[id]/page.tsx`, next to the existing `useSignal` calls:

```typescript
useSignal("signal_error", (signal) => {
  toast.error(signal.payload.reason);
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/services/voting/store.test.ts`
Expected: PASS, 2 tests.

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/services/voting/ src/components/meeting/VotePanel.tsx src/components/meeting/VoteCreateDialog.tsx "src/app/(app)/live/[id]/page.tsx"
git commit -m "feat(voting): server-owned vote state, one vote per user enforced in MySQL"
```

---

### Task 11: Hand raise, subtitle, and document sharing on the server

**Files:**
- Create: `src/services/rooms/snapshot.ts`
- Modify: `src/components/meeting/HandRaiseList.tsx`, `src/services/transcript/store.ts`, `src/app/(app)/live/[id]/page.tsx`
- Test: `src/services/rooms/snapshot.test.ts`

**Interfaces:**
- Consumes: `GET /api/rooms/:meetingId/state` from Task 8; `hand_state`, `doc_share_state`, `subtitle_text` signals from Task 7
- Produces: `type RoomSnapshot = { voteTopics: VoteTopicDto[]; raisedHands: RaisedHandDto[]; transcript: TranscriptSegment[]; docShare: DocShareDto | null }` and `fetchRoomSnapshot(meetingId): Promise<RoomSnapshot>` from `src/services/rooms/snapshot.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/rooms/snapshot.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchRoomSnapshot, EMPTY_SNAPSHOT } from './snapshot';
import { setAccessToken } from '@/services/api/client';

describe('fetchRoomSnapshot', () => {
  beforeEach(() => {
    setAccessToken('jwt-token-value');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://api.test');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns every section of the snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            voteTopics: [],
            raisedHands: [{ userId: 'U-003', userName: 'มาลี', raisedAt: 5 }],
            transcript: [{ speakerId: 'U-001', speakerName: 'สมชาย', startSec: 0, text: 'สวัสดี' }],
            docShare: { fileId: 'F-1', fileName: 'วาระ.pdf', page: 2, sharedBy: 'U-999', sharedName: 'admin' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    const snapshot = await fetchRoomSnapshot('MT-2569-007');

    expect(snapshot.raisedHands).toHaveLength(1);
    expect(snapshot.transcript[0].text).toBe('สวัสดี');
    expect(snapshot.docShare?.page).toBe(2);
  });

  it('falls back to an empty snapshot on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));

    await expect(fetchRoomSnapshot('MT-2569-007')).resolves.toEqual(EMPTY_SNAPSHOT);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/services/rooms/snapshot.test.ts`
Expected: FAIL with "Cannot find module './snapshot'".

- [ ] **Step 3: Write the snapshot service and rewire the three features**

Create `src/services/rooms/snapshot.ts`:

```typescript
// src/services/rooms/snapshot.ts
//
// คนที่เข้าห้องทีหลังต้องได้สถานะปัจจุบันทั้งก้อนก่อน แล้วค่อยฟังสัญญาณต่อ
// ไม่งั้นจะไม่เห็นโหวต/มือที่ยกอยู่/เอกสารที่แชร์ค้างไว้ก่อนหน้า

import { apiFetch } from "@/services/api/client";
import type { VoteTopicDto, RaisedHandDto, DocShareDto } from "@/services/signaling/types";
import type { TranscriptSegment } from "@/services/transcript/store";

export type RoomSnapshot = {
  voteTopics: VoteTopicDto[];
  raisedHands: RaisedHandDto[];
  transcript: TranscriptSegment[];
  docShare: DocShareDto | null;
};

export const EMPTY_SNAPSHOT: RoomSnapshot = {
  voteTopics: [],
  raisedHands: [],
  transcript: [],
  docShare: null,
};

export async function fetchRoomSnapshot(meetingId: string): Promise<RoomSnapshot> {
  try {
    const state = await apiFetch<RoomSnapshot>(`/api/rooms/${encodeURIComponent(meetingId)}/state`);
    return {
      voteTopics: state.voteTopics ?? [],
      raisedHands: state.raisedHands ?? [],
      transcript: state.transcript ?? [],
      docShare: state.docShare ?? null,
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}
```

Replace `src/services/transcript/store.ts` — the segment type stays, the storage moves:

```typescript
// src/services/transcript/store.ts
//
// เดิมแต่ละเครื่องบันทึก transcript สำเนาของตัวเองลง IndexedDB จึงได้ไม่ครบ
// ตอนนี้ server บันทึกให้ตอนได้รับ subtitle_text ที่ isFinal — ฝั่ง client อ่านอย่างเดียว

import { apiFetch } from "@/services/api/client";

export type TranscriptSegment = {
  speakerId: string;
  speakerName: string;
  startSec: number;
  text: string;
};

type RoomStateResponse = { transcript: TranscriptSegment[] };

export async function getTranscript(meetingId: string): Promise<TranscriptSegment[]> {
  try {
    const state = await apiFetch<RoomStateResponse>(`/api/rooms/${encodeURIComponent(meetingId)}/state`);
    return state.transcript ?? [];
  } catch {
    return [];
  }
}
```

`appendSegment` is removed, and it has exactly two callers plus its import, all in `src/app/(app)/live/[id]/page.tsx`: the import on line 24, the call on line 103 (inside the `subtitle_text` signal handler in `RoomSignalBridge`), and the call on line 514 (where the local speech recogniser finalises a phrase). Delete all three.

Line 103's call disappears entirely — the server now writes the segment when it receives the signal, so a listener writing its own copy would double-store it. Line 514 keeps the `broadcast({ type: "subtitle_text", ... })` beside it and gains `startSec` in the payload so the server stores the right offset:

```typescript
broadcast({
  type: "subtitle_text",
  payload: { text, isFinal: true, lang: "th-TH", startSec: elapsedSeconds },
});
```

Use whatever elapsed-seconds value line 514 already passes to `appendSegment` as `startSec`.

`src/components/meeting/HandRaiseList.tsx` is presentational — it takes `{ raised, isHost, onLower }` and holds no state of its own — so it does not change at all. Its `RaisedHand` type is structurally identical to `RaisedHandDto`, so the new payload drops straight into the existing `raised` prop.

All the hand-raise wiring changes live in `src/app/(app)/live/[id]/page.tsx`. In `RoomSignalBridge`, replace the existing `hand_raise` / `hand_lower` handlers with the single authoritative one:

```typescript
useSignal("hand_state", (signal) => {
  setRaisedHands(signal.payload.raised);
});
```

and change the two call sites that raise or lower a hand to send intent only — the server answers with `hand_state`:

```typescript
const toggleMyHand = (next: boolean) => broadcast({ type: "hand_raise", payload: { raised: next } });
const lowerOther = (targetUserId: string) => broadcast({ type: "hand_lower", payload: { targetUserId } });
```

Pass `lowerOther` as `HandRaiseList`'s `onLower` prop and `raisedHands` as its `raised` prop.

Still in `src/app/(app)/live/[id]/page.tsx`, fetch the snapshot once when the room mounts and seed hand + doc-share state from it:

```typescript
const [raisedHands, setRaisedHands] = useState<RaisedHandDto[]>([]);

useEffect(() => {
  let cancelled = false;
  fetchRoomSnapshot(meeting.id).then((snapshot) => {
    if (cancelled) return;
    setRaisedHands(snapshot.raisedHands);
    setSharedFileId(snapshot.docShare?.fileId ?? null);
    setVoteRefreshToken((n) => n + 1);
  });
  return () => {
    cancelled = true;
  };
}, [meeting.id]);
```

Replace the three doc-share `useSignal` handlers in `RoomSignalBridge` with the single authoritative one:

```typescript
useSignal("doc_share_state", (signal) => {
  const share = signal.payload.share;
  setSharedFileId(share?.fileId ?? null);
  setSharedPage(share?.page ?? 1);
  if (share && signal.senderId !== currentUserId) {
    toast.info(`${share.sharedName} กำลังแชร์เอกสาร: ${share.fileName}`);
  }
});
```

Delete the now-dead `useSignal("doc_share", ...)`, `useSignal("doc_share_page", ...)`, and `useSignal("doc_share_stop", ...)` handlers, and delete the `vote_create` / `vote_cast` / `vote_close` handlers — `VotePanel` listens to `vote_state` itself now. Keep the `signal_error` toast added in Task 10.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all suites (session, channel, voting store, snapshot).

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/services/rooms/ src/services/transcript/store.ts src/components/meeting/HandRaiseList.tsx "src/app/(app)/live/[id]/page.tsx"
git commit -m "feat(realtime): hand raise, transcript, and doc sharing read server state"
```

---

### Task 12: Two-device verification

**Files:**
- Create: `docs/superpowers/plans/2026-08-17-cross-device-test-script.md`
- Test: manual — this task has no automated test because it verifies behaviour across two physical browsers, which the unit suites cannot reach

**Interfaces:**
- Consumes: everything from Tasks 1–11
- Produces: a written, repeatable acceptance script and a recorded result

- [ ] **Step 1: Start the full stack**

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS emeeting_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
cd backend && npm run migrate && SEED_PASSWORD='Meeting@2569' npm run seed && npm run dev
```

In a second terminal:

```bash
npm run dev
```

- [ ] **Step 2: Write the acceptance script**

Create `docs/superpowers/plans/2026-08-17-cross-device-test-script.md` with this content:

```markdown
# Cross-Device Acceptance Script

Run on two different machines, or one machine plus a phone on the same network.
Machine A logs in as `malee.r@e-office.cloud`, machine B as `somchai.j@e-office.cloud`.
Password for both: the value passed as `SEED_PASSWORD`.

| # | Action on A | Expected on B | Pass |
|---|---|---|---|
| 1 | Log in | — | ☐ |
| 2 | Open `/live/MT-2569-007` | — | ☐ |
| 3 | Create a vote "รับรองวาระที่ 1" with 2 options | Vote card appears within 2s without reloading | ☐ |
| 4 | — | Vote "เห็นด้วย" on B | Count on A becomes 1 (100%) | ☐ |
| 5 | — | Vote "ไม่เห็นด้วย" on B | A still shows exactly 1 vote, now on the second option | ☐ |
| 6 | Close the vote | Option buttons on B become disabled | ☐ |
| 7 | — | Try to vote on B after closing | Thai error toast, no count change on A | ☐ |
| 8 | — | Raise hand on B | B appears in A's hand-raise list | ☐ |
| 9 | Lower B's hand from A | Hand clears on B | ☐ |
| 10 | Share a document | B follows to the same file and page | ☐ |
| 11 | Reload B's browser | B still sees the vote, the raised hands, and the shared document | ☐ |
| 12 | Stop the backend, then restart it | B reconnects on its own within 15s and stays in sync | ☐ |
| 13 | Open DevTools on B and edit the WebSocket payload to send `senderId: "U-999"` | Vote is still recorded as B's own user | ☐ |

Record the date, the two browsers used, and any row that failed.
```

- [ ] **Step 3: Run the script and record the result**

Work through all 13 rows. For each failure, open a bug note in the same file under a `## Findings` heading with the row number, what happened, and the file you suspect.

- [ ] **Step 4: Fix anything the script found**

Any failed row is a defect in Tasks 6–11. Fix it in the task's own files, add a regression test at the level where it broke (backend handler test or frontend transport test), and re-run the row.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-08-17-cross-device-test-script.md
git commit -m "docs: cross-device acceptance script with results"
```

---

## Phase 4 — Deploy and documentation

### Task 13: Deploy the backend and point the frontend at it

**Files:**
- Modify: `backend/.env.example`, `backend/README.md`, `.env.example`
- Create: `backend/Dockerfile`
- Test: manual smoke test against the deployed URL

**Interfaces:**
- Consumes: the whole backend
- Produces: a reachable `https://<host>/health` and `wss://<host>/ws`, with `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_WS_URL` set in Vercel

Vercel cannot host this backend — its serverless functions cannot hold a WebSocket connection open. Deploy the backend to a host that runs a long-lived process (Railway, Render, or an organisation VM). The frontend stays on Vercel.

- [ ] **Step 1: Write the Dockerfile**

Create `backend/Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm install --save-dev typescript@^5.2.2 && npx tsc && \
    node -e "require('fs').copyFileSync('src/database/schema.sql','dist/database/schema.sql')"

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/server.js"]
```

Note: the build copies the repo root's `src/data/index.ts` through the `tsconfig.json` `include` added in Task 2, so build the image from the repository root with `-f backend/Dockerfile`.

- [ ] **Step 2: Document the required environment variables**

Replace the contents of `backend/.env.example`:

```
# Server
PORT=3001
NODE_ENV=production

# ต้องระบุทุกโดเมนที่หน้าเว็บถูกเสิร์ฟ คั่นด้วย comma — ทั้ง REST และ WebSocket ใช้ค่านี้
CORS_ORIGIN=https://meeting-system-features-40fa4d.vercel.app,http://localhost:3000

# MySQL
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=emeeting_db

# ต้องเป็นค่าสุ่มยาวอย่างน้อย 32 ตัวอักษร ห้ามใช้ค่าเดียวกับ dev
JWT_SECRET=

# ใช้ครั้งเดียวตอนรัน npm run seed — ห้ามเก็บไว้ใน production env
SEED_PASSWORD=

# Claude API สำหรับสรุปการประชุม
ANTHROPIC_API_KEY=
```

- [ ] **Step 3: Deploy and wire the frontend**

1. Provision MySQL 8 on the host and note the credentials.
2. Deploy the backend image. Set every variable above except `SEED_PASSWORD`.
3. Run `npm run migrate` once against the production database.
4. Run the seed once with `SEED_PASSWORD` set to a strong value, then unset it.
5. In the Vercel project, set `NEXT_PUBLIC_API_BASE_URL=https://<backend-host>` and `NEXT_PUBLIC_WS_URL=wss://<backend-host>/ws`, then redeploy.

Verify:

```bash
curl https://<backend-host>/health
```

Expected: `{"status":"ok","timestamp":"..."}`

- [ ] **Step 4: Smoke test in production**

Run rows 1–5 and row 11 of the cross-device script from Task 12 against the production URLs, on two machines. All must pass. If `wss://` fails while `https://` works, the host is not forwarding WebSocket upgrades — fix the host configuration, not the code.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile backend/.env.example backend/README.md .env.example
git commit -m "chore(deploy): containerise the realtime backend and document its environment"
```

---

### Task 14: Update the project documentation

**Files:**
- Modify: `PROJECT_STATUS.md`, `README.md`, `SECURITY_PLAN.md`
- Test: none — documentation task, verified by reading

**Interfaces:**
- Consumes: the delivered system
- Produces: documentation that no longer claims same-browser-only sync or absent authentication

- [ ] **Step 1: Correct every stale claim in `PROJECT_STATUS.md`**

These specific lines are now wrong and must change:

- Line 23: the warning that voting/hand raise/subtitle/doc-share "sync ได้แค่ระหว่างแท็บของเบราว์เซอร์เดียวกันบนเครื่องเดียวกันเท่านั้น" — replace with a statement that all four now sync across devices through the WebSocket backend, and that ZegoCloud is no longer the only cross-device path.
- Line 26: "Backend + API + Database (specification ทำสำเร็จ, ยังไม่ deploy จริง)" — move to the completed list with the deployed host.
- Line 29: "Server-side audit logging + signed URLs (Phase 2 security, ยังไม่ทำ)" — audit logging is still not done; leave it, but note that authentication and server-side authorisation now exist.
- Lines 420 and 448: "No authentication (password uncheckable)" and the demo-login note — replace with the real login and the seeded password policy.
- The "Next Steps" list at line 496: tick "Setup Backend Project".

- [ ] **Step 2: Correct `README.md`**

Find the section that explains the `BroadcastChannel` limitation and replace it with the two-service setup: Next.js on Vercel, realtime backend on its own host, plus the two `NEXT_PUBLIC_*` variables and the local `npm run migrate` / `npm run seed` steps.

- [ ] **Step 3: Update `SECURITY_PLAN.md`**

In the 4-layer table, Layer 1 gains real password authentication with bcrypt and server-side membership checks on both REST and WebSocket. Layer 3 stays "⏳" — signed URLs and audit logging are still outstanding — but add a line recording that one-vote-per-user is now enforced by a database primary key rather than by client code, and that `senderId` is taken from the JWT so a participant cannot act as someone else.

- [ ] **Step 4: Re-read all three documents against the code**

For each claim you wrote, point at the file that makes it true. Any claim you cannot pin to a file is a claim to delete.

- [ ] **Step 5: Commit**

```bash
git add PROJECT_STATUS.md README.md SECURITY_PLAN.md
git commit -m "docs: realtime state is server-owned and cross-device"
```

---

## Self-Review

**Spec coverage** — the four concerns raised in the discussion that produced this plan all have tasks:

| Requirement | Task |
|---|---|
| Transport that crosses machines | 6, 9 |
| Server-owned state instead of per-device IndexedDB | 1, 7, 8, 10, 11 |
| Real authentication before opening any API | 3, 4, 5 |
| Server-side one-vote-per-user enforcement | 1 (primary key), 7 (`castVote`) |
| Late-join and reconnect | 8 (snapshot), 9 (backoff), 11 (mount fetch) |
| Identity that cannot be spoofed from the client | 6 (JWT → `RoomClient`), 7 (`envelope` uses `client.userId`), verified by the handler test and script row 13 |
| Deployability given Vercel's WebSocket limitation | 13 |

**Known gaps this plan does not close** — call these out rather than let a reader assume otherwise:

- Meetings are still created and edited in frontend mock data; only their identity and participant list reach MySQL, via the Task 2 seed. Creating a meeting in the UI will not make it joinable from another device until meeting CRUD moves server-side. That is a separate plan.
- Document *contents* stay in IndexedDB. Doc sharing syncs which file and which page, so a document the other participant does not already hold locally will not render for them. Moving file storage to the server is a separate plan.
- Audit logging and signed URLs (`SECURITY_PLAN.md` Layer 3) remain unimplemented.
- Seeded accounts all share one password. Forced password change on first login is not in scope here.
