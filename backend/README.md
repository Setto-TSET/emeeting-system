# e-Meeting Backend — Webex Integration

Backend server สำหรับระบบประชุมออนไลน์พร้อมการสรุปประชุมโดย AI

## 🏗️ Architecture

```
backend/
├── src/
│   ├── server.ts              # Entry point
│   ├── middleware/            # Auth, error handling
│   ├── routes/                # API endpoints
│   │   ├── video.ts           # POST /api/video/token
│   │   ├── transcription.ts   # POST /api/transcription/*
│   │   └── summarize.ts       # POST /api/summarize
│   ├── services/              # Business logic
│   │   ├── webex.ts           # Webex API wrapper
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
- **Webex**: WEBEX_CLIENT_ID, WEBEX_CLIENT_SECRET, WEBEX_BOT_TOKEN
- **Claude**: CLAUDE_API_KEY
- **Database**: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
- **Server**: PORT, JWT_SECRET, CORS_ORIGIN

---

## 📋 API Endpoints

### Video Token
```
POST /api/video/token
Content-Type: application/json

Body:
{
  "engineId": "webex",
  "roomKey": "conf-room-abc123"
}

Response:
{
  "token": "eyJhbGc...",
  "providerRoomId": "webex_space_xyz",
  "expiresAt": 1722694800000
}
```

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

### Video Token (Webex Guest Issuer)
- [ ] `src/services/webex.ts`: implement `getWebexGuestToken()`
- [ ] Map `roomKey` → `webex_space_id` ใน DB
- [ ] Handle token expiry + refresh
- [ ] Error handling for invalid/expired credentials

### Transcription (Webex Transcript API)
- [ ] `src/services/webex.ts`: implement `requestWebexTranscript()`
- [ ] Worker/Cron job: polling transcription status ทุก 30 วิ
- [ ] Parse Webex VTT format → `TranscriptSegment[]`
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
- [ ] Rate limiting สำหรับ `/api/token`
- [ ] CORS configuration สำหรับ frontend
- [ ] Audit logging ทุกการเข้าถึง sensitive endpoints

---

## 📊 Database Schema

### webex_rooms
```sql
meeting_id (PK, VARCHAR)
room_key (UNIQUE, VARCHAR)    -- สุ่มตอนสร้างประชุม
webex_space_id (VARCHAR)      -- map จาก Webex
created_at (TIMESTAMP)
```

### transcriptions
```sql
meeting_id (PK, VARCHAR)
webex_recording_id (VARCHAR)  -- บันทึกที่ Webex
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

# Request token
curl -X POST http://localhost:3001/api/video/token \
  -H "Content-Type: application/json" \
  -d '{"engineId":"webex","roomKey":"test-room"}'

# Request transcription
curl -X POST http://localhost:3001/api/transcription/request \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"MT-2569-001"}'
```

---

## 🔄 Workflows

### Meeting Workflow
1. Frontend: Create meeting
2. Backend: Generate `conferenceRoomKey` (srand)
3. Frontend: User joins meeting → request token
4. Backend: Issue Webex guest token
5. User enters Webex embedded room

### Transcription Workflow
1. Meeting ends → status = "waiting_endorse"
2. Frontend: User clicks "ขอ Transcript" → POST `/transcription/request`
3. Backend: Request Webex transcription API → status = "processing"
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
- **@webex/meetings**: Webex SDK (for future real implementation)
- **@anthropic-ai/sdk**: Claude API
- **axios**: HTTP client

### Development
- **typescript**: Type safety
- **ts-node**: Run TypeScript directly
- **jest**: Testing

---

## 🚨 Important Notes

### Security
- API keys จะต้อง rotate ทุก 3 เดือน
- Guest tokens มี expiry — ตั้ง 2 ชั่วโมง
- Transcription segments มี PII — ต้องเก็บให้ดี

### Performance
- Transcription ใช้ background worker ไม่ใช่ request-response
- Cache summaries ใน Redis (ถ้ามี)
- Batch polling transcriptions (ไม่เรียก API ทีละ meeting)

### Webex API Rate Limits
- Guest Issuer: ~100 requests/minute
- Transcript: ~50 requests/minute
- Recording: ~100 requests/minute

---

## 📞 Support

### Getting Help
- ดู `BACKEND_SPEC_WEBEX.md` สำหรับรายละเอียด API
- Check logs: `LOG_LEVEL=debug npm run dev`
- Test routes ด้วย `curl` หรือ Postman

### Common Issues

**Q: "WEBEX_BOT_TOKEN not configured"**
A: ต้องขอ Webex trial ก่อน แล้วเก็บ token ใน `.env`

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

**Happy coding! 🚀**
