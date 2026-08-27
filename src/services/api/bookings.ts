// ═══════════════════════════════════════════
// Bookings API — การจองห้องประชุมอยู่ที่ server แล้ว ไม่ใช่ localStorage
//
// server เป็นคนตัดสินว่าเวลาชนกันหรือไม่ (ตอบ 409) — หน้าเว็บกรองห้องว่างได้
// แต่ห้ามถือว่าผลนั้นเป็นข้อสรุป เพราะคนอื่นอาจจองแทรกระหว่างที่กรอกฟอร์มอยู่
// ═══════════════════════════════════════════

import { Booking } from "@/data";
import { apiFetch } from "./client";

export async function fetchBookings(): Promise<Booking[]> {
  const { bookings } = await apiFetch<{ bookings: Booking[] }>("/api/bookings");
  return bookings;
}

export async function createBooking(booking: Booking): Promise<Booking> {
  const body = await apiFetch<{ booking: Booking }>("/api/bookings", {
    method: "POST",
    body: JSON.stringify({ booking }),
  });
  return body.booking;
}

export async function cancelBooking(bookingId: string): Promise<Booking> {
  const body = await apiFetch<{ booking: Booking }>(`/api/bookings/${bookingId}`, {
    method: "DELETE",
  });
  return body.booking;
}
