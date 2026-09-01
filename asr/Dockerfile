FROM python:3.13-slim

WORKDIR /app

# libsndfile คือ native lib ที่ soundfile ต้องใช้ ไม่มีใน image slim
RUN apt-get update && apt-get install -y --no-install-recommends libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./

# ลง torch จาก index ของ CPU ก่อน ไม่งั้น wheel ปกติจาก PyPI ลากไลบรารี CUDA ของ NVIDIA
# เข้ามาหลายกิกะไบต์ทั้งที่อิมเมจนี้รันบน CPU อย่างเดียว (ASR_DEVICE=cpu)
RUN pip install --no-cache-dir torch==2.13.0 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py ./

# แคชทั้งหมดต้องอยู่ใน /app ไม่ใช่ /root — Hugging Face Spaces รัน container ด้วย UID 1000
# weights ที่โหลดตอน build ในฐานะ root จะอ่านไม่ได้ตอนรัน แล้ว /transcribe จะพังทุกครั้ง
# ทั้งที่ /health ตอบปกติ (บน docker compose ที่รันเป็น root ตัวแปรพวกนี้ไม่เปลี่ยนอะไร)
ENV HF_HOME=/app/cache/huggingface \
    TORCH_HOME=/app/cache/torch \
    XDG_CACHE_HOME=/app/cache \
    NEMO_CACHE_DIR=/app/cache/nemo
RUN mkdir -p /app/cache

# โหลด weights ตอน build ไม่ใช่ตอน start — ไม่งั้น container แรกที่ขึ้นมาจะรอโหลดกลางอากาศ
# แล้วคำบรรยายของประชุมแรกหลัง deploy จะหายไปเงียบ ๆ
RUN python -c "import nemo.collections.asr as a; a.models.ASRModel.from_pretrained(model_name='scb10x/typhoon-asr-realtime', map_location='cpu')"

# หลังโหลด weights แล้วค่อยเปิดสิทธิ์ — ผู้ใช้ที่แพลตฟอร์มเลือกให้ตอนรันไม่ใช่ root
RUN chmod -R 777 /app/cache

ENV ASR_DEVICE=cpu
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
