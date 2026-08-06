// ═══════════════════════════════════════════
// ZegoCloud Engine — real SDK integration
//
// mount() สร้าง ZegoExpressEngine จริง แล้ว loginRoom + publish stream
// ถ้า mount ล้มเหลว → คืน noopSession ให้ fallback เป็น demo mode
//
// credential ส่งผ่าน JoinContext.credential (เพิ่มใน types.ts)
// ═══════════════════════════════════════════

import type { EmbeddedEngine, EmbeddedSession, JoinContext } from "./types";

const noopSession: EmbeddedSession = {
  dispose() {},
  onLeft() {},
};

export const zegoEngine: EmbeddedEngine = {
  id: "zegocloud",
  requiresBackend: true,

  async mount(container: HTMLElement, ctx: JoinContext): Promise<EmbeddedSession> {
    // credential ต้องมี — ถ้าไม่มีแปลว่า caller ไม่ควรเรียก mount
    if (!ctx.credential) {
      console.warn("[zegoEngine] No credential provided — returning noop session");
      return noopSession;
    }

    const { token, appId, serverUrl, providerRoomId } = ctx.credential;

    try {
      // Dynamic import — SDK เป็น client-only, ไม่ควร bundle ตอน SSR
      const { ZegoExpressEngine } = await import("zego-express-engine-webrtc");

      const zg = new ZegoExpressEngine(appId, serverUrl);
      const userID = ctx.userId ?? ctx.displayName;
      const streamID = `stream_${providerRoomId}_${userID}_${Date.now()}`;

      // Login room
      await zg.loginRoom(
        providerRoomId,
        token,
        { userID, userName: ctx.displayName },
        { userUpdate: true }
      );

      // Create and publish local stream
      const localStream = await zg.createStream({
        camera: { video: true, audio: true },
      });

      // Attach local video to container
      const localVideo = document.createElement("video");
      localVideo.id = "zego-local-video";
      localVideo.autoplay = true;
      localVideo.playsInline = true;
      localVideo.muted = true;
      localVideo.srcObject = localStream;
      localVideo.style.cssText = "width:100%;height:100%;object-fit:cover;";
      container.appendChild(localVideo);

      await zg.startPublishingStream(streamID, localStream);

      // Handle remote streams
      zg.on("roomStreamUpdate", async (roomID, updateType, streamList) => {
        if (updateType === "ADD") {
          for (const stream of streamList) {
            const remoteStream = await zg.startPlayingStream(stream.streamID);
            const remoteVideo = document.createElement("video");
            remoteVideo.id = `zego-remote-${stream.streamID}`;
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            remoteVideo.srcObject = remoteStream;
            remoteVideo.style.cssText = "width:100%;height:100%;object-fit:cover;";
            container.appendChild(remoteVideo);
          }
        } else if (updateType === "DELETE") {
          for (const stream of streamList) {
            const el = document.getElementById(`zego-remote-${stream.streamID}`);
            el?.remove();
            zg.stopPlayingStream(stream.streamID);
          }
        }
      });

      // Log connection state changes
      zg.on("roomStateChanged", (roomID, reason, errorCode) => {
        console.log(`[zegoEngine] Room state: ${reason} (code: ${errorCode})`);
      });

      // Leave callback
      let onLeftCallback: (() => void) | null = null;
      zg.on("roomStateChanged", (_roomID, reason) => {
        if (reason === "KICKOUT" || reason === "LOGOUT") {
          onLeftCallback?.();
        }
      });

      const session: EmbeddedSession = {
        dispose() {
          try {
            zg.stopPublishingStream(streamID);
            zg.destroyStream(localStream);
            zg.logoutRoom(providerRoomId);
            zg.destroyEngine();
          } catch (err) {
            console.warn("[zegoEngine] dispose error:", err);
          }
          // Clean up DOM
          while (container.firstChild) {
            container.removeChild(container.firstChild);
          }
        },
        onLeft(cb: () => void) {
          onLeftCallback = cb;
        },
      };

      return session;
    } catch (error) {
      console.error("[zegoEngine] mount failed:", error);
      return noopSession;
    }
  },
};
