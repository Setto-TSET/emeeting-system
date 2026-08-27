# Deploy จริง — Render (backend) + Aiven (MySQL) + Vercel (frontend)

ทั้งหมดใช้ free tier ไม่ต้องผูกบัตร

| ส่วน | ที่อยู่ | ค่าใช้จ่าย |
|---|---|---|
| frontend (Next.js) | Vercel | ฟรี |
| backend (Express + WebSocket) | Render — Docker จาก `backend/Dockerfile` | ฟรี |
| MySQL 8 | Aiven free | ฟรี |

## ข้อจำกัดของ free tier ที่ต้องรู้ก่อน

- **Render free จะ sleep เมื่อไม่มี request 15 นาที** ตื่นครั้งแรกใช้เวลา ~50 วินาที
  ก่อนประชุมจริงให้เปิดหน้าเว็บทิ้งไว้สักครู่เพื่อปลุกเซิร์ฟเวอร์ก่อน
  ระหว่าง sleep **WebSocket ที่ต่อค้างไว้จะหลุด** — แต่ถ้ามีคนอยู่ในห้องประชุมก็ไม่ sleep
- **รันได้อินสแตนซ์เดียว** — ห้อง realtime เก็บใน memory (`backend/src/realtime/rooms.ts`)
  `render.yaml` ตั้ง `numInstances: 1` ไว้แล้ว **ห้ามเพิ่ม** จนกว่าจะย้าย fan-out ไป Redis
- **Aiven free ไม่มี backup อัตโนมัติ** — ข้อมูลสำคัญต้อง dump เอง (ดูหัวข้อสุดท้าย)
- ไฟล์เอกสารเก็บเป็น BLOB ใน MySQL — โควตา Aiven free จะเต็มเร็วถ้าอัปโหลดไฟล์ใหญ่บ่อย

---

## 1. MySQL บน Aiven

1. สมัคร https://aiven.io → Create service → **MySQL** → plan **Free** → region ใกล้ไทยที่สุด
2. รอสถานะขึ้น **Running** แล้วคัดลอก **Service URI** หน้าตาประมาณ
   ```
   mysql://avnadmin:PASSWORD@mysql-xxxx.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED
   ```
3. แปลงให้ mysql2 อ่านได้ — **ตัด `?ssl-mode=REQUIRED` ออก** แล้วต่อท้ายด้วย
   ```
   ?ssl={"rejectUnauthorized":false}
   ```
   เก็บค่านี้ไว้ นี่คือ `DATABASE_URL`

   > `rejectUnauthorized:false` = ไม่ตรวจใบรับรองของ Aiven ใช้ได้เพราะเชื่อมต่อตรงกับ host
   > ที่ Aiven กำหนดเท่านั้น ถ้าต้องการเข้มกว่านี้ ดาวน์โหลด CA จากหน้า Aiven แล้วใช้
   > `?ssl={"ca":"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}` แทน

4. **สร้างตารางและผู้ใช้ตั้งต้น จากเครื่องตัวเอง** (อิมเมจบน Render ไม่มี seed script)

   PowerShell:
   ```powershell
   cd backend
   $env:DATABASE_URL='mysql://avnadmin:PASSWORD@host:12345/defaultdb?ssl={"rejectUnauthorized":false}'
   npm run migrate
   $env:SEED_PASSWORD='รหัสผ่านที่จะใช้ล็อกอินจริง'
   npm run seed
   ```

   `SEED_PASSWORD` คือรหัสผ่านของบัญชีทดสอบทุกคน (มาลี สมชาย ฯลฯ) — **ตั้งให้ต่างจาก dev**
   ทุกคนที่รู้รหัสนี้เข้าได้ทุกบัญชี

## 2. backend บน Render

1. สมัคร https://render.com ด้วยบัญชี GitHub แล้วให้สิทธิ์เข้าถึง repo `Setto-TSET/emeeting-system`
2. **New → Blueprint** → เลือก repo → Render อ่าน `render.yaml` ที่รากอัตโนมัติ
3. Render จะถามค่าที่ตั้ง `sync: false` ไว้ กรอกตอนนี้:

   | ตัวแปร | ค่า |
   |---|---|
   | `DATABASE_URL` | Service URI ที่แปลงแล้วจากข้อ 1 |
   | `CORS_ORIGIN` | โดเมน Vercel เช่น `https://emeeting-system.vercel.app` (ยังไม่รู้ ใส่ทีหลังได้) |
   | `CLAUDE_API_KEY` | เว้นว่างได้ ถ้าไม่ใช้ฟีเจอร์สรุปด้วย AI |

   `JWT_SECRET` ไม่ต้องกรอก — `render.yaml` สั่งให้ Render สุ่มให้เอง
4. กด Apply แล้วรอ build (~3-5 นาทีครั้งแรก) จดโดเมนที่ได้ เช่น `emeeting-backend.onrender.com`
5. ตรวจว่ารันจริง:
   ```bash
   curl https://emeeting-backend.onrender.com/health
   ```
   ต้องได้ `{"status":"ok","timestamp":"..."}`

## 3. frontend บน Vercel

1. https://vercel.com → Add New Project → import repo เดียวกัน (framework ตรวจเจอ Next.js เอง)
2. ตั้ง Environment Variables ทั้ง **Production และ Preview**:

   | ตัวแปร | ค่า |
   |---|---|
   | `NEXT_PUBLIC_API_BASE_URL` | `https://emeeting-backend.onrender.com` |
   | `NEXT_PUBLIC_WS_URL` | `wss://emeeting-backend.onrender.com/ws` |
   | `ZEGO_APP_ID` | AppID จาก ZegoCloud Console |
   | `ZEGO_SERVER_SECRET` | ServerSecret จาก ZegoCloud Console |
   | `ZEGO_SERVER_URL` | `wss://webliveroom<AppID>-api-bak.coolzcloud.com/ws` |

   > `ZEGO_SERVER_SECRET` **ห้ามมี** `NEXT_PUBLIC_` นำหน้า — ตัวแปรที่ขึ้นต้นแบบนั้นถูกฝังลง
   > JavaScript ที่ส่งให้เบราว์เซอร์ ใครเปิด DevTools ก็เห็น แล้วออก token เข้าห้องประชุมไหนก็ได้

3. Deploy แล้วจดโดเมนจริง
4. **กลับไปแก้ `CORS_ORIGIN` บน Render ให้เป็นโดเมน Vercel นั้น** แล้วรอ redeploy
   ข้ามขั้นนี้ = เบราว์เซอร์บล็อกทุก request ด้วย CORS หน้าเว็บจะว่างเปล่าทั้งที่ backend ปกติ

## 4. ตรวจว่าใช้ได้จริง

1. เปิดโดเมน Vercel → login ด้วยบัญชีที่ seed ไว้ (เช่น `malee.r@e-office.cloud` + `SEED_PASSWORD`)
2. สร้างการประชุมใหม่ → เปิดอีกเบราว์เซอร์ล็อกอินเป็นผู้เข้าร่วมอีกคน → ต้องเห็นการประชุมเดียวกัน
3. เข้าห้อง live → เปิดโหวตจากเครื่องหนึ่ง อีกเครื่องต้องเห็นทันที (นี่คือการพิสูจน์ว่า WebSocket ผ่าน)
4. จองห้องประชุมจากเครื่องหนึ่ง อีกเครื่องต้องเห็นห้องนั้นไม่ว่างแล้ว
5. อัปโหลดเอกสารในการประชุม → อีกคนต้องเปิดไฟล์เดียวกันได้

## 5. อัปเดตหลังจากนี้

`autoDeploy: true` — push เข้า branch หลักแล้ว Render กับ Vercel build ใหม่ให้เอง
ถ้าแก้ `schema.sql` ต้องรัน migrate เองอีกรอบจากเครื่องตัวเอง (ชี้ `DATABASE_URL` ไป Aiven)
migrations เป็น idempotent รันซ้ำได้ปลอดภัย

## 6. สำรองข้อมูล

Aiven free ไม่มี backup ให้ — ก่อนประชุมสำคัญให้ dump เก็บไว้เอง:

```bash
mysqldump --ssl-mode=REQUIRED -h mysql-xxxx.aivencloud.com -P 12345 -u avnadmin -p defaultdb > backup.sql
```
