// src/context/RoomSignalingContext.tsx
"use client";

import { createContext, useContext, useEffect, useRef, useCallback, useState, ReactNode } from "react";
import type { RoomSignal, SignalType } from "@/services/signaling/types";
import { openChannel, postSignal, isRoomSignal } from "@/services/signaling/channel";
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
  const channelRef = useRef<BroadcastChannel | null>(null);
  const listenersRef = useRef<Map<SignalType, Set<Listener>>>(new Map());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const channel = openChannel(meetingId);
    channelRef.current = channel;
    setConnected(channel !== null);
    if (!channel) return;

    const onMessage = (event: MessageEvent) => {
      if (!isRoomSignal(event.data)) return;
      const signal = event.data as RoomSignal;
      const set = listenersRef.current.get(signal.type);
      set?.forEach((fn) => fn(signal));
    };
    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
      channelRef.current = null;
      setConnected(false);
    };
  }, [meetingId]);

  const broadcast = useCallback<Ctx["broadcast"]>(
    (partial) => {
      const signal: RoomSignal = {
        ...partial,
        senderId: currentUser.id,
        senderName: currentUser.name,
        timestamp: Date.now(),
      };
      postSignal(channelRef.current, signal);
    },
    [currentUser.id, currentUser.name]
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
