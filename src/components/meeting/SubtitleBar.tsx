// src/components/meeting/SubtitleBar.tsx
"use client";

import { useEffect, useState } from "react";
import type { RoomSignal } from "@/services/signaling/types";

type SubtitleEntry = { senderName: string; text: string; isFinal: boolean; at: number };

export function SubtitleBar({ latest }: { latest: RoomSignal<"subtitle_text"> | null }) {
  const [lines, setLines] = useState<SubtitleEntry[]>([]);
  // ติดตาม `latest` ตัวล่าสุดที่เคยประมวลผลแล้ว — ใช้ปรับ state ระหว่าง render แทนใน effect
  // (เลี่ยง react-hooks/set-state-in-effect: setState แบบ synchronous ในตัว effect ทำให้ cascading render)
  const [processedLatest, setProcessedLatest] = useState<RoomSignal<"subtitle_text"> | null>(null);

  if (latest && latest !== processedLatest) {
    setProcessedLatest(latest);
    setLines((prev) => {
      const withoutStale = prev.filter((l) => Date.now() - l.at < 5000);
      const next: SubtitleEntry = {
        senderName: latest.senderName,
        text: latest.payload.text,
        isFinal: latest.payload.isFinal,
        at: latest.timestamp,
      };
      return [...withoutStale.slice(-1), next]; // keep max 2 lines
    });
  }

  useEffect(() => {
    if (lines.length === 0) return;
    const timer = setTimeout(() => setLines((prev) => prev.filter((l) => Date.now() - l.at < 5000)), 5000);
    return () => clearTimeout(timer);
  }, [lines]);

  if (lines.length === 0) return null;

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 max-w-lg w-full px-4 space-y-1 pointer-events-none">
      {lines.map((l, i) => (
        <p
          key={`${l.at}-${i}`}
          className={`text-center text-sm bg-black/60 text-white rounded-md px-3 py-1 ${l.isFinal ? "" : "opacity-70 italic"}`}
        >
          <span className="font-medium">{l.senderName}:</span> {l.text}
        </p>
      ))}
    </div>
  );
}
