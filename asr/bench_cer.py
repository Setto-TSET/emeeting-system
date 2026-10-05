"""เทียบ CER ของโมเดลถอดเสียงไทยหลายตัวบนชุดเสียงเดียวกัน

ข้อมูล: โฟลเดอร์ที่มี <ชื่อ>.wav คู่กับ <ชื่อ>.txt (ข้อความอ้างอิงที่ถอดด้วยมือ)
wav ต้องเป็น 16 kHz mono ถ้าไม่ใช่ให้แปลงก่อน: ffmpeg -i in.mp3 -ar 16000 -ac 1 out.wav

    python bench_cer.py tests/fixtures
    python bench_cer.py D:/meeting-audio --models typhoon thonburian

ถอดทั้งไฟล์ ไม่ได้จำลองการตัดก้อน 3 วินาทีแบบคำบรรยายสด ค่า CER ของ typhoon ตอนใช้งานสด
จะสูงกว่าตัวเลขที่นี่เล็กน้อย (ผลวัดเดิมใน docs: ทั้งไฟล์ 0.024 เทียบ 3 วินาที 0.044)
"""

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

from server import SAMPLE_RATE, _transcribe_samples, get_model
from tests.test_server import cer, norm

WHISPER_MODELS = {
    "thonburian": "biodatlab/whisper-th-large-v3-combined",
    "pathumma": "nectec/Pathumma-whisper-th-large-v3",
    "whisper": "openai/whisper-large-v3",
}
# ponytail: ตัดทุก 30 วินาทีแบบไม่สนรอยต่อ คำที่คร่อมรอยถูกนับผิดได้ 1-2 ตัวอักษรต่อรอย
# พอสำหรับเทียบโมเดลกันเอง ถ้าต้องตัวเลขเป๊ะค่อยตัดตามช่วงเงียบด้วย VAD
TYPHOON_WINDOW_SEC = 30


def typhoon(samples: np.ndarray) -> str:
    step = TYPHOON_WINDOW_SEC * SAMPLE_RATE
    return "".join(_transcribe_samples(samples[i : i + step]) for i in range(0, len(samples), step))


def whisper(model_id: str):
    from transformers import pipeline

    pipe = pipeline("automatic-speech-recognition", model=model_id, device="cpu", chunk_length_s=30)

    def run(samples: np.ndarray) -> str:
        out = pipe(
            {"raw": samples, "sampling_rate": SAMPLE_RATE},
            generate_kwargs={"language": "th", "task": "transcribe"},
        )
        return out["text"]

    return run


def load(path: Path) -> np.ndarray:
    audio, rate = sf.read(path, dtype="float32", always_2d=True)
    if rate != SAMPLE_RATE:
        sys.exit(f"{path.name}: {rate} Hz ต้องเป็น {SAMPLE_RATE} Hz (ffmpeg -ar 16000 -ac 1)")
    return audio.mean(axis=1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("data", type=Path)
    parser.add_argument("--models", nargs="+", default=["typhoon", *WHISPER_MODELS])
    args = parser.parse_args()

    pairs = [(w, w.with_suffix(".txt")) for w in sorted(args.data.glob("*.wav"))]
    pairs = [(w, t) for w, t in pairs if t.exists()]
    if not pairs:
        sys.exit(f"ไม่เจอคู่ .wav + .txt ใน {args.data}")
    clips = [(w.stem, load(w), t.read_text(encoding="utf-8")) for w, t in pairs]
    audio_sec = sum(len(s) for _, s, _ in clips) / SAMPLE_RATE
    print(f"{len(clips)} ไฟล์ รวม {audio_sec:.0f} วินาที\n")

    results = []
    for name in args.models:
        # โหลดโมเดลก่อนเริ่มจับเวลา ไม่งั้นความเร็วที่วัดได้คือความเร็วโหลด weights ไม่ใช่ความเร็วถอด
        if name == "typhoon":
            get_model()
            run = typhoon
        else:
            run = whisper(WHISPER_MODELS[name])
        edits = chars = 0
        started = time.perf_counter()
        for stem, samples, ref in clips:
            hyp = run(samples)
            n = len(norm(ref))
            edits += cer(ref, hyp) * n
            chars += n
            print(f"[{name}] {stem}: CER {cer(ref, hyp):.4f}\n  ref: {ref.strip()}\n  hyp: {hyp.strip()}")
        took = time.perf_counter() - started
        # รวมเป็น edit ทั้งหมด / ตัวอักษรทั้งหมด ไม่ใช่เฉลี่ยรายไฟล์ ไฟล์สั้นจะได้ไม่ถ่วงผลเกินขนาดจริง
        results.append((name, edits / max(chars, 1), audio_sec / took))

    print(f"\n{'model':<12}{'CER':>8}{'speed (x realtime, CPU)':>26}")
    for name, score, speed in sorted(results, key=lambda r: r[1]):
        print(f"{name:<12}{score:>8.4f}{speed:>26.1f}")


if __name__ == "__main__":
    main()
