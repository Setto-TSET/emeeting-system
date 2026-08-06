// ═══════════════════════════════════════════
// ZegoCloud Mock Engine — สำหรับเดโมก่อนมี backend + ZegoCloud AppID
//
// ทำ interface EmbeddedEngine ครบ แต่ mount() คืน stub session
// UI จริงเรนเดอร์โดย <ZegoCloudEmbedStage> เพราะต้องอยู่ใน React tree
//
// วันต่อ ZegoCloud จริง: สร้าง engine ใน zego.ts ที่ mount() เรียก
// zego-express-engine-webrtc แล้วเปลี่ยน registry ให้ชี้มา engine จริง
// ═══════════════════════════════════════════

import type { EmbeddedEngine, EmbeddedSession, JoinContext } from "./types";

const noopSession: EmbeddedSession = {
  dispose() {},
  onLeft() {},
};

export const zegoMockEngine: EmbeddedEngine = {
  id: "zegocloud",
  requiresBackend: false,
  async mount(_container: HTMLElement, _ctx: JoinContext): Promise<EmbeddedSession> {
    void _container; void _ctx;
    return noopSession;
  },
};
