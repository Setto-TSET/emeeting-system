// src/app/(app)/live/[id]/RoomSignalBridge.test.tsx
//
// Fix round 1 (code review): ครอบคลุมพฤติกรรมที่แก้ไขใน RoomSignalBridge
//   1) สัญญาณสด (hand_state/doc_share_state) ที่มาถึงก่อน room snapshot ตอบกลับ ต้อง "ชนะ" —
//      snapshot ที่มาช้ากว่าต้องไม่ทับข้อมูลสด (ธง handSignalReceivedRef/docShareSignalReceivedRef)
//   2) hand_state ที่ทำให้ currentUser หลุดจากรายชื่อคนยกมือ ต้อง toast "โฮสต์ลดมือให้คุณแล้ว"
//      เฉพาะตอนที่ "คนอื่น" ลดมือให้ — ไม่ toast ถ้าผู้ใช้กดลดมือตัวเอง (selfLoweredHandRef)
//   3) doc_share_state อัปเดตไฟล์/หน้าที่แชร์ และเคลียร์ค่าเมื่อ share เป็น null
//
// Fix round 2 (code review): selfLoweredHandRef ต้องไม่ค้าง true ตลอดไปถ้า hand_state ที่คู่กันไม่มาถึง
// (เช่น disconnect กลางทาง) — ไม่งั้นตอนโฮสต์มาลดมือให้จริงทีหลัง toast จะถูกกลืนทิ้งผิดๆ
// ทดสอบด้วยการจำลอง connected: true -> false -> true ผ่าน setConnectedMock
"use client";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { RoomSignalBridge } from "./page";
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
type AnyHandler = (signal: RoomSignal) => void;
let handlersByType: Map<string, Set<AnyHandler>> = new Map();

// --- ควบคุม `connected` จากภายนอกได้ — จำลอง transport disconnect/reconnect ---
// pub/sub ธรรมดา: useRoomSignaling() ผูก useState เข้ากับ listener set นี้ผ่าน useEffect
// เพื่อให้ component ที่ใช้ useRoomSignaling() re-render เมื่อ setConnectedMock ถูกเรียก
let connectedValue = true;
const connectedListeners = new Set<() => void>();
function setConnectedMock(value: boolean) {
  connectedValue = value;
  connectedListeners.forEach((fn) => fn());
}

vi.mock("@/context/RoomSignalingContext", () => ({
  useRoomSignaling: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [connected, setConnected] = useState(connectedValue);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      const listener = () => setConnected(connectedValue);
      connectedListeners.add(listener);
      return () => {
        connectedListeners.delete(listener);
      };
    }, []);
    return {
      broadcast: broadcastMock,
      connected,
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
    };
  },
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
  const handSignalReceivedRef = useRef(false);
  const docShareSignalReceivedRef = useRef(false);
  const selfLoweredHandRef = useRef(false);

  useEffect(() => {
    snapshotPromise.then((snapshot) => {
      if (!handSignalReceivedRef.current) setRaisedHands(snapshot.raisedHands);
      if (!docShareSignalReceivedRef.current) setSharedFileId(snapshot.docShare?.fileId ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMyHand = (next: boolean) => {
    if (!next) selfLoweredHandRef.current = true;
  };

  return (
    <div>
      <div data-testid="raised">{raisedHands.map((h) => h.userId).join(",")}</div>
      <div data-testid="shared-file">{sharedFileId ?? ""}</div>
      <div data-testid="shared-page">{sharedViewerPage}</div>
      <button data-testid="lower-self" onClick={() => toggleMyHand(false)} />
      <RoomSignalBridge
        currentUserId={currentUserId}
        broadcastRef={broadcastRef as React.MutableRefObject<((signal: unknown) => void) | null>}
        setRaisedHands={setRaisedHands}
        setLatestSubtitle={setLatestSubtitle}
        setSharedFileId={setSharedFileId}
        setSharedViewerPage={setSharedViewerPage}
        handSignalReceivedRef={handSignalReceivedRef}
        docShareSignalReceivedRef={docShareSignalReceivedRef}
        selfLoweredHandRef={selfLoweredHandRef}
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
    setConnectedMock(true);
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

  it("toasts the target when the chair lowers someone else's hand", async () => {
    const snap = deferred<RoomSnapshot>();
    await act(async () => {
      root.render(<Harness currentUserId="U-1" snapshotPromise={snap.promise} />);
      snap.resolve(emptySnapshot());
    });

    // U-1 ถูกยกมืออยู่ก่อน
    await act(async () => {
      emit("hand_state", "server", { raised: [{ userId: "U-1", userName: "ผู้ใช้ทดสอบ", raisedAt: 1 }] });
    });
    expect(toastInfoMock).not.toHaveBeenCalled();

    // โฮสต์ (ไม่ใช่ U-1) ลดมือให้ — ไม่มีการกด lower-self ก่อน
    await act(async () => {
      emit("hand_state", "server", { raised: [] });
    });

    expect(toastInfoMock).toHaveBeenCalledWith("โฮสต์ลดมือให้คุณแล้ว");
    expect(container.querySelector('[data-testid="raised"]')?.textContent).toBe("");
  });

  it("does not toast when the user lowers their own hand", async () => {
    const snap = deferred<RoomSnapshot>();
    await act(async () => {
      root.render(<Harness currentUserId="U-1" snapshotPromise={snap.promise} />);
      snap.resolve(emptySnapshot());
    });

    await act(async () => {
      emit("hand_state", "server", { raised: [{ userId: "U-1", userName: "ผู้ใช้ทดสอบ", raisedAt: 1 }] });
    });

    // ผู้ใช้กดลดมือตัวเอง — ตั้งธง selfLoweredHandRef ก่อนที่ hand_state จะตอบกลับ
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="lower-self"]')!.click();
    });
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

  it("clears a stuck selfLoweredHandRef on disconnect so a later chair-lower still toasts", async () => {
    const snap = deferred<RoomSnapshot>();
    await act(async () => {
      root.render(<Harness currentUserId="U-1" snapshotPromise={snap.promise} />);
      snap.resolve(emptySnapshot());
    });

    // U-1 ถูกยกมืออยู่ก่อน
    await act(async () => {
      emit("hand_state", "server", { raised: [{ userId: "U-1", userName: "ผู้ใช้ทดสอบ", raisedAt: 1 }] });
    });

    // ผู้ใช้กดลดมือตัวเอง — ตั้งธง selfLoweredHandRef แล้วส่ง intent ไป แต่ hand_state ที่คาดว่าจะ
    // ตอบกลับ "ไม่มาถึง" เลย (จำลองสาย disconnect กลางทาง)
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="lower-self"]')!.click();
    });

    // สาย disconnect แล้ว reconnect — เจตนาที่ค้างอยู่ (ยกมือ) ไม่มีทางได้ hand_state คู่กันแล้ว
    // ธงต้องถูกเคลียร์ตรงนี้ ไม่งั้นจะค้าง true ตลอดไป
    await act(async () => {
      setConnectedMock(false);
    });
    await act(async () => {
      setConnectedMock(true);
    });

    // ทีนี้โฮสต์ลดมือให้ "จริงๆ" (เหตุการณ์ใหม่ ไม่เกี่ยวกับ intent ที่หลุดไปก่อนหน้า) — ต้องได้ toast
    // เพราะธง selfLoweredHandRef ถูกเคลียร์ไปแล้วตอน disconnect ไม่ใช่ถูกกลืนทิ้งผิดๆ
    await act(async () => {
      emit("hand_state", "server", { raised: [] });
    });

    expect(toastInfoMock).toHaveBeenCalledWith("โฮสต์ลดมือให้คุณแล้ว");
  });
});
