"use client";

import { createContext, useContext, useCallback, useEffect, useSyncExternalStore, ReactNode } from "react";
import { bookings as defaultBookings, Booking } from "@/data";
import { subscribeToKey, readKey, writeKey, seedKey } from "@/lib/localStore";

type BookingContextType = {
  bookings: Booking[];
  addBooking: (booking: Booking) => void;
  cancelBooking: (bookingId: string) => void;
};

/**
 * ขึ้นเลขเวอร์ชันท้ายคีย์เมื่อโครงสร้างข้อมูลเปลี่ยน
 * v2 — เพิ่ม bookedById (เดิมจับคู่เจ้าของการจองด้วยชื่อ ซึ่งพังเมื่อชื่อไม่ตรงกันเป๊ะ)
 */
const STORAGE_KEY = "meeting_system_bookings_v2";

const BookingContext = createContext<BookingContextType | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  // เขียนข้อมูลตั้งต้นลงเครื่องครั้งแรกที่เปิดระบบ
  useEffect(() => {
    seedKey(STORAGE_KEY, defaultBookings);
  }, []);

  const subscribe = useCallback((cb: () => void) => subscribeToKey(STORAGE_KEY, cb), []);
  const getSnapshot = useCallback(() => readKey<Booking[]>(STORAGE_KEY, defaultBookings), []);

  // getServerSnapshot คืนข้อมูลตั้งต้นเสมอ — ทำให้ผลลัพธ์ฝั่ง server กับ client แรกตรงกัน
  const bookings = useSyncExternalStore(subscribe, getSnapshot, () => defaultBookings);

  const addBooking = useCallback((booking: Booking) => {
    writeKey(STORAGE_KEY, [booking, ...readKey<Booking[]>(STORAGE_KEY, defaultBookings)]);
  }, []);

  const cancelBooking = useCallback((bookingId: string) => {
    const next = readKey<Booking[]>(STORAGE_KEY, defaultBookings).map((b) =>
      b.id === bookingId ? { ...b, status: "cancelled" as const } : b
    );
    writeKey(STORAGE_KEY, next);
  }, []);

  return (
    <BookingContext.Provider value={{ bookings, addBooking, cancelBooking }}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBookings() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBookings must be used within BookingProvider");
  return ctx;
}
