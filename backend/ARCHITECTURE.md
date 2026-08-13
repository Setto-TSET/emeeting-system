# Backend Architecture — e-Meeting System

> Video (ZegoCloud) ไม่ผ่าน backend นี้ — token ออกจาก Next.js API route โดยตรงที่
> `src/app/api/video/token/route.ts` (เซ็นด้วย `src/lib/zegoToken.ts`) backend/ นี้จึงเหลือ
> transcription + summarize เท่านั้น ยัง Planned, Not Started

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       Frontend (Next.js)                         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Meetings    │  │ Live Room    │  │ Summary Report         │ │
│  │ (UI for     │  │ (ZegoCloud + │  │ (Markdown viewer)      │ │
│  │ creating)   │  │  Documents)  │  │                        │ │
│  └──────┬──────┘  └──────┬───────┘  └────────┬───────────────┘ │
│         │                 │                   │                 │
│         │        (video token: Next.js        │                 │
│         │         API route, ไม่ผ่าน backend/) │                 │
│         └─────────────────┼───────────────────┘                 │
│                           │                                      │
│        ┌──────────────────▼──────────────────┐                 │
│        │   API Client (Frontend context)     │                 │
│        │  - POST /api/transcription/request  │                 │
│        │  - POST /api/summarize              │                 │
│        └──────────────────┬──────────────────┘                 │
└───────────────────────────┼──────────────────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │   HTTP/REST    │
                    │   (CORS)       │
                    └───────┬────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                Backend (Node.js + Express)                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Express Server                        │  │
│  │       ┌──────────────┐  ┌────────────────┐              │  │
│  │       │ /api/         │  │ /api/          │              │  │
│  │       │ transcription │  │ summarize      │              │  │
│  │       │ (STT TBD)     │  │ (Claude API)   │              │  │
│  │       └──────┬────────┘  └────────┬───────┘              │  │
│  │              │                   │                        │  │
│  │              └───────────────────┘                        │  │
│  │                          │                                │  │
│  │         ┌────────────────▼─────────────────┐             │  │
│  │         │   Middleware Layer               │             │  │
│  │         │  - Auth (JWT)                    │             │  │
│  │         │  - Error handling                │             │  │
│  │         │  - Async wrapper                 │             │  │
│  │         └────────────────┬─────────────────┘             │  │
│  └────────────────────────────┼─────────────────────────────┘  │
│                               │                                │
│  ┌────────────────────────────▼──────────────────────────┐   │
│  │            Service Layer                             │   │
│  │  ┌──────────────────┐  ┌─────────────────────────┐   │   │
│  │  │ STTService (TBD) │  │ ClaudeService           │   │   │
│  │  │ - requestSTT()   │  │ - summarizeTranscript() │   │   │
│  │  │ - pollStatus()   │  │ - parseResponse()       │   │   │
│  │  └──────────┬───────┘  └─────────────┬───────────┘   │   │
│  │             │                        │                │   │
│  └─────────────┼────────────────────────┼────────────────┘   │
│                │                        │                    │
└────────────────┼────────────────────────┼────────────────────┘
                 │                        │
        ┌────────▼────────┐      ┌────────▼─────────┐
        │  STT provider   │      │  Claude API      │
        │  (AssemblyAI/   │      │  - Summarize     │
        │   Azure — TBD)  │      │                  │
        └────────┬────────┘      └────────┬─────────┘
                 │                        │
        ┌────────▼────────────────────────▼───────┐
        │      External Services                  │
        │  - STT provider cloud (TBD)              │
        │  - Anthropic Cloud (api.anthropic.com)  │
        └─────────────────────────────────────────┘

        ┌──────────────────────────────────────────┐
        │          Database (MySQL)                │
        │       ┌──────────┐  ┌────────┐           │
        │       │transc-   │  │summ-   │           │
        │       │riptions  │  │aries   │           │
        │       └──────────┘  └────────┘           │
        └──────────────────────────────────────────┘
```

---

## Data Flow

### 1️⃣ Transcription Workflow

```
Frontend (Meeting ends)
   │
   ├─→ POST /api/transcription/request { meetingId }
   │
   ↓
Backend: transcriptionController.post()
   │
   ├─→ STTService.requestTranscript()
   │   ├─→ Find recording/audio source from meetingId
   │   └─→ Call STT provider API (AssemblyAI/Azure — TBD)
   │
   ├─→ Database: Update status = "processing"
   │
   └─→ Return { status: "processing", estimatedTime: 120 }
   │
   ↑
Frontend
   │
   └─→ Show "กำลังประมวลผล..."

───────────────── Meanwhile (Background Worker) ─────────────────

Worker (every 30 seconds)
   │
   ├─→ POST /api/transcription/poll
   │
   ├─→ Find all "processing" transcriptions
   │
   ├─→ STTService.getStatus()
   │
   ├─→ When done: parse response → TranscriptSegment[]
   │
   ├─→ Database: Save segments, update status = "ready"
   │
   └─→ Done

───────────────── Frontend ─────────────────

Frontend (checks status)
   │
   ├─→ GET /api/transcription/result { meetingId }
   │
   ↓
Backend
   │
   ├─→ Database: fetch segments
   │
   └─→ Return { status: "ready", segments: [...] }
   │
   ↑
Frontend
   │
   ├─→ Show "พร้อมสร้างรายงาน"
```

> **หมายเหตุ:** ตอนนี้ frontend ใช้ Web Speech API ฝั่ง client (`src/services/speech/webSpeechProvider.ts`)
> ถอดเสียงแบบ realtime ระหว่างประชุมอยู่แล้ว, บันทึกลง IndexedDB (`src/services/transcript/store.ts`)
> workflow ด้านบนคือแผนสำหรับ post-meeting transcript ที่แม่นยำกว่า ยังไม่ได้ implement จริง

### 2️⃣ Summarization Workflow

```
Frontend (User clicks "สร้างร่างรายงาน")
   │
   ├─→ POST /api/summarize { meetingId, transcript, agendas }
   │
   ↓
Backend: summarizeController.post()
   │
   ├─→ ClaudeService.summarizeTranscript()
   │   │
   │   ├─→ Build Claude prompt
   │   │   ├─→ Transcript text
   │   │   ├─→ Agenda titles
   │   │   └─→ System prompt (formal Thai)
   │   │
   │   ├─→ Call Claude API (streaming)
   │   │
   │   └─→ Parse JSON response
   │       ├─→ byAgenda[] { discussion, resolutions, actionItems }
   │       └─→ overall summary
   │
   ├─→ Database: Save summary
   │
   └─→ Return MeetingSummary { byAgenda, overall, isDraft: true }
   │
   ↑
Frontend
   │
   ├─→ buildReportMarkdown(summary)
   │
   ├─→ Save to IndexedDB
   │
   ├─→ addMeetingFile() → type: "report_draft"
   │
   └─→ Show "สร้างร่างรายงานสำเร็จ"
      │
      └─→ File appears in document list
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js 18+ | Server runtime |
| **Framework** | Express.js | REST API server |
| **Language** | TypeScript | Type safety |
| **Database** | MySQL 8.0+ | Data persistence |
| **ORM/Query** | mysql2 | Database queries |
| **External APIs** | STT provider (TBD), Claude | Integrations |
| **Auth** | JWT | API authentication |
| **Testing** | Jest | Unit tests |

Video (ZegoCloud) ไม่อยู่ในตารางนี้ — token generation ทำงานอยู่ใน Next.js API route แล้ว ไม่ต้องผ่าน backend Express นี้

---

## Scalability Considerations

### Current (Single Server)
- Suitable for: ~1000 concurrent users
- Limitation: No job queue, polling blocks

### Future (Production)
```
┌─────────────┐      ┌──────────────┐
│   Frontend  │──────│ Load Balancer│
└─────────────┘      └──────┬───────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
       ┌────▼───┐       ┌────▼───┐      ┌────▼───┐
       │Backend │       │Backend │      │Backend │
       │API #1  │       │API #2  │      │API #3  │
       └────┬───┘       └────┬───┘      └────┬───┘
            │                │                │
            └────────────────┼────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Shared Database│
                    │    (MySQL)      │
                    └─────────────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
       ┌────▼────┐      ┌────▼────┐    ┌────▼─────┐
       │ Job     │      │  Redis  │    │ Monitoring
       │ Queue   │      │  Cache  │    │
       │(Bull)   │      │         │    │
       └─────────┘      └─────────┘    └──────────┘

Workers (Background)
  └─→ Poll STT provider transcription status
  └─→ Process Claude summarization
```

---

## Security Architecture

```
┌─────────────────────────────────────────────────┐
│  HTTPS (TLS 1.3+)                              │
│  ├─ Certificate: Let's Encrypt                  │
│  └─ Force HTTPS redirect                        │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│  API Gateway (Kong/AWS API Gateway)             │
│  ├─ Rate limiting                               │
│  ├─ CORS validation                             │
│  ├─ Request/response logging                    │
│  └─ DDoS protection                             │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│  Express Middleware                             │
│  ├─ JWT validation                              │
│  ├─ Request validation                          │
│  ├─ XSS/CSRF protection                         │
│  └─ Rate limiter per user                       │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│  Route Handlers                                 │
│  ├─ Input sanitization                          │
│  ├─ Permission checks (authz)                   │
│  └─ Audit logging                               │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│  Services (STT provider, Claude, Database)      │
│  ├─ API key rotation                            │
│  ├─ Error handling                              │
│  └─ Retry logic with backoff                    │
└─────────────────────────────────────────────────┘
```

---

## Error Handling Strategy

```
┌─────────────────────────────────────┐
│  Client Request                     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Validate Input                     │
│  ├─ 400 Bad Request                 │
│  └─ 422 Unprocessable Entity        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Check Auth                         │
│  ├─ 401 Unauthorized                │
│  └─ 403 Forbidden                   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Execute Logic                      │
│  ├─ 500 Internal Server Error       │
│  ├─ Retry with exponential backoff  │
│  ├─ Log to error tracking (Sentry)  │
│  └─ Fallback response               │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Success Response (200, 201, etc)   │
└─────────────────────────────────────┘
```

---

## Monitoring & Observability

```
Application Logs
  └─→ Structured logging (JSON)
  └─→ Log aggregation (ELK, CloudWatch)
  └─→ Search & analyze

Metrics
  ├─→ API latency (p50, p95, p99)
  ├─→ Error rate per endpoint
  ├─→ Database connection pool
  ├─→ External API latencies (STT provider, Claude)
  └─→ Custom: transcription queue size

Tracing
  ├─→ Distributed tracing (Jaeger, Datadog)
  └─→ Trace requests across services

Alerts
  ├─→ High error rate (>1%)
  ├─→ API latency > 5s
  ├─→ Database connection pool exhausted
  ├─→ External API down
  └─→ Disk/memory usage critical
```

---

**Created: 2026-08-03**
**Updated: 2026-08-13 — ตัด Webex ออกทั้งหมด, video token ย้ายไป Next.js API route**
**Version: 1.1 (Planning)**
**Status: Ready for Implementation**
