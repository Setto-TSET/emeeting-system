"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Meeting } from "@/data";
import type { EmbeddedSession } from "@/services/video/types";

type Props = {
  meeting: Meeting;
  isHost: boolean;
  onLeave: () => void;
  credential?: { token: string; providerRoomId: string } | null;
};

export function ZegoCloudEmbedStage({ meeting, isHost, onLeave, credential }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef   = useRef<EmbeddedSession | null>(null);

  const handleLeave = () => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
    onLeave();
  };

  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [activeSpeakerIdx, setActiveSpeakerIdx] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const present = meeting.participants.filter((p) => p.present);
  useEffect(() => {
    if (present.length === 0) return;
    const interval = setInterval(() => {
      setActiveSpeakerIdx(Math.random() < 0.75 ? Math.floor(Math.random() * present.length) : null);
    }, 6000);
    return () => clearInterval(interval);
  }, [present.length]);

  useEffect(() => {
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

  const zoomRoomDevices = meeting.zoomRoomDevices ?? [];

  return (
    <div className="flex-1 min-h-[400px] rounded-2xl overflow-hidden border border-border bg-[#0a0f1e] text-white flex flex-col shadow-xl relative">
      <div ref={containerRef} className="absolute inset-0 pointer-events-none" aria-hidden />

      {/* Header แบรนด์ ZegoCloud */}
      <div className="h-11 px-4 flex items-center justify-between border-b border-white/10 bg-[#0055FF]/10">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-[#0055FF] flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[16px]">videocam</span>
          </div>
          <span className="text-sm font-semibold">ZegoCloud Video</span>
          <Badge className="bg-white/10 text-white/80 border-white/20 text-[10px]">
            {credential ? "connected" : "demo mode"}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-white/70">
          {zoomRoomDevices.length > 0 && (
            <span className="flex items-center gap-1.5 mr-2">
              <span className="material-symbols-outlined text-[14px]">meeting_room</span>
              Zoom Room: {zoomRoomDevices.filter(d => d.status === "connected").length}/{zoomRoomDevices.length}
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            กำลังบันทึกและถอดเสียง · {mm}:{ss}
          </span>
        </div>
      </div>

      {/* Video grid */}
      <div className="flex-1 p-4 min-h-0">
        {present.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-white/50 text-sm">
            <span className="material-symbols-outlined text-[40px] mb-2">group_off</span>
            <p>รอผู้เข้าร่วมประชุมคนแรก...</p>
          </div>
        ) : (
          <div className="h-full grid grid-cols-2 md:grid-cols-3 gap-3 auto-rows-fr">
            {present.slice(0, 6).map((p, i) => {
              const isSpeaking = activeSpeakerIdx === i;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl bg-[#141b30] flex flex-col items-center justify-center relative overflow-hidden border-2 transition-all ${
                    isSpeaking ? "border-[#0055FF] shadow-lg shadow-[#0055FF]/20" : "border-transparent"
                  }`}
                >
                  <div className="h-16 w-16 rounded-full bg-white/10 flex items-center justify-center text-2xl font-bold">
                    {(p.name.split(" ")[1] ?? p.name).charAt(0)}
                  </div>
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] bg-black/50 backdrop-blur px-2 py-0.5 rounded">
                    <span className="truncate">{p.name}</span>
                    {isSpeaking && (
                      <span className="material-symbols-outlined text-[13px] text-[#0055FF] animate-pulse">
                        graphic_eq
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* แถบควบคุม */}
      <div className="h-16 px-4 flex items-center justify-center gap-3 border-t border-white/10 bg-[#0c1225]">
        <ControlButton
          icon={micOn ? "mic" : "mic_off"}
          active={micOn}
          danger={!micOn}
          onClick={() => setMicOn(!micOn)}
          title={micOn ? "ปิดไมค์" : "เปิดไมค์"}
        />
        <ControlButton
          icon={cameraOn ? "videocam" : "videocam_off"}
          active={cameraOn}
          danger={!cameraOn}
          onClick={() => setCameraOn(!cameraOn)}
          title={cameraOn ? "ปิดกล้อง" : "เปิดกล้อง"}
        />
        {isHost && (
          <ControlButton
            icon="present_to_all"
            active={screenSharing}
            onClick={() => setScreenSharing(!screenSharing)}
            title="แชร์หน้าจอ"
          />
        )}
        <div className="w-4" />
        <Button
          onClick={handleLeave}
          className="h-10 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold"
        >
          <span className="material-symbols-outlined text-[18px] mr-1.5">call_end</span>
          ออกจากห้อง
        </Button>
      </div>

      {/* แถบล่าง — AI summary teaser */}
      <div className="px-4 py-2 border-t border-white/10 bg-[#0055FF]/5 flex items-center gap-2 text-[11px] text-white/70">
        <span className="material-symbols-outlined text-[14px] text-[#0055FF]">auto_awesome</span>
        เมื่อประชุมจบ ระบบจะสร้างร่างรายงานให้อัตโนมัติจากเสียงที่บันทึก · เลขาฯ ตรวจแก้ก่อนรับรอง
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
