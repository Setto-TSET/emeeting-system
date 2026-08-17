// src/context/RoomSignalingContext.tsx
"use client";

import { createContext, useContext, useEffect, useRef, useCallback, useState, ReactNode } from "react";
import type { RoomSignal, SignalType } from "@/services/signaling/types";
import { openTransport, type RoomTransport } from "@/services/signaling/channel";

type Ctx = {
  broadcast: <T extends SignalType>(signal: Omit<RoomSignal<T>, "senderId" | "senderName" | "timestamp">) => void;
  useSignal: <T extends SignalType>(type: T, handler: (signal: RoomSignal<T>) => void) => void;
  connected: boolean;
};

const RoomSignalingContext = createContext<Ctx | null>(null);

type Listener = (signal: RoomSignal) => void;

export function RoomSignalingProvider({ meetingId, children }: { meetingId: string; children: ReactNode }) {
  const transportRef = useRef<RoomTransport | null>(null);
  const listenersRef = useRef<Map<SignalType, Set<Listener>>>(new Map());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const transport = openTransport(meetingId, {
      onMessage: (signal) => {
        const set = listenersRef.current.get(signal.type);
        set?.forEach((fn) => fn(signal));
      },
      onStatus: setConnected,
    });
    transportRef.current = transport;

    return () => {
      transport.close();
      transportRef.current = null;
      setConnected(false);
    };
  }, [meetingId]);

  // senderId/senderName ไม่ส่งไปแล้ว — server เติมจาก JWT เอง client ปลอมตัวไม่ได้
  const broadcast = useCallback<Ctx["broadcast"]>((partial) => {
    transportRef.current?.send(partial.type, partial.payload);
  }, []);

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
