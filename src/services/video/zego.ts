// ═══════════════════════════════════════════
// ZegoCloud Engine — PLACEHOLDER
// ⚠️ ใช้ zegoMockEngine อยู่จนกว่าจะมี ZegoCloud AppID + backend
//
// เมื่อพร้อม:
//   1. npm install zego-express-engine-webrtc
//   2. แก้ mount() ให้เรียก new ZegoExpressEngine(appID, server)
//      → loginRoom(roomKey, token, { userID, userName })
//      → createStream() → startPublishingStream()
//   3. เปลี่ยน embeddedEngines["zegocloud"] ใน index.ts ให้ชี้มาที่ realZegoEngine
//   4. เพิ่ม requestVideoCredential() ใน credentials.ts ให้ call POST /api/video/token
// ═══════════════════════════════════════════

import type { EmbeddedEngine } from "./types";
import { zegoMockEngine } from "./zegoMock";

export const zegoEngine: EmbeddedEngine = zegoMockEngine;

/*
  ── Backend contract ──

  POST /api/video/token
  Body: { engineId: "zegocloud", roomKey: string, userId: string, userName: string }
  Response: { token: string, providerRoomId: string, expiresAt: number }

  ZegoCloud: token = UserToken สร้างจาก HMAC-SHA256 ด้วย ServerSecret
             providerRoomId = ZegoCloud Room ID ที่ map จาก roomKey (เก็บใน DB)
             token หมดอายุ 30 นาที — frontend ต้อง refresh ก่อนหมด

  ── SDK mount ตัวอย่าง ──

  import { ZegoExpressEngine } from "zego-express-engine-webrtc";

  const zg = new ZegoExpressEngine(appID, server);
  await zg.loginRoom(roomID, token, { userID, userName });
  const localStream = await zg.createStream({ camera: { video: true, audio: true } });
  await zg.startPublishingStream(streamID, localStream);

  zg.on("roomStreamUpdate", (roomID, updateType, streamList) => {
    if (updateType === "ADD") {
      for (const stream of streamList) {
        const remoteStream = await zg.startPlayingStream(stream.streamID);
        // attach to video element
      }
    }
  });

  // session.dispose:
  zg.stopPublishingStream(streamID);
  zg.destroyStream(localStream);
  zg.logoutRoom(roomID);
  zg.destroyEngine();
*/
