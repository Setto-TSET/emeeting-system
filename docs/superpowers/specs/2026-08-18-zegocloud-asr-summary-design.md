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

**เป้าหมายรอบนี้:** แทนที่ mock provider/summarizer ทั้งสองด้วยของจริง:

1. **ZEGOCLOUD Cloud Real-Time ASR** — ถอดคำพูดจากห้องประชุม (Zego Express Engine room ที่มีอยู่แล้ว)
2. **Claude API** — สรุปประชุมจาก transcript

> **หมายเหตุ (แก้ไขจากดีไซน์แรก):** ตรวจสอบแล้วพบว่า ZEGOCLOUD **ไม่มี** one-shot text-summarization API
> "AI Agent" ของ ZegoCloud ออกแบบมาสำหรับ conversational voice agent เท่านั้น (ต้องสร้าง Agent Instance
> ผูกกับ RTC room จริง, ตอบกลับ async ผ่าน callback, มี TTS พ่วงมาด้วย) — ใช้งานผิดจุดกับ batch
> summarization จึงเปลี่ยนมาใช้ **Claude API ตรง** สำหรับสรุป (ตามแผนเดิมใน `backend/README.md`)
> ส่วน ASR ยังใช้ ZegoCloud เพราะมี REST API ที่เหมาะกับงานนี้ตรง ๆ

อ้างอิง: [ZEGOCLOUD Cloud ASR Overview](https://www.zegocloud.com/docs/cloud-realtime-asr/introduction/overview),
[Start API](https://www.zegocloud.com/docs/cloud-realtime-asr/api-reference/start),
[Stop API](https://www.zegocloud.com/docs/cloud-realtime-asr/api-reference/stop),
[Receiving Callback](https://www.zegocloud.com/docs/cloud-realtime-asr/callbacks/receiving-callback),
[Server API Signing](https://docs.zegocloud.com/article/9781)

## แนวทางที่เลือก

Implement ตรงใน **Next.js API routes** (`src/app/api/`) — ไม่สร้าง/deploy `backend/` Express แยก
เหตุผล: video token ปัจจุบันก็ทำแบบนี้อยู่แล้ว (README: "video token ไม่ผ่าน backend นี้แล้ว") ทุกอย่างรันบน
Vercel เดียว ลด operational surface ไม่ต้องดูแล server ที่สอง `backend/` คงไว้เป็นเอกสารแผนเดิม
ไม่ต้อง implement เพิ่มในรอบนี้

## Architecture

### Provider ใหม่ (ต่อ contract เดิม ไม่แก้ type)

- `src/services/transcription/zegoAsrProvider.ts` — implements `TranscriptionProvider`, `id: "zego_asr"`
- `src/services/summarize/claudeSummarizer.ts` — implements `Summarizer`, `id: "claude"`

ทั้งสอง type union (`TranscriptionProvider["id"]`, `Summarizer["id"]`) ต้องเพิ่มค่าใหม่นี้เข้าไป

### API routes ใหม่

| Route | หน้าที่ |
|---|---|
| `POST /api/transcription/start` | เรียก ZegoCloud `StartRealtimeASRTask` ผูกกับ room ประชุม (room-level, ทุก stream) ตอน host เข้าห้อง |
| `POST /api/transcription/stop` | เรียก `StopRealtimeASRTask` ตอน host ออกจากห้อง/จบประชุม |
| `POST /api/transcription/callback` | Webhook รับผลถอดเสียงจาก ZegoCloud (public HTTPS ผ่าน Vercel, ต้องตั้งค่า URL นี้ฝั่ง ZegoCloud console — ดู "ข้อจำกัดที่ต้องรู้" ด้านล่าง) → map เป็น `TranscriptSegment[]` เก็บ store ชั่วคราวต่อ meetingId |
| `POST /api/summarize` | รับ `MeetingTranscript` + `AgendaWindow[]` → เรียก Claude API (`@anthropic-ai/sdk`) สรุปทีละวาระ → คืน `MeetingSummary` (`isDraft: true` เสมอ) |

### Credentials (env vars ใหม่ ต่อแพทเทิร์น `ZEGO_APP_ID`/`ZEGO_SERVER_SECRET` ที่มีอยู่)

```
ZEGO_ASR_APP_ID           # อาจใช้ค่าเดียวกับ ZEGO_APP_ID ถ้า ASR อยู่ App เดียวกับ video
ZEGO_SERVER_SECRET        # ใช้ค่าเดียวกับที่มีอยู่แล้ว — signature ของ Server API ทุกตัวใช้ secret เดียวกัน
CLAUDE_API_KEY            # เรียก Claude API สำหรับสรุป (ตาม backend/README.md เดิม)
```

ไม่ต้องเพิ่ม secret ใหม่สำหรับ ASR — ZegoCloud Server API ทุกตัว (video token, ASR) เซ็นด้วย
`ServerSecret` เดียวกันของ AppId เดียวกัน (ดู [Server API Signing](https://docs.zegocloud.com/article/9781))
ไม่มี credential ครบ → route คืน error ชัดเจน (เช่นเดียวกับวิดีโอตอนนี้: "ไม่มี mock ให้ fallback แล้ว")
ห้าม silent fallback เป็น mock เพราะจะทำให้แยกไม่ออกว่าเป็นข้อมูลจริงหรือ mock

### ข้อจำกัดที่ต้องรู้ก่อนเริ่ม implement

1. **Callback URL ตั้งค่าผ่าน ZegoCloud console เท่านั้น** ไม่ใช่ parameter ต่อ request — ต้องติดต่อ
   ZegoCloud support/console เพื่อผูก URL `<production-domain>/api/transcription/callback` ก่อน ASR
   ถึงจะส่งผลถอดเสียงเข้ามาได้จริง (ทำ code ให้พร้อมได้ก่อน แต่ทดสอบ end-to-end ต้องรอขั้นตอนนี้)
2. **Schema ของ `Data` field ใน callback (event `ASRResult`) ไม่ได้ระบุ field ละเอียดในเอกสารสาธารณะ**
   ต้อง log payload จริงจาก callback แรกที่ได้รับตอน manual test แล้วปรับ mapping ให้ตรง — เขียน route
   ให้ log raw body เสมอเพื่อรองรับขั้นตอนนี้
3. **AgendaWindow ยังไม่มี "ประวัติ" ให้ดึงจริง** — `Meeting.activeAgendaId` ในระบบตอนนี้เก็บแค่ค่าปัจจุบัน
   ค่าเดียว ไม่มี log ว่าเปลี่ยนเมื่อไหร่ (ตรวจสอบ `src/context/MeetingContext.tsx` แล้ว) รอบนี้จึงยังส่ง
   `windows: []` เหมือนโค้ดปัจจุบัน (`meetings/[id]/page.tsx:180`) — summarizer จะคืน `overall` อย่างเดียว
   ไม่มี `byAgenda` แยก (พฤติกรรมเดิมของ mock ก็เป็นแบบนี้อยู่แล้วเมื่อ windows ว่าง) การเก็บ agenda-change
   history เป็นงานแยกต่างหาก ไม่อยู่ในสโคปนี้

## Data Flow

1. Host เข้าห้องประชุม (mount ของ `ZegoCloudEmbedStage` สำเร็จใน `live/[id]/page.tsx`) → frontend เรียก
   `api/transcription/start` ผูกกับ room ID เดิมที่ใช้กับวิดีโอ (เฉพาะ host เท่านั้นที่ trigger เพื่อกันเรียกซ้ำ
   จากผู้เข้าร่วมหลายคน)
2. ผู้พูดคุยในห้อง → ZegoCloud ถอดเสียงฝั่ง cloud → ส่งผลกลับผ่าน `api/transcription/callback`
   → map `speakerId`/`speakerName` จาก stream userID เทียบกับ roster ที่มีอยู่ในระบบ (ไม่ให้ AI เดาเสียงเอง
   ตามกฎเดิมใน `transcription/types.ts`)
3. Host ออกจากห้อง (`onLeft`/`dispose()` ของ session) → `api/transcription/stop`
4. เลขาฯ เปิดหน้ารายละเอียดประชุม กด "ขอ Transcript" → `zegoAsrProvider.getTranscript(meetingId)` ดึงจาก
   store ที่ callback สะสมไว้ กด "สร้างร่างรายงานสรุป" → ส่ง transcript + `windows: []` เข้า
   `api/summarize` (Claude) → ได้ `MeetingSummary` ร่าง แสดงในหน้า UI เดิม (หน้าจอไม่ต้องแก้ เพราะ
   contract เดิมเหมือนกัน แค่สลับ provider id จาก `"mock"` เป็น `"zego_asr"`/`"claude"`)

## Error Handling

- Credential ขาด → error ชัดตอน route ถูกเรียก ไม่ mock
- ASR callback ไม่มาใน timeout ที่กำหนด → `TranscriptStatus: "failed"` + ปุ่ม retry (เรียก `start` ใหม่)
- Summarize ล้มเหลว (quota/network) → error state ชัดเจน มีปุ่ม retry ไม่ auto-fallback เป็น mock summary

## Testing

- Unit: mock `fetch` ของ ZegoCloud ASR / Claude API response → ตรวจ mapping เข้า `TranscriptSegment[]` /
  `MeetingSummary` ตรงตาม contract เดิมทุก field, ตรวจ signature generator ด้วย known-good input/output
- Integration: ยิง payload ตัวอย่าง (จำลองจาก schema ที่มีในเอกสาร) เข้า `api/transcription/callback`
  ตรวจ store อัปเดตถูก
- Manual: ประชุมทดสอบข้ามเครื่องจริงหลัง deploy + ตั้งค่า callback URL ฝั่ง ZegoCloud console แล้ว
  (เหมือนขั้นตอน deploy ที่ README อธิบายไว้กับวิดีโอ) เช็คความแม่นยำถอดเสียงไทยระดับ POC และปรับ
  callback field mapping ให้ตรงกับ payload จริงตามข้อจำกัดข้อ 2 ด้านบน

## Out of Scope (รอบนี้)

- DB ถาวรสำหรับเก็บ transcript ข้ามเครื่อง/ข้าม session (ยังใช้ store ชั่วคราวแบบเดียวกับ mock ปัจจุบัน —
  in-memory module-level store ฝั่ง server, หายเมื่อ serverless instance restart)
- Agenda-change history tracking (จำเป็นสำหรับสรุปแยกรายวาระ — ตอนนี้สรุปได้แค่ภาพรวม)
- Real-time translation
- Digital human / conversational AI features อื่นของ ZegoCloud
- `backend/` Express implementation ตามแผนเดิม (ถูกแทนด้วย Next.js API routes ในดีไซน์นี้)
