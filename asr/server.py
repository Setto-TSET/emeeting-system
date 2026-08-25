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
