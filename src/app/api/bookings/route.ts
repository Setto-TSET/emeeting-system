// GET  /api/bookings — การจองทั้งหมด (ทุกคนที่ล็อกอินเห็นได้ ต้องรู้ว่าห้องไหนว่าง)
// POST /api/bookings — จองห้อง (server เป็นคนตรวจเวลาชน ไม่ใช่ฝั่ง UI)

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/api/auth";
import { withApi, readJson } from "@/lib/api/respond";
import { bookingInclude, toBooking } from "@/lib/api/bookings";

export const GET = withApi(async (request: Request) => {
  await requireAuth(request);
  const bookings = await prisma.booking.findMany({
    include: bookingInclude,
    orderBy: [{ date: "desc" }, { startTime: "asc" }],
  });
  return Response.json({ bookings: bookings.map(toBooking) });
});

const createSchema = z.object({
  roomId: z.string().min(1),
  title: z.string().trim().min(1, "ต้องระบุหัวข้อการประชุม").max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ต้องเป็น YYYY-MM-DD"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  attendees: z.number().int().positive().max(1000),
  purpose: z.string().trim().max(2000).default(""),
  extraRooms: z.array(z.string()).optional(),
});

export const POST = withApi(async (request: Request) => {
  const user = await requireAuth(request);
  const body = createSchema.parse(await readJson(request));

  if (body.endTime <= body.startTime) {
    throw new ApiError(400, "เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
  }

  const room = await prisma.room.findUnique({ where: { id: body.roomId } });
  if (!room) throw new ApiError(404, "ไม่พบห้องประชุมนี้");
  if (room.status !== "available") throw new ApiError(409, `ห้องนี้ไม่พร้อมใช้งาน (${room.status})`);
  if (room.capacity < body.attendees) {
    throw new ApiError(409, `ห้องนี้รองรับได้ ${room.capacity} คน แต่ขอจองสำหรับ ${body.attendees} คน`);
  }

  // เวลาชนกันไหม — เดิมเช็คแค่ฝั่ง UI ซึ่งกันคนสองคนกดจองพร้อมกันไม่ได้
  // ponytail: ตรวจแล้วค่อย insert ยังมีช่องแข่งกันเสี้ยววินาที ถ้าเจอจองซ้อนจริงค่อยย้ายไป
  // unique index หรือ SELECT ... FOR UPDATE ใน transaction
  const clash = await prisma.booking.findFirst({
    where: {
      roomId: body.roomId,
      date: body.date,
      status: { not: "cancelled" },
      startTime: { lt: body.endTime },
      endTime: { gt: body.startTime },
    },
    select: { startTime: true, endTime: true },
  });
  if (clash) {
    throw new ApiError(409, `ห้องนี้ถูกจองแล้วช่วง ${clash.startTime}-${clash.endTime}`);
  }

  const booking = await prisma.booking.create({
    data: {
      roomId: body.roomId,
      title: body.title,
      bookedById: user.id, // ผู้จองมาจาก session เสมอ ไม่รับจาก body
      department: user.department,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      attendees: body.attendees,
      purpose: body.purpose,
      status: "confirmed",
      extraRooms: body.extraRooms ?? undefined,
    },
    include: bookingInclude,
  });

  return Response.json({ booking: toBooking(booking) }, { status: 201 });
});
