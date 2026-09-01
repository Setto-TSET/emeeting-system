# Deploy ASR sidecar ขึ้น Hugging Face Spaces

คำบรรยายสด (subtitle) ต้องมี ASR sidecar ทำงานอยู่ ถ้าไม่มี ระบบส่วนอื่นทำงานปกติทุกอย่าง
แต่กดปุ่มคำบรรยายแล้วจะได้ข้อความว่า "ถอดเสียงไม่สำเร็จ"

Render free tier รัน sidecar ไม่ไหว (โมเดลกิน RAM ราว 2 GB เกินโควตา 512 MB)
Spaces แบบ **CPU basic ฟรี** ให้ 2 vCPU / 16 GB RAM ซึ่งพอ

## ข้อจำกัดที่ต้องรู้ก่อน

- **Space ต้องเป็น public** — Space แบบ private ต้องแนบ token ของ Hugging Face ทุก request
  ซึ่ง backend ไม่ได้ทำ ความปลอดภัยจึงมาจาก `ASR_TOKEN` ของเราเอง ไม่ใช่จากการซ่อน URL
- **Space ฟรีจะหลับเมื่อไม่มีคนเรียกนาน ๆ** ตื่นครั้งแรกใช้เวลาหลายสิบวินาที
  ซึ่งนานกว่า timeout 10 วินาทีของ `asrClient.ts` — คำบรรยายช่วงต้นประชุมแรกจะยังไม่ขึ้น
  เปิด `https://<space>.hf.space/health` ทิ้งไว้ก่อนประชุมสัก 1 นาที
- **build นาน** เพราะต้องลง torch + NeMo แล้วโหลด weights ตอน build (รอบแรกอาจเกิน 20 นาที)
- เสียงประชุมจะวิ่งผ่านเซิร์ฟเวอร์ของ Hugging Face ถ้าองค์กรรับข้อนี้ไม่ได้
  ให้รัน sidecar ในเครือข่ายตัวเองแทน (`deploy/docker-compose.yml` มี service `asr` อยู่แล้ว)

---

## 1. สร้างความลับ

ต้องใช้ค่าเดียวกันทั้งสองฝั่ง สุ่มมาสักค่า:

```bash
openssl rand -base64 32
```

PowerShell:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
```

เก็บไว้ก่อน ขั้นตอนที่ 3 กับ 4 ใช้ค่านี้ทั้งคู่

## 2. สร้าง Space แล้วอัปโหลดโค้ด

1. เข้า https://huggingface.co/new-space
2. ตั้งชื่อ เช่น `emeeting-asr` → **SDK: Docker** → template **Blank** → **CPU basic (free)** → **Public**
3. Space คือ git repo ตัวหนึ่ง แต่ Dockerfile ต้องอยู่ที่ราก repo ส่วนของเราอยู่ในโฟลเดอร์ `asr/`
   จึงคัดลอกเนื้อในออกไป ไม่ push repo นี้ทั้งก้อน:

   ```bash
   git clone https://huggingface.co/spaces/<user>/emeeting-asr /tmp/emeeting-asr
   cp asr/Dockerfile asr/requirements.txt asr/server.py asr/README.md /tmp/emeeting-asr/
   cd /tmp/emeeting-asr && git add -A && git commit -m "deploy asr sidecar" && git push
   ```

   > `README.md` ต้องไปด้วย — ส่วนหัว YAML ในไฟล์นั้นบอก Spaces ว่าใช้ Docker และเปิดพอร์ต 8000
   > ถ้าไม่มี Spaces จะไปหาที่พอร์ต 7860 แล้วขึ้น build error

4. รอ build เสร็จ (ดู log ที่แท็บ **Logs** ของ Space)

## 3. ตั้งความลับให้ Space

ที่ Space → **Settings** → **Variables and secrets** → **New secret**

| ชื่อ | ค่า |
|---|---|
| `ASR_TOKEN` | ค่าที่สุ่มไว้ในขั้นตอนที่ 1 |

ใส่ที่ช่อง **Secrets** ไม่ใช่ **Variables** — Variables จะโผล่ในหน้า Space ให้คนอื่นเห็น

ตั้งเสร็จแล้ว Space จะ restart เอง ตรวจว่ามีผลจริง:

```bash
curl https://<user>-emeeting-asr.hf.space/health
```

ต้องได้ `{"status":"ok"}` และเมื่อลองยิงถอดเสียงโดยไม่ใส่ความลับ ต้องได้ **401**:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://<user>-emeeting-asr.hf.space/transcribe \
  -H "Content-Type: application/octet-stream" --data-binary "AAAA"
```

ได้ `200` แปลว่าความลับยังไม่มีผล อย่าไปต่อจนกว่าจะได้ `401`

## 4. ชี้ backend มาที่ Space

ที่ Render → service `emeeting-backend` → **Environment**

| ตัวแปร | ค่า |
|---|---|
| `ASR_URL` | `https://<user>-emeeting-asr.hf.space` (ไม่ต้องมี `/` ปิดท้าย) |
| `ASR_TOKEN` | ค่าเดียวกับขั้นตอนที่ 1 |

Save แล้ว Render จะ deploy ใหม่เอง

## 5. ตรวจว่าใช้ได้จริง

เข้าห้องประชุมสองเบราว์เซอร์ กดปุ่มคำบรรยาย อนุญาตไมค์ แล้วพูดภาษาไทย
ข้อความควรขึ้นที่แถบล่างของทั้งสองเครื่องภายในราว 3 วินาที

ถ้าขึ้น "ถอดเสียงไม่สำเร็จ" ให้ไล่ตามลำดับนี้:

| อาการ | สาเหตุที่พบบ่อย |
|---|---|
| `/health` ไม่ตอบ | Space หลับหรือ build ไม่ผ่าน — ดู Logs ของ Space |
| `/health` ตอบ แต่ยังไม่ได้คำบรรยาย | `ASR_URL` พิมพ์ผิด หรือมี `/` ปิดท้าย |
| ยิงเองด้วยความลับได้ แต่ในระบบไม่ได้ | `ASR_TOKEN` สองฝั่งไม่ตรงกัน |
| ครั้งแรกไม่ขึ้น ครั้งต่อไปขึ้น | Space เพิ่งตื่น เกิน timeout 10 วินาที — ปลุกก่อนประชุม |
