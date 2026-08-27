# Plan — ย้ายการจองห้องประชุมขึ้น server

**วันที่:** 2026-08-27
**เป้าหมาย:** จองห้องแล้วทุกคนเห็น และคนสองคนจองห้องเดียวเวลาเดียวกันไม่ได้
**ปัญหาเดิม:** `BookingContext` เก็บ localStorage (`meeting_system_bookings_v3`) การจองอยู่แค่ในเครื่องคนจอง คนอื่นจึงเห็นห้องนั้นว่างและจองทับได้ และการเช็คเวลาชนทำที่หน้าเว็บซึ่งตัดสินจากข้อมูลที่ไม่ครบ

## การตัดสินใจเชิงออกแบบ

**normalize เต็มรูป ไม่ใช้ JSON column แบบ meetings** — `Booking` มี 15 ฟิลด์และเกือบทุกฟิลด์ถูก query จริง (ห้อง วันที่ ช่วงเวลา สถานะ เจ้าของ) ต่างจาก `Meeting` ที่มีฟิลด์เชิงเนื้อหาอีก 20+ ที่ไม่มีใคร query

**`booking_date` เป็น VARCHAR(10) ไม่ใช่ DATE** — mysql2 แปลงคอลัมน์ DATE เป็น `Date` object แล้วเลื่อนวันตาม timezone ของ process การจองวันที่ 1 กลายเป็นวันที่ 31 ของเดือนก่อนได้ เก็บเป็นสตริง `YYYY-MM-DD` ตรงกับที่หน้าเว็บใช้อยู่แล้ว

**เช็คเวลาชนด้วย `SELECT ... FOR UPDATE` ในทรานแซกชันเดียวกับที่ INSERT** — เช็คก่อนเขียนแบบธรรมดายังหลุดเมื่อสองคนยิงพร้อมกัน gap lock ของ InnoDB ทำให้คนที่สองรอแล้วเห็นแถวของคนแรก จึงถูกปฏิเสธด้วย 409 แทนที่จะจองทับ
`ponytail: ล็อกทั้งช่วงห้อง+วัน ถ้าจำนวนห้องโตมากค่อยดูที่ index หรือ unique constraint แบบ time-slot`

**ยกเลิก = `status = 'cancelled'` ไม่ลบแถว** — ประวัติการจองต้องตรวจย้อนหลังได้ และแถวที่ยกเลิกแล้วไม่บล็อกการจองใหม่

**ทุกคนเห็นการจองทั้งหมด** — ปฏิทินห้องว่างใช้ไม่ได้เลยถ้าเห็นแค่ของตัวเอง ข้อแลกเปลี่ยนคือหัวข้อการประชุมในหน้าจองไม่ควรใส่ความลับ

## งานที่ทำ

### backend
1. `schema.sql` — ตาราง `room_bookings` + index `(room_id, booking_date, status)` และ `(booked_by_id)`
2. `repositories/bookings.ts` — `listBookings` / `getBooking` / `findConflicts` / `createBooking` (โยน `BookingConflictError`) / `cancelBooking`
3. `routes/bookings.ts` — `GET /api/bookings`, `POST /api/bookings` (409 ถ้าชน), `DELETE /api/bookings/:id` (เจ้าของหรือ admin)
   ผู้จองมาจาก JWT เสมอ ไม่เชื่อ `bookedById` จาก body
4. `server.ts` — mount `/api/bookings`
5. `tests/routes/bookings.test.ts` — 13 เคส รวมเคสยิงพร้อมกันสองคนต้องสำเร็จคนเดียว

### frontend
6. `services/api/bookings.ts` — client ครอบ endpoint ข้างบน
7. `BookingContext.tsx` — โหลดจาก server, `addBooking`/`cancelBooking` เป็น async
   ไม่ optimistic update แบบ `MeetingContext` เพราะ server เป็นผู้ตัดสินการชน ถ้าอัปเดตหน้าจอก่อนผู้ใช้จะเห็นการจองที่ถูกปฏิเสธโผล่แล้วหายไป
8. `booking/page.tsx` — submit เป็น async ปุ่ม disable ระหว่างส่ง และ toast ข้อความ 409 จาก server
9. `booking/my-bookings/page.tsx` — cancel เป็น async
10. `lib/localStore.ts` — ลบทิ้ง ไม่มีใครใช้แล้ว
11. `BookingContext.test.tsx` — 5 เคส

## นอกขอบเขต

- แก้ไขการจอง (ตอนนี้ทำได้แค่ยกเลิกแล้วจองใหม่)
- การอนุมัติการจอง (`status: "pending"` มีในโครงสร้างแต่ยังไม่มี flow)
- ห้องเสริม (`extraRooms`) เก็บได้แต่ยังไม่ถูกนับในการเช็คเวลาชน
- ผูกการจองเข้ากับการประชุมใน `meetings`
