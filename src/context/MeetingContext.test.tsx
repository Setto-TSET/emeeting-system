// src/context/MeetingContext.test.tsx
//
// สัญญาหลักหลังย้ายการประชุมขึ้น server: รายการต้องมาจาก API ไม่ใช่ localStorage,
// การแก้ไขต้องถูกส่งขึ้นไปจริง และถ้า server ปฏิเสธ หน้าจอต้องไม่ค้างค่าที่ไม่ได้บันทึก
"use client";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MeetingProvider, useMeetings } from "@/context/MeetingContext";
import { UserProvider } from "@/context/UserContext";
import { meetings as mockMeetings, type Meeting } from "@/data";
import { ApiError } from "@/services/api/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMeetings = vi.fn<() => Promise<Meeting[]>>();
const createMeeting = vi.fn<(m: Meeting) => Promise<Meeting>>();
const saveMeeting = vi.fn<(m: Meeting) => Promise<Meeting>>();

vi.mock("@/services/api/meetings", () => ({
  fetchMeetings: () => fetchMeetings(),
  createMeeting: (m: Meeting) => createMeeting(m),
  saveMeeting: (m: Meeting) => saveMeeting(m),
}));

const sample = mockMeetings[0];

let container: HTMLDivElement;
let root: Root;

function Probe() {
  const { meetings, loading, error, addMeeting, updateMeeting } = useMeetings();
  return (
    <div>
      <span id="state">{loading ? "loading" : `ready:${meetings.length}`}</span>
      <span id="error">{error ?? "-"}</span>
      <span id="names">{meetings.map((m) => m.name).join("|")}</span>
      <button id="add" onClick={() => addMeeting({ ...sample, id: "MT-NEW-1", name: "ประชุมใหม่" })}>
        add
      </button>
      <button id="rename" onClick={() => updateMeeting(sample.id, { name: "แก้ชื่อแล้ว" })}>
        rename
      </button>
    </div>
  );
}

const text = (id: string) => container.querySelector(`#${id}`)?.textContent;

async function mount() {
  await act(async () => {
    root.render(
      <UserProvider>
        <MeetingProvider>
          <Probe />
        </MeetingProvider>
      </UserProvider>
    );
  });
  // ปล่อยให้ promise ของ fetch รอบแรกเดินจนจบก่อนเริ่ม assert
  await act(async () => {
    await Promise.resolve();
  });
}

async function click(id: string) {
  await act(async () => {
    container.querySelector<HTMLButtonElement>(`#${id}`)?.click();
  });
  // เส้นทางที่ server ปฏิเสธมีหลายทอด (persist → setError → reload) จึงรอ macrotask
  // ไม่ใช่แค่ microtask เดียว
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("MeetingContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMeetings.mockResolvedValue([sample]);
    createMeeting.mockImplementation(async (m) => m);
    saveMeeting.mockImplementation(async (m) => m);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("โหลดรายการจาก server ไม่ใช่จากข้อมูลจำลองในเครื่อง", async () => {
    fetchMeetings.mockResolvedValue([{ ...sample, name: "มาจาก server" }]);
    await mount();
    expect(fetchMeetings).toHaveBeenCalled();
    expect(text("state")).toBe("ready:1");
    expect(text("names")).toBe("มาจาก server");
  });

  it("สร้างประชุมใหม่แล้วยิง POST ขึ้น server", async () => {
    await mount();
    await click("add");

    expect(createMeeting).toHaveBeenCalledTimes(1);
    expect(createMeeting.mock.calls[0][0].id).toBe("MT-NEW-1");
    expect(text("names")).toContain("ประชุมใหม่");
  });

  it("แก้ไขแล้วส่งเฉพาะการประชุมที่เปลี่ยนจริง", async () => {
    await mount();
    await click("rename");

    expect(saveMeeting).toHaveBeenCalledTimes(1);
    expect(saveMeeting.mock.calls[0][0].name).toBe("แก้ชื่อแล้ว");
  });

  it("server ปฏิเสธการแก้ไข — แจ้ง error แล้วดึงของจริงกลับมาทับ", async () => {
    saveMeeting.mockRejectedValue(new ApiError(403, "ไม่มีสิทธิ์แก้ไขการประชุมนี้"));
    await mount();
    await click("rename");

    expect(text("error")).toBe("ไม่มีสิทธิ์แก้ไขการประชุมนี้");
    expect(fetchMeetings).toHaveBeenCalledTimes(2);
    expect(text("names")).toBe(sample.name);
  });

  it("ยังไม่ล็อกอิน (401) ถือว่าไม่มีรายการ ไม่ใช่ข้อผิดพลาด", async () => {
    fetchMeetings.mockRejectedValue(new ApiError(401, "Invalid token"));
    await mount();

    expect(text("state")).toBe("ready:0");
    expect(text("error")).toBe("-");
  });
});
