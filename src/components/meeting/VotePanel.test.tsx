// src/components/meeting/VotePanel.test.tsx
//
// ครอบคลุมสัญญาที่สำคัญที่สุดของ Task 10: VotePanel ต้อง "ไม่" อัปเดต UI แบบ optimistic
// เมื่อกดโหวต — ต้องรอสัญญาณ vote_state จาก server ก่อนเสมอ เพราะ server อาจปฏิเสธการโหวต
// (หัวข้อปิดแล้ว/ไม่มีสิทธิ์) นอกจากนี้ยังครอบคลุม applyTopic (merge แทนที่ vs. เพิ่มใหม่)
// และ payload ของ broadcast() สำหรับ vote_create/vote_cast/vote_close
"use client";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useEffect } from "react";
import { VotePanel } from "./VotePanel";
import type { VoteTopic } from "@/services/voting/types";
import type { RoomSignal } from "@/services/signaling/types";

// React 19's act() checks this global to know it's safe to batch/flush updates in tests.
// We render directly with react-dom/client (no testing-library), so it must be set explicitly.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- Mock listTopics: ทำหน้าที่แทน GET /api/rooms/:meetingId/state ---
const listTopicsMock = vi.fn<(meetingId: string) => Promise<VoteTopic[]>>();
vi.mock("@/services/voting/store", () => ({
  listTopics: (meetingId: string) => listTopicsMock(meetingId),
}));

// --- Mock useRoomSignaling: capture broadcast() calls, expose a way to push vote_state ---
const broadcastMock = vi.fn();
type VoteStateHandler = (signal: RoomSignal<"vote_state">) => void;
let voteStateHandlers: VoteStateHandler[] = [];

vi.mock("@/context/RoomSignalingContext", () => ({
  useRoomSignaling: () => ({
    broadcast: broadcastMock,
    connected: true,
    // จำลอง useSignal จริง: ผูก/ถอน handler ผ่าน useEffect เหมือน RoomSignalingContext จริง
    // เพื่อให้พฤติกรรม subscribe/unsubscribe ตรงกับของจริง ไม่ใช่แค่ stub เปล่าๆ
    useSignal: (type: string, handler: (signal: RoomSignal) => void) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useEffect(() => {
        if (type !== "vote_state") return;
        const wrapped = handler as VoteStateHandler;
        voteStateHandlers.push(wrapped);
        return () => {
          voteStateHandlers = voteStateHandlers.filter((h) => h !== wrapped);
        };
      }, [type, handler]);
    },
  }),
}));

// --- Mock useCurrentUser: VotePanel needs currentUser.id ---
vi.mock("@/context/UserContext", () => ({
  useCurrentUser: () => ({
    currentUser: { id: "U-1", name: "ผู้ใช้ทดสอบ", email: "u1@test.local", systemRole: "member" },
    setCurrentUser: vi.fn(),
    users: [],
  }),
}));

function makeTopic(overrides: Partial<VoteTopic> = {}): VoteTopic {
  return {
    id: "vote-1",
    meetingId: "MT-1",
    title: "อนุมัติงบประมาณ",
    options: [
      { id: "opt-1", label: "เห็นด้วย" },
      { id: "opt-2", label: "ไม่เห็นด้วย" },
    ],
    createdBy: "U-2",
    createdByName: "ผู้จัดประชุม",
    createdAt: 1,
    status: "open",
    votes: [],
    ...overrides,
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function click(el: Element) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function emitVoteState(topic: VoteTopic) {
  const signal: RoomSignal<"vote_state"> = {
    type: "vote_state",
    senderId: "server",
    senderName: "server",
    timestamp: Date.now(),
    payload: { topic },
  };
  voteStateHandlers.forEach((h) => h(signal));
}

describe("VotePanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    voteStateHandlers = [];
    broadcastMock.mockClear();
    listTopicsMock.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  async function renderPanel(canManage: boolean) {
    await act(async () => {
      root.render(<VotePanel meetingId="MT-1" canManage={canManage} voteRefreshToken={0} />);
    });
    // flush the listTopics().then(setTopics) microtask + resulting re-render
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("does not update vote counts optimistically — only a vote_state signal moves the UI", async () => {
    const topic = makeTopic();
    listTopicsMock.mockResolvedValue([topic]);
    await renderPanel(false);

    const optionButtons = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.querySelector("span")?.textContent === "เห็นด้วย"
    );
    expect(optionButtons).toHaveLength(1);
    const optionButton = optionButtons[0];
    expect(optionButton.textContent).toContain("0 (0%)");

    await act(async () => {
      click(optionButton);
    });

    // broadcast() ถูกเรียก แต่ห้ามมีการอัปเดตตัวเลขใดๆ ก่อนได้รับ vote_state กลับมา
    expect(broadcastMock).toHaveBeenCalledTimes(1);
    expect(broadcastMock).toHaveBeenCalledWith({
      type: "vote_cast",
      payload: { topicId: "vote-1", optionId: "opt-1" },
    });
    expect(optionButton.textContent).toContain("0 (0%)");

    // ตอนนี้ server ตอบกลับมาด้วย vote_state ที่มีคะแนนจริง — ค่อยอัปเดต UI
    await act(async () => {
      emitVoteState({
        ...topic,
        votes: [{ userId: "U-1", userName: "ผู้ใช้ทดสอบ", optionId: "opt-1", timestamp: 2 }],
      });
    });

    const updatedButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.querySelector("span")?.textContent === "เห็นด้วย"
    )!;
    expect(updatedButton.textContent).toContain("1 (100%)");
  });

  it("applyTopic replaces an existing topic by id instead of duplicating it", async () => {
    const topic = makeTopic();
    listTopicsMock.mockResolvedValue([topic]);
    await renderPanel(false);

    expect(container.querySelectorAll('[data-slot="dialog-content"]').length).toBe(0);
    expect(container.textContent).toContain("อนุมัติงบประมาณ");

    await act(async () => {
      emitVoteState({ ...topic, title: "อนุมัติงบประมาณ (แก้ไขแล้ว)" });
    });

    expect(container.textContent).toContain("อนุมัติงบประมาณ (แก้ไขแล้ว)");
    expect(container.textContent).not.toContain("อนุมัติงบประมาณ (ยัง"); // sanity: no stale text
    // ยังมีการ์ดเดียว ไม่ใช่สองใบ
    const cards = container.querySelectorAll('[class*="text-sm"]');
    const titleOccurrences = Array.from(container.querySelectorAll("*")).filter(
      (el) => el.textContent === "อนุมัติงบประมาณ (แก้ไขแล้ว)" && el.children.length === 0
    );
    expect(titleOccurrences).toHaveLength(1);
  });

  it("applyTopic inserts a topic never seen locally (created by another participant)", async () => {
    const topic = makeTopic();
    listTopicsMock.mockResolvedValue([topic]);
    await renderPanel(false);

    expect(container.textContent).not.toContain("มติใหม่จากคนอื่น");

    const otherTopic = makeTopic({ id: "vote-2", title: "มติใหม่จากคนอื่น" });
    await act(async () => {
      emitVoteState(otherTopic);
    });

    expect(container.textContent).toContain("อนุมัติงบประมาณ");
    expect(container.textContent).toContain("มติใหม่จากคนอื่น");
  });

  it("broadcasts a vote_cast intent exactly once per click", async () => {
    const topic = makeTopic();
    listTopicsMock.mockResolvedValue([topic]);
    await renderPanel(false);

    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("ไม่เห็นด้วย")
    )!;
    await act(async () => {
      click(button);
    });

    expect(broadcastMock).toHaveBeenCalledTimes(1);
    expect(broadcastMock).toHaveBeenCalledWith({
      type: "vote_cast",
      payload: { topicId: "vote-1", optionId: "opt-2" },
    });
  });

  it("broadcasts a vote_close intent exactly once when a manager closes a topic", async () => {
    const topic = makeTopic();
    listTopicsMock.mockResolvedValue([topic]);
    await renderPanel(true);

    const closeButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "ปิดโหวต"
    )!;
    await act(async () => {
      click(closeButton);
    });

    expect(broadcastMock).toHaveBeenCalledTimes(1);
    expect(broadcastMock).toHaveBeenCalledWith({
      type: "vote_close",
      payload: { topicId: "vote-1" },
    });
  });

  it("broadcasts a vote_create intent with the drafted title and default options", async () => {
    listTopicsMock.mockResolvedValue([]);
    await renderPanel(true);

    const openCreateButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "+ สร้างโหวต"
    )!;
    await act(async () => {
      click(openCreateButton);
    });

    const titleInput = document.querySelector<HTMLInputElement>(
      'input[placeholder="หัวข้อโหวต เช่น อนุมัติงบประมาณ Q3"]'
    )!;
    expect(titleInput).not.toBeNull();

    await act(async () => {
      setInputValue(titleInput, "อนุมัติแผนงาน");
    });

    const submitButton = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "สร้างโหวต"
    )!;
    await act(async () => {
      click(submitButton);
    });

    expect(broadcastMock).toHaveBeenCalledTimes(1);
    expect(broadcastMock).toHaveBeenCalledWith({
      type: "vote_create",
      payload: {
        title: "อนุมัติแผนงาน",
        options: [
          { id: "opt-1", label: "เห็นด้วย" },
          { id: "opt-2", label: "ไม่เห็นด้วย" },
          { id: "opt-3", label: "งดออกเสียง" },
        ],
      },
    });
  });
});
