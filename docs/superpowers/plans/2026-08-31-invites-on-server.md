# Plan — ย้ายลิงก์เชิญบุคคลภายนอกขึ้น server

**วันที่:** 2026-08-31
**เป้าหมาย:** สร้างลิงก์เชิญบนเครื่องหนึ่ง แล้วคนนอกเปิดจากอีกเครื่องเข้าประชุมได้จริง
**ปัญหาเดิม:** `src/lib/inviteTokens.ts` เก็บ token ใน `localStorage` คีย์ `meeting_system_invite_tokens` — token อยู่แค่ในเบราว์เซอร์ของผู้เชิญ คนที่ได้รับลิงก์เปิดแล้วเจอ "ลิงก์ไม่ถูกต้อง" เสมอ ฟีเจอร์นี้จึงใช้ไม่ได้เลยนอกจากทดสอบบนเครื่องเดียว

ปัญหาซ้อนอีกชั้น: `join/[token]/page.tsx` อ่านรายละเอียดการประชุมจาก `useMeetings()` ซึ่งต้องล็อกอินก่อน แขกภายนอกไม่มีบัญชี จึงได้รายการว่างและติดหน้า loading ตลอดไป

## การตัดสินใจเชิงออกแบบ

**endpoint สาธารณะสองตัว ไม่ผ่าน `authMiddleware`** — แขกยังไม่มี token ตอนเปิดลิงก์ ตัวลิงก์เองคือหลักฐานการได้รับเชิญ
`GET /api/invites/:token` กับ `POST /api/invites/:token/accept` จึงเปิดสาธารณะ ส่วน endpoint ที่สร้าง/ดู/เพิกถอนลิงก์ยังต้องล็อกอินตามเดิม

**คืนข้อมูลการประชุมเท่าที่หน้าเชิญต้องใช้** — ชื่อ วันเวลา สถานที่ ผู้จัด เท่านั้น
ไม่คืนวาระ ไฟล์แนบ หรือรายชื่อผู้เข้าร่วม ใครถือลิงก์เห็นได้แค่ว่าถูกเชิญไปประชุมอะไร ไม่ใช่เนื้อหาการประชุม

**ทำเครื่องหมาย "ใช้แล้ว" ด้วย `UPDATE ... WHERE used_at IS NULL` แล้วดู `affectedRows`** — ไม่ใช่อ่านมาเช็คแล้วค่อยเขียน
สองคนกดลิงก์เดียวกันพร้อมกัน แบบอ่านก่อนเขียนจะผ่านทั้งคู่ ใช้ UPDATE แบบมีเงื่อนไขให้ MySQL ตัดสินคนเดียว คนที่สองได้ 410

**ยอมรับลิงก์แล้วออก guest JWT ทันที** — ใช้ `signGuestToken` ตัวเดิมที่ `POST /api/auth/guest` ใช้อยู่
token ผูกกับ `meetingId` เดียว WebSocket ตรวจตรงนี้อยู่แล้ว (`server.ts` — `claims.meetingId !== meetingId` ปิดทันที) แขกจึงเข้าได้เฉพาะห้องที่ถูกเชิญ

**ลิงก์ที่ถูกเชิญไม่ต้องขึ้นกับ `allow_guest_join`** — ต่างจาก `POST /api/auth/guest` ที่ใครก็ยิงได้ถ้ารู้ `meetingId`
คำเชิญที่ผู้จัดออกให้เป็นรายคนคือการอนุญาตอยู่แล้ว ถ้าบังคับ flag ด้วย ผู้จัดจะงงว่าออกลิงก์แล้วทำไมใช้ไม่ได้

**เพิกถอน = `revoked_at` ไม่ลบแถว** — ต้องตรวจย้อนหลังได้ว่าใครออกลิงก์ให้ใครแล้วเกิดอะไรขึ้น
เหตุผลเดียวกับที่ `room_bookings` ใช้ `status = 'cancelled'` แทนการลบ

**เก็บเวลาเป็น BIGINT epoch ms** — ตรงกับ `created_at` ของทุกตารางในสคีมานี้ และเลี่ยงปัญหาเดียวกับที่ทำให้ `booking_date` ต้องเป็น VARCHAR (mysql2 แปลงคอลัมน์วันที่เป็น `Date` แล้วเลื่อนตาม timezone ของ process)

## งานที่ทำ

### backend
1. `schema.sql` — ตาราง `meeting_invites` + index `(meeting_id)`
2. `repositories/invites.ts` — `createInvite` / `getInvite` / `listInvitesForMeeting` / `consumeInvite` / `revokeInvite`
3. `routes/invites.ts` — สาธารณะ: `GET /api/invites/:token`, `POST /api/invites/:token/accept`
   ต้องล็อกอิน: `POST /api/meetings/:id/invites`, `GET /api/meetings/:id/invites`, `DELETE /api/invites/:token`
   สิทธิ์ออกลิงก์ใช้ `canEditMeeting` ตัวเดียวกับที่หน้าแก้ไขการประชุมใช้
4. `server.ts` — mount `/api/invites` และ `/api/meetings/:id/invites`
5. `tests/routes/invites.test.ts`

### frontend
6. `services/api/invites.ts` — client ครอบ endpoint ข้างบน
7. `lib/inviteTokens.ts` — ลบ localStorage ออก เหลือแค่ `buildJoinUrl`
8. `meetings/[id]/page.tsx` — สร้าง/ดู/เพิกถอนลิงก์เป็น async
9. `join/[token]/page.tsx` — เลิกพึ่ง `useMeetings()` อ่านจาก endpoint สาธารณะ และเก็บ guest token ที่ได้ลง `setAccessToken`

## นอกขอบเขต

- ส่งอีเมลลิงก์ให้แขกอัตโนมัติ (ตอนนี้ผู้จัดคัดลอกลิงก์ไปส่งเอง)
- เพิ่มแขกเข้า `meeting_participants` ถาวร (แขกไม่มี `user_id` ตารางนี้ผูกกับบัญชีในระบบ)
- ลิงก์ใช้ได้หลายครั้ง / เชิญเป็นกลุ่มด้วยลิงก์เดียว
- เปลี่ยนอายุลิงก์จากหน้าเว็บ (คงที่ 48 ชั่วโมงตามเดิม)
