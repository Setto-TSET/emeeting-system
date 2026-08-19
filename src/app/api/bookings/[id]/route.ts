// PATCH /api/bookings/[id] — ยกเลิกการจอง (เจ้าของการจองหรือ admin เท่านั้น)

import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/api/auth";
import { withApi } from "@/lib/api/respond";
import { bookingInclude, toBooking } from "@/lib/api/bookings";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireAuth(request);

  const booking = await prisma.booking.findUnique({ where: { id }, select: { bookedById: true } });
  if (!booking) throw new ApiError(404, "ไม่พบการจองนี้");
  if (booking.bookedById !== user.id && user.systemRole !== "admin") {
    throw new ApiError(403, "ยกเลิกได้เฉพาะการจองของตัวเอง");
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: { status: "cancelled" },
    include: bookingInclude,
  });

  return Response.json({ booking: toBooking(updated) });
});
