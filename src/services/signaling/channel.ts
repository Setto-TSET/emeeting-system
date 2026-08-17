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

export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 15000;

// จำกัดคิวก่อนต่อสำเร็จ กันหน่วยความจำบวมตอนหลุดการเชื่อมต่อนาน ๆ
// (เช่น subtitle_text ที่ยิงถี่ทุกผลลัพธ์การถอดเสียงบางส่วน)
export const MAX_QUEUE_SIZE = 50;

// สัญญาณกลุ่มนี้คือ "สถานะล่าสุด" ของสิ่งหนึ่ง ไม่ใช่ลำดับเหตุการณ์ที่ต้องเรียงกัน
// ต่อกลับมาแล้วส่งแค่ค่าล่าสุดก็พอ — ของเก่าในคิวถูกแทนที่ ไม่สะสม
const COALESCE_ON_RECONNECT: ReadonlySet<SignalType> = new Set<SignalType>([
  "hand_raise",
  "hand_lower",
  "doc_share",
  "doc_share_page",
  "doc_share_stop",
]);

// สัญญาณกลุ่มนี้ transient เกินกว่าจะมีความหมายหลังต่อกลับมา — ทิ้งทันทีตอนออฟไลน์
// (คำบรรยายบางส่วนที่เก่าไปแล้วไม่มีประโยชน์ ผู้ใช้พิมพ์/พูดใหม่เองเมื่อกลับมาต่อ)
const DISCARD_WHEN_OFFLINE: ReadonlySet<SignalType> = new Set<SignalType>(["subtitle_text"]);

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
  const queue: { type: SignalType; body: string }[] = [];

  const flush = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    while (queue.length > 0) socket.send(queue.shift()!.body);
  };

  // ใช้ backoff เดียวกันทั้งตอน onclose และตอนไม่มี token — ไม่งั้น transport
  // จะค้างตายถ้า provider mount ก่อน token hydrate เสร็จ (เช่น hard refresh)
  const scheduleReconnect = () => {
    if (closedByCaller) return;
    attempt += 1;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS);
    reconnectTimer = setTimeout(connect, delay);
  };

  const connect = () => {
    const token = getAccessToken();
    if (!token) {
      handlers.onStatus(false);
      scheduleReconnect();
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
      scheduleReconnect();
    };

    socket.onerror = () => {
      // onclose จะตามมาเสมอ ปล่อยให้ตรงนั้นจัดการ reconnect ที่เดียว
    };
  };

  connect();

  return {
    send(type, payload) {
      const body = JSON.stringify({ type, payload });
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(body);
        return;
      }
      if (DISCARD_WHEN_OFFLINE.has(type)) return;
      if (COALESCE_ON_RECONNECT.has(type)) {
        const existingIndex = queue.findIndex((item) => item.type === type);
        if (existingIndex !== -1) {
          queue[existingIndex] = { type, body };
          return;
        }
      }
      queue.push({ type, body });
      if (queue.length > MAX_QUEUE_SIZE) queue.shift();
    },
    close() {
      closedByCaller = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    },
  };
}
