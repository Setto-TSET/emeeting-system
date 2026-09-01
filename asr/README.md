---
title: E-Meeting Thai ASR
emoji: 🎙️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 8000
pinned: false
---

# ASR sidecar — ถอดเสียงไทยสำหรับคำบรรยายสด

บริการถอดเสียงตัวเดียวจบ ไม่มี business logic ไม่แตะฐานข้อมูล
ใช้โมเดล [`scb10x/typhoon-asr-realtime`](https://huggingface.co/scb10x/typhoon-asr-realtime)
โหลด weights ไว้ตั้งแต่ตอน build image แล้ว

ส่วนหัวไฟล์ (YAML ด้านบน) เป็นค่าตั้งของ Hugging Face Space — ไม่มีผลตอนรันด้วย docker compose

## API

| Endpoint | รายละเอียด |
|---|---|
| `GET /health` | เปิดสาธารณะเสมอ คืน `{"status":"ok"}` ไม่มีข้อมูลอื่น |
| `POST /transcribe` | body เป็น PCM 16-bit little-endian mono **16 kHz** ดิบ ไม่ใช่ไฟล์ WAV คืน `{"text": "..."}` |

## ตัวแปรสภาพแวดล้อม

| ตัวแปร | ค่าเริ่มต้น | หน้าที่ |
|---|---|---|
| `ASR_TOKEN` | ว่าง | ความลับที่ผู้เรียกต้องแนบมาเป็น `Authorization: Bearer <token>` **ว่าง = ใครก็เรียกได้** |
| `ASR_MODEL` | `scb10x/typhoon-asr-realtime` | เปลี่ยนโมเดลต้อง build image ใหม่ ไม่งั้นจะโหลดตอนสตาร์ตแทน |
| `ASR_DEVICE` | `cpu` | |

> **ต้องตั้ง `ASR_TOKEN` เสมอเมื่อบริการนี้เข้าถึงได้จากอินเทอร์เน็ต**
> เพราะไม่มีระบบผู้ใช้ ใครยิงถึงก็สั่งถอดเสียงได้ และ CPU มีชุดเดียวร่วมกับห้องประชุมจริง

ขั้นตอน deploy ขึ้น Hugging Face Spaces อยู่ที่ [`deploy/HUGGINGFACE.md`](../deploy/HUGGINGFACE.md)

## รันเอง

```bash
pip install -r requirements.txt
uvicorn server:app --port 8000
```

เทสต์ (ต้องรันจากในโฟลเดอร์นี้ เพราะเทสต์อ้าง `tests/fixtures/` แบบ relative):

```bash
pytest
```
