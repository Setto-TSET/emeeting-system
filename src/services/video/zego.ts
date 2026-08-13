// ═══════════════════════════════════════════
// ZegoCloud Engine — เชื่อม SDK จริง (zego-express-engine-webrtc)
//
// หลักการ: engine ไม่ยุ่งกับ DOM เลย — มันเก็บ MediaStream แล้วส่งรายการช่อง
// (VideoTile) ออกทาง onTiles ให้ React เป็นคนวาด
// เดิม engine append <video> ใส่ container เอง ทำให้ทุกช่องซ้อนทับกัน
// และ React ไม่รู้ว่ามีใครอยู่ในห้องบ้าง
//
// เสียง: จับไมค์ตั้งแต่ mount เสมอ แล้วใช้ mutePublishStreamAudio ปิด/เปิด
// (เร็วกว่าและไม่ต้องขอสิทธิ์ใหม่ทุกครั้งเหมือนการปิดอุปกรณ์จริง)
// ═══════════════════════════════════════════

import type {
  EmbeddedEngine,
  EmbeddedSession,
  JoinContext,
  VideoTile,
} from "./types";

const noopSession: EmbeddedSession = {
  dispose() {},
  onLeft() {},
};

/** แปลง error ของ SDK/เบราว์เซอร์ เป็นข้อความที่ผู้ใช้อ่านรู้เรื่อง */
function describeMediaError(error: unknown): string {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "msg" in error
      ? String((error as { msg: unknown }).msg)
      : String(error);

  if (name === "NotAllowedError" || /permission|denied/i.test(msg)) {
    return "เบราว์เซอร์ไม่อนุญาตให้ใช้ไมค์/กล้อง — กดไอคอนกุญแจข้าง URL แล้วอนุญาต จากนั้นรีเฟรชหน้า";
  }
  if (name === "NotFoundError" || /not\s*found|no device/i.test(msg)) {
    return "ไม่พบไมค์หรือกล้องในเครื่องนี้";
  }
  if (name === "NotReadableError" || /in use|busy/i.test(msg)) {
    return "ไมค์/กล้องถูกโปรแกรมอื่นใช้อยู่ — ปิดโปรแกรมนั้นแล้วลองใหม่";
  }
  return msg || "เชื่อมต่อห้องประชุมไม่สำเร็จ";
}

export const zegoEngine: EmbeddedEngine = {
  id: "zegocloud",
  requiresBackend: true,

  async mount(_container: HTMLElement, ctx: JoinContext): Promise<EmbeddedSession> {
    void _container; // engine ไม่แตะ DOM — React เป็นคนวาดจาก onTiles

    if (!ctx.credential) {
      console.warn("[zegoEngine] ไม่มี credential — คืน session เปล่า");
      return noopSession;
    }

    const { token, appId, serverUrl, providerRoomId } = ctx.credential;

    // callback ที่หน้าจอลงทะเบียนไว้ — เก็บเป็นตัวแปรเพราะอาจถูกตั้งหลัง mount เสร็จ
    let onTilesCb: ((tiles: VideoTile[]) => void) | null = null;
    let onLevelsCb: ((levels: Record<string, number>) => void) | null = null;
    let onErrorCb: ((message: string) => void) | null = null;
    let onLeftCb: (() => void) | null = null;

    const tiles = new Map<string, VideoTile>();
    const emitTiles = () => onTilesCb?.([...tiles.values()]);
    const emitError = (message: string) => {
      console.warn("[zegoEngine]", message);
      onErrorCb?.(message);
    };

    try {
      // SDK เป็น client-only — import แบบ dynamic เพื่อไม่ให้ bundle ตอน SSR
      const { ZegoExpressEngine } = await import("zego-express-engine-webrtc");

      const zg = new ZegoExpressEngine(appId, serverUrl);
      const userID = ctx.userId ?? ctx.displayName;
      const streamID = `stream_${providerRoomId}_${userID}_${Date.now()}`;

      const support = await zg.checkSystemRequirements("webRTC");
      if (support.webRTC === false) {
        zg.destroyEngine();
        return {
          ...noopSession,
          onError(cb) {
            cb("เบราว์เซอร์นี้ไม่รองรับ WebRTC — ใช้ Chrome หรือ Edge เวอร์ชันล่าสุด");
          },
        };
      }

      await zg.loginRoom(
        providerRoomId,
        token,
        { userID, userName: ctx.displayName },
        { userUpdate: true }
      );

      // ── จับไมค์ + กล้อง ──
      // ลองทีละระดับ: กล้อง+ไมค์ → ไมค์อย่างเดียว → ไม่มีเลย (join ห้องแบบดู/ฟังคนอื่นอย่างเดียว)
      // ห้ามให้ทั้งห้อง mount ล้มเหลวแค่เพราะสิทธิ์กล้อง/ไมค์ถูกปฏิเสธหรือเครื่องไม่มีอุปกรณ์เลย
      let localStream: MediaStream | null = null;
      let hasCamera = true;
      try {
        localStream = await zg.createStream({ camera: { video: true, audio: true } });
      } catch (cameraError) {
        console.warn("[zegoEngine] เปิดกล้องไม่ได้ ใช้เสียงอย่างเดียว:", cameraError);
        hasCamera = false;
        try {
          localStream = await zg.createStream({ camera: { video: false, audio: true } });
        } catch (micError) {
          console.warn("[zegoEngine] ไมค์ก็ใช้ไม่ได้ — join ห้องแบบดู/ฟังอย่างเดียว:", micError);
          emitError(`ไม่สามารถใช้กล้อง/ไมค์ได้ (${describeMediaError(micError)}) — เข้าประชุมแบบดู/ฟังอย่างเดียว`);
        }
      }

      if (localStream) {
        // สถานะเริ่มต้น: ไมค์เปิด กล้องปิด — ใช้ mute ไม่ใช่ปิดอุปกรณ์ เพื่อสลับได้ทันที
        zg.mutePublishStreamAudio(localStream, false);
        if (hasCamera) zg.mutePublishStreamVideo(localStream, true);

        await zg.startPublishingStream(streamID, localStream);

        tiles.set(streamID, {
          id: streamID,
          userId: userID,
          userName: ctx.displayName,
          stream: localStream,
          isLocal: true,
          micOn: true,
          cameraOn: false,
        });
        emitTiles();
      }

      // ── คนอื่นในห้อง ──
      zg.on("roomStreamUpdate", async (_roomID, updateType, streamList) => {
        if (updateType === "ADD") {
          for (const s of streamList) {
            if (tiles.has(s.streamID)) continue;
            try {
              const remoteStream = await zg.startPlayingStream(s.streamID);
              tiles.set(s.streamID, {
                id: s.streamID,
                userId: s.user.userID,
                userName: s.user.userName || s.user.userID,
                stream: remoteStream,
                isLocal: false,
                micOn: true,
                cameraOn: true,
              });
              emitTiles();
            } catch (playError) {
              emitError(`ดึงภาพของ ${s.user.userName || s.user.userID} ไม่สำเร็จ`);
              console.warn("[zegoEngine] startPlayingStream ล้มเหลว:", playError);
            }
          }
        } else if (updateType === "DELETE") {
          for (const s of streamList) {
            zg.stopPlayingStream(s.streamID);
            tiles.delete(s.streamID);
          }
          emitTiles();
        }
      });

      // สถานะไมค์/กล้องของคนอื่น — ของจริง ไม่ใช่ค่าสุ่มเหมือนห้องจำลอง
      zg.on("remoteMicStatusUpdate", (remoteStreamID, status) => {
        const tile = tiles.get(remoteStreamID);
        if (!tile) return;
        tiles.set(remoteStreamID, { ...tile, micOn: status === "OPEN" });
        emitTiles();
      });
      zg.on("remoteCameraStatusUpdate", (remoteStreamID, status) => {
        const tile = tiles.get(remoteStreamID);
        if (!tile) return;
        tiles.set(remoteStreamID, { ...tile, cameraOn: status === "OPEN" });
        emitTiles();
      });

      // ── ระดับเสียง → ไฮไลต์คนที่กำลังพูด ──
      // เก็บสะสมไว้ก้อนเดียว — soundLevelUpdate (คนอื่น) กับ capturedSoundLevelUpdate (เราเอง)
      // มาคนละ event ถ้าส่งแยกกันหน้าจอจะเห็นทีละฝั่งแล้วกระพริบ
      const soundLevels: Record<string, number> = {};
      zg.setSoundLevelDelegate(true, 500);
      zg.on("soundLevelUpdate", (soundLevelList) => {
        for (const info of soundLevelList) {
          soundLevels[info.streamID] = info.soundLevel;
        }
        onLevelsCb?.({ ...soundLevels });
      });
      zg.on("capturedSoundLevelUpdate", (soundLevel) => {
        soundLevels[streamID] = soundLevel;
        onLevelsCb?.({ ...soundLevels });
      });

      zg.on("roomStateChanged", (_roomID, reason, errorCode) => {
        console.log(`[zegoEngine] สถานะห้อง: ${reason} (code ${errorCode})`);
        if (reason === "KICKOUT") {
          emitError("ถูกนำออกจากห้องประชุม — บัญชีนี้เข้าห้องเดียวกันจากอีกแท็บ/อีกเครื่อง");
          onLeftCb?.();
        } else if (reason === "LOGIN_FAILED") {
          emitError("เข้าห้องประชุมไม่สำเร็จ — token หมดอายุหรือไม่ตรงกับผู้ใช้ ลองรีเฟรชหน้า");
        } else if (reason === "RECONNECT_FAILED") {
          emitError("การเชื่อมต่อหลุดและต่อกลับไม่ได้");
          onLeftCb?.();
        }
      });

      zg.on("publisherStateUpdate", (state) => {
        if (state.state === "NO_PUBLISH" && state.errorCode !== 0) {
          emitError(`ส่งสัญญาณไม่สำเร็จ (code ${state.errorCode})`);
        }
      });

      let disposed = false;

      return {
        dispose() {
          if (disposed) return;
          disposed = true;
          try {
            for (const tile of tiles.values()) {
              if (!tile.isLocal) zg.stopPlayingStream(tile.id);
            }
            if (localStream) {
              zg.stopPublishingStream(streamID);
              zg.destroyStream(localStream);
            }
            zg.logoutRoom(providerRoomId);
            zg.destroyEngine();
          } catch (err) {
            console.warn("[zegoEngine] dispose error:", err);
          }
          tiles.clear();
        },
        onLeft(cb) {
          onLeftCb = cb;
        },
        onTiles(cb) {
          onTilesCb = cb;
          cb([...tiles.values()]);
        },
        onSoundLevels(cb) {
          onLevelsCb = cb;
        },
        onError(cb) {
          onErrorCb = cb;
        },
        setMicEnabled(on) {
          if (!localStream) {
            emitError("เครื่องนี้ไม่มีไมค์ที่ใช้ได้ — เข้าประชุมแบบดู/ฟังอย่างเดียว");
            return false;
          }
          const ok = zg.mutePublishStreamAudio(localStream, !on);
          if (!ok) return false;
          const local = tiles.get(streamID);
          if (local) {
            tiles.set(streamID, { ...local, micOn: on });
            emitTiles();
          }
          return true;
        },
        setCameraEnabled(on) {
          if (!localStream || !hasCamera) {
            emitError("เครื่องนี้ไม่มีกล้องที่ใช้ได้ — เข้าประชุมด้วยเสียงอย่างเดียว");
            return false;
          }
          const ok = zg.mutePublishStreamVideo(localStream, !on);
          if (!ok) return false;
          const local = tiles.get(streamID);
          if (local) {
            tiles.set(streamID, { ...local, cameraOn: on });
            emitTiles();
          }
          return true;
        },
      };
    } catch (error) {
      const message = describeMediaError(error);
      // error ของ ZegoCloud SDK มักเป็น plain object { code, msg } ไม่ใช่ Error instance —
      // log ตัว error ดิบจะโชว์ {} ใน Next.js dev overlay เพราะ serialize ไม่ออก
      // log message ที่แปลแล้วแทน จะได้เห็นสาเหตุจริง
      console.error("[zegoEngine] mount ล้มเหลว:", message, error);
      return {
        ...noopSession,
        onError(cb) {
          cb(message);
        },
      };
    }
  },
};
