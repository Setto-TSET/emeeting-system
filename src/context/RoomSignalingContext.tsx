// src/context/RoomSignalingContext.tsx
"use client";

import { createContext, useContext, useEffect, useRef, useCallback, useState, ReactNode } from "react";
import type { RoomSignal, SignalType } from "@/services/signaling/types";
import { openStream, postSignal, isRoomSignal } from "@/services/signaling/channel";
import { useCurrentUser } from "./UserContext";

type Ctx = {
  broadcast: <T extends SignalType>(signal: Omit<RoomSignal<T>, "senderId" | "senderName" | "timestamp">) => void;
  useSignal: <T extends SignalType>(type: T, handler: (signal: RoomSignal<T>) => void) => void;
  connected: boolean;
};

const RoomSignalingContext = createContext<Ctx | null>(null);

type Listener = (signal: RoomSignal) => void;

export function RoomSignalingProvider({ meetingId, children }: { meetingId: string; children: ReactNode }) {
  const { currentUser } = useCurrentUser();
  const listenersRef = useRef<Map<SignalType, Set<Listener>>>(new Map());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const stream = openStream(meetingId);
    if (!stream) return;

    // สัญญาณของตัวเองเด้งกลับมาจาก server ด้วย — ตัดทิ้งตรงนี้จุดเดียว
    // ไม่งั้นผู้ส่งจะเห็น toast ของตัวเองซ้ำ และ handler ที่นับค่าจะนับสองรอบ
    const onMessage = (event: MessageEvent) => {
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!isRoomSignal(data)) return;
      if (data.senderId === currentUser.id) return;
      listenersRef.current.get(data.type)?.forEach((fn) => fn(data));
    };

    stream.addEventListener("message", onMessage);
    stream.addEventListener("open", () => setConnected(true));
    // เบราว์เซอร์ต่อใหม่ให้เองเมื่อสายหลุด — แค่บอกสถานะให้ UI รู้
    stream.addEventListener("error", () => setConnected(false));

    return () => {
      stream.removeEventListener("message", onMessage);
      stream.close();
      setConnected(false);
    };
  }, [meetingId, currentUser.id]);

  const broadcast = useCallback<Ctx["broadcast"]>(
    (partial) => {
      postSignal(meetingId, partial);
    },
    [meetingId]
  );

  const useSignal = useCallback<Ctx["useSignal"]>((type, handler) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      let set = listenersRef.current.get(type);
      if (!set) {
        set = new Set();
        listenersRef.current.set(type, set);
      }
      const wrapped: Listener = (signal) => handler(signal as RoomSignal<typeof type>);
      set.add(wrapped);
      return () => {
        set!.delete(wrapped);
      };
    }, [type, handler]);
  }, []);

  return (
    <RoomSignalingContext.Provider value={{ broadcast, useSignal, connected }}>
      {children}
    </RoomSignalingContext.Provider>
  );
}

export function useRoomSignaling() {
  const ctx = useContext(RoomSignalingContext);
  if (!ctx) throw new Error("useRoomSignaling must be used within RoomSignalingProvider");
  return ctx;
}
