// ═══════════════════════════════════════════
// Video Service — สัญญากลางของ "เครื่องยนต์ประชุม"
//
// จุดประสงค์: ให้หน้าห้องประชุม (/live) ไม่ต้องรู้ว่าเบื้องหลังเป็น
// engine ฝังในเว็บ (ZegoCloud) หรือเปิดแอปภายนอก — เรียกผ่านสัญญาเดียวกันหมด
//
// Webex ถูกตัดออกแล้ว (ไม่มี license/backend และใช้ ZegoCloud แทนถาวร)
// กันความเสี่ยง: ห้ามหน้าจอ import zego.ts ตรงๆ — ต้องผ่าน interface นี้เท่านั้น
// ═══════════════════════════════════════════

import type { ResolvedConference } from "@/lib/conference";

/** id ของเครื่องยนต์ที่ฝังในเว็บได้ — ตอนนี้มีแค่ ZegoCloud */
export type EmbeddedEngineId = "zegocloud";

/**
 * พื้นผิววิดีโอของการประชุมหนึ่งๆ — มี 2 แบบที่ต่างกันคนละเรื่อง
 * แยกเป็น discriminated union เพื่อให้หน้าจอ switch ได้ครบทุกกรณี
 *
 * ห้องจำลอง (mockup) ถูกตัดออกแล้ว — meeting ที่ไม่ได้ระบุ provider จะ resolve เป็น
 * embed/zegocloud เสมอ ไม่มีค่า "simulated" ให้คืนอีกต่อไป
 */
export type VideoSurface =
  | { kind: "external"; conference: ResolvedConference }   // เปิดแอปภายนอก (Teams/Zoom/Meet)
  | { kind: "embed"; engineId: EmbeddedEngineId };         // ฝังในเว็บ (ZegoCloud)

/** ข้อมูลที่ engine ต้องใช้ตอนพาผู้ใช้เข้าห้อง */
export type JoinContext = {
  /** id การประชุมในระบบเรา */
  meetingId: string;
  /** กุญแจห้องที่เดาไม่ได้ — backend แลกเป็นห้องจริงของผู้ให้บริการ */
  roomKey: string;
  /** ชื่อที่จะแสดงในห้องประชุม */
  displayName: string;
  /** เป็นโฮสต์ไหม — มาจาก can(user, "meeting.host", meeting) */
  isHost: boolean;
  /** credential from backend — null means the token request failed (no mock fallback) */
  credential?: {
    token: string;
    appId: number;
    serverUrl: string;
    providerRoomId: string;
  } | null;
  /** user ID in our system */
  userId?: string;
};

/**
 * เซสชันที่กำลังทำงานอยู่ — คืนจาก engine.mount()
 * dispose() สำคัญมาก: ต้องเรียกตอนออกห้อง ไม่งั้นกล้อง/ไมค์ค้าง
 */
export type EmbeddedSession = {
  dispose(): void;
  /** callback เมื่อผู้ใช้กดออกจากฝั่ง engine เอง */
  onLeft(cb: () => void): void;
};

/** สัญญาของเครื่องยนต์ที่ฝังในเว็บได้ */
export type EmbeddedEngine = {
  id: EmbeddedEngineId;
  /** ต้องมี backend ออก token ก่อนถึงจะ mount ได้ไหม */
  requiresBackend: boolean;
  /** ฝัง engine ลงใน container แล้วพาเข้าห้อง */
  mount(container: HTMLElement, ctx: JoinContext): Promise<EmbeddedSession>;
};
