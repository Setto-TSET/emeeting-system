// ═══════════════════════════════════════════
// Video Service — สัญญากลางของ "เครื่องยนต์ประชุม"
//
// engine ฝังในเว็บ (ZegoCloud) หรือเปิดแอปภายนอก — เรียกผ่านสัญญาเดียวกันหมด
//
// Webex ถูกตัดออกแล้ว (ไม่มี license/backend และใช้ ZegoCloud แทนถาวร)
// กันความเสี่ยง: ห้ามหน้าจอ import SDK ของผู้ให้บริการตรงๆ — ต้องผ่าน interface นี้เท่านั้น
//               จะได้สลับ/เพิ่ม engine ได้โดยไม่ต้องแก้หน้าจอ
// ═══════════════════════════════════════════

import type { ResolvedConference } from "@/lib/conference";

/** id ของเครื่องยนต์ที่ฝังในเว็บได้ — ตอนนี้มีแค่ ZegoCloud, ขยายรายการนี้เมื่อเพิ่ม engine ใหม่ */
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
  | { kind: "embed"; engineId: EmbeddedEngineId };         // ฝังในเว็บผ่าน SDK (ZegoCloud)

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
 * ผู้ร่วมประชุมหนึ่งช่องในห้องจริง — engine เป็นคนบอก หน้าจอเป็นคนวาด
 * แยกกันแบบนี้เพื่อให้ engine ไม่ต้องยุ่งกับ DOM และ React คุม layout ได้เต็มที่
 */
export type VideoTile = {
  /** streamID ของผู้ให้บริการ — unique ต่อหนึ่งช่อง */
  id: string;
  userId: string;
  userName: string;
  stream: MediaStream;
  isLocal: boolean;
  micOn: boolean;
  cameraOn: boolean;
};

/**
 * เซสชันที่กำลังทำงานอยู่ — คืนจาก engine.mount()
 * dispose() สำคัญมาก: ต้องเรียกตอนออกห้อง ไม่งั้นกล้อง/ไมค์ค้าง
 *
 * เมธอดที่เป็น optional คือของ engine จริงเท่านั้น — mock engine ไม่ต้องมี
 */
export type EmbeddedSession = {
  dispose(): void;
  /** callback เมื่อผู้ใช้กดออกจากฝั่ง engine เอง */
  onLeft(cb: () => void): void;
  /** เปิด/ปิดไมค์ที่กำลังส่งออกไปจริง — คืน false เมื่อ engine ทำไม่ได้ */
  setMicEnabled?(on: boolean): boolean;
  /** เปิด/ปิดกล้องที่กำลังส่งออกไปจริง */
  setCameraEnabled?(on: boolean): boolean;
  /** รายชื่อช่องวิดีโอปัจจุบัน — ยิงทุกครั้งที่มีคนเข้า/ออก/ปิดไมค์ */
  onTiles?(cb: (tiles: VideoTile[]) => void): void;
  /** ระดับเสียงต่อ streamID (0-100) — ใช้ไฮไลต์คนที่กำลังพูดจริง */
  onSoundLevels?(cb: (levels: Record<string, number>) => void): void;
  /** callback เมื่อมี error ที่ไม่ถึงขั้นห้องล่ม (เช่น กล้อง/ไมค์ใช้ไม่ได้) — ห้องยัง join ต่อได้ */
  onError?(cb: (message: string) => void): void;
};

/** สัญญาของเครื่องยนต์ที่ฝังในเว็บได้ */
export type EmbeddedEngine = {
  id: EmbeddedEngineId;
  /** ต้องมี backend ออก token ก่อนถึงจะ mount ได้ไหม */
  requiresBackend: boolean;
  /** ฝัง engine ลงใน container แล้วพาเข้าห้อง */
  mount(container: HTMLElement, ctx: JoinContext): Promise<EmbeddedSession>;
};
