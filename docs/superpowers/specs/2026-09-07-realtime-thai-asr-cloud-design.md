# Realtime Thai ASR ผ่าน Cloud (Azure) แบบแบ่งตามระดับความลับ — Design

**Date:** 2026-09-07
**Status:** Approved (design phase) — รอ implementation plan
**ต่อยอดจาก:** `2026-08-24-server-side-thai-asr-design.md` (Phase F — Typhoon self-host)

## บริบท

Phase F ย้ายการถอดเสียงจาก Web Speech API มาไว้ที่ server ด้วย Typhoon ASR self-host
โค้ดครบทุกชั้นแล้วและวัดผลไว้ที่ CER 0.0438 หน่วงประมวลผล 185 ms ต่อก้อน แต่โครงสร้าง
"ตัดเสียงเป็นก้อนละ 3 วินาทีแล้วยิงทีละก้อน" มีเพดานที่แก้ด้วยการจูนตัวเลขไม่ได้:

1. **ผู้ใช้เห็นข้อความช้ากว่าเสียงราว 3.2 วินาที** — spec เดิมวัดไว้ว่าลดก้อนเหลือ 2 วินาที
   ทำให้ CER แย่ลงเกือบเท่าตัว (0.0707) โดยที่หน่วงไม่ได้ลดลงจริง ทางนี้ตัน
2. **ไม่มีผลบางส่วน (partial)** — ข้อความโผล่ทีเดียวทั้งก้อน ไม่ไหลตามคำพูด
3. **ไม่รู้จักศัพท์เฉพาะ** — ชื่อคน ชื่อคณะทำงาน ศัพท์ราชการ ปรับให้โมเดลรู้จักไม่ได้
   ซึ่งเป็นจุดที่ ASR พังบ่อยที่สุดในประชุมจริง
4. **รันบน host ที่มีอยู่ไม่ได้** — โมเดลกิน RAM ราว 2 GB เกินโควตา Render free 512 MB
   ตอนนี้ `ASR_URL` บน production จึงยังว่าง คำบรรยายสดใช้งานไม่ได้จริง

## แนวทางที่เลือก

ใช้ **cloud streaming ASR แบ่งเส้นทางตามระดับความลับของการประชุม**

| `confidentialityLevel` | ผู้ให้บริการ | เหตุผล |
|---|---|---|
| `normal`, `restricted` | Azure AI Speech (`th-TH`, region `southeastasia`) | เร็ว แม่น มี partial ปรับศัพท์เฉพาะได้ |
| `top_secret` | Typhoon self-host (ของเดิม) | เสียงไม่ออกนอกองค์กร |

### เหตุผลที่เลือก Azure ไม่ใช่ Google

ค้นข้อมูลวันที่ 2026-09-07:

| | Azure AI Speech | Google Cloud STT v2 (Chirp 3) |
|---|---|---|
| ภาษาไทย | รองรับเต็ม ไม่ใช่ preview | **Preview** |
| Region ที่ streaming ได้ | มี Southeast Asia (สิงคโปร์) | **us / eu multi-region เท่านั้น** |
| ปรับศัพท์เฉพาะภาษาไทย | phrase list, plain text, structured text, เทรนด้วย audio + transcript | model adaptation |
| ราคา real-time | $0.146/ชม. (custom $0.262/ชม. + $0.056/ชม. ค่า host endpoint) | $0.016/นาที = $0.96/ชม. |
| Free tier | 5 ชม./เดือน ตลอดไป | 60 นาที/เดือน + เครดิต $300 หมดอายุ 90 วัน |

สามข้อแรกคือเหตุผลหลัก ระบบที่จะใช้ประชุมจริงไม่ควรพึ่ง API สถานะ preview และการที่เสียง
ประชุมไทยต้องวิ่งไป us/eu ทั้งเพิ่มหน่วง 150-250 ms และตอบคำถาม "เสียงไปไหน" กับองค์กร
ได้แย่กว่าสิงคโปร์มาก ส่วนราคาที่ Azure ถูกกว่าราว 6 เท่าเป็นผลพลอยได้

### เหตุผลที่ยอมให้เสียงออกนอกองค์กร

จุดขายเรื่องความลับของระบบนี้เป็นเหตุผลเดิมที่ทิ้ง Web Speech API การเลือก cloud ASR คือ
การรับข้อนั้นกลับมาบางส่วน จึงจำกัดไว้ที่ `normal` กับ `restricted` เท่านั้น ส่วน `top_secret`
ซึ่งเป็นระดับที่เปิด watermark ถี่สุดและ blur — ตรงกับเจตนา "ห้ามหลุดออกนอกห้อง" มากที่สุด —
ยังเข้า Typhoon self-host เหมือนเดิม การตัดสินใจนี้อยู่ที่ server เท่านั้น (ดู Architecture)

## Architecture

### Provider seam

`backend/src/realtime/asrClient.ts` ปัจจุบันเป็น request/response ก้อนเดียวจบ
(`transcribePcm(pcm) => Promise<string>`) ซึ่งรองรับ streaming ไม่ได้ — streaming ต้องมี
session ที่เปิดค้าง ป้อนเสียงเข้าเรื่อย ๆ แล้วมีผลยิงกลับหลายครั้ง เปลี่ยนเป็น:

```ts
export interface AsrSession {
  push(pcm: Buffer): void;
  close(): Promise<void>;
}

export interface AsrProvider {
  open(opts: {
    onPartial(text: string): void;
    onFinal(text: string, startSec: number): void;
    phrases?: string[];
  }): Promise<AsrSession>;
}
```

สอง implementation หลัง interface เดียวกัน:

| ไฟล์ | หน้าที่ |
|---|---|
| `backend/src/realtime/providers/azure.ts` | Speech SDK, `th-TH`, region จาก env, เปิด interim results, ส่ง phrase list |
| `backend/src/realtime/providers/typhoon.ts` | ห่อ `transcribePcm` เดิม สะสมเสียงครบ 3 วินาทีค่อยยิง `onFinal` ไม่มี partial |

`transcribePcm`, `stripOverlap`, และ `asr/` ทั้งโฟลเดอร์ไม่ถูกลบ — กลายเป็นราย
ละเอียดภายในของ typhoon provider ตัวเดียว

### การเลือก provider

```
client เข้าห้อง
  → backend อ่าน meeting.confidentialityLevel จาก DB
  → normal | restricted  → azure provider
  → top_secret           → typhoon provider
```

**ตัดสินที่ server เท่านั้น** frame ที่ client ส่งมาไม่มีที่ให้บอกว่าจะใช้ provider ไหน
ถ้าให้ client เลือกได้ คนที่แก้ payload เองก็ส่งเสียงประชุมลับออก cloud ได้ หลักการเดียว
กับที่ Phase F กำหนดว่าตัวตนผู้พูดมาจาก JWT ไม่ใช่จาก frame

### Active speaker arbitration

Azure free tier (F0) จำกัด concurrent request ไว้ที่ **1 และปรับไม่ได้** ส่วน S0 ได้ 100
ในประชุมจริงคนพูดทีละคน จึงเปิด session เฉพาะผู้พูดที่ active เท่านั้น

ต่อห้องมี slot จำนวน `ASR_MAX_STREAMS` (default `1`):

1. Client ส่ง RMS มาใน header ของ frame (คำนวณด้วย `rms()` ที่มีอยู่แล้วใน
   `src/services/speech/pcm.ts`) — header เดิมมีแต่ timestamp 4 ไบต์ ต้องขยาย
2. ผู้พูดที่ถือ slot อยู่ → `push()` เข้า session ต่อ
3. slot ว่าง + RMS เกิน `SILENCE_RMS_THRESHOLD` → เปิด session ให้ผู้พูดคนนั้น
4. slot เต็ม + RMS ของผู้พูดใหม่ > RMS ของคนที่ถืออยู่ × `ARBITRATION_TAKEOVER_RATIO` → ปิด session
   เดิม (รอ final ตัวสุดท้ายก่อน) แล้วเปิดให้คนใหม่
5. ผู้พูดที่ถือ slot เงียบเกิน `SILENCE_CLOSE_MS` (1500 ms) → ปิด session คืน slot

ข้อ 5 สำคัญสองเรื่องพร้อมกัน: Azure คิดเงินตามเวลาที่ session เปิด และบน F0 ที่มี slot เดียว
ถ้าไม่ปิด คนแรกที่พูดจะยึด slot ไปทั้งประชุม

ข้อ 4 ต้องมี hysteresis จริง ไม่ใช่เทียบ RMS ตรง ๆ — สองคนที่ดังพอกันจะสลับ slot กันไปมา
ทุกเฟรม เปิด-ปิด session รัวจนทั้งค่าใช้จ่ายบานและไม่ได้ข้อความของใครเลย

`ASR_MAX_STREAMS` เป็น env ไม่ใช่ค่าคงที่ในโค้ด ขึ้น S0 เมื่อไหร่เพิ่มเป็น 4-8 ได้ทันที
โดยไม่ต้องแก้โค้ด

## Data Flow

```
ไมค์ → AudioWorklet → downsample 16 kHz → PCM16 + RMS
  → frame [timestamp 4B][rms 4B][PCM16...] → WebSocket
  → backend: arbitration ตัดสินว่า frame นี้เข้า session ไหนหรือทิ้ง
  → provider.push(pcm)
      ├─ onPartial → broadcast subtitle_text { isFinal: false }  ← ไม่เขียน DB
      └─ onFinal   → broadcast subtitle_text { isFinal: true }
                     + transcript.appendSegment()
```

โปรโตคอล `subtitle_text` มี `isFinal: boolean` อยู่แล้ว
(`src/services/signaling/types.ts:63`) และ `SubtitleBar` รับค่านี้อยู่แล้ว — **partial
ไม่ต้องแก้โปรโตคอล**

`stripOverlap()` ใช้กับ typhoon provider เท่านั้น สตรีมของ Azure ไม่มีรอยต่อก้อนให้ตัด

### สิ่งที่ต้องแก้ฝั่ง frontend

`src/components/meeting/SubtitleBar.tsx` ตอนนี้ append ทุกครั้งที่มีสัญญาณใหม่ ซึ่งใช้ได้
เมื่อข้อความมาทุก 3 วินาที แต่ partial ไหลมาวินาทีละหลายครั้ง ต้องเปลี่ยนเป็น: บรรทัดที่ยัง
`isFinal: false` ของผู้พูดคนเดิมให้**แทนที่** ไม่ใช่ต่อท้าย ส่วนบรรทัดที่ `isFinal: true`
แล้วจึงค้างไว้ตามเดิม

## ความแม่นยำ: Phrase list จากข้อมูลประชุม

Base model ของผู้ให้บริการไหนก็ไม่รู้จัก "คณะกรรมการกลั่นกรองงบประมาณ" หรือชื่อเฉพาะของ
คนในองค์กร Azure รับ phrase list ต่อ session ได้โดยไม่ต้องเทรนโมเดล และข้อมูลที่ต้องใช้
อยู่ใน `Meeting` ครบแล้ว backend ประกอบให้ตอนเปิด session:

| แหล่ง | ใช้ทำอะไร | ลำดับความสำคัญ |
|---|---|---|
| `participants[].name` | ชื่อคนในห้อง | 1 |
| `committee`, `shortName`, `title` | ชื่อคณะทำงาน/หน่วยงาน | 2 |
| `agenda[].title` ที่ `secretGroupId` เป็น null | ศัพท์เฉพาะของวาระที่คุย | 3 |
| `description` | บริบทที่ผู้จัดกรอกเอง | 4 |

วาระที่มี `secretGroupId` ต้องถูกตัดออกเสมอ — วาระลับอยู่ในห้องที่ระดับความลับเป็น `normal`/`restricted` ได้
การส่งหัวข้อวาระลับเข้า phrase list คือการส่งข้อความนั้นออก cloud โดยที่ไม่มีใครสั่ง

นอกจากนั้น Azure มีเพดานจำนวน phrase ต่อ session — เกินเมื่อไหร่ตัดจากลำดับท้ายขึ้นมา ชื่อคนต้องรอด
เสมอเพราะเป็นจุดที่ผิดแล้วเจ็บที่สุด

ผู้ใช้ไม่ต้องตั้งค่าอะไรเพิ่ม และไม่รู้ตัวว่ามีระบบนี้

**Custom Speech แบบเทรนโมเดลไม่ทำในเฟสนี้** — phrase list ได้ผลทันทีโดยไม่มีค่า endpoint
hosting $0.056/ชม. และไม่ต้องมีคนดูแล dataset ต่อเนื่อง ถ้าวัดแล้วยังไม่พอค่อยพิจารณาใหม่

## Error Handling

| เหตุ | พฤติกรรม |
|---|---|
| Azure ล้ม / คีย์ผิด / เกินโควตา F0 | log สาเหตุจริงที่ server + ส่ง `signal_error` ให้ client ตามรูปแบบเดิมใน `audio.ts` |
| Typhoon ล้ม (ห้อง `top_secret`) | เหมือนเดิม — คำบรรยายเงียบ ส่วนอื่นของระบบทำงานปกติ |
| session หลุดกลางประชุม | เปิดใหม่ครั้งเดียวเมื่อ frame ถัดไปเข้ามา ไม่ retry เป็นลูป |
| ไม่ได้ตั้ง `AZURE_SPEECH_KEY` | ห้อง cloud ไม่มีคำบรรยาย + log เตือนตอน start ไม่ใช่ตอน request แรก |
| frame ที่ header พัง | ทิ้งเงียบ ไม่ปิด socket (เหมือนเดิม — เสียงก้อนเดียวเพี้ยนไม่ควรทำให้คนทั้งห้องหลุด) |

**ห้าม fallback จาก Azure ไป Typhoon อัตโนมัติ** — ฟังดูปลอดภัยแต่ผิดสองชั้น: Typhoon บน
Render free รันไม่ได้อยู่แล้ว fallback จึงล้มซ้ำเปล่า ๆ และถ้าวันหนึ่งรันได้จริง การสลับเงียบ ๆ
ทำให้ไม่มีใครรู้ว่า Azure พังมาสามสัปดาห์

## ความลับของคีย์

`AZURE_SPEECH_KEY` และ `AZURE_SPEECH_REGION` เป็น env ฝั่ง backend เท่านั้น ห้ามมี
`NEXT_PUBLIC_` และห้ามส่งถึง browser — client ไม่เคยคุยกับ Azure โดยตรง เสียงวิ่งผ่าน
backend เสมอ ซึ่งจำเป็นอยู่แล้วเพราะทั้ง arbitration และการอ่านระดับความลับต้องอยู่ที่ server

ต่างจาก ZegoCloud ที่ frontend ต้องถือ token — ตรงนี้ไม่มีเหตุผลใดให้คีย์ออกจาก server

## Configuration

| env | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `AZURE_SPEECH_KEY` | (ไม่มี) | ไม่ตั้ง = ห้อง cloud ไม่มีคำบรรยาย |
| `AZURE_SPEECH_REGION` | `southeastasia` | |
| `ASR_MAX_STREAMS` | `1` | F0 รับได้ 1 ขึ้น S0 แล้วเพิ่มได้ |
| `SILENCE_CLOSE_MS` | `1500` | เงียบเกินนี้ปิด session คืน slot |
| `ARBITRATION_TAKEOVER_RATIO` | `1.5` | ต้องดังเป็นกี่เท่าของคนที่ถือ slot อยู่ถึงแย่งได้ — `rms()` คืนค่าเชิงเส้น ไม่ใช่ dB จึงเทียบด้วยอัตราส่วน ไม่ใช่ผลต่าง |
| `ASR_URL`, `ASR_TOKEN` | (ไม่มี) | ของเดิม ใช้กับ typhoon provider (`top_secret`) |

## Testing

### Automated

| ไฟล์ | ทดสอบ |
|---|---|
| `backend/src/realtime/arbitration.test.ts` | คนดังกว่าแย่ง slot ได้, hysteresis กันสลับถี่, เงียบแล้วคืน slot, `ASR_MAX_STREAMS=4` เปิดพร้อมกันได้ 4 |
| `backend/src/realtime/providers/select.test.ts` | `top_secret` ได้ typhoon provider เสมอ — ด่านกันเสียงประชุมลับหลุดออก cloud |
| `backend/src/realtime/phrases.test.ts` | วาระที่มี `secretGroupId` ไม่หลุดเข้า phrase list, ชื่อคนรอดเสมอเมื่อเกินเพดาน |
| `backend/src/realtime/audio.test.ts` (มีอยู่แล้ว) | partial ไม่ถูกเขียนลง transcript, final ถูกเขียน |
| `src/components/meeting/SubtitleBar.test.tsx` | partial ของผู้พูดคนเดิมแทนที่บรรทัดเดิม ไม่สะสม |

### วัดผลด้วยมือ (เกณฑ์ตัดสินว่าออกแบบนี้สำเร็จ)

ขยาย harness เดิมจาก Phase F (`asr/tests/`) ให้วัดสามทางด้วยเสียงชุดเดียวกัน:

| วัด | เกณฑ์ผ่าน |
|---|---|
| CER ของ Azure + phrase list | ดีกว่า 0.0438 ที่ Typhoon วัดไว้ |
| CER ของ Azure ไม่มี phrase list | เก็บไว้เทียบ — พิสูจน์ว่า phrase list คุ้มจริง |
| หน่วง partial แรกหลังเริ่มพูด | < 500 ms |
| หน่วง final หลังพูดจบประโยค | < 1500 ms (ของเดิม 3200 ms) |
| ค่าใช้จ่ายประชุม 1 ชม. 5 คน | ใกล้ 1 stream-hour ไม่ใช่ 5 — พิสูจน์ว่า arbitration ทำงาน |

**เสียงทดสอบต้องเป็นเสียงประชุมจริง ไม่ใช่ TTS** — spec เดิมเตือนไว้เองว่าตัวเลข 0.024-0.044
ต่ำกว่าความจริงเพราะเสียง TTS ชัดเกินไป ถ้ารอบนี้ใช้ TTS อีกก็เทียบอะไรไม่ได้

## ขอบเขตที่ไม่รวมรอบนี้

- **Custom Speech แบบเทรนโมเดล** — ทำ phrase list ก่อน วัดผลแล้วค่อยตัดสิน
- **Speaker diarization ของ Azure** — ระบบรู้อยู่แล้วว่าใครพูดจาก JWT ที่ผูกกับ socket
- **Fallback อัตโนมัติระหว่าง provider** — ดูเหตุผลใน Error Handling
- **การลบ Typhoon self-host ทิ้ง** — ยังต้องใช้กับ `top_secret`
- **Deploy Typhoon ขึ้น HF Spaces** — ยังจำเป็นถ้าต้องการคำบรรยายในห้อง `top_secret`
  แต่แยกเป็นงานคนละชิ้นกับ spec นี้ (`deploy/HUGGINGFACE.md`)
- **ให้ผู้จัดประชุมเลือก provider เอง** — ตัดสินจากระดับความลับอย่างเดียว ค่าตั้งต้นที่
  ปลอดภัยดีกว่าสวิตช์ที่คนกดผ่านโดยไม่อ่าน

## แหล่งอ้างอิงราคาและการรองรับภาษา (ค้นวันที่ 2026-09-07)

- Azure Speech pricing — https://azure.microsoft.com/en-us/pricing/details/speech/
- Azure language support (`th-TH` STT + custom speech) — https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
- Azure quotas (F0 concurrent = 1, S0 = 100) — https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits
- Google Chirp 3 (ไทย = Preview, streaming us/eu) — https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3
- Google STT pricing — https://cloud.google.com/speech-to-text/pricing

ราคาและสถานะการรองรับภาษาเปลี่ยนได้ ตรวจซ้ำก่อนตัดสินใจเรื่องงบประมาณจริง
