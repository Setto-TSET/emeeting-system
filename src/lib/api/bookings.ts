// แปลง row ของ Prisma เป็น Booking รูปแบบเดียวกับที่ UI ใช้อยู่ (src/data/index.ts)

import type { Prisma } from "@prisma/client";
import type { Booking } from "@/data";

export const bookingInclude = {
  room: { select: { name: true } },
  bookedBy: { select: { name: true } },
} satisfies Prisma.BookingInclude;

type BookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    roomId: row.roomId,
    roomName: row.room.name,
    title: row.title,
    bookedById: row.bookedById,
    bookedBy: row.bookedBy.name,
    department: row.department,
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    attendees: row.attendees,
    purpose: row.purpose,
    status: row.status,
    extraRooms: (row.extraRooms as string[] | null) ?? undefined,
  };
}
