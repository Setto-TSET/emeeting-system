# Deploy backend ขึ้น Koyeb (สำหรับทดสอบ)

ใช้ Koyeb build จาก `backend/Dockerfile` บน GitHub โดยตรง — ไม่ใช้ docker compose stack ใน `deploy/`
(ตัว compose stack ยังใช้กับ VM จริงได้เหมือนเดิม ดู `README.md` และ `docker-compose.yml`)

Koyeb ให้ TLS + โดเมน `*.koyeb.app` มาเอง จึง **ไม่ต้องใช้ Caddy** และ **ไม่ต้องมีโดเมนของตัวเอง**
WebSocket ใช้ผ่าน route เดียวกับ REST ได้เลย (`wss://<app>.koyeb.app/ws`)

## ข้อจำกัดที่ต้องรู้ก่อน

- Koyeb **ไม่มี managed MySQL** (มีแต่ Serverless Postgres) → ต้องใช้ MySQL ภายนอก ที่นี่ใช้ **Aiven free MySQL**
- Koyeb **ไม่มี free tier สำหรับ compute** แล้ว — instance `nano` คิดเงินตามชั่วโมงที่รัน ปิด service เมื่อเลิกทดสอบ
- รันได้ **1 instance เท่านั้น** — room registry ของ realtime เก็บใน memory (`backend/src/realtime/rooms.ts`)
  สคริปต์ตั้ง `--min-scale 1 --max-scale 1` ไว้แล้ว

---

## 1. เตรียม MySQL บน Aiven

1. สมัคร aiven.io → Create service → **MySQL** → plan **Free**
2. รอ service ขึ้นสถานะ Running แล้วคัดลอก **Service URI** — หน้าตาประมาณ
   `mysql://avnadmin:PASSWORD@mysql-xxxx.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED`
3. แปลงเป็นรูปแบบที่ mysql2 เข้าใจ: **ตัด `?ssl-mode=REQUIRED` ออก** แล้วต่อท้ายด้วย

   ```
   ?ssl={"rejectUnauthorized":false}
   ```

   > `rejectUnauthorized:false` = ไม่ตรวจใบรับรองของ Aiven (Aiven ใช้ CA ของตัวเอง)
   > ใช้ได้กับการทดสอบ แต่สำหรับ production ควรใส่ CA จริงแทน:
   > `?ssl={"ca":"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}`

4. สร้าง schema + ข้อมูลทดสอบ จากเครื่อง dev (Koyeb image ไม่มี seed script):

   PowerShell:
   ```powershell
   cd backend
   $env:DATABASE_URL='mysql://avnadmin:PASSWORD@host:12345/defaultdb?ssl={"rejectUnauthorized":false}'
   npm run migrate
   $env:SEED_PASSWORD='รหัสผ่านทดสอบ'
   npm run seed
   ```

## 2. ติดตั้ง koyeb CLI + login

```bash
curl -fsSL https://raw.githubusercontent.com/koyeb/koyeb-cli/master/install.sh | sh
koyeb login
```

(Windows: ดาวน์โหลด binary จาก https://github.com/koyeb/koyeb-cli/releases หรือใช้ `winget install Koyeb.koyeb-cli`)

Koyeb ต้องเชื่อม GitHub app กับ repo `Setto-TSET/emeeting-system` ก่อน (ทำครั้งเดียวจาก dashboard → Settings → GitHub)

## 3. ตั้งค่าและ deploy

```bash
cp deploy/koyeb.env.example deploy/koyeb.env
# เติม DATABASE_URL, JWT_SECRET, CORS_ORIGIN, CLAUDE_API_KEY
bash deploy/koyeb-deploy.sh
```

สคริปต์จะ: สร้าง app → เก็บค่าลับเป็น Koyeb secret → สร้าง/อัปเดต service ที่ build จาก `backend/` ด้วย Dockerfile
เปิด port 3001, health check `/health`

ดู log ระหว่าง build/run:
```bash
koyeb service logs emeeting/backend
```

## 4. ชี้ frontend มาที่ backend นี้

ตั้ง env บน Vercel (Production + Preview) แล้ว redeploy:

| ตัวแปร | ค่า |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://<app-slug>.koyeb.app` |
| `NEXT_PUBLIC_WS_URL` | `wss://<app-slug>.koyeb.app/ws` |

URL จริงดูได้จาก `koyeb service get emeeting/backend` หรือหน้า dashboard

## 5. ตรวจว่าใช้ได้

```bash
curl https://<app-slug>.koyeb.app/health
```
ต้องได้ `{"status":"ok","timestamp":"..."}`

จากนั้นทดสอบจาก frontend: login → เข้าห้องประชุม → เปิดโหวต/ยกมือ จากสองเบราว์เซอร์ ต้องเห็นตรงกัน

## ลบทิ้งเมื่อเลิกทดสอบ (หยุดค่าใช้จ่าย)

```bash
koyeb service delete emeeting/backend
koyeb app delete emeeting
```
