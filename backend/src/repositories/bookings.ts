// ═══════════════════════════════════════════
// Room Bookings — การจองห้องประชุม
//
// หัวใจของไฟล์นี้คือ createBooking() ที่เช็คเวลาชนกันภายในทรานแซกชันเดียวกับที่เขียน
// เดิมเช็คที่หน้าเว็บอย่างเดียว สองคนกดจองห้องเดียวกันพร้อมกันจึงผ่านทั้งคู่
// ═══════════════════════════════════════════

import { query, withTransaction } from '../database/connection';

export type Booking = {
  id: string;
  roomId: string;
  roomName: string;
  title: string;
  bookedById: string;
  bookedBy: string;
  department: string;
  date: string;
  startTime: string;
  endTime: string;
  attendees: number;
  purpose: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  extraRooms?: string[];
};

type BookingRow = {
  id: string;
  room_id: string;
  room_name: string;
  title: string;
  booked_by_id: string;
  booked_by: string;
  department: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  attendees: number;
  purpose: string;
  status: Booking['status'];
  extra_rooms: unknown;
};

/** ชนกันเมื่อช่วงเวลาเหลื่อมกัน — จบพอดีตอนอีกอันเริ่มไม่ถือว่าชน */
const OVERLAP = `room_id = ? AND booking_date = ? AND status <> 'cancelled'
                 AND NOT (end_time <= ? OR start_time >= ?)`;

function toBooking(row: BookingRow): Booking {
  const extra = typeof row.extra_rooms === 'string' ? JSON.parse(row.extra_rooms) : row.extra_rooms;
  return {
    id: row.id,
    roomId: row.room_id,
    roomName: row.room_name,
    title: row.title,
    bookedById: row.booked_by_id,
    bookedBy: row.booked_by,
    department: row.department,
    date: row.booking_date,
    startTime: row.start_time,
    endTime: row.end_time,
    attendees: row.attendees,
    purpose: row.purpose,
    status: row.status,
    ...(Array.isArray(extra) && extra.length > 0 ? { extraRooms: extra } : {}),
  };
}

/**
 * ทุกคนในองค์กรเห็นการจองทั้งหมด — ปฏิทินห้องว่างจะใช้ไม่ได้เลยถ้าเห็นแค่ของตัวเอง
 * (หัวข้อการประชุมจึงไม่ควรใส่ความลับ เป็นข้อจำกัดที่รับไว้ตั้งแต่ต้น)
 */
export async function listBookings(): Promise<Booking[]> {
  const rows = (await query(
    'SELECT * FROM room_bookings ORDER BY booking_date DESC, start_time ASC'
  )) as BookingRow[];
  return rows.map(toBooking);
}

export async function getBooking(id: string): Promise<Booking | null> {
  const rows = (await query('SELECT * FROM room_bookings WHERE id = ?', [id])) as BookingRow[];
  return rows[0] ? toBooking(rows[0]) : null;
}

/** ห้องที่ชนกับช่วงเวลานี้ — ใช้ตอนหน้าเว็บถามว่าห้องไหนว่าง */
export async function findConflicts(
  roomIds: string[],
  date: string,
  startTime: string,
  endTime: string
): Promise<Booking[]> {
  if (roomIds.length === 0) return [];
  const rows = (await query(
    `SELECT * FROM room_bookings
     WHERE room_id IN (${roomIds.map(() => '?').join(',')})
       AND booking_date = ? AND status <> 'cancelled'
       AND NOT (end_time <= ? OR start_time >= ?)`,
    [...roomIds, date, startTime, endTime]
  )) as BookingRow[];
  return rows.map(toBooking);
}

export class BookingConflictError extends Error {
  constructor(public conflict: Booking) {
    super(`ห้องนี้ถูกจองแล้วในช่วงเวลาดังกล่าว (${conflict.startTime}-${conflict.endTime})`);
    this.name = 'BookingConflictError';
  }
}

/**
 * จองห้อง — โยน BookingConflictError ถ้าเวลาชน
 *
 * SELECT ... FOR UPDATE ล็อกช่วงแถวของห้อง+วันนั้นไว้ก่อนเช็ค คนที่ยิงพร้อมกันจะรอ
 * แล้วเห็นแถวที่คนแรกเพิ่งใส่ ทำให้คนที่สองถูกปฏิเสธแทนที่จะจองทับ
 */
export async function createBooking(input: Booking): Promise<Booking> {
  return withTransaction(async (run) => {
    const clash = (await run(`SELECT * FROM room_bookings WHERE ${OVERLAP} FOR UPDATE`, [
      input.roomId,
      input.date,
      input.startTime,
      input.endTime,
    ])) as BookingRow[];

    if (clash.length > 0) throw new BookingConflictError(toBooking(clash[0]));

    await run(
      `INSERT INTO room_bookings
         (id, room_id, room_name, title, booked_by_id, booked_by, department,
          booking_date, start_time, end_time, attendees, purpose, status, extra_rooms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.roomId,
        input.roomName,
        input.title,
        input.bookedById,
        input.bookedBy,
        input.department ?? '',
        input.date,
        input.startTime,
        input.endTime,
        input.attendees ?? 1,
        input.purpose ?? '',
        input.status ?? 'confirmed',
        input.extraRooms && input.extraRooms.length > 0 ? JSON.stringify(input.extraRooms) : null,
        Date.now(),
      ]
    );

    return { ...input, status: input.status ?? 'confirmed' };
  });
}

/** ยกเลิกแบบไม่ลบแถว — ประวัติการจองยังต้องตรวจสอบย้อนหลังได้ */
export async function cancelBooking(id: string): Promise<void> {
  await query("UPDATE room_bookings SET status = 'cancelled' WHERE id = ?", [id]);
}
