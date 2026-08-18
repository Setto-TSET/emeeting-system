# ZegoCloud Real-Time ASR + AI Summarization — Design

**Date:** 2026-08-18
**Status:** Approved (design phase) — รอ implementation plan

## บริบท

ปัจจุบันระบบมี transcript แบบ live subtitle จาก Web Speech API (`src/services/speech/webSpeechProvider.ts` +
`src/services/transcript/store.ts`) และมี "post-meeting transcript + summarize" pipeline ที่เป็น contract
พร้อมแล้วแต่ implementation ยังเป็น mock ทั้งคู่:

- `src/services/transcription/mockProvider.ts` implements `TranscriptionProvider`
- `src/services/summarize/mockSummarizer.ts` implements `Summarizer`

`backend/` (Express, แยกต่างหาก) มีแผนไว้ให้ทำ transcription + summarize endpoints แต่ยัง **Not Started**
และไม่ได้ deploy — วิดีโอ (ZegoCloud) เองก็ไม่ผ่าน backend นี้แล้ว (token ออกจาก Next.js API route โดยตรง)

**เป้าหมายรอบนี้:** แทนที่ mock provider/summarizer ทั้งสองด้วยของจริง โดยใช้บริการของ ZegoCloud:

1. **ZEGOCLOUD Cloud Real-Time ASR** — ถอดคำพูดจากห้องประชุม (Zego Express Engine room ที่มีอยู่แล้ว)
2. **ZEGOCLOUD AI Agent / unified LLM gateway** — สรุปประชุมจาก transcript (ไม่มี "meeting summary API"
   แยกต่างหากจาก ZegoCloud — สรุปทำโดยป้อน transcript เข้า LLM ผ่าน gateway ของ Zego เอง)

อ้างอิง: [ZEGOCLOUD Cloud ASR Overview](https://www.zegocloud.com/docs/cloud-realtime-asr/introduction/overview),
[ZEGOCLOUD AI Agent Overview](https://www.zegocloud.com/docs/aiagent-server/introduction/overview)

## แนวทางที่เลือก

Implement ตรงใน **Next.js API routes** (`src/app/api/`) — ไม่สร้าง/deploy `backend/` Express แยก
เหตุผล: video token ปัจจุบันก็ทำแบบนี้อยู่แล้ว (README: "video token ไม่ผ่าน backend นี้แล้ว") ทุกอย่างรันบน
Vercel เดียว ลด operational surface ไม่ต้องดูแล server ที่สอง `backend/` คงไว้เป็นเอกสารแผนเดิม
ไม่ต้อง implement เพิ่มในรอบนี้

## Architecture

### Provider ใหม่ (ต่อ contract เดิม ไม่แก้ type)

- `src/services/transcription/zegoAsrProvider.ts` — implements `TranscriptionProvider`, `id: "zego_asr"`
- `src/services/summarize/zegoLlmSummarizer.ts` — implements `Summarizer`, `id: "zego_llm"`

ทั้งสอง type union (`TranscriptionProvider["id"]`, `Summarizer["id"]`) ต้องเพิ่มค่าใหม่นี้เข้าไป

### API routes ใหม่

| Route | หน้าที่ |
|---|---|
| `POST /api/transcription/start` | เรียก ZegoCloud "Start Cloud Real-Time ASR" ผูกกับ room ประชุม (room-level, ทุก stream) ตอนประชุมเริ่ม |
| `POST /api/transcription/stop` | เรียก "Stop ASR" ตอนประชุมจบ |
| `POST /api/transcription/callback` | Webhook รับผลถอดเสียงจาก ZegoCloud (public HTTPS ผ่าน Vercel) → map เป็น `TranscriptSegment[]` เก็บ store ชั่วคราวต่อ meetingId |
| `POST /api/summarize` | รับ `MeetingTranscript` + `AgendaWindow[]` → เรียก ZegoCloud AI Agent gateway (LLM) สรุปทีละวาระ → คืน `MeetingSummary` (`isDraft: true` เสมอ) |

### Credentials (env vars ใหม่ ต่อแพทเทิร์น `ZEGO_APP_ID`/`ZEGO_SERVER_SECRET` ที่มีอยู่)

```
ZEGO_ASR_API_KEY          # ใช้เรียก Start/Stop/Add/Delete ASR Stream
ZEGO_AI_AGENT_API_KEY     # ใช้เรียก AI Agent / LLM gateway สำหรับสรุป
```

ไม่มี credential ครบ → route คืน error ชัดเจน (เช่นเดียวกับวิดีโอตอนนี้: "ไม่มี mock ให้ fallback แล้ว")
ห้าม silent fallback เป็น mock เพราะจะทำให้แยกไม่ออกว่าเป็นข้อมูลจริงหรือ mock

## Data Flow

1. ประชุมเริ่ม (host กด "เริ่มประชุม") → frontend เรียก `api/transcription/start` ผูกกับ room ID เดิมที่ใช้กับวิดีโอ
2. ผู้พูดคุยในห้อง → ZegoCloud ถอดเสียงฝั่ง cloud → ส่งผลกลับผ่าน `api/transcription/callback`
   → map `speakerId`/`speakerName` จาก stream userID เทียบกับ roster ที่มีอยู่ในระบบ (ไม่ให้ AI เดาเสียงเอง
   ตามกฎเดิมใน `transcription/types.ts`)
3. ประชุมจบ → `api/transcription/stop`
4. เลขาฯ กด "สรุปด้วย AI" → ดึง `MeetingTranscript` ที่สะสมไว้ + `AgendaWindow[]` (จาก activeAgendaId
   history ที่มีอยู่แล้ว) → ส่งเข้า `api/summarize` → ได้ `MeetingSummary` ร่าง แสดงในหน้า UI เดิม
   (หน้าจอไม่ต้องแก้ เพราะ contract เดิมเหมือนกัน แค่สลับ provider id)

## Error Handling

- Credential ขาด → error ชัดตอน route ถูกเรียก ไม่ mock
- ASR callback ไม่มาใน timeout ที่กำหนด → `TranscriptStatus: "failed"` + ปุ่ม retry (เรียก `start` ใหม่)
- Summarize ล้มเหลว (quota/network) → error state ชัดเจน มีปุ่ม retry ไม่ auto-fallback เป็น mock summary

## Testing

- Unit: mock `fetch` ของ ZegoCloud ASR/AI Agent response → ตรวจ mapping เข้า `TranscriptSegment[]` /
  `MeetingSummary` ตรงตาม contract เดิมทุก field
- Integration: ยิง payload ตัวอย่างจาก ZegoCloud docs เข้า `api/transcription/callback` ตรวจ store อัปเดตถูก
- Manual: ประชุมทดสอบข้ามเครื่องจริง (เหมือนขั้นตอน deploy ที่ README อธิบายไว้กับวิดีโอ) เช็คความแม่นยำ
  ถอดเสียงไทยระดับ POC

## Out of Scope (รอบนี้)

- DB ถาวรสำหรับเก็บ transcript ข้ามเครื่อง/ข้าม session (ยังใช้ store ชั่วคราวแบบเดียวกับ mock ปัจจุบัน)
- Real-time translation
- Digital human / conversational AI features อื่นของ ZegoCloud
- `backend/` Express implementation ตามแผนเดิม (ถูกแทนด้วย Next.js API routes ในดีไซน์นี้)
