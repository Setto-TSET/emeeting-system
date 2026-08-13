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
ส่วนอื่นของระบบ (จองห้อง, จัดการประชุม, เอกสาร) ใช้งานได้ปกติเพราะเป็น mock data ในเบราว์เซอร์
(localStorage/IndexedDB) ไม่ต้องมี backend/database

## บัญชีทดสอบ

กดเลือกจากปุ่ม "บัญชีทดสอบ" หน้า login ได้เลย (ไม่เช็ครหัสผ่าน):

| Role | Email |
|---|---|
| Admin | admin@e-office.cloud |
| ผู้บริหาร | prasert@e-office.cloud |
| เลขานุการ | malee.r@e-office.cloud |
| เจ้าหน้าที่ | somchai.j@e-office.cloud, wipha.s@e-office.cloud, decha@e-office.cloud |
| บุคคลภายนอก | expert@external.org |

## Deploy (Vercel)

1. Push branch นี้ขึ้น GitHub (ทำแล้วถ้าใช้ PR ที่มีอยู่)
2. เข้า [vercel.com](https://vercel.com) → Import Project → เลือก repo นี้
3. ตั้ง Environment Variables ใน Vercel Project Settings (**ห้ามใส่ในโค้ด**):
   - `ZEGO_APP_ID`
   - `ZEGO_SERVER_SECRET`
   - `ZEGO_SERVER_URL`
4. Deploy — Vercel รัน `npm run build` อัตโนมัติ, ได้ HTTPS ฟรี (จำเป็นสำหรับ getUserMedia/WebRTC)
5. ทดสอบ: เปิดลิงก์ที่ deploy ได้จากคนละเครื่อง/เบราว์เซอร์ → เข้าห้องประชุมทดสอบ ZegoCloud ดูว่า
   วิดีโอเชื่อมต่อข้ามเครื่องได้จริง

**ข้อจำกัดที่ควรรู้ก่อน deploy จริง:** ข้อมูลประชุม/ผู้ใช้/การจองเป็น mock data เก็บใน
localStorage **ต่อเบราว์เซอร์เท่านั้น** — คนละเครื่อง/คนละเบราว์เซอร์จะเห็นรายชื่อผู้เข้าร่วม,
โหวต, แชท คนละชุดกัน ไม่ sync ข้ามเครื่องจริง (มีแค่วิดีโอ ZegoCloud ที่ sync จริงเพราะเป็น cloud
service) ถ้าต้องการให้ข้อมูลอื่นๆ sync ข้ามเครื่องด้วย ต้องสร้าง backend + database จริง
(ดู `backend/README.md` — โครงไว้แล้วแต่ยังไม่ implement)

## Backend (แยกต่างหาก, ยังไม่ได้ deploy)

`backend/` เป็น Express API สำหรับ transcription + AI summarization เท่านั้น (video token ไม่ผ่าน
backend นี้แล้ว) ยัง Planned/Not Started — ดู `backend/README.md`
