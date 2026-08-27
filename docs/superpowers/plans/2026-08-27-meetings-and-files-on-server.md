# Plan — ย้ายการประชุมและไฟล์เอกสารขึ้น server

**วันที่:** 2026-08-27
**เป้าหมาย:** สร้างการประชุมจากหน้าเว็บแล้วผู้เข้าร่วมทุกคนเห็น เข้าห้อง realtime ได้ และเปิดเอกสารที่คนอื่นอัปโหลดได้
**ปัญหาปัจจุบัน:** `MeetingContext` เก็บ localStorage (`meeting_system_meetings_v9`) และ `fileStorage` เก็บ IndexedDB — ข้อมูลอยู่แค่ในเครื่องคนสร้าง ประชุมใหม่ไม่มีใน MySQL ทำให้ WebSocket ปฏิเสธด้วย 4403 และเอกสารที่แชร์คนอื่นเปิดไม่ได้

## การตัดสินใจเชิงออกแบบ

**เก็บ Meeting เป็น JSON column** ไม่ normalize เต็มรูป — type `Meeting` มี 20+ ฟิลด์ (agenda, secretGroups, permissions, extraTextBoxes, displayFormat) ที่ไม่มี query ไหนต้องกรองด้วยเลย คอลัมน์แยกเก็บเฉพาะที่ query จริง ส่วน `meeting_participants` ยัง normalize เหมือนเดิมเพราะ WebSocket handshake และ authz ใช้ตารางนี้ตัดสิน

**ไฟล์เก็บเป็น LONGBLOB ใน MySQL** — ไม่ต้องตั้ง object storage เพิ่ม deploy ยังเป็น container เดียว
`ponytail: blob ใน DB, ย้ายไป S3/R2 เมื่อไฟล์รวมเกิน ~1GB หรือ Aiven free เต็ม`

**อัปโหลดผ่าน JSON base64** ไม่เพิ่ม multer — ประหยัด dependency แลกกับ payload บวม 33%
`ponytail: base64 + express.json limit 25mb, เปลี่ยนเป็น multipart เมื่อไฟล์เกิน ~20MB`

## งาน

### ฝั่ง backend

1. **schema.sql** — เพิ่มใน `meetings`: `payload JSON NOT NULL`, `committee_id VARCHAR(64)`, `created_at BIGINT`
   เพิ่มตาราง `meeting_files` (id, meeting_id, name, mime_type, size_bytes, visibility, uploaded_by, uploaded_at, content LONGBLOB)
   ทุกคำสั่งต้องเป็น `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` ให้รันซ้ำได้

2. **repositories/meetings.ts** — เพิ่ม `listForUser()`, `getMeeting()`, `createMeeting()`, `updateMeeting()`
   ทุกครั้งที่เขียน ต้อง sync `meeting_participants` ให้ตรงกับ `payload.participants` ในทรานแซกชันเดียว
   (ไม่งั้น WebSocket จะเห็นรายชื่อไม่ตรงกับที่หน้าเว็บแสดง)

3. **repositories/meetingFiles.ts** — `listFiles()` (ไม่ดึง content), `getFile()`, `putFile()`, `deleteFile()`

4. **services/authz.ts** — ย้าย `src/lib/authz.ts` มาฝั่ง server (ไฟล์นั้นเขียนเป็น pure function ไว้แล้วเพื่อการนี้)
   route ต้องบังคับสิทธิ์เอง ห้ามเชื่อ payload จาก client

5. **routes/meetings.ts**
   - `GET /api/meetings` — คืนเฉพาะที่ผู้ใช้มีสิทธิ์เห็น (admin เห็นทั้งหมด)
   - `GET /api/meetings/:id`
   - `POST /api/meetings` — ต้องมีสิทธิ์สร้าง
   - `PUT /api/meetings/:id` — ต้องผ่าน `meeting.edit`
   - `GET /api/meetings/:id/files` — metadata เท่านั้น กรองตามระดับการมองเห็น
   - `POST /api/meetings/:id/files` — base64
   - `GET /api/meetings/:id/files/:fileId` — ส่งไฟล์จริง เช็คสิทธิ์รายไฟล์ก่อน
   - `DELETE /api/meetings/:id/files/:fileId`

6. **server.ts** — `express.json({ limit: '25mb' })`

7. **tests** — `tests/routes/meetings.test.ts`, `tests/routes/meetingFiles.test.ts`
   เคสที่ต้องมี: คนนอกประชุมเรียก `GET /:id` ต้องได้ 403 · อัปโหลดไฟล์ลับแล้วคนไม่มีสิทธิ์โหลดต้องได้ 403 · participants sync ตรงกับ payload

### ฝั่ง frontend

8. **services/api/meetings.ts** — client ครอบ endpoint ข้างบน
9. **MeetingContext.tsx** — โหลดจาก server ตอน mount, mutate ผ่าน API แล้ว refetch เลิกใช้ localStorage
   ต้องมี loading / error state เพราะเดิมข้อมูลมาทันทีแบบ synchronous
10. **fileStorage.ts** — เปลี่ยน implementation เป็นเรียก API โดยคง API เดิม (`putFile` / `getFile`) ให้ผู้เรียกไม่ต้องแก้
11. **vitest** — MeetingContext โหลด/สร้าง/แก้ไขผ่าน API mock

## ลำดับการทำ

backend (1→7) ให้เทสผ่านก่อน แล้วค่อยต่อ frontend (8→11) — ระหว่างทาง `MT-2569-010` ที่ seed ไว้ต้องใช้งานได้ตลอด ไม่พัง

## นอกขอบเขต

- การจองห้อง (`BookingContext`) ยัง localStorage
- ส่งอีเมลจริง
- ย้ายไฟล์ไป object storage
