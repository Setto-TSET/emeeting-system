// ═══════════════════════════════════════════
// Webex Engine — PLACEHOLDER
// ⚠️ ใช้ webexMockEngine อยู่จนกว่าจะมี Webex license + backend
//
// เมื่อพร้อม:
//   1. npm install @webex/browser-sdk
//   2. แก้ mount() ให้เรียก new Webex({ token: ctx.token }).meetings.join(ctx.roomKey)
//   3. เปลี่ยน embeddedEngines["webex"] ใน index.ts ให้ชี้มาที่ realWebexEngine (ไฟล์นี้)
//   4. เพิ่ม requestVideoCredential() ใน src/services/credentials.ts ให้ call POST /api/video/token
// ═══════════════════════════════════════════

import type { EmbeddedEngine } from "./types";
import { webexMockEngine } from "./webexMock";

// re-export mock เป็น default จนกว่า license พร้อม
export const webexEngine: EmbeddedEngine = webexMockEngine;

/*
  ── Backend contract ──

  POST /api/video/token
  Body: { engineId: "webex", roomKey: string }
  Response: { token: string, providerRoomId: string, expiresAt: string }

  Webex: token = JWT guest token จาก Webex Guest Issuer API
         providerRoomId = Webex Space ID ที่ map จาก roomKey (เก็บใน DB)

  ── SDK mount ตัวอย่าง ──

  const wx = new Webex({ credentials: { access_token: token } });
  await wx.meetings.register();
  const meeting = await wx.meetings.create(providerRoomId);
  await meeting.join();
  await meeting.addMedia({
    localStream: await wx.meetings.getLocalVideoStream({ audio: true, video: true }),
    mediaSettings: { receiveVideo: true, receiveAudio: true },
  });
  meeting.on("meeting:left", () => session.current = null);

  // session.dispose:
  meeting.leave();
*/
