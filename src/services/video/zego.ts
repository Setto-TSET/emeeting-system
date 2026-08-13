// ═══════════════════════════════════════════
// ZegoCloud Engine — real SDK integration
//
// mount() สร้าง ZegoExpressEngine จริง แล้ว loginRoom + publish stream
// - loginRoom ล้มเหลว → ห้องเข้าไม่ได้จริง คืน noopSession
// - createStream (กล้อง/ไมค์) ล้มเหลว → ยัง login ห้องสำเร็จ ยังเห็น/ได้ยินคนอื่น
//   แค่ตัวเองไม่มีภาพ/เสียงส่งออก — ไม่ล้มทั้งห้องเพราะสิทธิ์กล้อง/ไมค์ถูกปฏิเสธ
//
// credential ส่งผ่าน JoinContext.credential (เพิ่มใน types.ts)
// ═══════════════════════════════════════════

import type { EmbeddedEngine, EmbeddedSession, JoinContext } from "./types";

const noopSession: EmbeddedSession = {
  dispose() {},
  onLeft() {},
};

/** ZegoCloud SDK มักโยน plain object { code, msg } ไม่ใช่ Error instance — แปลงเป็นข้อความอ่านง่าย */
function describeZegoError(error: unknown): string {
  if (error && typeof error === "object" && "msg" in error) {
    const { code, msg } = error as { code?: unknown; msg?: unknown };
    return `${msg ?? "unknown error"}${code ? ` (code ${code})` : ""}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

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

    // Dynamic import — SDK เป็น client-only, ไม่ควร bundle ตอน SSR
    const { ZegoExpressEngine } = await import("zego-express-engine-webrtc");
    const zg = new ZegoExpressEngine(appId, serverUrl);
    const userID = ctx.userId ?? ctx.displayName;
    const streamID = `stream_${providerRoomId}_${userID}_${Date.now()}`;

    // ── Step 1: Login room — ถ้าล้มเหลว ห้องเข้าไม่ได้จริง ต้องคืน noop ──
    try {
      await zg.loginRoom(
        providerRoomId,
        token,
        { userID, userName: ctx.displayName },
        { userUpdate: true }
      );
    } catch (error) {
      console.error("[zegoEngine] loginRoom failed:", describeZegoError(error), error);
      try {
        zg.destroyEngine();
      } catch {
        // ปล่อยผ่าน — engine ยังไม่เคย login สำเร็จ ไม่มีอะไรต้อง cleanup มาก
      }
      return noopSession;
    }

    // ── Step 2: กล้อง/ไมค์ — ลองทีละระดับ ล้มเหลวได้โดยไม่ทำให้ห้องล่ม ──
    // camera+mic → mic-only → ไม่มีเลย (แค่ join ห้อง ดู/ฟังคนอื่นได้)
    let localStream: MediaStream | null = null;
    let mediaWarning: string | null = null;
    try {
      localStream = await zg.createStream({ camera: { video: true, audio: true } });
    } catch (camError) {
      console.warn("[zegoEngine] camera+mic failed, retrying mic-only:", describeZegoError(camError));
      try {
        localStream = await zg.createStream({ camera: { video: false, audio: true } });
        mediaWarning = "ไม่พบกล้องหรือไม่ได้รับสิทธิ์ใช้กล้อง — เข้าประชุมแบบไม่มีภาพ";
      } catch (micError) {
        console.warn("[zegoEngine] mic-only also failed:", describeZegoError(micError));
        mediaWarning = `ไม่สามารถใช้กล้อง/ไมค์ได้ (${describeZegoError(micError)}) — เข้าประชุมแบบดู/ฟังอย่างเดียว ตรวจสอบสิทธิ์กล้อง/ไมค์ของเบราว์เซอร์`;
      }
    }

    if (localStream) {
      const localVideo = document.createElement("video");
      localVideo.id = "zego-local-video";
      localVideo.autoplay = true;
      localVideo.playsInline = true;
      localVideo.muted = true;
      localVideo.srcObject = localStream;
      localVideo.style.cssText = "width:100%;height:100%;object-fit:cover;";
      container.appendChild(localVideo);

      try {
        await zg.startPublishingStream(streamID, localStream);
      } catch (error) {
        console.warn("[zegoEngine] startPublishingStream failed:", describeZegoError(error));
      }
    }

    // Handle remote streams
    zg.on("roomStreamUpdate", async (roomID, updateType, streamList) => {
      if (updateType === "ADD") {
        for (const stream of streamList) {
          try {
            const remoteStream = await zg.startPlayingStream(stream.streamID);
            const remoteVideo = document.createElement("video");
            remoteVideo.id = `zego-remote-${stream.streamID}`;
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            remoteVideo.srcObject = remoteStream;
            remoteVideo.style.cssText = "width:100%;height:100%;object-fit:cover;";
            container.appendChild(remoteVideo);
          } catch (error) {
            console.warn("[zegoEngine] startPlayingStream failed:", describeZegoError(error));
          }
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
          if (localStream) {
            zg.stopPublishingStream(streamID);
            zg.destroyStream(localStream);
          }
          zg.logoutRoom(providerRoomId);
          zg.destroyEngine();
        } catch (err) {
          console.warn("[zegoEngine] dispose error:", describeZegoError(err));
        }
        // Clean up DOM
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      },
      onLeft(cb: () => void) {
        onLeftCallback = cb;
      },
      onError(cb: (message: string) => void) {
        // ถ้ามี warning ค้างจากตอนขอกล้อง/ไมค์ ยิงให้ subscriber ทันทีที่ subscribe
        if (mediaWarning) cb(mediaWarning);
      },
    };

    return session;
  },
};
