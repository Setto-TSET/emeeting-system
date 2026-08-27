"use client";

import { createContext, useContext, useCallback, useEffect, useState, ReactNode } from "react";
import { Booking } from "@/data";
import { ApiError } from "@/services/api/client";
import * as api from "@/services/api/bookings";
import { useCurrentUser } from "@/context/UserContext";

type BookingContextType = {
  bookings: Booking[];
  /** true ระหว่างดึงรายการจาก server ครั้งแรก */
  loading: boolean;
  reload: () => Promise<void>;
  /** โยน ApiError ถ้า server ปฏิเสธ (409 = เวลาชน) — ผู้เรียกต้อง catch เพื่อแจ้งผู้ใช้ */
  addBooking: (booking: Booking) => Promise<Booking>;
  cancelBooking: (bookingId: string) => Promise<void>;
};

const BookingContext = createContext<BookingContextType | null>(null);

/**
 * การจองห้องอยู่ที่ server แล้ว (เดิม localStorage คีย์ meeting_system_bookings_v3)
 *
 * ทำไมต้องย้าย: การจองอยู่ในเครื่องคนจอง คนอื่นจึงเห็นห้องนั้นว่างและจองทับได้
 * และการเช็คเวลาชนที่ทำอยู่ฝั่งหน้าเว็บก็ตัดสินจากข้อมูลที่ไม่ครบ
 *
 * ตอนนี้ server เป็นผู้ตัดสินการชนกันในทรานแซกชันเดียวกับที่เขียน — ที่นี่จึงไม่
 * optimistic update แบบ MeetingContext แต่รอผลจริงก่อนค่อยอัปเดตหน้าจอ
 * ไม่งั้นผู้ใช้จะเห็นการจองที่ถูกปฏิเสธโผล่ขึ้นมาแล้วหายไป
 */
export function BookingProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useCurrentUser();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setBookings(await api.fetchBookings());
    } catch (e) {
      // ยังไม่ล็อกอิน (หน้า login) — ไม่ใช่ความผิดพลาดที่ต้องแจ้งผู้ใช้
      if (!(e instanceof ApiError && e.status === 401)) console.error(e);
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ดึงใหม่ทุกครั้งที่ผู้ใช้เปลี่ยน — ล็อกอินเสร็จคือจังหวะที่ token พร้อมใช้
  useEffect(() => {
    void reload();
  }, [currentUser.id, reload]);

  const addBooking = useCallback(async (booking: Booking) => {
    const saved = await api.createBooking(booking);
    // ดึงทั้งรายการใหม่ ไม่ต่อท้ายเฉยๆ — ระหว่างที่กรอกฟอร์มอาจมีคนอื่นจองเพิ่ม
    // ปฏิทินห้องว่างที่แสดงอยู่จึงเก่าไปแล้ว
    setBookings(await api.fetchBookings());
    return saved;
  }, []);

  const cancelBooking = useCallback(async (bookingId: string) => {
    await api.cancelBooking(bookingId);
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: "cancelled" as const } : b))
    );
  }, []);

  return (
    <BookingContext.Provider value={{ bookings, loading, reload, addBooking, cancelBooking }}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBookings() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBookings must be used within BookingProvider");
  return ctx;
}
