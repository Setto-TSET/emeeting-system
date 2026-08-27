// src/context/BookingContext.test.tsx
//
// สัญญาหลักหลังย้ายการจองขึ้น server: รายการมาจาก API, การจองที่ server ปฏิเสธ (409)
// ต้องโยนต่อให้หน้าเว็บแจ้งผู้ใช้ ไม่ใช่เงียบแล้วโชว์ว่าจองสำเร็จ
"use client";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BookingProvider, useBookings } from "@/context/BookingContext";
import { UserProvider } from "@/context/UserContext";
import { ApiError } from "@/services/api/client";
import type { Booking } from "@/data";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchBookings = vi.fn<() => Promise<Booking[]>>();
const createBooking = vi.fn<(b: Booking) => Promise<Booking>>();
const cancelBooking = vi.fn<(id: string) => Promise<Booking>>();

vi.mock("@/services/api/bookings", () => ({
  fetchBookings: () => fetchBookings(),
  createBooking: (b: Booking) => createBooking(b),
  cancelBooking: (id: string) => cancelBooking(id),
}));

const sample: Booking = {
  id: "BK-1",
  roomId: "R-801",
  roomName: "ห้องประชุม 801",
  title: "ประชุมทีม",
  bookedById: "U-003",
  bookedBy: "นางสาว มาลี รักษาสัตย์",
  department: "ฝ่ายเทคโนโลยี",
  date: "2026-09-01",
  startTime: "09:00",
  endTime: "10:00",
  attendees: 5,
  purpose: "ติดตามงาน",
  status: "confirmed",
};

let container: HTMLDivElement;
let root: Root;
let lastError: unknown = null;

function Probe() {
  const { bookings, loading, addBooking, cancelBooking: cancel } = useBookings();
  return (
    <div>
      <span id="state">{loading ? "loading" : `ready:${bookings.length}`}</span>
      <span id="titles">{bookings.map((b) => `${b.title}:${b.status}`).join("|")}</span>
      <button
        id="add"
        onClick={() => {
          void addBooking({ ...sample, id: "BK-2", title: "จองใหม่" }).catch((e) => {
            lastError = e;
          });
        }}
      >
        add
      </button>
      <button id="cancel" onClick={() => void cancel("BK-1")}>
        cancel
      </button>
    </div>
  );
}

const text = (id: string) => container.querySelector(`#${id}`)?.textContent;

async function mount() {
  await act(async () => {
    root.render(
      <UserProvider>
        <BookingProvider>
          <Probe />
        </BookingProvider>
      </UserProvider>
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

async function click(id: string) {
  await act(async () => {
    container.querySelector<HTMLButtonElement>(`#${id}`)?.click();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("BookingContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastError = null;
    fetchBookings.mockResolvedValue([sample]);
    createBooking.mockImplementation(async (b) => b);
    cancelBooking.mockImplementation(async (id) => ({ ...sample, id, status: "cancelled" }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("โหลดการจองจาก server ไม่ใช่จากข้อมูลในเครื่อง", async () => {
    await mount();
    expect(fetchBookings).toHaveBeenCalled();
    expect(text("state")).toBe("ready:1");
    expect(text("titles")).toBe("ประชุมทีม:confirmed");
  });

  it("จองสำเร็จแล้วดึงรายการใหม่ทั้งชุด — กันปฏิทินค้างของเก่า", async () => {
    await mount();
    fetchBookings.mockResolvedValue([sample, { ...sample, id: "BK-2", title: "จองใหม่" }]);
    await click("add");

    expect(createBooking).toHaveBeenCalledTimes(1);
    expect(fetchBookings).toHaveBeenCalledTimes(2);
    expect(text("titles")).toContain("จองใหม่");
  });

  it("server ปฏิเสธเพราะเวลาชน (409) — ต้องโยนต่อ และไม่โผล่ในรายการ", async () => {
    createBooking.mockRejectedValue(new ApiError(409, "ห้องนี้ถูกจองแล้วในช่วงเวลาดังกล่าว"));
    await mount();
    await click("add");

    expect(lastError).toBeInstanceOf(ApiError);
    expect((lastError as ApiError).status).toBe(409);
    expect(text("titles")).toBe("ประชุมทีม:confirmed");
  });

  it("ยกเลิกแล้วสถานะเปลี่ยนเป็น cancelled ไม่ใช่หายไปจากรายการ", async () => {
    await mount();
    await click("cancel");

    expect(cancelBooking).toHaveBeenCalledWith("BK-1");
    expect(text("titles")).toBe("ประชุมทีม:cancelled");
  });

  it("ยังไม่ล็อกอิน (401) ถือว่าไม่มีการจอง ไม่ใช่ข้อผิดพลาด", async () => {
    fetchBookings.mockRejectedValue(new ApiError(401, "Invalid token"));
    await mount();

    expect(text("state")).toBe("ready:0");
  });
});
