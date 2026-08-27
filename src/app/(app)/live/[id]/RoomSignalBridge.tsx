"use client";

// RoomSignalBridge อยู่ไฟล์แยกจาก page.tsx เพราะ Next ยอมให้ไฟล์ page export ได้เฉพาะ
// default export กับ metadata ที่กำหนดไว้เท่านั้น — export คอมโพเนนต์อื่นจากไฟล์ page ทำให้ build ล้ม

import { useEffect } from "react";
import { toast } from "sonner";
import { useRoomSignaling } from "@/context/RoomSignalingContext";
import type { RoomSignal, RaisedHandDto } from "@/services/signaling/types";

export type Broadcast = ReturnType<typeof useRoomSignaling>["broadcast"];

/**
 * ต้องเป็นคอมโพเนนต์ลูกที่ render อยู่ใต้ RoomSignalingProvider เพราะ useRoomSignaling()
 * ใช้ไม่ได้ในตัว LiveMeetingRoomPage เอง (มันเป็นคนสร้าง Provider ขึ้นมา ไม่ได้อยู่ใต้ Provider)
 * — ส่ง broadcast กลับขึ้นไปให้ parent ผ่าน ref แทนการยกทั้งหน้าเข้าไปอยู่ใต้ Provider
 *
 * คอมโพเนนต์นี้ mount อยู่ตลอดอายุห้องประชุม (ไม่ผูกกับแท็บที่เปิดอยู่) จึงเป็นที่รวมของทุกสัญญาณ
 * ที่ต้องทำงานได้ไม่ว่าผู้ใช้จะเปิดแท็บไหนอยู่: hand_state (สถานะมือที่ยกอยู่ ณ ปัจจุบัน — server เป็นเจ้าของ),
 * subtitle_text (คำบรรยายที่ผู้พูดคนอื่นส่งมา — server เป็นคนบันทึกลง transcript เมื่อ isFinal, ฝั่งนี้แค่แสดงผล),
 * doc_share_state (สถานะเอกสารที่กำลังแชร์ ณ ปัจจุบัน — server เป็นเจ้าของ),
 * และ signal_error (แจ้งเตือนเมื่อ server ปฏิเสธเจตนาที่ส่งไป — สัญญาณ vote_* ตอนนี้ VotePanel ฟังเอง)
 */
export function RoomSignalBridge({
  currentUserId,
  broadcastRef,
  sendAudioRef,
  meetingStartRef,
  setRaisedHands,
  setLatestSubtitle,
  setSharedFileId,
  setSharedViewerPage,
  handSignalReceivedRef,
  docShareSignalReceivedRef,
}: {
  currentUserId: string;
  broadcastRef: React.MutableRefObject<Broadcast | null>;
  sendAudioRef: React.MutableRefObject<((frame: ArrayBuffer) => void) | null>;
  // จุดอ้างอิงเวลาของคำบรรยาย — เขียนทับด้วยค่าที่ server บอกตอน room_joined
  meetingStartRef: React.MutableRefObject<number>;
  setRaisedHands: React.Dispatch<React.SetStateAction<RaisedHandDto[]>>;
  setLatestSubtitle: React.Dispatch<React.SetStateAction<RoomSignal<"subtitle_text"> | null>>;
  setSharedFileId: React.Dispatch<React.SetStateAction<string | null>>;
  setSharedViewerPage: React.Dispatch<React.SetStateAction<number>>;
  // ธงบอกว่าได้รับสัญญาณสดแล้ว — กัน snapshot ที่มาช้ากว่ามาทับข้อมูลสด (ดู Fix 1 ของ code review รอบที่ 1)
  handSignalReceivedRef: React.MutableRefObject<boolean>;
  docShareSignalReceivedRef: React.MutableRefObject<boolean>;
}) {
  const { broadcast, sendAudio, useSignal } = useRoomSignaling();

  useEffect(() => {
    broadcastRef.current = broadcast;
  }, [broadcast, broadcastRef]);

  useEffect(() => {
    sendAudioRef.current = sendAudio;
  }, [sendAudio, sendAudioRef]);

  useSignal("hand_state", (signal) => {
    // สัญญาณสดมาถึงแล้ว — ตั้งแต่นี้ snapshot effect ที่ยังค้าง fetch อยู่ (ถ้ามี) ต้องไม่ทับสถานะนี้อีก
    // ห้ามลบธงนี้ทิ้งแม้จะดูเหมือนไม่มีอะไรอ่านซ้ำ เพราะ snapshot .then() อ่านมันก่อน setRaisedHands ทุกครั้ง
    handSignalReceivedRef.current = true;
    // Fix 2 (code review รอบที่ 3): เดา "ใครทำให้มือลด" จาก diff ของ raised list ในเครื่องไม่ได้ —
    // payload เหมือนกันทุกประการไม่ว่าจะเป็นผู้ใช้กดลดมือเองหรือโฮสต์ลดให้ (ดูรอบที่ 2 ที่พังเพราะเดาผิด
    // ตอน hand_state เก่าที่ค้างมาถึงหลัง reconnect) ต้องรอ server ส่ง lastAction มาบอกตรงๆ เท่านั้น —
    // ตอนนี้ server ยังไม่ส่ง (ดู Task 7) ธงนี้จึงเงียบเสมอจนกว่า server จะเติม lastAction มาให้
    const action = signal.payload.lastAction;
    if (action && action.userId === currentUserId && action.byUserId !== currentUserId) {
      toast.info("โฮสต์ลดมือให้คุณแล้ว");
    }
    setRaisedHands(signal.payload.raised);
  });

  useSignal("room_joined", (signal) => {
    // แปลงเวลาเริ่มห้องของ server มาเป็นเวลาบนนาฬิกาของเครื่องนี้ ทุกคนในห้องจึงได้จุดอ้างอิง
    // เดียวกันโดยไม่ต้องให้นาฬิกาสองเครื่องตรงกัน — ถ้าใช้เวลาที่ตัวเองเปิดหน้าเว็บ คนเข้าทีหลัง
    // จะติดเวลาน้อยกว่าความจริง แล้ว transcript ที่เรียงตาม startSec จะสลับลำดับกัน
    const { serverTime, roomStartedAt } = signal.payload;
    if (typeof serverTime === "number" && typeof roomStartedAt === "number") {
      meetingStartRef.current = Date.now() - (serverTime - roomStartedAt);
    }
  });

  useSignal("subtitle_text", (signal) => {
    setLatestSubtitle(signal);
  });

  useSignal("doc_share_state", (signal) => {
    // สัญญาณสดมาถึงแล้ว — เหตุผลเดียวกับ handSignalReceivedRef ด้านบน
    docShareSignalReceivedRef.current = true;
    const share = signal.payload.share;
    setSharedFileId(share?.fileId ?? null);
    setSharedViewerPage(share?.page ?? 1);
    if (share && signal.senderId !== currentUserId) {
      toast.info(`${share.sharedName} กำลังแชร์เอกสาร: ${share.fileName}`);
    }
  });

  useSignal("signal_error", (signal) => {
    toast.error(signal.payload.reason);
  });

  return null;
}
