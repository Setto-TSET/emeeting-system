// src/app/(app)/live/[id]/RoomSignalBridge.test.tsx
//
// Fix round 1 (code review): ครอบคลุมพฤติกรรมที่แก้ไขใน RoomSignalBridge
//   1) สัญญาณสด (hand_state/doc_share_state) ที่มาถึงก่อน room snapshot ตอบกลับ ต้อง "ชนะ" —
//      snapshot ที่มาช้ากว่าต้องไม่ทับข้อมูลสด (ธง handSignalReceivedRef/docShareSignalReceivedRef)
//   3) doc_share_state อัปเดตไฟล์/หน้าที่แชร์ และเคลียร์ค่าเมื่อ share เป็น null
//
// Fix round 3 (code review): รอบที่ 2 พยายามเดา "ใครลดมือ" จากไคลเอนต์เอง (selfLoweredHandRef +
// disconnect reset) แล้วพังเพราะ hand_state เก่าที่มาถึงหลัง reconnect มี payload เหมือนกันเป๊ะ
// ไม่ว่าผู้ใช้จะลดมือเองหรือโฮสต์ลดให้ — ทำให้ toast โกหกได้ ตอนนี้เปลี่ยนมาใช้ attribution
// (`lastAction`) ที่ server เป็นคนบอกมาตรงๆ เท่านั้น ไม่มีการเดาฝั่งไคลเอนต์อีกต่อไป —
// selfLoweredHandRef/disconnect-reset ถูกลบทิ้งทั้งหมด (ดู page.tsx)
"use client";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { RoomSignalBridge } from "./RoomSignalBridge";
import type { RaisedHandDto, RoomSignal } from "@/services/signaling/types";
import type { RoomSnapshot } from "@/services/rooms/snapshot";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- Mock sonner toast: จับ toast.info/toast.error ---
const toastInfoMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfoMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

// --- Mock useRoomSignaling: จำลอง useSignal จริงด้วย subscribe/unsubscribe ผ่าน useEffect
// เหมือนของจริงใน RoomSignalingContext (ตามแพตเทิร์นของ VotePanel.test.tsx) ---
const broadcastMock = vi.fn();
const sendAudioMock = vi.fn();
type AnyHandler = (signal: RoomSignal) => void;
let handlersByType: Map<string, Set<AnyHandler>> = new Map();

vi.mock("@/context/RoomSignalingContext", () => ({
  useRoomSignaling: () => ({
    broadcast: broadcastMock,
    sendAudio: sendAudioMock,
    connected: true,
    useSignal: (type: string, handler: AnyHandler) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useEffect(() => {
        let set = handlersByType.get(type);
        if (!set) {
          set = new Set();
          handlersByType.set(type, set);
        }
        set.add(handler);
        return () => {
          set!.delete(handler);
        };
      }, [type, handler]);
    },
  }),
}));

function emit<T extends "hand_state" | "doc_share_state">(
  type: T,
  senderId: string,
  payload: RoomSignal<T>["payload"]
) {
  const signal: RoomSignal<T> = {
    type,
    senderId,
    senderName: senderId,
    timestamp: Date.now(),
    payload,
  };
  handlersByType.get(type)?.forEach((h) => h(signal as RoomSignal));
}

// Deferred promise ควบคุมได้เอง — ใช้จำลอง room snapshot ที่ตอบกลับช้า
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// Harness จำลองสิ่งที่ src/app/(app)/live/[id]/page.tsx ทำจริง: ถือ state + ref guard แล้ว
// ต่อกับ RoomSignalBridge ตัวจริง (import มาจาก ./page) — snapshotPromise แทน fetchRoomSnapshot()
function Harness({
  currentUserId,
  snapshotPromise,
}: {
  currentUserId: string;
  snapshotPromise: Promise<RoomSnapshot>;
}) {
  const [raisedHands, setRaisedHands] = useState<RaisedHandDto[]>([]);
  const [sharedFileId, setSharedFileId] = useState<string | null>(null);
  const [sharedViewerPage, setSharedViewerPage] = useState(1);
  const [latestSubtitle, setLatestSubtitle] = useState<RoomSignal<"subtitle_text"> | null>(null);
  const broadcastRef = useRef<((signal: unknown) => void) | null>(null);
  const sendAudioRef = useRef<((frame: ArrayBuffer) => void) | null>(null);
  const handSignalReceivedRef = useRef(false);
  const docShareSignalReceivedRef = useRef(false);

  useEffect(() => {
    snapshotPromise.then((snapshot) => {
      if (!handSignalReceivedRef.current) setRaisedHands(snapshot.raisedHands);
      if (!docShareSignalReceivedRef.current) setSharedFileId(snapshot.docShare?.fileId ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div data-testid="raised">{raisedHands.map((h) => h.userId).join(",")}</div>
      <div data-testid="shared-file">{sharedFileId ?? ""}</div>
      <div data-testid="shared-page">{sharedViewerPage}</div>
      <RoomSignalBridge
        currentUserId={currentUserId}
        broadcastRef={broadcastRef as React.MutableRefObject<((signal: unknown) => void) | null>}
        sendAudioRef={sendAudioRef}
        setRaisedHands={setRaisedHands}
        setLatestSubtitle={setLatestSubtitle}
        setSharedFileId={setSharedFileId}
        setSharedViewerPage={setSharedViewerPage}
        handSignalReceivedRef={handSignalReceivedRef}
        docShareSignalReceivedRef={docShareSignalReceivedRef}
      />
    </div>
  );
}

function emptySnapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return { voteTopics: [], raisedHands: [], transcript: [], docShare: null, ...overrides };
}

describe("RoomSignalBridge", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    handlersByType = new Map();
    broadcastMock.mockClear();
    toastInfoMock.mockClear();
    toastErrorMock.mockClear();
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

  it("does not let a late-resolving snapshot revert a hand_state that already landed", async () => {
    const snap = deferred<RoomSnapshot>();

    await act(async () => {
      root.render(<Harness currentUserId="U-1" snapshotPromise={snap.promise} />);
    });

    // สัญญาณสดมาถึงก่อน — มีคนยกมือ U-2
    await act(async () => {
      emit("hand_state", "server", { raised: [{ userId: "U-2", userName: "สมชาย", raisedAt: 1 }] });
    });
    expect(container.querySelector('[data-testid="raised"]')?.textContent).toBe("U-2");

    // snapshot เก่ากว่าเพิ่งตอบกลับมา (ว่างเปล่า) — ต้องไม่ทับข้อมูลสดที่เพิ่งได้รับ
    await act(async () => {
      snap.resolve(emptySnapshot({ raisedHands: [] }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="raised"]')?.textContent).toBe("U-2");
  });

  it("applies the snapshot when no live hand_state has landed yet", async () => {
    const snap = deferred<RoomSnapshot>();
    await act(async () => {
      root.render(<Harness currentUserId="U-1" snapshotPromise={snap.promise} />);
    });

    await act(async () => {
      snap.resolve(emptySnapshot({ raisedHands: [{ userId: "U-3", userName: "มาลี", raisedAt: 1 }] }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="raised"]')?.textContent).toBe("U-3");
  });

  it("toasts when hand_state attribution names another user lowering the current user's hand", async () => {
    const snap = deferred<RoomSnapshot>();
    await act(async () => {
      root.render(<Harness currentUserId="U-1" snapshotPromise={snap.promise} />);
      snap.resolve(emptySnapshot());
    });

    await act(async () => {
      emit("hand_state", "server", {
        raised: [],
        lastAction: { userId: "U-1", byUserId: "U-2" },
      });
    });

    expect(toastInfoMock).toHaveBeenCalledWith("โฮสต์ลดมือให้คุณแล้ว");
  });

  it("does not toast when hand_state attribution names the current user as the actor", async () => {
    const snap = deferred<RoomSnapshot>();
    await act(async () => {
      root.render(<Harness currentUserId="U-1" snapshotPromise={snap.promise} />);
      snap.resolve(emptySnapshot());
    });

    await act(async () => {
      emit("hand_state", "server", {
        raised: [],
        lastAction: { userId: "U-1", byUserId: "U-1" },
      });
    });

    expect(toastInfoMock).not.toHaveBeenCalled();
  });

  it("does not toast on a hand_state with no attribution, even if the current user disappears from raised", async () => {
    // นี่คือ regression test ของ toast โกหกจากรอบที่ 2: hand_state เก่าที่ไม่มี lastAction (ทุกข้อความ
    // วันนี้เป็นแบบนี้ทั้งหมด เพราะ server ยังไม่ส่ง lastAction มา) ต้องไม่ toast แม้ currentUser
    // จะหายไปจาก raised list ก็ตาม — ห้ามมีใครใส่การเดาแบบ diff-based กลับเข้ามาแทน
    const snap = deferred<RoomSnapshot>();
    await act(async () => {
      root.render(<Harness currentUserId="U-1" snapshotPromise={snap.promise} />);
      snap.resolve(emptySnapshot());
    });

    await act(async () => {
      emit("hand_state", "server", { raised: [{ userId: "U-1", userName: "ผู้ใช้ทดสอบ", raisedAt: 1 }] });
    });
    expect(toastInfoMock).not.toHaveBeenCalled();

    // U-1 หายไปจาก raised list แต่ไม่มี lastAction แนบมา — ไม่รู้ว่าใครทำ ต้องเงียบ
    await act(async () => {
      emit("hand_state", "server", { raised: [] });
    });

    expect(toastInfoMock).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="raised"]')?.textContent).toBe("");
  });

  it("doc_share_state updates the shared file and page, and a null share clears it", async () => {
    const snap = deferred<RoomSnapshot>();
    await act(async () => {
      root.render(<Harness currentUserId="U-1" snapshotPromise={snap.promise} />);
      snap.resolve(emptySnapshot());
    });

    await act(async () => {
      emit("doc_share_state", "U-2", {
        share: { fileId: "F-1", fileName: "วาระ.pdf", page: 3, sharedBy: "U-2", sharedName: "เลขานุการ" },
      });
    });
    expect(container.querySelector('[data-testid="shared-file"]')?.textContent).toBe("F-1");
    expect(container.querySelector('[data-testid="shared-page"]')?.textContent).toBe("3");
    expect(toastInfoMock).toHaveBeenCalledWith("เลขานุการ กำลังแชร์เอกสาร: วาระ.pdf");

    await act(async () => {
      emit("doc_share_state", "U-2", { share: null });
    });
    expect(container.querySelector('[data-testid="shared-file"]')?.textContent).toBe("");
    expect(container.querySelector('[data-testid="shared-page"]')?.textContent).toBe("1");
  });
});
