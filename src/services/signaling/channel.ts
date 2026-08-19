// src/services/signaling/channel.ts
//
// ขาส่ง/ขารับสัญญาณในห้องประชุม ผ่าน API แทน BroadcastChannel เดิม
// (BroadcastChannel ส่งได้แค่ระหว่างแท็บของเบราว์เซอร์เดียวกัน — คนละเครื่องไม่เคยเห็นกัน)

import { apiCall } from "@/lib/api/client";
import type { RoomSignal } from "./types";

/** เปิดสตรีมรับสัญญาณของห้องนี้ — คืน EventSource ให้ผู้เรียกปิดเองตอน unmount */
export function openStream(meetingId: string): EventSource | null {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return null;
  // EventSource แนบ Authorization header ไม่ได้ จึงอาศัย session cookie ที่เบราว์เซอร์ส่งให้เอง
  return new EventSource(`/api/meetings/${meetingId}/events`);
}

/** ส่งสัญญาณให้ทุกคนในห้อง — server เป็นคนเติมชื่อผู้ส่งและเวลา */
export function postSignal(
  meetingId: string,
  signal: Pick<RoomSignal, "type" | "payload">
): Promise<unknown> {
  return apiCall(`/api/meetings/${meetingId}/events`, {
    method: "POST",
    body: JSON.stringify(signal),
  }).catch((error) => {
    // ส่งไม่ถึงคนอื่นไม่ควรทำให้หน้าจอของผู้ส่งพัง — UI อัปเดตฝั่งตัวเองไปแล้ว
    console.warn("[signaling] ส่งสัญญาณไม่สำเร็จ", error);
  });
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
