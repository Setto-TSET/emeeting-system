// ═══════════════════════════════════════════
// Routes — จองห้องประชุม
//
// ผู้จองมาจาก JWT เสมอ ไม่เชื่อ bookedById ที่ client ส่งมา
// การชนกันของเวลาตัดสินที่ repository ในทรานแซกชันเดียวกับที่เขียน ไม่ใช่ที่หน้าเว็บ
// ═══════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { authMiddleware, asyncHandler } from '../middleware';
import {
  Booking,
  BookingConflictError,
  cancelBooking,
  createBooking,
  getBooking,
  listBookings,
} from '../repositories/bookings';

const router = Router();

router.use(authMiddleware);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** คืนข้อความผิดพลาดข้อแรกที่เจอ — null คือผ่าน */
function validate(b: Partial<Booking>): string | null {
  if (!b.roomId) return 'ต้องระบุห้องประชุม';
  if (!b.title || !b.title.trim()) return 'ต้องระบุหัวข้อการประชุม';
  if (!b.date || !DATE.test(b.date)) return 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD';
  if (!b.startTime || !TIME.test(b.startTime)) return 'รูปแบบเวลาเริ่มต้องเป็น HH:mm';
  if (!b.endTime || !TIME.test(b.endTime)) return 'รูปแบบเวลาสิ้นสุดต้องเป็น HH:mm';
  if (b.endTime <= b.startTime) return 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม';
  return null;
}

/** GET /api/bookings — ทุกคนเห็นทั้งหมด เพราะปฏิทินห้องว่างต้องใช้ข้อมูลของทุกคน */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ bookings: await listBookings() });
  })
);

/** POST /api/bookings — 409 ถ้าเวลาชนกับการจองที่มีอยู่ */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const input = (req.body?.booking ?? {}) as Partial<Booking>;
    const invalid = validate(input);
    if (invalid) return res.status(400).json({ error: invalid });

    const user = req.user!;
    const booking: Booking = {
      ...(input as Booking),
      id: input.id || `BK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      // ผู้จองมาจาก token เสมอ — ไม่งั้นจองในนามคนอื่นได้
      bookedById: user.id,
      bookedBy: user.name,
      status: 'confirmed',
    };

    try {
      res.status(201).json({ booking: await createBooking(booking) });
    } catch (error) {
      if (error instanceof BookingConflictError) {
        return res.status(409).json({ error: error.message, conflict: error.conflict });
      }
      throw error;
    }
  })
);

/** DELETE /api/bookings/:id — ยกเลิก (ไม่ลบแถว) เจ้าของหรือ admin เท่านั้น */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const booking = await getBooking(req.params.id);
    if (!booking) return res.status(404).json({ error: 'ไม่พบการจองนี้' });

    const user = req.user!;
    if (user.role !== 'admin' && booking.bookedById !== user.id) {
      return res.status(403).json({ error: 'ยกเลิกได้เฉพาะการจองของตัวเอง' });
    }

    await cancelBooking(booking.id);
    res.json({ booking: { ...booking, status: 'cancelled' as const } });
  })
);

export default router;
