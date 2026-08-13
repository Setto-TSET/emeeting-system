> ⚠️ **DEPRECATED (2026-08-13):** สเปกนี้เขียนไว้ตอนแผนใช้ Webex เป็น video engine — ตอนนี้ระบบตัด Webex
> ออกทั้งหมดแล้ว และใช้ **ZegoCloud** แทนถาวร (ดู [PROJECT_STATUS.md](PROJECT_STATUS.md)) Video credential
> ไม่ต้องรอ backend แยกอีกต่อไป — มี Next.js API route ทำงานจริงแล้วที่ `src/app/api/video/token/route.ts`
> (ใช้ `src/lib/zegoToken.ts` เซ็น token04) ส่วน Transcription/Summarization ในเอกสารนี้ยังใช้อ้างอิงได้
> (แค่เปลี่ยนแหล่งเสียงจาก "Webex Transcript API" เป็น Web Speech API/mock ตามที่ implement จริงใน
> `src/services/speech/`, `src/services/transcript/`) เนื้อหาด้านล่างเก็บไว้เป็นบันทึกประวัติเท่านั้น
> ไม่ใช่แผนที่จะทำต่อ

# Backend Integration Spec — Webex + AI Summarization (เอกสารเก่า — ดูคำเตือนด้านบน)

> สำหรับ backend developer ที่จะต่อ Webex API และระบบสรุปประชุม

---

## 🎯 Overview

Frontend ตอนนี้เป็น mock เต็ม — backend ต้องเสียบ:
1. **Video Credential** — ออก guest token สำหรับ Webex embedded meeting
2. **Transcription** — ดึง transcript จาก Webex หรือจาก Azure STT
3. **Summarization** — สรุป transcript เป็นรายงานผ่าน LLM (Claude/Gemini)

---

## 1️⃣ Video Credential — Webex Guest Token

### Endpoint
```
POST /api/video/token
Content-Type: application/json
```

### Request
```json
{
  "engineId": "webex",
  "roomKey": "conf-room-abc123"
}
```

`roomKey` = `meeting.conferenceRoomKey` (สุ่มตอนสร้างประชุม ไม่ใช่ meeting.id)

### Response (200 OK)
```json
{
  "token": "eyJhbGc...<long JWT guest token>",
  "providerRoomId": "webex_space_id_xyz",
  "expiresAt": 1722694800000
}
```

### Implementation

#### 1. Setup (ครั้งแรก)
```bash
npm install @webex/meetings
# env vars จาก Webex Developer Portal:
WEBEX_CLIENT_ID=...
WEBEX_CLIENT_SECRET=...
WEBEX_OAUTH_URL=https://webexapis.com/v1/access_token
```

#### 2. Database Schema
```sql
-- Mapping ที่ frontend ส่ง roomKey เป็น Webex Space ID
CREATE TABLE webex_rooms (
  id INT PRIMARY KEY AUTO_INCREMENT,
  meeting_id VARCHAR(50) UNIQUE NOT NULL,
  room_key VARCHAR(100) UNIQUE NOT NULL,
  webex_space_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 3. Backend Logic (Node.js example)
```javascript
const webex = require('@webex/meetings');

app.post('/api/video/token', authenticateUser, async (req, res) => {
  const { engineId, roomKey } = req.body;

  if (engineId !== 'webex') {
    return res.status(400).json({ error: 'Only Webex supported' });
  }

  // Map roomKey to Webex Space
  let spaceId = await getWebexSpaceId(roomKey);
  if (!spaceId) {
    spaceId = await createWebexSpace(roomKey);
    await saveMapping(roomKey, spaceId);
  }

  // Request guest token จาก Webex
  const guestToken = await requestWebexGuestToken(spaceId, req.user.id);

  res.json({
    token: guestToken,
    providerRoomId: spaceId,
    expiresAt: Date.now() + 3600000 // 1 hour
  });
});

async function requestWebexGuestToken(spaceId, userId) {
  // ใช้ Guest Issuer API — ต้อง Webex License
  const response = await fetch('https://webexapis.com/v1/guest/tokens', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WEBEX_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      hostEmail: 'meeting@organization.webex.com',
      expiresIn: 3600,
      displayName: req.user.name
    })
  });
  return (await response.json()).token;
}
```

### Error Responses
```json
{
  "error": "space_not_found",
  "message": "ไม่พบห้อง Webex"
}
```
```json
{
  "error": "invalid_license",
  "message": "Webex license ไม่รองรับ Guest Issuer API"
}
```

---

## 2️⃣ Transcription — Webex Transcript API

### Endpoint
```
POST /api/transcription/request
Content-Type: application/json
```

### Request
```json
{
  "meetingId": "MT-2569-001"
}
```

### Response (200 OK)
```json
{
  "status": "processing",
  "estimatedTime": 120,
  "jobId": "transcript-job-xyz"
}
```

### Get Transcript Result
```
GET /api/transcription/result?meetingId=MT-2569-001
```

### Response (200 OK)
```json
{
  "meetingId": "MT-2569-001",
  "status": "ready",
  "language": "th",
  "segments": [
    {
      "speakerId": "U-001",
      "speakerName": "นาย สมชาย ใจดี",
      "startSec": 0,
      "endSec": 45,
      "text": "ขอเปิดการประชุมครั้งนี้..."
    },
    {
      "speakerId": "U-002",
      "speakerName": "นาย ประเสริฐ มั่นคง",
      "startSec": 50,
      "endSec": 95,
      "text": "ขอบคุณที่มาร่วมประชุม..."
    }
  ]
}
```

### Implementation (Webex Transcript API)

#### 1. Database Schema
```sql
CREATE TABLE transcriptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  meeting_id VARCHAR(50) UNIQUE NOT NULL,
  webex_recording_id VARCHAR(100),
  transcript_status ENUM('none', 'processing', 'ready', 'failed'),
  segments JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### 2. Request Transcription (ตอนประชุมจบ)
```javascript
app.post('/api/transcription/request', authenticateUser, async (req, res) => {
  const { meetingId } = req.body;
  
  // หา recording ID จาก Webex
  const recordingId = await getWebexRecordingId(meetingId);
  if (!recordingId) {
    return res.status(404).json({ error: 'No recording found' });
  }

  // สั่ง Webex ถอดเสียง
  const jobId = await requestWebexTranscript(recordingId);
  
  await db.query(
    'UPDATE transcriptions SET transcript_status = ? WHERE meeting_id = ?',
    ['processing', meetingId]
  );

  res.json({ status: 'processing', estimatedTime: 120, jobId });
});

async function requestWebexTranscript(recordingId) {
  // Webex Transcript API (ต้อง Webex License ที่มี recording transcription)
  const response = await fetch(`https://webexapis.com/v1/recordings/${recordingId}/transcript`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WEBEX_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  return (await response.json()).jobId;
}
```

#### 3. Polling Transcript Status
```javascript
// Worker/Cron job — poll ทุก 30 วิ
const pollTranscripts = async () => {
  const processing = await db.query(
    'SELECT meeting_id, webex_recording_id FROM transcriptions WHERE transcript_status = "processing"'
  );

  for (const row of processing) {
    const transcript = await getWebexTranscriptStatus(row.webex_recording_id);
    
    if (transcript.status === 'completed') {
      const segments = parseWebexTranscript(transcript.vtt);
      await db.query(
        'UPDATE transcriptions SET transcript_status = ?, segments = ? WHERE meeting_id = ?',
        ['ready', JSON.stringify(segments), row.meeting_id]
      );
    }
  }
};

// Run every 30s
setInterval(pollTranscripts, 30000);
```

#### 4. Parse Webex VTT → Segments
```javascript
function parseWebexTranscript(vttContent) {
  // Webex return VTT format (WebVTT subtitles)
  // Convert to our TranscriptSegment[] format
  const lines = vttContent.split('\n');
  const segments = [];
  let currentSpeaker = null;
  let currentText = '';
  let startTime = 0;

  for (const line of lines) {
    if (line.includes('-->')) {
      // "00:00:15.000 --> 00:00:45.000"
      const [start] = line.split('-->');
      startTime = timeToSeconds(start.trim());
    } else if (line.match(/^<v (.*?)>/)) {
      // "<v Speaker Name>text"
      const match = line.match(/^<v (.*?)>(.*)/);
      if (match) {
        currentSpeaker = match[1];
        currentText = match[2];
      }
    } else if (line.trim() && currentSpeaker) {
      currentText += ' ' + line.trim();
    } else if (!line.trim() && currentText) {
      segments.push({
        speakerId: `webex-${currentSpeaker}`,
        speakerName: currentSpeaker,
        startSec: startTime,
        endSec: startTime + 30, // estimate
        text: currentText.trim()
      });
      currentText = '';
    }
  }

  return segments;
}

function timeToSeconds(time) {
  const [h, m, s] = time.split(':');
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
}
```

### Error Responses
```json
{
  "error": "no_recording",
  "message": "ประชุมนี้ไม่มีการบันทึก"
}
```

---

## 3️⃣ Summarization — LLM Summarizer

### Endpoint
```
POST /api/summarize
Content-Type: application/json
```

### Request
```json
{
  "meetingId": "MT-2569-001",
  "transcript": [
    {
      "speakerId": "U-001",
      "speakerName": "นาย สมชาย ใจดี",
      "startSec": 0,
      "endSec": 45,
      "text": "..."
    }
  ],
  "agendas": [
    {
      "agendaId": "AG-1",
      "no": "1",
      "title": "รายงานผลการดำเนินงาน",
      "windows": [
        { "agendaId": "AG-1", "startSec": 0, "endSec": 300 }
      ]
    }
  ]
}
```

### Response (200 OK)
```json
{
  "meetingId": "MT-2569-001",
  "isDraft": true,
  "byAgenda": [
    {
      "agendaId": "AG-1",
      "discussion": "นำเสนอผลการดำเนินงาน...",
      "resolutions": [
        "ที่ประชุมมีมติเห็นชอบตามที่เสนอด้วยเอกฉันท์"
      ],
      "actionItems": [
        {
          "text": "จัดทำรายงานสรุปภายใน 15 วัน",
          "ownerName": "นาย สมชาย ใจดี"
        }
      ]
    }
  ],
  "overall": "สรุปผลการประชุม: วาระที่ 1..."
}
```

### Implementation (Claude API)

#### 1. Setup
```bash
npm install @anthropic-ai/sdk
# env:
CLAUDE_API_KEY=sk-ant-...
```

#### 2. Backend Logic
```javascript
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

app.post('/api/summarize', authenticateUser, async (req, res) => {
  const { meetingId, transcript, agendas } = req.body;

  const prompt = buildSummarizePrompt(transcript, agendas);

  const message = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  const summary = parseSummaryResponse(message.content[0].text, transcript, agendas);

  res.json(summary);
});

function buildSummarizePrompt(transcript, agendas) {
  const transcriptText = transcript
    .map(s => `[${formatTime(s.startSec)}] ${s.speakerName}: ${s.text}`)
    .join('\n');

  const agendasText = agendas
    .map(a => `- วาระที่ ${a.no}: ${a.title}`)
    .join('\n');

  return `
คุณเป็นผู้บันทึกประชุมมืออาชีพภาษาไทย

ให้สรุปการประชุมด้านล่างเป็นภาษาไทยอย่างเป็นทางการ

## ทำเนียบวาระการประชุม
${agendasText}

## Transcript
${transcriptText}

## คำขอ

สรุปตามรูปแบบ JSON นี้:
{
  "byAgenda": [
    {
      "agendaId": "AG-1",
      "discussion": "สรุปการอภิปรายสั้นๆ (2-3 ประโยค)",
      "resolutions": ["มติ 1", "มติ 2"],
      "actionItems": [
        {
          "text": "ข้อสั่งการ + ผู้รับผิดชอบ",
          "ownerName": "ชื่อคน"
        }
      ]
    }
  ],
  "overall": "สรุปภาพรวมการประชุม"
}

ข้อหลัก:
- ใช้ภาษาไทยอย่างเป็นทางการ
- Resolutions ต้องชัดเจนว่าค่อยจะบอกผล
- Action items ต้องระบุผู้รับผิดชอบและกำหนดเวลา
- ห้ามเดา — อ้างอิงจาก transcript จริง
`;
}

function parseSummaryResponse(aiText, transcript, agendas) {
  const json = JSON.parse(aiText);
  return {
    meetingId: transcript[0]?.meetingId,
    isDraft: true,
    byAgenda: json.byAgenda,
    overall: json.overall
  };
}
```

#### 3. Alternative: Webex AI Assistant
ถ้า Webex subscription มี AI Assistant included:
```javascript
const response = await fetch(`https://webexapis.com/v1/recordings/${recordingId}/summary`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${WEBEX_BOT_TOKEN}`
  }
});
const { summary } = await response.json();
// summary = { topics, actionItems, highlights }
```

---

## 🔐 Security Checklist

- [ ] API keys (`WEBEX_CLIENT_SECRET`, `CLAUDE_API_KEY`) เก็บใน `.env` ไม่ใช่ git
- [ ] Endpoint `/api/video/token` ต้อง authenticate user (JWT/session)
- [ ] Transcript ต้อง check permission: user ต้องเป็น organizer/participant ของ meeting นั้น
- [ ] Guest token มี expiry (1-3 ชั่วโมง) — ไม่ให้นั่งประชุมนานเกินไป
- [ ] Log ทุกครั้งที่ request token/transcript (audit trail)

---

## 🚀 Rollout Plan

### Phase 1: Local Testing (Week 1)
```bash
# 1. ขอ Webex developer account (free)
# 2. ตั้ง .env
WEBEX_CLIENT_ID=...
WEBEX_CLIENT_SECRET=...
CLAUDE_API_KEY=...

# 3. Test endpoint
curl -X POST http://localhost:3001/api/video/token \
  -H "Content-Type: application/json" \
  -d '{"engineId":"webex","roomKey":"test-room"}'
```

### Phase 2: Integration Testing (Week 2-3)
```
Frontend → Backend → Webex API (test)
Backend → Database (transcriptions table)
Backend → Claude API (summarization)
```

### Phase 3: Production (Week 4)
```
Upgrade: Webex free tier → paid license
Deploy backend to production
Wire frontend requests to production endpoint
```

---

## 📚 References

- [Webex Guest Issuer API](https://developer.webex.com/docs/guest-issuer)
- [Webex Transcript API](https://developer.webex.com/docs/recordings#get-recording-transcript)
- [Claude API Documentation](https://docs.anthropic.com)
- [Webex Browser SDK](https://github.com/webex/webex-sdk)

---

## ❓ Q&A

**Q: ทำไมต้องบันทึก roomKey ↔ spaceId mapping?**
A: Webex ต้องการ spaceId ตัวจริง แต่ frontend รู้แค่ roomKey (srand) — backend ต้องแลก

**Q: Transcript API มี free tier ไหม?**
A: ไม่ — ต้องซื้อ Webex meeting subscription ที่มี transcription feature

**Q: สรุปประชุมใช้ Webex AI หรือ Claude ดีกว่า?**
A: Webex AI = ฟรี (รวมใน license) แต่ exact format ไม่ชัด · Claude = ต้องจ่าย แต่ format ครบเครื่อง · ขึ้นกับ budget + requirement

**Q: Guest token expiry ตั้งเท่าไหร่?**
A: 1-3 ชั่วโมง (recommend 2 ชั่วโมง) — ให้คนเข้าประชุมได้นานพอ แต่ไม่ให้ token reuse บ่อย

