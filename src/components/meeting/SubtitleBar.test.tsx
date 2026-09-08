import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SubtitleBar } from "./SubtitleBar";
import type { RoomSignal } from "@/services/signaling/types";

function signal(senderId: string, text: string, isFinal: boolean): RoomSignal<"subtitle_text"> {
  return {
    type: "subtitle_text",
    senderId,
    senderName: senderId === "U-1" ? "มาลี" : "สมชาย",
    timestamp: Date.now(),
    payload: { text, isFinal, lang: "th-TH" },
  } as RoomSignal<"subtitle_text">;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SubtitleBar", () => {
  it("partial ของผู้พูดคนเดิมแทนที่บรรทัดเดิม ไม่สะสม", () => {
    act(() => root.render(<SubtitleBar latest={signal("U-1", "สวัส", false)} />));
    act(() => root.render(<SubtitleBar latest={signal("U-1", "สวัสดีค", false)} />));
    act(() => root.render(<SubtitleBar latest={signal("U-1", "สวัสดีครับ", false)} />));

    const lines = container.querySelectorAll("p");
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toContain("สวัสดีครับ");
  });

  it("final ปิดบรรทัดนั้น แล้ว partial ถัดไปขึ้นบรรทัดใหม่", () => {
    act(() => root.render(<SubtitleBar latest={signal("U-1", "สวัสดีครับ", true)} />));
    act(() => root.render(<SubtitleBar latest={signal("U-1", "วาระแรก", false)} />));

    const lines = container.querySelectorAll("p");
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain("สวัสดีครับ");
    expect(lines[1].textContent).toContain("วาระแรก");
  });

  it("partial ของคนละคนไม่ทับกัน", () => {
    act(() => root.render(<SubtitleBar latest={signal("U-1", "ผมขอ", false)} />));
    act(() => root.render(<SubtitleBar latest={signal("U-2", "เห็นด้วย", false)} />));

    const lines = container.querySelectorAll("p");
    expect(lines).toHaveLength(2);
  });

  it("แสดงไม่เกินสองบรรทัด", () => {
    act(() => root.render(<SubtitleBar latest={signal("U-1", "หนึ่ง", true)} />));
    act(() => root.render(<SubtitleBar latest={signal("U-1", "สอง", true)} />));
    act(() => root.render(<SubtitleBar latest={signal("U-1", "สาม", true)} />));

    expect(container.querySelectorAll("p")).toHaveLength(2);
  });
});
