"""ASR sidecar — ถอดเสียงไทยด้วย Typhoon ASR แบบ self-host

รับ PCM ดิบเพื่อตัดขั้นตอน decode ทิ้งทั้งชั้น เบราว์เซอร์ส่ง PCM 16 kHz mono มาแล้ว
ไม่ต้องมี ffmpeg ในอิมเมจนี้
"""

import os
import secrets
import tempfile
from contextlib import asynccontextmanager

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

SAMPLE_RATE = 16000
MODEL_NAME = os.environ.get("ASR_MODEL", "scb10x/typhoon-asr-realtime")
DEVICE = os.environ.get("ASR_DEVICE", "cpu")

_model = None


def _asr_token() -> str:
    # อ่านทุกครั้งแทนอ่านครั้งเดียวตอน import — เทสต์ตั้งค่านี้ต่อเคสได้โดยไม่ต้องโหลดโมดูลใหม่
    return os.environ.get("ASR_TOKEN", "")


def require_token(request: Request) -> None:
    """sidecar นี้ไม่มีระบบผู้ใช้ ใครยิงถึงก็สั่งถอดเสียงได้

    เปิดออกอินเทอร์เน็ตโดยไม่ตั้ง ASR_TOKEN แปลว่าคนนอกใช้ CPU ของเราได้ฟรี
    และคิวของ sidecar ตัวเดียวจะบวมจนคำบรรยายของห้องประชุมจริงหยุดทำงาน
    ปล่อยผ่านเมื่อไม่ตั้งค่า เพื่อให้ docker compose ในเครือข่ายปิดใช้ได้โดยไม่ต้องตั้งอะไรเพิ่ม
    """
    expected = _asr_token()
    if not expected:
        return

    scheme, _, value = request.headers.get("authorization", "").partition(" ")
    # compare_digest ไม่ใช่การกันเดา แต่กันการวัดเวลาตอบเพื่อไล่เดาความลับทีละตัวอักษร
    if scheme.lower() != "bearer" or not secrets.compare_digest(value, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not _asr_token():
        # ไม่ยอมสตาร์ตไม่ได้ เพราะ compose ที่รันในเครือข่ายปิดก็ไม่ได้ตั้งค่านี้เหมือนกัน
        print("[asr] WARNING: ไม่ได้ตั้ง ASR_TOKEN — ห้ามเปิด service นี้ออกอินเทอร์เน็ต", flush=True)

    # โหลดโมเดลตั้งแต่ตอนสตาร์ต ไม่ปล่อยให้ request แรกเป็นคนจ่ายค่าโหลดสามวินาที
    # (คำบรรยายประโยคแรกของประชุมแรกหลัง deploy จะหายไปเงียบ ๆ ถ้ารอโหลดตอนนั้น)
    await run_in_threadpool(get_model)
    yield


app = FastAPI(lifespan=lifespan)


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
    require_token(request)

    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=400, detail="empty body")
    if len(raw) % 2 != 0:
        raise HTTPException(status_code=400, detail="pcm16 requires an even number of bytes")

    samples = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0

    # ถอดเสียงเป็นงาน CPU ล้วนและกินเวลาราว 200 มิลลิวินาทีต่อก้อน ถ้ารันบน event loop ตรง ๆ
    # ทั้งกระบวนการจะหยุดรอ รวมถึง /health ที่ตัวตรวจสุขภาพเรียก โยนเข้า threadpool แทน
    text = await run_in_threadpool(_transcribe_samples, samples)
    return {"text": text}


def _transcribe_samples(samples: np.ndarray) -> str:
    # NeMo รับ path ของไฟล์ ไม่รับ array โดยตรงในเวอร์ชันนี้ จึงเขียนไฟล์ชั่วคราวแล้วลบทิ้ง
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        path = tmp.name
    try:
        sf.write(path, samples, SAMPLE_RATE)
        hypotheses = get_model().transcribe(audio=[path])
        first = hypotheses[0]
        return first.text if hasattr(first, "text") else str(first)
    finally:
        os.unlink(path)
