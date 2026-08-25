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
