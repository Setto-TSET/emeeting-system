"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Meeting } from "@/data";
import type { EmbeddedSession, VideoTile } from "@/services/video/types";

type Props = {
  meeting: Meeting;
  isHost: boolean;
  onLeave: () => void;
  credential?: { token: string; providerRoomId: string; appId: number; serverUrl: string } | null;
  /** เหตุผลที่ยังเข้าห้องจริงไม่ได้ — แสดงให้ผู้ใช้เห็นแทนการเงียบ */
  credentialError?: string | null;
  /** user ID ในระบบ — ใช้เป็น userID ของ ZegoCloud SDK */
  userId: string;
  /** ชื่อที่จะขึ้นในห้อง — ต้องเป็นชื่อผู้ใช้ที่ล็อกอินอยู่จริง */
  displayName: string;
};

/** ระดับเสียงที่ถือว่า "กำลังพูด" — ตามคู่มือ Zego คนพูดปกติจะเกิน 10 */
const SPEAKING_THRESHOLD = 10;

export function ZegoCloudEmbedStage({
  meeting,
  isHost,
  onLeave,
  credential,
  credentialError,
  userId,
  displayName,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<EmbeddedSession | null>(null);

  const [tiles, setTiles] = useState<VideoTile[]>([]);
  const [soundLevels, setSoundLevels] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

  const handleLeave = () => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
    onLeave();
  };

  // ── เข้าห้องจริงเมื่อมี credential ──
  useEffect(() => {
    if (!credential || !containerRef.current) return;

    let cancelled = false;
    setConnecting(true);
    setError(null);

    import("@/services/video/zego").then(({ zegoEngine }) => {
      zegoEngine
        .mount(containerRef.current!, {
          meetingId: meeting.id,
          roomKey: credential.providerRoomId,
          displayName,
          isHost,
          userId,
          credential,
        })
        .then((session) => {
          if (cancelled) {
            session.dispose();
            return;
          }
          sessionRef.current = session;
          setConnecting(false);
          session.onTiles?.(setTiles);
          session.onSoundLevels?.(setSoundLevels);
          session.onError?.((message) => setError(message));
          session.onLeft(() => onLeave());
        });
    });

    return () => {
      cancelled = true;
      sessionRef.current?.dispose();
      sessionRef.current = null;
      setTiles([]);
      setSoundLevels({});
    };
    // ผูกกับห้อง/ตัวตนเท่านั้น — onLeave เปลี่ยน identity ทุก render ถ้าใส่จะ remount ไม่จบ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credential, meeting.id, userId, displayName, isHost]);

  const toggleMic = () => {
    const next = !micOn;
    // ถ้า engine ปฏิเสธ (ยังไม่เข้าห้อง/ไม่มีไมค์) อย่าเปลี่ยนไอคอนให้ผู้ใช้เข้าใจผิด
    if (sessionRef.current?.setMicEnabled && !sessionRef.current.setMicEnabled(next)) return;
    setMicOn(next);
  };

  const toggleCamera = () => {
    const next = !cameraOn;
    if (sessionRef.current?.setCameraEnabled && !sessionRef.current.setCameraEnabled(next)) return;
    setCameraOn(next);
  };

  const live = Boolean(credential) && tiles.length > 0;

  return (
    <div className="flex-1 min-h-[400px] rounded-2xl overflow-hidden border border-border bg-[#0a0f1e] text-white flex flex-col shadow-xl relative">
      {/* จุดยึดของ engine — ตัว engine ไม่วาดอะไรลงไป แต่ต้องมี element จริงให้ mount */}
      <div ref={containerRef} className="hidden" aria-hidden />

      {/* Header แบรนด์ ZegoCloud */}
      <div className="h-11 px-4 flex items-center justify-between border-b border-white/10 bg-[#0055FF]/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-[#0055FF] flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[16px]">videocam</span>
          </div>
          <span className="text-sm font-semibold">ZegoCloud Video</span>
          <Badge
            className={
              credential
                ? "bg-white/10 text-white/80 border-white/20 text-[10px]"
                : "bg-red-500/20 text-red-200 border-red-400/40 text-[10px]"
            }
          >
            {connecting ? "กำลังเชื่อมต่อ…" : live ? `ในห้อง ${tiles.length} คน` : credential ? "เชื่อมต่อแล้ว" : "เชื่อมต่อไม่สำเร็จ"}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-white/70">
          <span>ห้อง: {meeting.conferenceRoomKey?.slice(0, 20) ?? meeting.id}</span>
          <span>{mm}:{ss}</span>
        </div>
      </div>

      {/* แถบแจ้งปัญหา — ไม่มี credential หรือ engine พัง */}
      {(error || (!credential && credentialError)) && (
        <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-[11px] text-amber-200 flex items-start gap-2 shrink-0">
          <span className="material-symbols-outlined text-[14px] mt-px">warning</span>
          <span>{error ?? credentialError}</span>
        </div>
      )}

      {/* ช่องวิดีโอจริง */}
      <div className="flex-1 p-3 min-h-0 overflow-y-auto">
        {!credential ? (
          <div className="h-full flex flex-col items-center justify-center text-white/50 text-sm text-center px-6">
            <span className="material-symbols-outlined text-[40px] mb-2">videocam_off</span>
            <p>ยังเข้าห้องประชุมจริงไม่ได้</p>
            <p className="text-[11px] mt-1 text-white/40">
              {credentialError ?? "กำลังขอสิทธิ์เข้าห้องจากเซิร์ฟเวอร์…"}
            </p>
          </div>
        ) : tiles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-white/50 text-sm">
            <span className="material-symbols-outlined text-[40px] mb-2 animate-pulse">sensors</span>
            <p>{connecting ? "กำลังเข้าห้องประชุม…" : "รอผู้เข้าร่วมประชุมคนแรก…"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-[minmax(150px,1fr)]">
            {tiles.map((tile) => (
              <TileView
                key={tile.id}
                tile={tile}
                speaking={(soundLevels[tile.id] ?? 0) > SPEAKING_THRESHOLD}
              />
            ))}
          </div>
        )}
      </div>

      {/* แถบควบคุม */}
      <div className="h-16 px-4 flex items-center justify-center gap-3 border-t border-white/10 bg-[#0c1225] shrink-0">
        <ControlButton
          icon={micOn ? "mic" : "mic_off"}
          active={micOn}
          danger={!micOn}
          onClick={toggleMic}
          title={micOn ? "ปิดไมค์" : "เปิดไมค์"}
        />
        <ControlButton
          icon={cameraOn ? "videocam" : "videocam_off"}
          active={cameraOn}
          danger={!cameraOn}
          onClick={toggleCamera}
          title={cameraOn ? "ปิดกล้อง" : "เปิดกล้อง"}
        />
        <div className="w-4" />
        <Button
          onClick={handleLeave}
          className="h-10 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold"
        >
          <span className="material-symbols-outlined text-[18px] mr-1.5">call_end</span>
          ออกจากห้อง
        </Button>
      </div>

      {isHost && (
        <div className="px-4 py-2 border-t border-white/10 bg-[#0055FF]/5 text-[11px] text-white/60">
          คุณเป็นผู้ควบคุมห้อง — ปิดประชุมได้จากปุ่ม “จบการประชุมเลย” ด้านบน
        </div>
      )}
    </div>
  );
}

/** หนึ่งช่องวิดีโอ — ผูก MediaStream เข้ากับ <video> ผ่าน ref ไม่ใช่ attribute */
function TileView({ tile, speaking }: { tile: VideoTile; speaking: boolean }) {
  const attachStream = useCallback(
    (el: HTMLVideoElement | null) => {
      if (el && el.srcObject !== tile.stream) el.srcObject = tile.stream;
    },
    [tile.stream]
  );

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-[#141b30] border-2 transition-all ${
        speaking ? "border-[#0055FF] shadow-lg shadow-[#0055FF]/20" : "border-transparent"
      }`}
    >
      <video
        ref={attachStream}
        autoPlay
        playsInline
        // เสียงตัวเองต้องปิด ไม่งั้นหอน — เสียงคนอื่นต้องเปิด ไม่งั้นประชุมแล้วไม่ได้ยิน
        muted={tile.isLocal}
        className={`w-full h-full object-cover ${tile.isLocal ? "scale-x-[-1]" : ""} ${
          tile.cameraOn ? "" : "invisible"
        }`}
      />

      {!tile.cameraOn && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-white/10 flex items-center justify-center text-2xl font-bold">
            {(tile.userName.split(" ")[1] ?? tile.userName).charAt(0)}
          </div>
        </div>
      )}

      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 text-[11px] bg-black/50 backdrop-blur px-2 py-0.5 rounded">
        <span className="truncate">
          {tile.userName}
          {tile.isLocal && " (คุณ)"}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {!tile.micOn && (
            <span className="material-symbols-outlined text-[13px] text-red-400">mic_off</span>
          )}
          {speaking && tile.micOn && (
            <span className="material-symbols-outlined text-[13px] text-[#0055FF]">graphic_eq</span>
          )}
        </span>
      </div>
    </div>
  );
}

function ControlButton({
  icon,
  active,
  danger,
  onClick,
  title,
}: {
  icon: string;
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`h-11 w-11 rounded-full flex items-center justify-center transition-colors ${
        danger
          ? "bg-red-600/80 hover:bg-red-600 text-white"
          : active
          ? "bg-white/10 hover:bg-white/20 text-white"
          : "bg-white/5 hover:bg-white/10 text-white/60"
      }`}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
    </button>
  );
}
