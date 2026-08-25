# e-Meeting System

ระบบบริหารการประชุมและจองห้องประชุม — Next.js 16 + React 19 + TypeScript. รายละเอียดสถานะ/ฟีเจอร์
ทั้งหมดดู [PROJECT_STATUS.md](PROJECT_STATUS.md)

## Local Development

```bash
npm install
cp .env.example .env.local   # ใส่ ZEGO_APP_ID / ZEGO_SERVER_SECRET / ZEGO_SERVER_URL จริง
npm run dev
# เปิด http://localhost:3000
```

ไม่มี .env.local (หรือค่าไม่ครบ) → วิดีโอห้องประชุมจะเชื่อมต่อไม่สำเร็จ (ไม่มี mock ให้ fallback แล้ว)
ส่วนการจองห้อง/จัดการประชุม/เอกสาร ยังใช้ mock data ในเบราว์เซอร์ (localStorage/IndexedDB) อยู่
— แต่โหวต, ยกมือ, ซับไตเติล, แชร์เอกสาร sync ข้ามเครื่องผ่าน backend จริงแล้ว (ต้องรัน backend
ตามด้านล่างก่อนถึงจะใช้ฟีเจอร์เหล่านี้ได้)

คำบรรยายสดถอดเสียงที่ server ด้วย Typhoon ASR ที่รัน self-host (`asr/`) เบราว์เซอร์ส่ง PCM 16 kHz
ผ่าน WebSocket เส้นเดิม จึงใช้ได้ทุกเบราว์เซอร์ที่รองรับ AudioWorklet ไม่ใช่เฉพาะ Chrome และ
**เสียงประชุมไม่ออกนอกองค์กร** ต่างจาก Web Speech API เดิมที่ส่งเสียงไปประมวลผลที่ Google

## สองระบบ, สอง deploy target

ระบบนี้แยกเป็นสองส่วนที่ deploy คนละที่กัน:

1. **Frontend (Next.js)** — deploy บน Vercel (serverless, ไม่รองรับ WebSocket ค้างสาย)
2. **Backend (`backend/`)** — Express + MySQL + WebSocket realtime server, deploy บน host ที่รัน
   process ค้างได้ตลอดเวลา (Vercel serverless function ใช้ไม่ได้กับ WebSocket)

ต้อง deploy backend ก่อน แล้วเอา URL มาตั้งเป็น env var ฝั่ง frontend

### Frontend env vars ที่ต้องตั้งเพิ่ม (นอกจาก ZEGO_*)

| Variable | ค่าตัวอย่าง | ใช้ทำอะไร |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.example.com` | REST calls (login, room snapshot ฯลฯ) — default `http://localhost:3001` ตอน dev |
| `NEXT_PUBLIC_WS_URL` | `wss://api.example.com/ws` | WebSocket signaling — default `ws://localhost:3001/ws` ตอน dev |

## รัน backend ในเครื่อง (จำเป็นสำหรับโหวต/ยกมือ/ซับไตเติล/แชร์เอกสาร)

```bash
cd backend
npm install
cp .env.example .env          # ใส่ DB_HOST/DB_USER/DB_PASSWORD/DB_NAME, JWT_SECRET
npm run migrate               # สร้างตาราง
SEED_PASSWORD=<รหัสทดสอบ> npm run seed   # ใส่ผู้ใช้/ห้องประชุมทดสอบ, ทุกคนใช้รหัสเดียวกัน
npm run dev                   # http://localhost:3001
```

ดูรายละเอียด endpoint/schema เต็มที่ `backend/README.md`

## รัน ASR sidecar (จำเป็นสำหรับคำบรรยายสด)

```bash
cd asr
python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt   # Python 3.13
.venv/Scripts/python -m uvicorn server:app --port 8000
```

แล้วตั้ง `ASR_URL=http://localhost:8000` ใน `backend/.env` ถ้ารันทั้งชุดด้วย
`deploy/docker-compose.yml` service `asr` ขึ้นมาให้เองพร้อม weights ที่ฝังในอิมเมจแล้ว

## บัญชีทดสอบ

ล็อกอินจริงผ่านหน้า login ด้วยอีเมลด้านล่าง + รหัสผ่านที่ตั้งไว้ตอน `npm run seed`
(`SEED_PASSWORD`) — ไม่มีการข้ามการเช็ครหัสผ่านแล้ว:

| Role | Email |
|---|---|
| Admin | admin@e-office.cloud |
| ผู้บริหาร | prasert@e-office.cloud |
| เลขานุการ | malee.r@e-office.cloud |
| เจ้าหน้าที่ | somchai.j@e-office.cloud, wipha.s@e-office.cloud, decha@e-office.cloud |
| บุคคลภายนอก | expert@external.org |

## Deploy Frontend (Vercel)

1. Push branch นี้ขึ้น GitHub (ทำแล้วถ้าใช้ PR ที่มีอยู่)
2. เข้า [vercel.com](https://vercel.com) → Import Project → เลือก repo นี้
3. ตั้ง Environment Variables ใน Vercel Project Settings (**ห้ามใส่ในโค้ด**):
   - `ZEGO_APP_ID`, `ZEGO_SERVER_SECRET`, `ZEGO_SERVER_URL`
   - `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WS_URL` (ชี้ไป backend ที่ deploy ไว้แล้ว)
4. Deploy — Vercel รัน `npm run build` อัตโนมัติ, ได้ HTTPS ฟรี (จำเป็นสำหรับ getUserMedia/WebRTC)
5. ทดสอบ: เปิดลิงก์ที่ deploy ได้จากคนละเครื่อง/เบราว์เซอร์ → เข้าห้องประชุมเดียวกัน โหวต/ยกมือ/
   แชร์เอกสารต้องเห็นตรงกันทั้งสองเครื่อง ไม่ใช่แค่วิดีโอ

**ยังไม่ deploy จริง ณ ตอนนี้:** โค้ด backend เขียนและเทสครบแล้ว (auth, WebSocket realtime,
room snapshot) แต่ตัว host สำหรับรันจริงยังไม่ได้ตั้ง — งานที่เหลือคือเลือก host แล้วรัน
`npm run migrate` + `npm run seed` บนนั้น

**ข้อจำกัดที่ยังเหลืออยู่:** ข้อมูลประชุม/ผู้ใช้/การจองยังเป็น mock data ใน localStorage
ต่อเบราว์เซอร์ — สร้าง/แก้ไขการประชุมในหน้าเว็บจะยังไม่เห็นข้ามเครื่อง (เห็นแค่ identity +
รายชื่อผู้เข้าร่วมที่ seed เข้า MySQL ไว้) ย้าย meeting CRUD ขึ้น server เป็นแผนแยกต่างหาก
เอกสารที่แชร์ก็ sync แค่ "ไฟล์ไหน/หน้าไหน" — เนื้อไฟล์ยังอยู่ใน IndexedDB ต่อเครื่อง
