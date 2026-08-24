# Server-Side Thai ASR (Typhoon) — Design

**Date:** 2026-08-24
**Status:** Approved (design phase) — รอ implementation plan

## บริบท

ตอนนี้คำบรรยายสดมาจาก Web Speech API ที่รันบนเบราว์เซอร์ของผู้พูดแต่ละคน
(`src/services/speech/webSpeechProvider.ts` เรียกจาก `src/app/(app)/live/[id]/page.tsx:464`)
ผลลัพธ์ถูกส่งเป็นสัญญาณ `subtitle_text` ผ่าน WebSocket ไปที่ backend ซึ่งบันทึกลง
`transcript_segments` เมื่อ `isFinal` แล้วกระจายให้คนอื่นในห้อง (`backend/src/realtime/handlers.ts:120`)

เส้นทางหลัง Web Speech ทำงานถูกต้องและ sync ข้ามเครื่องได้แล้ว ปัญหาอยู่ที่ตัวถอดเสียงเอง:

1. **ไม่ครบทุกคน** — Web Speech API มีเฉพาะ Chromium คนที่ใช้ Safari, Firefox หรือมือถือบางรุ่น
   ไม่มีคำบรรยายเลย transcript จึงขาดคนเหล่านั้นทั้งคน ไม่ใช่แค่ขาดบางประโยค
2. **คุณภาพภาษาไทยกลาง ๆ** และควบคุมไม่ได้ ปรับแต่งไม่ได้
3. **เสียงออกนอกองค์กร** — Web Speech ส่งเสียงไปประมวลผลที่ Google ซึ่งขัดกับจุดขายเรื่อง
   ความลับของระบบนี้ (watermark, blur-on-blur, การจำหน่ายเอกสารตามสิทธิ์)

## แนวทางที่เลือก

ย้ายการถอดเสียงไปฝั่ง server ด้วย **Typhoon ASR Real-time** (`scb10x/typhoon-asr-realtime`,
Apache 2.0, FastConformer-Transducer, เทรนด้วยเสียงไทย 10,000 ชั่วโมง) รันแบบ self-host
บน VM เดียวกับ backend เสียงไม่ออกนอกองค์กร ค่าใช้จ่ายต่อนาทีเป็นศูนย์

### ผลทดสอบที่ใช้ตัดสินใจ (2026-08-24)

ทดสอบบน CPU ของเครื่อง dev (ไม่ใช้ GPU) ด้วยเสียงสังเคราะห์ภาษาไทยแนวประชุมราชการ 5 คลิป รวม 50 วินาที:

| ขนาดก้อนเสียง | CER | หน่วงประมวลผลต่อก้อน (avg / p95) |
|---|---|---|
| ทั้งไฟล์ (~10 วินาที) | 0.0240 | — |
| 5 วินาที | 0.0311 | 278 ms / 373 ms |
| **3 วินาที** | **0.0438** | **185 ms / 269 ms** |
| 2 วินาที | 0.0707 | 187 ms / 230 ms |

throughput รวม 23 เท่าของเวลาจริงบน CPU โหลดโมเดล 3 วินาที

**เสียงทดสอบเป็น TTS จึงชัดเกินจริง** ตัวเลขชุดนี้ต่ำกว่า CER 0.0984 ที่ผู้พัฒนาประกาศไว้บนข้อมูลจริงมาก
ใช้ยืนยันได้แค่ว่าติดตั้งได้ เร็วพอ และถอดไทยได้ ไม่ใช่หลักฐานว่าแม่นพอสำหรับงานจริง
**ต้องวัดซ้ำด้วยเสียงประชุมจริงก่อนขึ้น production**

เลือกก้อนละ 3 วินาที: ผู้ใช้เห็นข้อความช้ากว่าเสียงประมาณ 3.2 วินาที ซึ่งรับได้สำหรับคำบรรยายประกอบ
ที่ 2 วินาที CER แย่ลงเกือบเท่าตัวโดยที่หน่วงไม่ได้ลดลงจริง ที่ 5 วินาทีแม่นขึ้นแต่ช้าเกินจนเสียความเป็นสด
ทับซ้อนก้อนละ 0.5 วินาทีเพื่อกันคำขาดตรงรอยต่อ — ผลทดสอบเห็นคำหายตรงรอยต่อจริง (คลิป c5: "เจ็ดต่อ" หายไป)

### สิ่งที่ไม่เปลี่ยน

**contract `subtitle_text` คงเดิมทุกประการ** เปลี่ยนเฉพาะว่าใครเป็นผู้ผลิตข้อความ
`SubtitleBar`, `src/services/transcript/store.ts`, การบันทึกลง `transcript_segments`,
การ fan-out ใน `handlers.ts` และ snapshot `GET /api/rooms/:meetingId/state` ไม่ต้องแก้

ผู้พูดยังคงถูกระบุจาก JWT ของเจ้าของสตรีมเสียงเหมือนเดิม ไม่ต้องทำ speaker diarization
เพราะแต่ละเบราว์เซอร์ส่งเฉพาะเสียงไมค์ของตัวเอง ซึ่งแม่นกว่า diarization ทุกแบบ

### สองจุดที่ต้องเปลี่ยนพฤติกรรม แม้ contract จะเหมือนเดิม

**1. ผู้พูดต้องได้รับคำบรรยายของตัวเองกลับมาด้วย**
วันนี้ `handlers.ts:136` เรียก `broadcast(..., client.userId)` คือ **ไม่ส่งกลับหาผู้ส่ง** ซึ่งถูกต้อง
เพราะผู้พูดมีข้อความอยู่ในมือแล้วจาก Web Speech และเซ็ต `setLatestSubtitle` เองที่
`live/[id]/page.tsx:479` เมื่อย้ายไปถอดฝั่ง server **ผู้พูดจะไม่รู้ข้อความของตัวเองอีกต่อไป**
เส้นทางเสียงจึงต้อง broadcast ให้ทุกคนรวมผู้พูด (ไม่ส่ง `exceptUserId`) และฝั่ง client
ต้องเลิกเซ็ต `latestSubtitle` เองในจุดนั้น มิฉะนั้นผู้พูดจะเห็นคำบรรยายของทุกคนยกเว้นตัวเอง

**2. `startSec` ต้องเดินทางมากับก้อนเสียง**
วันนี้ client คำนวณ `startSec` จาก `meetingStartRef` แล้วแนบมากับ payload JSON
binary frame ไม่มีที่ให้แนบ จึงกำหนดรูปแบบเฟรมเป็น **header 4 ไบต์ (uint32 little-endian
เก็บ offset หน่วยมิลลิวินาทีนับจากเริ่มห้อง) ตามด้วย PCM 16-bit little-endian**
server อ่าน header แล้วแปลงเป็นวินาทีก่อนส่งเข้า `appendSegment()` ห้ามให้ server เดาเวลาเอง
จากเวลาที่เฟรมมาถึง เพราะความหน่วงของเครือข่ายจะทำให้ offset ในรายงานประชุมเพี้ยน

## Architecture

```
เบราว์เซอร์ของผู้เข้าร่วมแต่ละคน
  AudioWorklet จับไมค์ตัวเอง → downsample เป็น PCM 16 kHz mono 16-bit
  → ตัดก้อนละ 3 วินาที ทับซ้อน 0.5 วินาที → ข้ามก้อนที่เงียบ (RMS gate)
  → ส่งเป็น binary frame ผ่าน WebSocket /ws เส้นเดิม
        |
Backend Node (backend/src/realtime/server.ts)
  แยก binary frame ออกจาก JSON frame → รู้ userId/userName จาก JWT อยู่แล้ว
  → POST ไปที่ ASR sidecar
  ← ได้ text กลับมา
  → เข้าเส้นทางเดิมของ subtitle_text: transcript.appendSegment() + broadcast()
        |
ASR sidecar (container ใหม่ใน deploy/docker-compose.yml)
  Python + FastAPI + typhoon-asr โหลดโมเดลครั้งเดียวตอน start
  POST /transcribe → { text }
```

### ไฟล์ที่สร้างใหม่

| ไฟล์ | หน้าที่ |
|---|---|
| `asr/Dockerfile` | อิมเมจ Python + NeMo + typhoon-asr โหลด weights ตอน build |
| `asr/server.py` | FastAPI: `POST /transcribe` (PCM 16k mono) → `{ text }`, `GET /health` |
| `asr/requirements.txt` | ตรึงเวอร์ชัน typhoon-asr, nemo-toolkit, fastapi, uvicorn |
| `backend/src/realtime/asrClient.ts` | HTTP client เรียก sidecar หนึ่งตัว ไม่มี business logic |
| `backend/src/realtime/audio.ts` | คิวเสียงต่อผู้พูด: รับ binary frame → เรียก asrClient → คืน text |
| `src/services/speech/audioCapture.ts` | AudioWorklet + downsample + ตัดก้อน + RMS gate (แยกส่วนคำนวณเป็นฟังก์ชันบริสุทธิ์ให้ทดสอบได้) |
| `src/services/speech/pcmWorklet.ts` | โค้ด AudioWorkletProcessor |

### ไฟล์ที่แก้

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `backend/src/realtime/server.ts` | `socket.on('message')` แยกทาง: binary → `audio.ts`, text → `handleSignal()` เดิม |
| `src/services/signaling/channel.ts` | เพิ่ม `sendAudio(chunk: ArrayBuffer)` ใน `RoomTransport` — ไม่เข้าคิว ไม่ retry |
| `src/app/(app)/live/[id]/page.tsx` | เลิกเรียก `webSpeechProvider` เปลี่ยนไปเรียก `audioCapture` |
| `deploy/docker-compose.yml` | เพิ่ม service `asr` |
| `backend/.env.example`, `deploy/.env.example` | เพิ่ม `ASR_URL` |

### ไฟล์ที่ลบ

`src/services/speech/webSpeechProvider.ts` — ลบเมื่อของใหม่ผ่านการทดสอบกับเสียงจริงแล้วเท่านั้น
ไม่เก็บไว้เป็น fallback เพราะจะทำให้ `transcript_segments` มีข้อความสองคุณภาพปนกันโดยแยกที่มาไม่ได้
sidecar ล่ม = ไม่มีคำบรรยาย และขึ้นข้อความแจ้งผู้ใช้ ดีกว่าเงียบ ๆ แล้วได้ของคุณภาพต่างกัน

## Data Flow

1. ผู้ใช้เข้าห้อง กด "เปิดคำบรรยาย" → `audioCapture.start()` ขอสิทธิ์ไมค์ (ขอแยกจากไมค์ของ ZegoCloud
   ไม่แย่ง track กัน — ใช้ `getUserMedia` คนละ stream)
2. ทุก 3 วินาที ได้ `Int16Array` หนึ่งก้อน ถ้า RMS ต่ำกว่าเกณฑ์ (เงียบ) ข้ามไม่ส่ง
   ค่าเริ่มต้น RMS gate = 0.01 ของ full scale ตั้งเป็นค่าคงที่ที่แก้ได้ในไฟล์เดียว ไม่ฝังกระจาย —
   ไมค์จริงกับห้องประชุมจริงมี noise floor ต่างกัน ค่านี้ต้องปรับหน้างานได้โดยไม่ต้องไล่แก้หลายที่
3. `transport.sendAudio(chunk)` ส่ง binary frame ไป `/ws` — ก้อนเสียงไม่เข้าคิว retry
   ถ้าหลุดการเชื่อมต่อให้ทิ้ง เหมือนที่ `DISCARD_WHEN_OFFLINE` ทำกับ `subtitle_text` วันนี้
4. Backend รับ binary frame รู้ทันทีว่าเป็นเสียงของ `client.userId` จาก JWT
5. `audio.ts` ส่งต่อ sidecar ทีละก้อนต่อผู้พูดหนึ่งคน ถ้าก้อนใหม่ของคนเดิมมาถึงก่อนก้อนเก่าเสร็จ
   ให้ทิ้งก้อนเก่า ไม่เข้าคิวสะสม เพราะคำบรรยายที่ช้าเกินไปไม่มีประโยชน์
6. ได้ text → ตัดส่วนที่ซ้ำจากการทับซ้อนออกก่อน (ดูหัวข้อถัดไป) → บันทึก `transcript.appendSegment()`
   และ `broadcast()` ให้ทุกคนรวมผู้พูด ด้วย envelope `subtitle_text` ที่มี `isFinal: true` เสมอ
   (Typhoon คืนผลเป็นก้อนจบ ไม่มีผลระหว่างพูดแบบ Web Speech)

### การตัดข้อความซ้ำจากช่วงทับซ้อน

ก้อนเสียงทับซ้อนกัน 0.5 วินาที แปลว่าคำที่อยู่ตรงรอยต่อจะถูกถอดออกมาสองครั้ง ถ้าไม่จัดการ
transcript จะมีคำซ้ำทุกรอยต่อ ซึ่งแย่กว่าปัญหาคำหายที่การทับซ้อนตั้งใจจะแก้

กติกา: ก่อนต่อข้อความก้อนใหม่เข้ากับก้อนก่อนหน้าของผู้พูดคนเดียวกัน ให้หา **ส่วนท้ายของข้อความเดิม
ที่ยาวที่สุดซึ่งตรงกับส่วนหัวของข้อความใหม่ โดยดูไม่เกิน 30 ตัวอักษร** แล้วตัดส่วนนั้นออกจากข้อความใหม่
ถ้าไม่พบส่วนที่ตรงกันเลย ให้ต่อตรง ๆ ไม่ต้องเดา

ตัวเปรียบเทียบต้องทำงานบนข้อความที่ตัดช่องว่างออกแล้ว เพราะ Typhoon คืนภาษาไทยแบบไม่มีช่องว่าง
ระหว่างคำ และตำแหน่งช่องว่างไม่คงที่ระหว่างก้อน

ฟังก์ชันนี้เป็นฟังก์ชันบริสุทธิ์ อยู่ใน `backend/src/realtime/audio.ts` และต้องมีเทสต์ของตัวเอง —
เป็นจุดที่พังเงียบได้ง่ายที่สุดในดีไซน์นี้

## Error Handling

| สถานการณ์ | พฤติกรรม |
|---|---|
| sidecar ล่มหรือ timeout | backend ตอบ `signal_error` กลับไปที่ผู้ส่งก้อนนั้น พร้อมข้อความไทย ไม่ broadcast |
| เบราว์เซอร์ไม่รองรับ AudioWorklet | ปุ่มคำบรรยายถูก disable พร้อมเหตุผล ไม่เงียบ ๆ ล้มเหลว |
| ผู้ใช้ไม่อนุญาตไมค์ | ข้อความไทยบอกวิธีเปิดสิทธิ์ ไม่ retry วนลูป |
| ก้อนเสียงมาถี่กว่าที่ sidecar ถอดทัน | ทิ้งก้อนเก่าของผู้พูดคนนั้น เก็บก้อนล่าสุด (ข้อ 5 ข้างบน) |
| binary frame ใหญ่ผิดปกติ | ปฏิเสธถ้าเกิน 200 KB (3 วินาทีที่ 16 kHz 16-bit เท่ากับ 96 KB) กัน memory abuse |

## Testing

| ระดับ | ทดสอบอะไร |
|---|---|
| `asr/test_server.py` | `POST /transcribe` ด้วยไฟล์ fixture ภาษาไทย ได้ข้อความไม่ว่าง และ **CER ไม่เกิน 0.15** — เกณฑ์นี้หลวมกว่าที่วัดได้จริง (0.024–0.044) โดยตั้งใจ เพื่อจับกรณีโมเดลโหลดผิดตัวหรือ pipeline เสียงพัง ไม่ใช่เพื่อวัดคุณภาพ |
| `backend/tests/realtime/audio.test.ts` | binary frame → เรียก asrClient (mock) → บันทึกลง transcript และ broadcast ด้วย `senderId` จาก JWT ไม่ใช่จาก payload |
| `backend/tests/realtime/audio.test.ts` | ผู้พูดได้รับ `subtitle_text` ของตัวเองกลับมาด้วย (ไม่ถูก exclude เหมือนเส้นทาง JSON เดิม) |
| `backend/tests/realtime/audio.test.ts` | header 4 ไบต์ถูกอ่านเป็น `startSec` ถูกต้อง และเฟรมที่สั้นกว่า 4 ไบต์ถูกปฏิเสธโดยไม่ทำให้ socket ล่ม |
| `backend/tests/realtime/audio.test.ts` | ก้อนใหม่มาระหว่างก้อนเก่ายังไม่เสร็จ → ก้อนเก่าถูกทิ้ง ไม่สะสมคิว |
| `backend/tests/realtime/audio.test.ts` | การตัดข้อความซ้ำ: มีส่วนซ้อนแล้วตัดถูก, ไม่มีส่วนซ้อนแล้วต่อตรง, ส่วนซ้อนยาวเกิน 30 ตัวอักษรแล้วไม่ตัดเกินขอบเขต |
| `src/services/speech/audioCapture.test.ts` | การตัดก้อน การทับซ้อน และ RMS gate ทดสอบด้วย buffer สังเคราะห์ |

การวัด CER กับเสียงประชุมจริงเป็นขั้นตอนแยกก่อนลบ `webSpeechProvider.ts` ไม่ใช่ automated test

## ขอบเขตที่ไม่รวมรอบนี้

- **การสรุปการประชุม** — พักไว้ตามที่ตกลง `mockSummarizer` ยังอยู่เหมือนเดิม
- **ZegoCloud Cloud ASR** — ราคายังไม่เปิดเผย ต้องรอใบเสนอราคาจาก sales ถ้าถูกกว่าค่าดูแล VM
  ค่อยพิจารณาใหม่ โครงสร้างนี้เปลี่ยนผู้ให้บริการได้โดยแก้แค่ `asrClient.ts`
- **context biasing** (ป้อนรายชื่อผู้เข้าประชุมจาก `meeting_participants` เป็น hint) — รอวัดกับเสียงจริงก่อน
  ว่าชื่อคนและศัพท์มติผิดจริงแค่ไหน ผลทดสอบ TTS เห็นแล้วว่าผิดได้ ("รักษาสัตย์" เป็น "รักษาสัตว์",
  "งดออกเสียง" เป็น "งวดออกเสียง", "เซิร์ฟเวอร์" เป็น "Super") แต่ยังไม่รู้ขนาดปัญหาบนเสียงจริง
- **GPU** — CPU ทำได้ 23 เท่าของเวลาจริงแล้ว ไม่ต้องใช้
- **สเกลหลาย instance** — sidecar หนึ่งตัวรับได้หลายห้องพร้อมกัน และ backend ยังเป็น replica เดียว
  อยู่แล้วเพราะ room registry อยู่ใน memory
