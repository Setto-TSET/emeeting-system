// ═══════════════════════════════════════════
// Video Service — สัญญากลางของ "เครื่องยนต์ประชุม"
//
// จุดประสงค์: ให้หน้าห้องประชุม (/live) ไม่ต้องรู้ว่าเบื้องหลังเป็น
// ห้องจำลอง, เปิดแอปภายนอก, หรือฝัง SDK — เรียกผ่านสัญญาเดียวกันหมด
//
// กันความเสี่ยง: ห้ามหน้าจอ import SDK ของผู้ให้บริการตรงๆ — ต้องผ่าน interface นี้เท่านั้น
//               จะได้สลับ/เพิ่ม engine ได้โดยไม่ต้องแก้หน้าจอ
// ═══════════════════════════════════════════

import type { ResolvedConference } from "@/lib/conference";

/** id ของเครื่องยนต์ที่ฝังในเว็บได้ — ขยายรายการนี้เมื่อเพิ่ม engine ใหม่ */
export type EmbeddedEngineId = "zegocloud";

/**
 * พื้นผิววิดีโอของการประชุมหนึ่งๆ — มี 3 แบบที่ต่างกันคนละเรื่อง
 * แยกเป็น discriminated union เพื่อให้หน้าจอ switch ได้ครบทุกกรณี
 */
export type VideoSurface =
  | { kind: "simulated" }                                  // ห้องจำลองในเว็บ (ของปัจจุบัน)
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
  /** credential from backend — null means demo mode */
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
  /** ข้อผิดพลาดที่ผู้ใช้ต้องรู้ เช่น ไม่อนุญาตให้ใช้ไมค์ */
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
