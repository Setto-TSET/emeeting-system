# Server-Side Thai ASR (Typhoon) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ย้ายการถอดเสียงคำบรรยายสดจาก Web Speech API บนเบราว์เซอร์ ไปเป็น Typhoon ASR ที่รัน self-host ฝั่ง server เพื่อให้ผู้เข้าร่วมทุกเบราว์เซอร์มีคำบรรยาย และเสียงประชุมไม่ออกนอกองค์กร

**Architecture:** เบราว์เซอร์แต่ละคนจับไมค์ตัวเองด้วย AudioWorklet แปลงเป็น PCM 16 kHz mono ตัดก้อนละ 3 วินาที (ทับซ้อน 0.5 วินาที) แล้วส่งเป็น binary frame ผ่าน WebSocket `/ws` เส้นเดิม backend อ่าน `userId` จาก JWT ที่ผูกกับ socket อยู่แล้ว ส่งเสียงต่อไปที่ ASR sidecar (Python + FastAPI + typhoon-asr) แล้วนำข้อความที่ได้เข้าเส้นทาง `subtitle_text` เดิมทุกประการ คือบันทึกลง `transcript_segments` แล้วกระจายออกห้อง

**Tech Stack:** Node.js 20, TypeScript 5 (strict), Express 4.18, `ws` 8, mysql2 3.6, Jest 29 + ts-jest (backend), Next.js 16.2.9 + React 19.2.4, Vitest 3 + jsdom (frontend), Python 3.13 + FastAPI + uvicorn + nemo-toolkit + typhoon-asr (sidecar)

## Global Constraints

- Node.js 20 LTS ห้ามใช้ Node API ที่ใหม่กว่า Node 20
- TypeScript `strict: true` ทั้ง `tsconfig.json` และ `backend/tsconfig.json` ห้ามใช้ `any` ในโค้ดใหม่ ยกเว้นตอนอ้าง helper เดิมใน `backend/src/database/connection.ts` ที่คืน `any` อยู่วันนี้
- ห้ามเพิ่ม runtime dependency ฝั่ง frontend — AudioWorklet และ WebSocket เป็น API ของเบราว์เซอร์ ไม่ต้องลงไลบรารี
- backend เพิ่ม dependency ใหม่ได้เฉพาะที่ระบุในแผนนี้ ซึ่งคือ **ไม่มีเลย** (`fetch` เป็น global ตั้งแต่ Node 18)
- sidecar ตรึงเวอร์ชันแน่นอน: `typhoon-asr==0.1.1`, `fastapi==0.121.1`, `uvicorn==0.42.0`, `soundfile==0.14.0`, `numpy==2.5.2`
- ตัวตนที่ server มองเห็นมาจาก JWT เท่านั้น handler ที่อ่าน user id, ชื่อ หรือ role ออกจาก body หรือ payload ถือว่าเป็นข้อบกพร่อง
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย คอมเมนต์ในโค้ดเขียนไทยเมื่ออธิบายเหตุผลเชิงผลิตภัณฑ์ ให้เข้าชุดกับไฟล์รอบข้าง
- SQL ทุกคำสั่งใช้ placeholder `?` ผ่าน `query()` / `queryOne()` การต่อสตริง SQL ถือว่าเป็นข้อบกพร่อง
- backend รัน replica เดียวเสมอ เพราะ room registry อยู่ใน memory ห้ามออกแบบอะไรที่ต้องใช้หลาย instance
- รูปแบบ binary frame: **4 ไบต์แรกเป็น uint32 little-endian เก็บ offset หน่วยมิลลิวินาทีนับจากเริ่มห้อง ตามด้วย PCM 16-bit little-endian mono 16 kHz**
- ขนาดก้อนเสียง 3 วินาที ทับซ้อน 0.5 วินาที ค่ามาจากผลวัดจริงในสเปก ห้ามเปลี่ยนโดยไม่วัดใหม่
- backend คุยกับ sidecar ผ่าน `ASR_URL` เท่านั้น ห้าม hardcode hostname

---

## File Structure

**สร้างใหม่ — ASR sidecar**

| ไฟล์ | หน้าที่ |
|---|---|
| `asr/requirements.txt` | ตรึงเวอร์ชัน dependency ของ sidecar |
| `asr/server.py` | FastAPI: `POST /transcribe` รับ PCM ดิบ คืน `{ text }`, `GET /health` |
| `asr/Dockerfile` | อิมเมจ Python พร้อม weights ที่โหลดมาแล้วตอน build |
| `asr/tests/test_server.py` | เทสต์ของ sidecar |
| `asr/tests/fixtures/th_sample.wav` | เสียงไทย fixture สำหรับเทสต์ |

**สร้างใหม่ — backend**

| ไฟล์ | หน้าที่ |
|---|---|
| `backend/src/realtime/asrClient.ts` | HTTP client เรียก sidecar หนึ่งตัว ไม่มี business logic |
| `backend/src/realtime/audio.ts` | แกะ frame, ตัดข้อความซ้ำ, คุมคิวต่อผู้พูด, บันทึกและกระจายผล |
| `backend/tests/realtime/audio.test.ts` | เทสต์ทั้งฟังก์ชันบริสุทธิ์และเส้นทาง WebSocket จริง |

**สร้างใหม่ — frontend**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/services/speech/pcm.ts` | ฟังก์ชันบริสุทธิ์: downsample, RMS, แปลงเป็น PCM16, ประกอบ frame |
| `src/services/speech/pcm.test.ts` | เทสต์ของฟังก์ชันข้างบน |
| `src/services/speech/audioCapture.ts` | ต่อ getUserMedia + AudioWorklet เข้ากับ `pcm.ts` และ transport |
| `public/pcm-worklet.js` | AudioWorkletProcessor (ต้องเป็นไฟล์ static ที่ browser โหลดผ่าน URL ได้) |

**แก้ไข**

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `backend/src/realtime/server.ts` | `socket.on('message')` แยกทาง binary กับ text |
| `src/services/signaling/channel.ts` | เพิ่ม `sendAudio` ใน `RoomTransport` |
| `src/context/RoomSignalingContext.tsx` | ส่ง `sendAudio` ต่อออกไปให้หน้าห้องใช้ |
| `src/app/(app)/live/[id]/page.tsx` | เปลี่ยน `handleToggleSubtitle` จาก webSpeechProvider เป็น audioCapture |
| `deploy/docker-compose.yml` | เพิ่ม service `asr` และ `ASR_URL` ให้ backend |
| `deploy/.env.example`, `backend/.env.example` | เพิ่ม `ASR_URL` |

**ลบ**

| ไฟล์ | เงื่อนไข |
|---|---|
| `src/services/speech/webSpeechProvider.ts` | ลบใน Task 7 หลังเส้นทางใหม่ทำงานครบแล้ว |

---

## Task 1: ASR sidecar ที่ถอดเสียงไทยได้

**Files:**
- Create: `asr/requirements.txt`, `asr/server.py`, `asr/tests/test_server.py`, `asr/tests/fixtures/th_sample.wav`
- Test: `asr/tests/test_server.py`

**Interfaces:**
- Consumes: ไม่มี เป็นงานแรก
- Produces: HTTP service ที่ `POST /transcribe` รับ body เป็น PCM 16-bit little-endian mono 16 kHz ดิบ (ไม่มี WAV header) คืน JSON `{"text": string}` และ `GET /health` คืน `{"status": "ok"}`

- [ ] **Step 1: สร้างไฟล์เสียง fixture**

fixture ต้องเป็นเสียงไทยจริงที่รู้คำตอบแน่นอน สร้างด้วย edge-tts ซึ่งใช้แค่ตอนสร้าง fixture ไม่ใช่ dependency ของ sidecar

```bash
mkdir -p asr/tests/fixtures
python -m pip install edge-tts soundfile librosa
python - <<'PY'
import asyncio, edge_tts, librosa, soundfile as sf
TEXT = "มติที่ประชุมเห็นชอบตามที่เสนอ ด้วยคะแนนเสียง เจ็ด ต่อ สอง"
asyncio.run(edge_tts.Communicate(TEXT, "th-TH-NiwatNeural").save("_tmp.mp3"))
y, _ = librosa.load("_tmp.mp3", sr=16000, mono=True)
sf.write("asr/tests/fixtures/th_sample.wav", y, 16000)
print("ok", len(y) / 16000, "sec")
PY
rm _tmp.mp3
```

- [ ] **Step 2: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `asr/tests/test_server.py`:

```python
import unicodedata
import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from server import app

REFERENCE = "มติที่ประชุมเห็นชอบตามที่เสนอด้วยคะแนนเสียงเจ็ดต่อสอง"
client = TestClient(app)


def norm(s: str) -> str:
    # ไทยไม่มีช่องว่างระหว่างคำ ตัดช่องว่างทิ้งก่อนเทียบ ไม่งั้นวัดการเว้นวรรคแทนการถอดเสียง
    # และรวม ํา (นิคหิต + สระอา) ให้เป็น ำ เพราะโมเดลคืนคนละรูปกับข้อความอ้างอิง
    return "".join(unicodedata.normalize("NFC", s).replace("ํา", "ำ").split())


def cer(ref: str, hyp: str) -> float:
    r, h = norm(ref), norm(hyp)
    prev = list(range(len(h) + 1))
    for i, rc in enumerate(r, 1):
        cur = [i]
        for j, hc in enumerate(h, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rc != hc)))
        prev = cur
    return prev[-1] / max(len(r), 1)


def pcm_bytes(path: str) -> bytes:
    audio, rate = sf.read(path, dtype="float32")
    assert rate == 16000
    return (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2").tobytes()


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_transcribe_thai_fixture():
    response = client.post(
        "/transcribe",
        content=pcm_bytes("tests/fixtures/th_sample.wav"),
        headers={"Content-Type": "application/octet-stream"},
    )
    assert response.status_code == 200
    text = response.json()["text"]
    assert text.strip() != ""
    # เกณฑ์นี้หลวมกว่าที่วัดได้จริง (0.024-0.044) โดยตั้งใจ มีไว้จับกรณีโหลดโมเดลผิดตัว
    # หรือ pipeline เสียงพัง ไม่ใช่ไว้วัดคุณภาพของโมเดล
    assert cer(REFERENCE, text) <= 0.15


def test_transcribe_rejects_empty_body():
    response = client.post(
        "/transcribe",
        content=b"",
        headers={"Content-Type": "application/octet-stream"},
    )
    assert response.status_code == 400


def test_transcribe_rejects_odd_length_body():
    # PCM 16-bit ต้องมีจำนวนไบต์เป็นเลขคู่เสมอ ไบต์แปลก ๆ คือสัญญาณว่า frame เพี้ยน
    response = client.post(
        "/transcribe",
        content=b"\x00\x01\x02",
        headers={"Content-Type": "application/octet-stream"},
    )
    assert response.status_code == 400
```

- [ ] **Step 3: รันเทสต์ให้เห็นว่าไม่ผ่าน**

```bash
cd asr && python -m pytest tests/test_server.py -v
```

Expected: FAIL ด้วย `ModuleNotFoundError: No module named 'server'`

- [ ] **Step 4: เขียน requirements.txt**

สร้าง `asr/requirements.txt`:

```
typhoon-asr==0.1.1
fastapi==0.121.1
uvicorn==0.42.0
soundfile==0.14.0
numpy==2.5.2
```

ติดตั้ง (ต้องใช้ Python 3.13 — NeMo กับ PyTorch ยังไม่รองรับ 3.14):

```bash
cd asr && python -m pip install -r requirements.txt pytest httpx
```

- [ ] **Step 5: เขียน server.py**

สร้าง `asr/server.py`:

```python
"""ASR sidecar — ถอดเสียงไทยด้วย Typhoon ASR แบบ self-host

รับ PCM ดิบเพื่อตัดขั้นตอน decode ทิ้งทั้งชั้น เบราว์เซอร์ส่ง PCM 16 kHz mono มาแล้ว
ไม่ต้องมี ffmpeg ในอิมเมจนี้
"""

import os
import tempfile

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException, Request

SAMPLE_RATE = 16000
MODEL_NAME = os.environ.get("ASR_MODEL", "scb10x/typhoon-asr-realtime")
DEVICE = os.environ.get("ASR_DEVICE", "cpu")

app = FastAPI()
_model = None


def get_model():
    # โหลดครั้งเดียวแล้วใช้ซ้ำ การโหลดใช้เวลาราว 3 วินาที ถ้าโหลดทุก request จะช้ากว่าการถอดเสียงเอง
    global _model
    if _model is None:
        import nemo.collections.asr as nemo_asr

        _model = nemo_asr.models.ASRModel.from_pretrained(
            model_name=MODEL_NAME, map_location=DEVICE
        )
    return _model


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(request: Request):
    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=400, detail="empty body")
    if len(raw) % 2 != 0:
        raise HTTPException(status_code=400, detail="pcm16 requires an even number of bytes")

    samples = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0

    # NeMo รับ path ของไฟล์ ไม่รับ array โดยตรงในเวอร์ชันนี้ จึงเขียนไฟล์ชั่วคราวแล้วลบทิ้ง
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        path = tmp.name
    try:
        sf.write(path, samples, SAMPLE_RATE)
        hypotheses = get_model().transcribe(audio=[path])
        first = hypotheses[0]
        text = first.text if hasattr(first, "text") else str(first)
    finally:
        os.unlink(path)

    return {"text": text}
```

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

```bash
cd asr && python -m pytest tests/test_server.py -v
```

Expected: PASS ทั้ง 4 เทสต์ (ครั้งแรกช้าเพราะดาวน์โหลด weights จาก HuggingFace)

- [ ] **Step 7: Commit**

```bash
git add asr/
git commit -m "feat(asr): typhoon ASR sidecar transcribing raw thai PCM"
```

---

## Task 2: อิมเมจของ sidecar

**Files:**
- Create: `asr/Dockerfile`, `asr/.dockerignore`
- Modify: `deploy/docker-compose.yml`, `deploy/.env.example`, `backend/.env.example`
- Test: manual — build อิมเมจแล้วยิง `/health` และ `/transcribe` จริง

**Interfaces:**
- Consumes: `asr/server.py` จาก Task 1
- Produces: service ชื่อ `asr` ใน compose ที่ backend เรียกได้ที่ `http://asr:8000`

- [ ] **Step 1: เขียน Dockerfile**

สร้าง `asr/Dockerfile`:

```dockerfile
FROM python:3.13-slim

WORKDIR /app

# libsndfile คือ native lib ที่ soundfile ต้องใช้ ไม่มีใน image slim
RUN apt-get update && apt-get install -y --no-install-recommends libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py ./

# โหลด weights ตอน build ไม่ใช่ตอน start — ไม่งั้น container แรกที่ขึ้นมาจะรอโหลดกลางอากาศ
# แล้วคำบรรยายของประชุมแรกหลัง deploy จะหายไปเงียบ ๆ
RUN python -c "import nemo.collections.asr as a; a.models.ASRModel.from_pretrained(model_name='scb10x/typhoon-asr-realtime', map_location='cpu')"

ENV ASR_DEVICE=cpu
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
```

สร้าง `asr/.dockerignore`:

```
tests
__pycache__
*.pyc
```

- [ ] **Step 2: Build แล้วทดสอบอิมเมจจริง**

```bash
docker build -t emeeting-asr ./asr
docker run -d --name asr-smoke -p 8000:8000 emeeting-asr
sleep 10
curl -s http://localhost:8000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 3: ทดสอบ /transcribe ผ่าน container**

```bash
python - <<'PY'
import numpy as np, soundfile as sf, urllib.request
audio, rate = sf.read("asr/tests/fixtures/th_sample.wav", dtype="float32")
assert rate == 16000
body = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2").tobytes()
req = urllib.request.Request(
    "http://localhost:8000/transcribe", data=body,
    headers={"Content-Type": "application/octet-stream"}, method="POST")
print(urllib.request.urlopen(req, timeout=120).read().decode())
PY
docker rm -f asr-smoke
```

Expected: JSON ที่มีข้อความไทยใกล้เคียง "มติที่ประชุมเห็นชอบตามที่เสนอด้วยคะแนนเสียงเจ็ดต่อสอง"

- [ ] **Step 4: เพิ่ม service เข้า compose**

แก้ `deploy/docker-compose.yml` เพิ่ม service นี้ก่อนบล็อก `caddy`:

```yaml
  asr:
    build:
      context: ../asr
    restart: unless-stopped
    # ponytail: instance เดียว โมเดลกิน RAM ราว 2 GB และ CPU ทำได้ 23 เท่าของเวลาจริงอยู่แล้ว
    # ถ้าห้องประชุมพร้อมกันเยอะจนถอดไม่ทัน ค่อยเพิ่ม replica แล้วใส่ load balancer หน้ามัน
    expose:
      - "8000"
```

และเพิ่ม env ให้ service `backend` ใต้ `ANTHROPIC_API_KEY`:

```yaml
      ASR_URL: ${ASR_URL:-http://asr:8000}
```

และเพิ่ม `asr` เข้า `depends_on` ของ `backend`:

```yaml
    depends_on:
      mysql:
        condition: service_healthy
      asr:
        condition: service_started
```

- [ ] **Step 5: เพิ่ม ASR_URL ใน env ตัวอย่างทั้งสองไฟล์**

ต่อท้าย `deploy/.env.example`:

```
# ที่อยู่ของ ASR sidecar — ค่าเริ่มต้นชี้ไปที่ service ใน compose เดียวกัน
ASR_URL=http://asr:8000
```

ต่อท้าย `backend/.env.example`:

```
# ที่อยู่ของ ASR sidecar (Typhoon) — ถอดเสียงคำบรรยายสด
ASR_URL=http://localhost:8000
```

- [ ] **Step 6: ตรวจว่า compose ยังถูกต้อง**

```bash
docker compose -f deploy/docker-compose.yml config > /dev/null && echo VALID
```

Expected: `VALID`

- [ ] **Step 7: Commit**

```bash
git add asr/Dockerfile asr/.dockerignore deploy/docker-compose.yml deploy/.env.example backend/.env.example
git commit -m "chore(asr): containerise the sidecar and wire it into compose"
```

---

## Task 3: asrClient — ตัวเรียก sidecar จาก backend

**Files:**
- Create: `backend/src/realtime/asrClient.ts`
- Test: `backend/tests/realtime/asrClient.test.ts`

**Interfaces:**
- Consumes: service จาก Task 1 ผ่าน env `ASR_URL`
- Produces: `export async function transcribePcm(pcm: Buffer): Promise<string>` — คืนข้อความ ถ้า sidecar ตอบไม่สำเร็จหรือหมดเวลาให้ throw `Error`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `backend/tests/realtime/asrClient.test.ts`:

```typescript
import http from 'http';
import { AddressInfo } from 'net';
import { transcribePcm } from '../../src/realtime/asrClient';

let server: http.Server;
let received: Buffer[] = [];
let respond: (res: http.ServerResponse) => void;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      received.push(Buffer.concat(chunks));
      respond(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  process.env.ASR_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  received = [];
  respond = (res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text: 'สวัสดีครับ' }));
  };
});

test('ส่ง PCM ดิบไปที่ sidecar แล้วคืนข้อความที่ได้', async () => {
  const pcm = Buffer.from([0x01, 0x00, 0x02, 0x00]);
  const text = await transcribePcm(pcm);

  expect(text).toBe('สวัสดีครับ');
  expect(received).toHaveLength(1);
  expect(received[0].equals(pcm)).toBe(true);
});

test('sidecar ตอบ 500 แล้ว throw', async () => {
  respond = (res) => {
    res.writeHead(500);
    res.end('boom');
  };

  await expect(transcribePcm(Buffer.from([0x00, 0x00]))).rejects.toThrow();
});

test('sidecar คืน JSON ที่ไม่มี text แล้ว throw', async () => {
  respond = (res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ oops: true }));
  };

  await expect(transcribePcm(Buffer.from([0x00, 0x00]))).rejects.toThrow();
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

```bash
cd backend && npx jest tests/realtime/asrClient.test.ts
```

Expected: FAIL ด้วย `Cannot find module '../../src/realtime/asrClient'`

- [ ] **Step 3: เขียน asrClient.ts**

สร้าง `backend/src/realtime/asrClient.ts`:

```typescript
// ═══════════════════════════════════════════
// ASR Client — คุยกับ sidecar ที่ถอดเสียงเท่านั้น ไม่มี business logic
//
// เปลี่ยนผู้ให้บริการถอดเสียง (เช่นย้ายไป ZegoCloud Cloud ASR) ให้แก้แค่ไฟล์นี้ไฟล์เดียว
// ═══════════════════════════════════════════

// ก้อนเสียง 3 วินาทีถอดเสร็จในราว 200 มิลลิวินาที ให้เวลา 10 วินาทีคือเผื่อไว้มากแล้ว
// เกินกว่านี้แปลว่า sidecar มีปัญหา ปล่อยให้ล้มเร็วดีกว่าค้างสะสม
const TIMEOUT_MS = 10_000;

export function asrBaseUrl(): string {
  return process.env.ASR_URL ?? 'http://localhost:8000';
}

export async function transcribePcm(pcm: Buffer): Promise<string> {
  const response = await fetch(`${asrBaseUrl()}/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(pcm),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`ASR sidecar ตอบกลับ ${response.status}`);
  }

  const body = (await response.json()) as { text?: unknown };
  if (typeof body.text !== 'string') {
    throw new Error('ASR sidecar ไม่ได้คืนข้อความ');
  }

  return body.text;
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

```bash
cd backend && npx jest tests/realtime/asrClient.test.ts
```

Expected: PASS ทั้ง 3 เทสต์

- [ ] **Step 5: Commit**

```bash
git add backend/src/realtime/asrClient.ts backend/tests/realtime/asrClient.test.ts
git commit -m "feat(realtime): client for the ASR sidecar"
```

---

## Task 4: ฟังก์ชันบริสุทธิ์ของ audio.ts — แกะ frame และตัดข้อความซ้ำ

**Files:**
- Create: `backend/src/realtime/audio.ts`
- Test: `backend/tests/realtime/audioPure.test.ts`

**Interfaces:**
- Consumes: ไม่มี ฟังก์ชันบริสุทธิ์ล้วน
- Produces:
  - `export function parseAudioFrame(raw: Buffer): { startSec: number; pcm: Buffer } | null` — คืน `null` ถ้า frame สั้นกว่า 6 ไบต์ หรือความยาว PCM เป็นเลขคี่
  - `export function stripOverlap(previous: string, next: string): string` — คืนข้อความใหม่ที่ตัดส่วนหัวที่ซ้ำกับท้ายของข้อความก่อนหน้าออกแล้ว

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `backend/tests/realtime/audioPure.test.ts`:

```typescript
import { parseAudioFrame, stripOverlap } from '../../src/realtime/audio';

function frame(startMs: number, samples: number[]): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(startMs, 0);
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => pcm.writeInt16LE(s, i * 2));
  return Buffer.concat([header, pcm]);
}

describe('parseAudioFrame', () => {
  test('อ่าน offset จาก header แล้วแปลงเป็นวินาที', () => {
    const parsed = parseAudioFrame(frame(90_500, [1, -1]));

    expect(parsed).not.toBeNull();
    expect(parsed!.startSec).toBeCloseTo(90.5, 3);
    expect(parsed!.pcm).toHaveLength(4);
  });

  test('frame ที่สั้นกว่า header ถูกปฏิเสธ', () => {
    expect(parseAudioFrame(Buffer.from([0x00, 0x01]))).toBeNull();
  });

  test('frame ที่มีแต่ header ไม่มีเสียง ถูกปฏิเสธ', () => {
    expect(parseAudioFrame(frame(0, []))).toBeNull();
  });

  test('PCM ความยาวเป็นเลขคี่ ถูกปฏิเสธ', () => {
    const bad = Buffer.concat([frame(0, [1]), Buffer.from([0x7f])]);
    expect(parseAudioFrame(bad)).toBeNull();
  });
});

describe('stripOverlap', () => {
  test('ตัดส่วนหัวที่ซ้ำกับท้ายของข้อความก่อนหน้า', () => {
    expect(stripOverlap('มติที่ประชุมเห็นชอบ', 'เห็นชอบตามที่เสนอ')).toBe('ตามที่เสนอ');
  });

  test('ไม่มีส่วนซ้ำ ต่อตรง ๆ', () => {
    expect(stripOverlap('วาระที่หนึ่ง', 'ประธานแจ้งให้ทราบ')).toBe('ประธานแจ้งให้ทราบ');
  });

  test('ไม่มีข้อความก่อนหน้า คืนข้อความใหม่ทั้งก้อน', () => {
    expect(stripOverlap('', 'เริ่มประชุม')).toBe('เริ่มประชุม');
  });

  test('เทียบโดยไม่สนช่องว่าง เพราะโมเดลวางช่องว่างไม่คงที่ระหว่างก้อน', () => {
    expect(stripOverlap('มติ ที่ประชุม', 'ที่ ประชุมเห็นชอบ')).toBe('เห็นชอบ');
  });

  test('ส่วนซ้ำยาวเกิน 30 ตัวอักษร ตัดได้ไม่เกินขอบเขตที่กำหนด', () => {
    const shared = 'ก'.repeat(40);
    const result = stripOverlap(shared, shared + 'จบ');
    // ตัดได้มากสุด 30 ตัว จึงเหลือ ก อีก 10 ตัวบวกท้าย
    expect(result).toBe('ก'.repeat(10) + 'จบ');
  });

  test('ข้อความใหม่ซ้ำกับของเดิมทั้งก้อน คืนสตริงว่าง', () => {
    expect(stripOverlap('เห็นชอบ', 'เห็นชอบ')).toBe('');
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

```bash
cd backend && npx jest tests/realtime/audioPure.test.ts
```

Expected: FAIL ด้วย `Cannot find module '../../src/realtime/audio'`

- [ ] **Step 3: เขียนฟังก์ชันบริสุทธิ์ใน audio.ts**

สร้าง `backend/src/realtime/audio.ts`:

```typescript
// ═══════════════════════════════════════════
// Audio Frames — แกะเสียงที่ client ส่งมา ถอดเป็นข้อความ แล้วเข้าเส้นทาง subtitle_text เดิม
//
// ตัวตนผู้พูดมาจาก JWT ที่ผูกกับ socket เท่านั้น frame ไม่มีที่ให้ client บอกว่าตัวเองเป็นใคร
// ═══════════════════════════════════════════

const HEADER_BYTES = 4;

// ก้อนเสียงทับซ้อนกัน 0.5 วินาที คำตรงรอยต่อจึงถูกถอดสองครั้ง มองย้อนไม่เกินเท่านี้ก็พอ
// (พูดเร็วสุดราว 20 ตัวอักษรต่อครึ่งวินาที เผื่อไว้เป็น 30)
const MAX_OVERLAP_CHARS = 30;

export function parseAudioFrame(raw: Buffer): { startSec: number; pcm: Buffer } | null {
  if (raw.length <= HEADER_BYTES) return null;

  const pcm = raw.subarray(HEADER_BYTES);
  if (pcm.length % 2 !== 0) return null;

  return { startSec: raw.readUInt32LE(0) / 1000, pcm };
}

function withoutSpaces(value: string): string {
  return value.replace(/\s+/g, '');
}

export function stripOverlap(previous: string, next: string): string {
  const tail = withoutSpaces(previous);
  const head = withoutSpaces(next);
  if (!tail || !head) return next;

  const limit = Math.min(MAX_OVERLAP_CHARS, tail.length, head.length);
  for (let size = limit; size > 0; size -= 1) {
    if (tail.endsWith(head.slice(0, size))) {
      return head.slice(size);
    }
  }

  return head;
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

```bash
cd backend && npx jest tests/realtime/audioPure.test.ts
```

Expected: PASS ทั้ง 11 เทสต์

- [ ] **Step 5: Commit**

```bash
git add backend/src/realtime/audio.ts backend/tests/realtime/audioPure.test.ts
git commit -m "feat(realtime): audio frame parsing and overlap de-duplication"
```

---

## Task 5: เส้นทางเสียงเต็มรูปแบบใน backend

**Files:**
- Modify: `backend/src/realtime/audio.ts`, `backend/src/realtime/server.ts:79-87`
- Test: `backend/tests/realtime/audio.test.ts`

**Interfaces:**
- Consumes: `parseAudioFrame`, `stripOverlap` จาก Task 4 · `transcribePcm` จาก Task 3 · `RoomClient` จาก `./rooms` · `send`, `broadcast` จาก `./server` · `transcript.appendSegment` จาก `../repositories/transcript`
- Produces: `export async function handleAudioFrame(client: RoomClient, raw: Buffer): Promise<void>` และ `export function resetAudioState(): void` (ใช้ล้างสถานะระหว่างเทสต์)

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `backend/tests/realtime/audio.test.ts`:

```typescript
import http from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import { query, close } from '../../src/database/connection';
import { runMigrations } from '../../src/database/migrations';
import { seedFromMockData } from '../../src/database/seed';
import { signAccessToken } from '../../src/services/auth';
import { createApp } from '../../src/server';
import { attachRealtime } from '../../src/realtime/server';
import { resetAudioState } from '../../src/realtime/audio';

jest.mock('../../src/realtime/asrClient', () => ({
  transcribePcm: jest.fn(),
}));
import { transcribePcm } from '../../src/realtime/asrClient';

const mockTranscribe = transcribePcm as jest.MockedFunction<typeof transcribePcm>;

let server: http.Server;
let port: number;
const MEETING = 'MT-2569-010';

function tokenFor(sub: string, name: string, role: string) {
  return signAccessToken({ sub, email: `${sub}@e-office.cloud`, name, role });
}

function audioFrame(startMs: number, sampleCount = 8): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(startMs, 0);
  return Buffer.concat([header, Buffer.alloc(sampleCount * 2)]);
}

async function openClient(sub: string, name: string, role = 'admin'): Promise<WebSocket> {
  const socket = new WebSocket(
    `ws://localhost:${port}/ws?meetingId=${MEETING}&token=${tokenFor(sub, name, role)}`
  );
  const firstMessage = nextMessage(socket);
  await new Promise<void>((resolve) => socket.on('open', () => resolve()));
  await firstMessage;
  return socket;
}

function nextMessage(socket: WebSocket): Promise<any> {
  return new Promise((resolve) => socket.once('message', (raw) => resolve(JSON.parse(raw.toString()))));
}

describe('audio frames', () => {
  beforeAll(async () => {
    await runMigrations();
    await query('DELETE FROM meeting_participants');
    await query('DELETE FROM meetings');
    await query('DELETE FROM app_users');
    await seedFromMockData('Meeting@2569');

    server = http.createServer(createApp());
    attachRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await close();
  });

  beforeEach(async () => {
    await query('DELETE FROM transcript_segments');
    mockTranscribe.mockReset();
    resetAudioState();
  });

  test('ผู้พูดได้รับคำบรรยายของตัวเองกลับมาด้วย', async () => {
    mockTranscribe.mockResolvedValue('สวัสดีครับ');
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    const echoed = nextMessage(speaker);
    speaker.send(audioFrame(0));
    const signal = await echoed;

    expect(signal.type).toBe('subtitle_text');
    expect(signal.senderId).toBe('U-001');
    expect(signal.payload.text).toBe('สวัสดีครับ');
    expect(signal.payload.isFinal).toBe(true);

    speaker.close();
  });

  test('คนอื่นในห้องได้รับคำบรรยายเดียวกัน', async () => {
    mockTranscribe.mockResolvedValue('รับทราบครับ');
    const speaker = await openClient('U-001', 'สมชาย ใจดี');
    const listener = await openClient('U-003', 'มาลี รักษาสัตย์');

    const heard = nextMessage(listener);
    speaker.send(audioFrame(0));
    const signal = await heard;

    expect(signal.senderId).toBe('U-001');
    expect(signal.senderName).toBe('สมชาย ใจดี');
    expect(signal.payload.text).toBe('รับทราบครับ');

    speaker.close();
    listener.close();
  });

  test('บันทึกลง transcript_segments ด้วย startSec จาก header ไม่ใช่เวลาที่เฟรมมาถึง', async () => {
    mockTranscribe.mockResolvedValue('วาระที่หนึ่ง');
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    const echoed = nextMessage(speaker);
    speaker.send(audioFrame(12_500));
    await echoed;

    const rows = (await query(
      'SELECT speaker_id, start_sec, text FROM transcript_segments WHERE meeting_id = ?',
      [MEETING]
    )) as { speaker_id: string; start_sec: number; text: string }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].speaker_id).toBe('U-001');
    expect(Number(rows[0].start_sec)).toBeCloseTo(12.5, 3);
    expect(rows[0].text).toBe('วาระที่หนึ่ง');

    speaker.close();
  });

  test('ข้อความที่ซ้ำจากช่วงทับซ้อนถูกตัดก่อนบันทึก', async () => {
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    mockTranscribe.mockResolvedValueOnce('มติที่ประชุมเห็นชอบ');
    let echoed = nextMessage(speaker);
    speaker.send(audioFrame(0));
    await echoed;

    mockTranscribe.mockResolvedValueOnce('เห็นชอบตามที่เสนอ');
    echoed = nextMessage(speaker);
    speaker.send(audioFrame(3_000));
    const second = await echoed;

    expect(second.payload.text).toBe('ตามที่เสนอ');

    speaker.close();
  });

  test('เฟรมที่แกะไม่ได้ถูกทิ้งเงียบ ๆ ไม่เรียก ASR และไม่ทำให้ socket ตาย', async () => {
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    speaker.send(Buffer.from([0x00, 0x01]));
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(speaker.readyState).toBe(WebSocket.OPEN);

    speaker.close();
  });

  test('sidecar ล้มเหลว แจ้ง signal_error กลับหาผู้ส่งเท่านั้น', async () => {
    mockTranscribe.mockRejectedValue(new Error('sidecar down'));
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    const replied = nextMessage(speaker);
    speaker.send(audioFrame(0));
    const signal = await replied;

    expect(signal.type).toBe('signal_error');
    expect(typeof signal.payload.reason).toBe('string');

    const rows = (await query('SELECT id FROM transcript_segments WHERE meeting_id = ?', [MEETING])) as unknown[];
    expect(rows).toHaveLength(0);

    speaker.close();
  });

  test('ข้อความว่างจาก ASR ไม่ถูกบันทึกและไม่ถูกกระจาย', async () => {
    mockTranscribe.mockResolvedValue('   ');
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    speaker.send(audioFrame(0));
    await new Promise((resolve) => setTimeout(resolve, 200));

    const rows = (await query('SELECT id FROM transcript_segments WHERE meeting_id = ?', [MEETING])) as unknown[];
    expect(rows).toHaveLength(0);

    speaker.close();
  });

  test('ก้อนใหม่ที่มาระหว่างก้อนเก่ายังถอดไม่เสร็จ ทำให้ก้อนเก่าถูกทิ้ง', async () => {
    const speaker = await openClient('U-001', 'สมชาย ใจดี');

    let releaseFirst: (value: string) => void = () => {};
    mockTranscribe.mockImplementationOnce(
      () => new Promise<string>((resolve) => { releaseFirst = resolve; })
    );
    mockTranscribe.mockResolvedValueOnce('ก้อนที่สอง');

    speaker.send(audioFrame(0));
    await new Promise((resolve) => setTimeout(resolve, 50));

    const echoed = nextMessage(speaker);
    speaker.send(audioFrame(3_000));
    releaseFirst('ก้อนที่หนึ่ง');
    const signal = await echoed;

    // ก้อนแรกถูกทิ้ง ข้อความที่ออกอากาศต้องเป็นก้อนที่สองเท่านั้น
    expect(signal.payload.text).toBe('ก้อนที่สอง');

    const rows = (await query('SELECT text FROM transcript_segments WHERE meeting_id = ?', [MEETING])) as {
      text: string;
    }[];
    expect(rows.map((r) => r.text)).toEqual(['ก้อนที่สอง']);

    speaker.close();
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

```bash
cd backend && npx jest tests/realtime/audio.test.ts
```

Expected: FAIL — `resetAudioState` และ `handleAudioFrame` ยังไม่มีใน `audio.ts`

- [ ] **Step 3: เขียนเส้นทางเสียงเต็มรูปแบบ**

ต่อท้าย `backend/src/realtime/audio.ts` (เก็บฟังก์ชันบริสุทธิ์จาก Task 4 ไว้เหมือนเดิม):

```typescript
import type { RoomClient } from './rooms';
import { send, broadcast } from './server';
import { transcribePcm } from './asrClient';
import * as transcript from '../repositories/transcript';

type SpeakerState = {
  // ลำดับของก้อนล่าสุดที่รับเข้ามา ใช้ตัดสินว่าผลที่กลับมาเป็นของก้อนที่ยังใหม่อยู่หรือเปล่า
  latestSeq: number;
  previousText: string;
};

const speakers = new Map<string, SpeakerState>();

function keyFor(client: RoomClient): string {
  return `${client.meetingId}::${client.userId}`;
}

export function resetAudioState(): void {
  speakers.clear();
}

export async function handleAudioFrame(client: RoomClient, raw: Buffer): Promise<void> {
  const parsed = parseAudioFrame(raw);
  // เฟรมพังคือความผิดของ client ทิ้งเงียบ ๆ ไม่ตอบกลับ ไม่ปิด socket
  // เพราะเสียงหนึ่งก้อนที่เพี้ยนไม่ควรทำให้คนทั้งห้องหลุด
  if (!parsed) return;

  const key = keyFor(client);
  const state = speakers.get(key) ?? { latestSeq: 0, previousText: '' };
  const seq = state.latestSeq + 1;
  state.latestSeq = seq;
  speakers.set(key, state);

  let text: string;
  try {
    text = await transcribePcm(parsed.pcm);
  } catch {
    return send(client.socket, {
      type: 'signal_error',
      senderId: client.userId,
      senderName: client.userName,
      timestamp: Date.now(),
      payload: { reason: 'ถอดเสียงไม่สำเร็จ ระบบคำบรรยายอาจไม่พร้อมใช้งานชั่วคราว' },
    });
  }

  // ระหว่างรอถอด มีก้อนใหม่ของคนเดิมเข้ามาแล้ว ผลก้อนนี้เก่าเกินจะมีประโยชน์ ทิ้งทั้งก้อน
  // ห้ามเข้าคิวสะสม เพราะคำบรรยายที่ตามหลังเสียงหลายวินาทีอ่านแล้วสับสนกว่าไม่มีเลย
  const current = speakers.get(key);
  if (!current || current.latestSeq !== seq) return;

  const deduped = stripOverlap(current.previousText, text).trim();
  if (!deduped) return;

  current.previousText = text;
  speakers.set(key, current);

  await transcript.appendSegment(client.meetingId, {
    speakerId: client.userId,
    speakerName: client.userName,
    startSec: parsed.startSec,
    text: deduped,
  });

  // ส่งให้ทุกคนรวมผู้พูดเอง ต่างจากเส้นทาง subtitle_text แบบ JSON ที่ตัดผู้ส่งออก —
  // ผู้พูดไม่ได้ถอดเสียงเองอีกแล้ว ถ้าไม่ส่งกลับ ผู้พูดจะเห็นคำบรรยายของทุกคนยกเว้นตัวเอง
  broadcast(client.meetingId, {
    type: 'subtitle_text',
    senderId: client.userId,
    senderName: client.userName,
    timestamp: Date.now(),
    payload: { text: deduped, isFinal: true, lang: 'th-TH', startSec: parsed.startSec },
  });
}
```

- [ ] **Step 4: แยกทาง binary กับ text ใน server.ts**

แทนที่บล็อก `socket.on('message', ...)` ท้ายไฟล์ `backend/src/realtime/server.ts` ด้วย:

```typescript
    socket.on('message', async (raw, isBinary) => {
      if (isBinary) {
        return handleAudioFrame(client, Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer));
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      await handleSignal(client, parsed);
    });
```

และเพิ่ม import ที่หัวไฟล์ ใต้บรรทัด `import { handleSignal } from './handlers';`:

```typescript
import { handleAudioFrame } from './audio';
```

จำกัดขนาดเฟรมที่ตัว `WebSocketServer` เลย ไม่ใช่ตรวจในโค้ดเราเอง — `ws` ปิดการเชื่อมต่อให้ก่อน
โหลด payload เข้าหน่วยความจำ ซึ่งเป็นจุดที่กันได้จริง แก้บรรทัดที่สร้าง server เป็น:

```typescript
  // ก้อนเสียง 3 วินาทีที่ 16 kHz 16-bit เท่ากับ 96 KB บวก header — 200 KB คือเผื่อไว้เท่าตัว
  // เกินกว่านี้ไม่ใช่เสียงประชุม
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 200 * 1024 });
```

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

```bash
cd backend && npx jest tests/realtime/audio.test.ts
```

Expected: PASS ทั้ง 8 เทสต์

- [ ] **Step 6: รันเทสต์ backend ทั้งชุดกันของเดิมพัง**

```bash
cd backend && npm test
```

Expected: PASS ทุก suite (ต้องมี MySQL ที่ตั้งค่าตาม `backend/.env.test` รันอยู่)

- [ ] **Step 7: Commit**

```bash
git add backend/src/realtime/audio.ts backend/src/realtime/server.ts backend/tests/realtime/audio.test.ts
git commit -m "feat(realtime): server-side transcription from client audio frames"
```

---

## Task 6: ฝั่งเบราว์เซอร์ — แปลงเสียงเป็น frame

**Files:**
- Create: `src/services/speech/pcm.ts`, `src/services/speech/pcm.test.ts`
- Test: `src/services/speech/pcm.test.ts`

**Interfaces:**
- Consumes: ไม่มี ฟังก์ชันบริสุทธิ์ล้วน
- Produces:
  - `export function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array`
  - `export function rms(samples: Float32Array): number`
  - `export function floatToPcm16(samples: Float32Array): Int16Array`
  - `export function buildAudioFrame(pcm: Int16Array, startMs: number): ArrayBuffer`
  - `export const SILENCE_RMS_THRESHOLD: number`, `export const CHUNK_SECONDS: number`, `export const OVERLAP_SECONDS: number`, `export const TARGET_RATE: number`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `src/services/speech/pcm.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import {
  buildAudioFrame,
  downsampleTo16k,
  floatToPcm16,
  rms,
  SILENCE_RMS_THRESHOLD,
  TARGET_RATE,
} from './pcm';

describe('downsampleTo16k', () => {
  test('ลดอัตราสุ่มจาก 48 kHz เหลือ 16 kHz ได้ความยาวหนึ่งในสาม', () => {
    const input = new Float32Array(4800).fill(0.5);
    const output = downsampleTo16k(input, 48000);

    expect(output).toHaveLength(1600);
    expect(output[0]).toBeCloseTo(0.5, 5);
  });

  test('อัตราสุ่มตรงกับเป้าหมายอยู่แล้ว คืนของเดิม', () => {
    const input = new Float32Array([0.1, -0.2, 0.3]);
    expect(Array.from(downsampleTo16k(input, TARGET_RATE))).toEqual([0.1, -0.2, 0.3]);
  });
});

describe('rms', () => {
  test('ความเงียบสนิทได้ศูนย์ และต่ำกว่าเกณฑ์', () => {
    const value = rms(new Float32Array(100));
    expect(value).toBe(0);
    expect(value).toBeLessThan(SILENCE_RMS_THRESHOLD);
  });

  test('เสียงดังได้ค่าสูงกว่าเกณฑ์', () => {
    expect(rms(new Float32Array(100).fill(0.4))).toBeGreaterThan(SILENCE_RMS_THRESHOLD);
  });
});

describe('floatToPcm16', () => {
  test('แปลงช่วง -1 ถึง 1 เป็นจำนวนเต็ม 16 บิต', () => {
    const pcm = floatToPcm16(new Float32Array([0, 1, -1]));

    expect(pcm[0]).toBe(0);
    expect(pcm[1]).toBe(32767);
    expect(pcm[2]).toBe(-32767);
  });

  test('ค่าที่เกินช่วงถูก clip ไม่ให้ล้นกลับเป็นเสียงแตก', () => {
    const pcm = floatToPcm16(new Float32Array([2.5, -2.5]));

    expect(pcm[0]).toBe(32767);
    expect(pcm[1]).toBe(-32767);
  });
});

describe('buildAudioFrame', () => {
  test('ประกอบ header 4 ไบต์ little-endian ตามด้วย PCM', () => {
    const frame = buildAudioFrame(new Int16Array([1, -1]), 90_500);
    const view = new DataView(frame);

    expect(frame.byteLength).toBe(4 + 4);
    expect(view.getUint32(0, true)).toBe(90_500);
    expect(view.getInt16(4, true)).toBe(1);
    expect(view.getInt16(6, true)).toBe(-1);
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

```bash
npx vitest run src/services/speech/pcm.test.ts
```

Expected: FAIL ด้วย `Failed to resolve import "./pcm"`

- [ ] **Step 3: เขียน pcm.ts**

สร้าง `src/services/speech/pcm.ts`:

```typescript
// src/services/speech/pcm.ts
//
// แปลงเสียงไมค์เป็นรูปแบบที่ ASR sidecar รับได้ ฟังก์ชันในไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ทั้งหมด
// เพื่อให้ทดสอบได้โดยไม่ต้องมี AudioContext จริง

export const TARGET_RATE = 16000;
export const CHUNK_SECONDS = 3;
export const OVERLAP_SECONDS = 0.5;

// noise floor ของไมค์แต่ละตัวกับห้องประชุมแต่ละห้องไม่เท่ากัน ค่านี้ตั้งไว้กลาง ๆ
// และต้องแก้ได้จากที่เดียว ไม่ฝังกระจายไปตามไฟล์อื่น
export const SILENCE_RMS_THRESHOLD = 0.01;

export function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === TARGET_RATE) return input;

  const ratio = inputRate / TARGET_RATE;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);

  // เฉลี่ยค่าในช่วงที่ยุบ แทนการหยิบตัวแรกทิ้งที่เหลือ — การหยิบทิ้งทำให้เกิด aliasing
  // ซึ่งฟังเป็นเสียงแหลมแปลกปลอมและทำให้ผลถอดเสียงแย่ลง
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j];
    output[i] = end > start ? sum / (end - start) : 0;
  }

  return output;
}

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function floatToPcm16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = Math.round(clamped * 32767);
  }
  return pcm;
}

export function buildAudioFrame(pcm: Int16Array, startMs: number): ArrayBuffer {
  const buffer = new ArrayBuffer(4 + pcm.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, Math.max(0, Math.floor(startMs)), true);
  new Int16Array(buffer, 4).set(pcm);
  return buffer;
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

```bash
npx vitest run src/services/speech/pcm.test.ts
```

Expected: PASS ทั้ง 8 เทสต์

- [ ] **Step 5: Commit**

```bash
git add src/services/speech/pcm.ts src/services/speech/pcm.test.ts
git commit -m "feat(speech): pure helpers converting mic audio into ASR frames"
```

---

## Task 7: ต่อไมค์เข้ากับ transport แล้วเลิกใช้ Web Speech

**Files:**
- Create: `public/pcm-worklet.js`, `src/services/speech/audioCapture.ts`
- Modify: `src/services/signaling/channel.ts`, `src/context/RoomSignalingContext.tsx`, `src/app/(app)/live/[id]/page.tsx:454-485`
- Delete: `src/services/speech/webSpeechProvider.ts`
- Test: `src/services/signaling/channel.test.ts` (เพิ่มเคสใหม่)

**Interfaces:**
- Consumes: `buildAudioFrame`, `downsampleTo16k`, `floatToPcm16`, `rms`, `SILENCE_RMS_THRESHOLD`, `CHUNK_SECONDS`, `OVERLAP_SECONDS`, `TARGET_RATE` จาก Task 6 · `RoomTransport` จาก `channel.ts`
- Produces:
  - `RoomTransport` เพิ่มเมธอด `sendAudio(frame: ArrayBuffer): void`
  - `export function startCapture(options: { sendAudio: (frame: ArrayBuffer) => void; startedAt: number }): Promise<() => void>` — คืนฟังก์ชันสำหรับหยุดจับเสียง
  - `export function isCaptureSupported(): boolean`

- [ ] **Step 1: เขียนเทสต์ของ sendAudio ที่ยังไม่ผ่าน**

ไฟล์เทสต์นี้ใช้ `FakeWebSocket` ที่ประกาศไว้ต้นไฟล์ และเข้าถึง socket ผ่าน `FakeWebSocket.instances[0]`
ซึ่งวันนี้เก็บของที่ส่งไว้ใน `sent: string[]` เท่านั้น ต้องขยายให้รับ binary ได้ก่อน

แก้ประกาศของ `FakeWebSocket` ในไฟล์ `src/services/signaling/channel.test.ts`:

```typescript
  sent: (string | ArrayBuffer)[] = [];
```

```typescript
  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }
```

แล้วเพิ่ม `describe` นี้ต่อท้ายไฟล์ ก่อนวงเล็บปิดของ `describe('openTransport', ...)`:

```typescript
  it('sends an audio frame immediately once the socket is open', () => {
    const transport = openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus: vi.fn() });
    FakeWebSocket.instances[0].simulateOpen();

    const frame = new ArrayBuffer(8);
    transport.sendAudio(frame);

    expect(FakeWebSocket.instances[0].sent).toContain(frame);
    transport.close();
  });

  it('drops audio frames while disconnected instead of queueing them', () => {
    const transport = openTransport('MT-2569-007', { onMessage: vi.fn(), onStatus: vi.fn() });

    transport.sendAudio(new ArrayBuffer(8));

    expect(FakeWebSocket.instances[0].sent).toHaveLength(0);

    // ต่อได้แล้วก็ยังต้องไม่มีเสียงเก่าหลุดออกไป — ต่างจาก send() ที่ flush คิวตอน open
    FakeWebSocket.instances[0].simulateOpen();
    expect(FakeWebSocket.instances[0].sent).toHaveLength(0);

    transport.close();
  });
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

```bash
npx vitest run src/services/signaling/channel.test.ts
```

Expected: FAIL ด้วย `transport.sendAudio is not a function`

- [ ] **Step 3: เพิ่ม sendAudio ใน channel.ts**

แก้ type `RoomTransport` ใน `src/services/signaling/channel.ts`:

```typescript
export type RoomTransport = {
  send: (type: SignalType, payload: unknown) => void;
  sendAudio: (frame: ArrayBuffer) => void;
  close: () => void;
};
```

และเพิ่มเมธอดนี้เข้าไปในอ็อบเจกต์ที่ `openTransport` คืนออกมา คู่กับ `send` เดิม:

```typescript
    // ก้อนเสียงไม่เข้าคิวและไม่ retry — เสียงที่ค้างไว้ตอนหลุดการเชื่อมต่อ พอกลับมาต่อได้ก็สายเกิน
    // จะเป็นคำบรรยายที่มีประโยชน์แล้ว หลักการเดียวกับ DISCARD_WHEN_OFFLINE ของ subtitle_text
    sendAudio: (frame: ArrayBuffer) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(frame);
    },
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

```bash
npx vitest run src/services/signaling/channel.test.ts
```

Expected: PASS ทุกเคสรวมสองเคสใหม่

- [ ] **Step 5: เขียน AudioWorkletProcessor**

สร้าง `public/pcm-worklet.js` (ต้องอยู่ใน `public/` เพราะ `audioWorklet.addModule()` โหลดผ่าน URL ไม่ใช่ผ่าน bundler):

```javascript
// AudioWorkletProcessor — ส่งบล็อกเสียงดิบกลับไปที่ main thread
// ตรรกะการตัดก้อนและกรองเสียงเงียบอยู่ที่ audioCapture.ts เพื่อให้ทดสอบได้โดยไม่ต้องมี AudioContext
class PcmCollector extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      this.port.postMessage(new Float32Array(channel));
    }
    return true;
  }
}

registerProcessor('pcm-collector', PcmCollector);
```

- [ ] **Step 6: เขียน audioCapture.ts**

สร้าง `src/services/speech/audioCapture.ts`:

```typescript
// src/services/speech/audioCapture.ts
//
// จับเสียงไมค์ของผู้ใช้คนนี้คนเดียว แล้วส่งเป็นก้อนไปให้ server ถอด
// ผู้พูดถูกระบุจาก JWT ที่ผูกกับ WebSocket อยู่แล้ว ไฟล์นี้จึงไม่ต้องรู้ว่าใครเป็นใคร

import {
  buildAudioFrame,
  downsampleTo16k,
  floatToPcm16,
  rms,
  CHUNK_SECONDS,
  OVERLAP_SECONDS,
  SILENCE_RMS_THRESHOLD,
  TARGET_RATE,
} from "./pcm";

export function isCaptureSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.AudioContext !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export async function startCapture(options: {
  sendAudio: (frame: ArrayBuffer) => void;
  startedAt: number;
}): Promise<() => void> {
  // ขอ stream ของตัวเองแยกจากไมค์ที่ ZegoCloud ใช้ ไม่แย่ง track กัน
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const context = new AudioContext();
  await context.audioWorklet.addModule("/pcm-worklet.js");

  const source = context.createMediaStreamSource(stream);
  const collector = new AudioWorkletNode(context, "pcm-collector");

  const chunkSamples = CHUNK_SECONDS * TARGET_RATE;
  const keepSamples = Math.floor(OVERLAP_SECONDS * TARGET_RATE);
  let buffer = new Float32Array(0);
  let chunkStartMs = Date.now() - options.startedAt;

  collector.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const downsampled = downsampleTo16k(event.data, context.sampleRate);
    const merged = new Float32Array(buffer.length + downsampled.length);
    merged.set(buffer);
    merged.set(downsampled, buffer.length);
    buffer = merged;

    while (buffer.length >= chunkSamples) {
      const chunk = buffer.subarray(0, chunkSamples);

      // เงียบก็ไม่ต้องส่ง ลดงานของ sidecar และไม่ให้ transcript มีบรรทัดว่าง
      if (rms(chunk) >= SILENCE_RMS_THRESHOLD) {
        options.sendAudio(buildAudioFrame(floatToPcm16(chunk), chunkStartMs));
      }

      // เก็บท้ายก้อนไว้ทับซ้อนกับก้อนถัดไป กันคำขาดตรงรอยต่อ
      // ข้อความที่ซ้ำจากช่วงนี้ถูกตัดที่ฝั่ง server (backend/src/realtime/audio.ts)
      buffer = buffer.slice(chunkSamples - keepSamples);
      chunkStartMs += (CHUNK_SECONDS - OVERLAP_SECONDS) * 1000;
    }
  };

  source.connect(collector);

  return () => {
    collector.port.onmessage = null;
    collector.disconnect();
    source.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
  };
}
```

- [ ] **Step 7: ส่ง sendAudio ผ่าน context**

ใน `src/context/RoomSignalingContext.tsx` เปิดเผย `sendAudio` ของ transport ออกไปให้ผู้ใช้ context เรียกได้ ด้วยรูปแบบเดียวกับที่ไฟล์นั้นเปิดเผย `send` อยู่แล้ว (ทั้งใน type ของ context value และในค่าที่ provider ส่งออก)

- [ ] **Step 8: เปลี่ยนหน้าห้องประชุมมาใช้ audioCapture**

ใน `src/app/(app)/live/[id]/page.tsx` แทนที่ `handleToggleSubtitle` ทั้งฟังก์ชันด้วย:

```typescript
  const stopCaptureRef = useRef<(() => void) | null>(null);

  const handleToggleSubtitle = async () => {
    if (subtitleOn) {
      stopCaptureRef.current?.();
      stopCaptureRef.current = null;
      setSubtitleOn(false);
      return;
    }

    if (!isCaptureSupported()) {
      toast.error("เบราว์เซอร์นี้ไม่รองรับการจับเสียงไมค์สำหรับคำบรรยาย");
      return;
    }

    try {
      stopCaptureRef.current = await startCapture({
        sendAudio: (frame) => sendAudioRef.current?.(frame),
        startedAt: meetingStartRef.current,
      });
      setSubtitleOn(true);
    } catch {
      toast.error("เปิดไมค์ไม่สำเร็จ กรุณาอนุญาตการใช้ไมโครโฟนในเบราว์เซอร์");
    }
  };
```

เปลี่ยน import ที่หัวไฟล์จาก `webSpeechProvider` เป็น:

```typescript
import { isCaptureSupported, startCapture } from "@/services/speech/audioCapture";
```

`sendAudioRef` ผูกกับ `sendAudio` ที่ได้จาก context ด้วยรูปแบบเดียวกับ `broadcastRef` ที่ไฟล์นี้ใช้อยู่แล้ว

ลบการเรียก `webSpeechProvider.stop()` ทั้งสองจุด (บรรทัด 278 และ 456 เดิม) แล้วเปลี่ยนเป็น `stopCaptureRef.current?.()` และ **ลบการเซ็ต `setLatestSubtitle(signal)` ของผู้พูดเอง** เพราะ server ส่งคำบรรยายกลับมาให้ผู้พูดแล้ว ถ้ายังเซ็ตเองจะเห็นข้อความซ้ำสองรอบ

- [ ] **Step 9: ลบ webSpeechProvider**

```bash
git rm src/services/speech/webSpeechProvider.ts
grep -rn "webSpeechProvider" src/ || echo "ไม่มีการอ้างถึงเหลืออยู่"
```

Expected: `ไม่มีการอ้างถึงเหลืออยู่`

- [ ] **Step 10: รันเทสต์ frontend ทั้งชุดและ build**

```bash
npm test
npm run build
```

Expected: PASS ทุก suite และ build สำเร็จ

- [ ] **Step 11: Commit**

```bash
git add public/pcm-worklet.js src/services/speech/audioCapture.ts src/services/signaling/channel.ts src/services/signaling/channel.test.ts src/context/RoomSignalingContext.tsx "src/app/(app)/live/[id]/page.tsx"
git commit -m "feat(speech): capture mic audio for server-side transcription, drop Web Speech"
```

---

## Task 8: ทดสอบสองเครื่องจริงและปรับเอกสาร

**Files:**
- Create: `docs/superpowers/plans/2026-08-24-asr-acceptance-script.md`
- Modify: `PROJECT_STATUS.md`, `README.md`
- Test: manual — ทดสอบข้ามเครื่องจริง เทสต์อัตโนมัติเข้าไม่ถึงเรื่องไมค์จริงกับเบราว์เซอร์จริง

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 1 ถึง 7
- Produces: สคริปต์ทดสอบที่ทำซ้ำได้ พร้อมผลที่บันทึกไว้

- [ ] **Step 1: ยก stack ขึ้นมาทั้งชุด**

```bash
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml exec backend node dist/database/migrations.js
curl -s http://localhost/health
```

Expected: `{"status":"ok","timestamp":"..."}`

- [ ] **Step 2: เขียนสคริปต์ทดสอบ**

สร้าง `docs/superpowers/plans/2026-08-24-asr-acceptance-script.md`:

```markdown
# ASR Acceptance Script

ทดสอบบนสองเครื่องที่ต่างกัน หรือหนึ่งเครื่องกับโทรศัพท์ในเครือข่ายเดียวกัน
เครื่อง A ล็อกอิน `malee.r@e-office.cloud` เครื่อง B ล็อกอิน `somchai.j@e-office.cloud`
ห้องประชุม `MT-2569-010`

**เครื่อง B ต้องใช้ Safari หรือ Firefox** ซึ่งไม่มี Web Speech API — ทั้งหมดนี้คือเหตุผลของงานรอบนี้

| # | ทำที่ A | ต้องเห็นที่ B | ผ่าน |
|---|---|---|---|
| 1 | เปิดคำบรรยาย แล้วพูด "วาระที่หนึ่ง เรื่องที่ประธานแจ้งให้ทราบ" | ข้อความไทยขึ้นภายใน 5 วินาที พร้อมชื่อผู้พูดถูกคน | ☐ |
| 2 | เงียบ 30 วินาที | ไม่มีบรรทัดว่างหรือข้อความขยะเพิ่มขึ้น | ☐ |
| 3 | — | เปิดคำบรรยายที่ B แล้วพูด | A เห็นข้อความพร้อมชื่อของ B | ☐ |
| 4 | ดูหน้าจอ A ตอน A เป็นคนพูดเอง | A เห็นคำบรรยายของตัวเอง และเห็นรอบเดียวไม่ซ้ำสอง | ☐ |
| 5 | พูดยาวต่อเนื่อง 30 วินาทีไม่หยุด | ข้อความต่อกันไม่มีคำซ้ำตรงรอยต่อทุก 3 วินาที | ☐ |
| 6 | โหลดหน้า B ใหม่ | ข้อความที่ผ่านมาทั้งหมดยังอยู่ครบ | ☐ |
| 7 | หยุด container `asr` แล้วพูด | ขึ้นข้อความแจ้งข้อผิดพลาดภาษาไทย ห้องไม่หลุด คนอื่นยังโหวตและยกมือได้ | ☐ |
| 8 | เปิด container `asr` กลับมาแล้วพูด | คำบรรยายกลับมาทำงานเองโดยไม่ต้องโหลดหน้าใหม่ | ☐ |
| 9 | เปิด DevTools ที่ B แล้วส่ง binary frame ปลอมที่อ้างว่าเป็นของ A | ข้อความถูกบันทึกเป็นของ B ไม่ใช่ของ A | ☐ |

บันทึกวันที่ เบราว์เซอร์ที่ใช้ทั้งสองตัว และแถวที่ไม่ผ่าน

## Findings

(เติมผลจริงตรงนี้ แถวที่ไม่ผ่านให้ระบุหมายเลขแถว สิ่งที่เกิดขึ้น และไฟล์ที่สงสัย)
```

- [ ] **Step 3: รันสคริปต์แล้วบันทึกผล**

ทำครบทั้ง 9 แถว แถวที่ไม่ผ่านให้เขียนลงหัวข้อ `## Findings` ในไฟล์เดียวกัน

- [ ] **Step 4: แก้สิ่งที่สคริปต์เจอ**

แถวที่ไม่ผ่านคือข้อบกพร่องของ Task 5 ถึง 7 แก้ในไฟล์ของ task นั้น เพิ่มเทสต์ที่ระดับที่มันพัง (เทสต์ backend หรือเทสต์ frontend) แล้วรันแถวนั้นซ้ำ

- [ ] **Step 5: วัด CER กับเสียงประชุมจริง**

อัดเสียงประชุมจริง 3 ถึง 5 คลิป คลิปละ 2 ถึง 3 นาที ให้มีทั้งเสียงชัด เสียงมีสัญญาณรบกวน และคนพูดทับกัน แล้ววัดด้วยวิธีเดียวกับในสเปก บันทึกผลลงหัวข้อ `## Findings`

ผลนี้คือตัวตัดสินว่าต้องทำ context biasing ต่อหรือไม่ ไม่ใช่การตัดสินว่างานรอบนี้ผ่านหรือไม่ผ่าน

- [ ] **Step 6: แก้ข้อความที่ล้าสมัยในเอกสาร**

ใน `PROJECT_STATUS.md` แก้บรรทัดที่ระบุว่าซับไตเติลมาจาก Web Speech API ให้เป็นการถอดเสียงฝั่ง server ด้วย Typhoon ASR ที่รัน self-host และระบุว่าใช้ได้ทุกเบราว์เซอร์ที่รองรับ AudioWorklet ไม่ใช่เฉพาะ Chrome

ใน `README.md` แก้ข้อความเดียวกันทุกจุดที่กล่าวถึง Web Speech API และเพิ่มว่าเสียงประชุมไม่ออกนอกองค์กร

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/plans/2026-08-24-asr-acceptance-script.md PROJECT_STATUS.md README.md
git commit -m "docs: ASR acceptance script with results, refresh stale subtitle claims"
```

---

## Self-Review

**Spec coverage**

| ข้อกำหนดในสเปก | Task ที่ทำ |
|---|---|
| sidecar Python + FastAPI + typhoon-asr | Task 1 |
| อิมเมจ sidecar และ service ใน compose พร้อม `ASR_URL` | Task 2 |
| `asrClient.ts` เรียก sidecar | Task 3 |
| header 4 ไบต์เก็บ offset มิลลิวินาที | Task 4 (แกะ), Task 6 (ประกอบ) |
| ตัดข้อความซ้ำจากช่วงทับซ้อนไม่เกิน 30 ตัวอักษร | Task 4 |
| ผู้พูดได้รับคำบรรยายของตัวเองกลับมา | Task 5 (server ส่งให้ทุกคน), Task 7 Step 8 (client เลิกเซ็ตเอง) |
| ทิ้งก้อนเก่าเมื่อก้อนใหม่มาถึงก่อนถอดเสร็จ | Task 5 |
| `signal_error` เมื่อ sidecar ล่ม ไม่ broadcast | Task 5 |
| ปฏิเสธเฟรมที่แกะไม่ได้ | Task 4, Task 5 |
| RMS gate ค่าเริ่มต้น 0.01 แก้ได้จากที่เดียว | Task 6 (`SILENCE_RMS_THRESHOLD`) |
| ก้อน 3 วินาที ทับซ้อน 0.5 วินาที | Task 6 (ค่าคงที่), Task 7 (การตัดก้อน) |
| `sendAudio` ไม่เข้าคิว ไม่ retry | Task 7 |
| ลบ `webSpeechProvider.ts` | Task 7 Step 9 |
| ข้อความแจ้งผู้ใช้เป็นภาษาไทยเมื่อไม่รองรับหรือไม่ได้สิทธิ์ไมค์ | Task 7 Step 8 |
| ทดสอบข้ามเครื่องและวัด CER กับเสียงจริง | Task 8 |
| แก้เอกสารที่อ้าง Web Speech | Task 8 Step 6 |

| ปฏิเสธเฟรมที่ใหญ่เกิน 200 KB | Task 5 Step 4 (`maxPayload` ของ `WebSocketServer` — กันก่อนโหลดเข้าหน่วยความจำ ตรงจุดกว่าตรวจในโค้ดเราเอง) |

**Type consistency** — ชื่อที่ข้าม task ตรวจแล้วตรงกันทุกตัว: `transcribePcm` (Task 3 สร้าง, Task 5 ใช้), `parseAudioFrame` และ `stripOverlap` (Task 4 สร้าง, Task 5 ใช้), `handleAudioFrame` และ `resetAudioState` (Task 5 สร้าง, `server.ts` และเทสต์ใช้), `buildAudioFrame` พร้อม `SILENCE_RMS_THRESHOLD` `CHUNK_SECONDS` `OVERLAP_SECONDS` `TARGET_RATE` (Task 6 สร้าง, Task 7 ใช้), `sendAudio` (Task 7 เพิ่มใน `RoomTransport` และใช้ในหน้าห้อง)

รูปแบบ frame เป็น uint32 little-endian หน่วยมิลลิวินาทีเหมือนกันทั้งฝั่งเขียน (Task 6) และฝั่งอ่าน (Task 4)
