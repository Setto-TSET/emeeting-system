"use client";

import { createContext, useContext, useCallback, useEffect, useState, ReactNode } from "react";
import { Booking } from "@/data";
import { apiCall } from "@/lib/api/client";

// การจองอยู่ที่ server แล้ว (ตาราง Booking) ไม่ใช่ localStorage ของแต่ละเครื่อง
// — คนอื่นจึงเห็นห้องที่ถูกจองไปแล้วจริง และเวลาชนถูกตรวจซ้ำที่ server
//
// ยังไม่มี realtime: โหลดใหม่ตอน mount และตอนกลับมาโฟกัสหน้าต่างเท่านั้น
// ponytail: การจองไม่ได้เปลี่ยนทุกวินาทีเหมือนโหวต ถ้าเริ่มชนกันบ่อยค่อยเติม poll

type BookingContextType = {
  bookings: Booking[];
  /** โยน error ถ้าจองไม่ได้ (เวลาชน/ห้องไม่ว่าง) — ผู้เรียกเอาข้อความไปแสดง */
  addBooking: (draft: NewBooking) => Promise<Booking>;
  cancelBooking: (bookingId: string) => Promise<void>;
  error: string | null;
  reload: () => void;
};

export type NewBooking = {
  roomId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  attendees: number;
  purpose: string;
  extraRooms?: string[];
};

const BookingContext = createContext<BookingContextType | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await apiCall<{ bookings: Booking[] }>("/api/bookings");
      setBookings(data.bookings);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลการจองไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState เกิดหลัง await ไม่ใช่ระหว่าง render
    reload();
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  const addBooking = useCallback(async (draft: NewBooking) => {
    const data = await apiCall<{ booking: Booking }>("/api/bookings", {
      method: "POST",
      body: JSON.stringify(draft),
    });
    setBookings((prev) => [data.booking, ...prev]);
    return data.booking;
  }, []);

  const cancelBooking = useCallback(async (bookingId: string) => {
    const data = await apiCall<{ booking: Booking }>(`/api/bookings/${bookingId}`, {
      method: "PATCH",
    });
    setBookings((prev) => prev.map((b) => (b.id === bookingId ? data.booking : b)));
  }, []);

  return (
    <BookingContext.Provider value={{ bookings, addBooking, cancelBooking, error, reload }}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBookings() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBookings must be used within BookingProvider");
  return ctx;
}
