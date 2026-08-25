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
