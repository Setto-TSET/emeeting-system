// src/services/signaling/channel.ts
//
// เดิมใช้ BroadcastChannel ซึ่งคุยได้แค่ระหว่างแท็บของเบราว์เซอร์เดียวกันบนเครื่องเดียวกัน
// ตอนนี้ต่อ WebSocket ไปที่ backend จริง — sync ข้ามเครื่องได้
// token แนบไปกับ query string เพราะ WebSocket ฝั่งเบราว์เซอร์ตั้ง header เองไม่ได้

import type { RoomSignal, SignalType } from "./types";
import { getAccessToken } from "@/services/api/client";

export type RoomTransport = {
  send: (type: SignalType, payload: unknown) => void;
  close: () => void;
};

export type TransportHandlers = {
  onMessage: (signal: RoomSignal) => void;
  onStatus: (connected: boolean) => void;
};

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export function wsBaseUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";
}

export function isRoomSignal(data: unknown): data is RoomSignal {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    "senderId" in data &&
    "timestamp" in data &&
    "payload" in data
  );
}

export function openTransport(meetingId: string, handlers: TransportHandlers): RoomTransport {
  let socket: WebSocket | null = null;
  let closedByCaller = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const queue: string[] = [];

  const flush = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    while (queue.length > 0) socket.send(queue.shift()!);
  };

  const connect = () => {
    const token = getAccessToken();
    if (!token) {
      handlers.onStatus(false);
      return;
    }

    const url = `${wsBaseUrl()}?meetingId=${encodeURIComponent(meetingId)}&token=${encodeURIComponent(token)}`;
    socket = new WebSocket(url);
    handlers.onStatus(false);

    socket.onopen = () => {
      attempt = 0;
      handlers.onStatus(true);
      flush();
    };

    socket.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof event.data === "string" ? event.data : "");
      } catch {
        return;
      }
      if (!isRoomSignal(parsed)) return;
      handlers.onMessage(parsed);
    };

    socket.onclose = () => {
      handlers.onStatus(false);
      if (closedByCaller) return;
      attempt += 1;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS);
      reconnectTimer = setTimeout(connect, delay);
    };

    socket.onerror = () => {
      // onclose จะตามมาเสมอ ปล่อยให้ตรงนั้นจัดการ reconnect ที่เดียว
    };
  };

  connect();

  return {
    send(type, payload) {
      const body = JSON.stringify({ type, payload });
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(body);
      else queue.push(body);
    },
    close() {
      closedByCaller = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    },
  };
}
