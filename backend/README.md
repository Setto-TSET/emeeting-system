# e-Meeting Backend

Backend server สำหรับ transcription + AI summarization ของระบบประชุมออนไลน์

> Video (ZegoCloud) ไม่ผ่าน backend นี้ — token ออกจาก Next.js API route โดยตรงที่
> `src/app/api/video/token/route.ts` (ดู `src/lib/zegoToken.ts`) backend/ นี้จึงเหลือแค่
> transcription + summarize endpoints เท่านั้น (ยัง Planned, Not Started — mock ฝั่ง frontend ใช้แทนอยู่)

## 🏗️ Architecture

```
backend/
├── src/
│   ├── server.ts              # Entry point
│   ├── middleware/            # Auth, error handling
│   ├── routes/                # API endpoints
│   │   ├── transcription.ts   # POST /api/transcription/*
│   │   └── summarize.ts       # POST /api/summarize
│   ├── services/              # Business logic
│   │   └── claude.ts          # Claude API wrapper
│   └── database/              # DB connection + migrations
├── .env.example               # Environment template
├── package.json
└── tsconfig.json
```

---

## 🚀 Quick Start

### 1. Setup

```bash
# Copy environment file
cp .env.example .env

# Install dependencies
npm install

# Setup database
npm run migrate

# Start dev server
npm run dev
```

Server จะ run ที่ `http://localhost:3001`

### 2. Environment Variables

แก้ `.env` ด้วยค่าจริงจาก:
- **Claude**: CLAUDE_API_KEY
- **Database**: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
- **Server**: PORT, JWT_SECRET, CORS_ORIGIN
- **STT provider** (ถ้าเลือก AssemblyAI/Azure ในอนาคต): ตาม provider ที่เลือก

---

## 📋 API Endpoints

### Transcription Request
```
POST /api/transcription/request
Body: { "meetingId": "MT-2569-001" }
Response: { "status": "processing", "estimatedTime": 120 }
```

### Transcription Result
```
GET /api/transcription/result?meetingId=MT-2569-001
Response:
{
  "meetingId": "MT-2569-001",
  "status": "ready",
  "language": "th",
  "segments": [...]
}
```

### Summarization
```
POST /api/summarize
Body:
{
  "meetingId": "MT-2569-001",
  "transcript": [...],
  "agendas": [...]
}

Response:
{
  "meetingId": "MT-2569-001",
  "isDraft": true,
  "byAgenda": [...],
  "overall": "..."
}
```

---

## 🔧 Implementation Checklist

### Transcription (STT provider TBD)
- [ ] เลือก STT provider (AssemblyAI/Azure — ดูความแม่นยำเทียบ Web Speech API ที่ frontend ใช้อยู่)
- [ ] `src/services/<provider>.ts`: implement `requestTranscript()`
- [ ] Worker/Cron job: polling transcription status ทุก 30 วิ
- [ ] Store segments ใน DB
- [ ] Handle failed transcriptions

### Summarization (Claude API)
- [ ] `src/services/claude.ts`: implement `summarizeTranscript()`
- [ ] Test Claude prompt engineering
- [ ] Handle streaming responses (ถ้าต้อง long summaries)
- [ ] Cache summaries เพื่อไม่ให้เรียก API ซ้ำ

### Database
- [ ] Run migrations: `npm run migrate`
- [ ] Setup backup strategy
- [ ] Test connection pooling

### Security
- [ ] Implement `authMiddleware` ให้ครบ
- [ ] Validate API keys ไม่ให้ expose ใน logs
- [ ] Rate limiting
- [ ] CORS configuration สำหรับ frontend
- [ ] Audit logging ทุกการเข้าถึง sensitive endpoints

---

## 📊 Database Schema

### transcriptions
```sql
meeting_id (PK, VARCHAR)
transcript_status (ENUM)      -- none | processing | ready | failed
segments (JSON)               -- TranscriptSegment[]
updated_at (TIMESTAMP)
```

### summaries
```sql
meeting_id (PK, VARCHAR)
summary_json (JSON)           -- MeetingSummary
is_draft (BOOLEAN)
updated_at (TIMESTAMP)
```

---

## 🧪 Testing

### Test Endpoints Locally

```bash
# Health check
curl http://localhost:3001/health

# Request transcription
curl -X POST http://localhost:3001/api/transcription/request \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"MT-2569-001"}'
```

---

## 🔄 Workflows

### Transcription Workflow
1. Meeting ends → status = "waiting_endorse"
2. Frontend: User clicks "ขอ Transcript" → POST `/transcription/request`
3. Backend: Request transcript จาก STT provider → status = "processing"
4. Worker: Poll every 30s → when done, update segments
5. Frontend: Click "สร้างร่างรายงาน" → POST `/summarize`
6. Backend: Claude summarizes → return summary
7. Frontend: Save summary as file

---

## 📚 Dependencies

### Core
- **express**: Web server
- **mysql2**: Database
- **jsonwebtoken**: Authentication
- **cors**: Cross-origin

### Integrations
- **@anthropic-ai/sdk**: Claude API
- **axios**: HTTP client (สำหรับเรียก STT provider ที่เลือก)

### Development
- **typescript**: Type safety
- **ts-node**: Run TypeScript directly
- **jest**: Testing

---

## 🚨 Important Notes

### Security
- API keys จะต้อง rotate ทุก 3 เดือน
- Transcription segments มี PII — ต้องเก็บให้ดี

### Performance
- Transcription ใช้ background worker ไม่ใช่ request-response
- Cache summaries ใน Redis (ถ้ามี)
- Batch polling transcriptions (ไม่เรียก API ทีละ meeting)

---

## 📞 Support

### Getting Help
- Check logs: `LOG_LEVEL=debug npm run dev`
- Test routes ด้วย `curl` หรือ Postman

### Common Issues

**Q: Database connection failed**
A: Check DB_HOST, DB_USER, DB_PASSWORD ใน `.env` และตรวจ MySQL รันอยู่ไหม

**Q: Transcription stuck on "processing"**
A: Check worker/cron job เรียก `/api/transcription/poll` หรือยัง

---

## ✅ Deployment Checklist

- [ ] `.env` มี production values
- [ ] Database backups enabled
- [ ] Monitoring + alerting setup
- [ ] Log aggregation (ELK / CloudWatch)
- [ ] Rate limiting configured
- [ ] CORS whitelist production origins only
- [ ] SSL certificates installed
- [ ] API documentation deployed
- [ ] Health check endpoint monitored

---

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

---

**Happy coding! 🚀**
