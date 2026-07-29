// ═══════════════════════════════════════════
// Webex Mock Engine — สำหรับเดโม Phase C ก่อนมี license/backend จริง
//
// ทำ interface EmbeddedEngine ครบ แต่ mount() คืน stub session
// UI จริงเรนเดอร์โดย <WebexEmbedStage> เพราะต้องอยู่ใน React tree
// (engine mount แบบไม่ผ่าน React จะทำให้ dispose ยาก)
//
// วันต่อ Webex จริง: สร้าง webex.ts ใหม่ที่ mount() เรียก @webex/browser-sdk
// แล้วเปลี่ยน registry ให้ชี้มา engine จริงแทน mock — หน้าจอไม่ต้องแก้
// ═══════════════════════════════════════════

import type { EmbeddedEngine, EmbeddedSession, JoinContext } from "./types";

const noopSession: EmbeddedSession = {
  dispose() {},
  onLeft() {},
};

/**
 * mock engine: ไม่ทำอะไรจริง — คืน session ว่าง
 * การเรนเดอร์วิดีโอปลอมทำโดย <WebexEmbedStage> ในหน้าห้องประชุม
 */
export const webexMockEngine: EmbeddedEngine = {
  id: "webex",
  // mock ไม่ต้อง backend — วันต่อของจริง flag นี้จะเป็น true
  // และหน้าจอต้องขอ credential จาก services/credentials.ts ก่อน mount
  requiresBackend: false,
  async mount(_container: HTMLElement, _ctx: JoinContext): Promise<EmbeddedSession> {
    void _container; void _ctx;
    return noopSession;
  },
};
