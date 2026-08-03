# Backend Architecture — e-Meeting System

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       Frontend (Next.js)                         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Meetings    │  │ Live Room    │  │ Summary Report         │ │
│  │ (UI for     │  │ (Webex +     │  │ (Markdown viewer)      │ │
│  │ creating)   │  │  Documents)  │  │                        │ │
│  └──────┬──────┘  └──────┬───────┘  └────────┬───────────────┘ │
│         │                 │                   │                 │
│         └─────────────────┼───────────────────┘                 │
│                           │                                      │
│        ┌──────────────────▼──────────────────┐                 │
│        │   API Client (Frontend context)     │                 │
│        │  - requestVideoCredential()         │                 │
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
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │ /api/video  │  │ /api/         │  │ /api/          │  │  │
│  │  │ /token      │  │ transcription │  │ summarize      │  │  │
│  │  │ (Webex)     │  │ (Webex API)   │  │ (Claude API)   │  │  │
│  │  └──────┬──────┘  └──────┬────────┘  └────────┬───────┘  │  │
│  │         │                │                   │            │  │
│  │         └────────────────┼───────────────────┘            │  │
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
│  │  │ WebexService     │  │ ClaudeService           │   │   │
│  │  │ - getToken()     │  │ - summarizeTranscript() │   │   │
│  │  │ - pollStatus()   │  │ - parseResponse()       │   │   │
│  │  │ - parseVTT()     │  │                         │   │   │
│  │  └──────────┬───────┘  └─────────────┬───────────┘   │   │
│  │             │                        │                │   │
│  └─────────────┼────────────────────────┼────────────────┘   │
│                │                        │                    │
└────────────────┼────────────────────────┼────────────────────┘
                 │                        │
        ┌────────▼────────┐      ┌────────▼─────────┐
        │  Webex APIs     │      │  Claude API      │
        │  - Guest Token  │      │  - Summarize     │
        │  - Transcript   │      │                  │
        │  - Recording    │      │                  │
        └────────┬────────┘      └────────┬─────────┘
                 │                        │
        ┌────────▼────────────────────────▼───────┐
        │      External Services                  │
        │  - Webex Cloud (webexapis.com)          │
        │  - Anthropic Cloud (api.anthropic.com)  │
        └─────────────────────────────────────────┘

        ┌──────────────────────────────────────────┐
        │          Database (MySQL)                │
        │  ┌──────────┐  ┌──────────┐  ┌────────┐ │
        │  │webex_    │  │transc-   │  │summ-   │ │
        │  │rooms     │  │riptions  │  │aries   │ │
        │  └──────────┘  └──────────┘  └────────┘ │
        └──────────────────────────────────────────┘
```

---

## Data Flow

### 1️⃣ Get Video Token (Webex Embedded Meeting)

```
Frontend
   │
   ├─→ POST /api/video/token { engineId, roomKey }
   │
   ↓
Backend: videoController.post()
   │
   ├─→ WebexService.getWebexGuestToken()
   │   ├─→ Call Webex Guest Issuer API
   │   └─→ Return JWT token
   │
   ├─→ Database: Save roomKey ↔ spaceId mapping
   │
   └─→ Return { token, providerRoomId, expiresAt }
   │
   ↑
Frontend
   │
   ├─→ Mount WebexEmbedStage with token
   │
   ↓
Browser
   │
   └─→ Webex SDK joins meeting
```

### 2️⃣ Transcription Workflow

```
Frontend (Meeting ends)
   │
   ├─→ POST /api/transcription/request { meetingId }
   │
   ↓
Backend: transcriptionController.post()
   │
   ├─→ WebexService.requestWebexTranscript()
   │   ├─→ Find recording ID from meetingId
   │   └─→ Call Webex Transcript API
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
   ├─→ WebexService.getWebexTranscriptStatus()
   │
   ├─→ When done: parse VTT → TranscriptSegment[]
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

### 3️⃣ Summarization Workflow

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
| **External APIs** | Webex, Claude | Integrations |
| **Auth** | JWT | API authentication |
| **Testing** | Jest | Unit tests |

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
  └─→ Poll Webex transcription status
  └─→ Process Claude summarization
  └─→ Cleanup old tokens
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
│  Services (Webex, Claude, Database)            │
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
  ├─→ External API latencies (Webex, Claude)
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
**Version: 1.0 (Planning)**  
**Status: Ready for Implementation**
