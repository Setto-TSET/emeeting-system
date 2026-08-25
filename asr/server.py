"""ASR sidecar — ถอดเสียงไทยด้วย Typhoon ASR แบบ self-host

รับ PCM ดิบเพื่อตัดขั้นตอน decode ทิ้งทั้งชั้น เบราว์เซอร์ส่ง PCM 16 kHz mono มาแล้ว
ไม่ต้องมี ffmpeg ในอิมเมจนี้
"""

import os
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


@asynccontextmanager
async def lifespan(_app: FastAPI):
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
