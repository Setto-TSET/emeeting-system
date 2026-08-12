// src/components/meeting/TranscriptTimeline.tsx
"use client";

import { useEffect, useState } from "react";
import { getTranscript, type TranscriptSegment } from "@/services/transcript/store";

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TranscriptTimeline({ meetingId }: { meetingId: string }) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    getTranscript(meetingId).then(setSegments);
  }, [meetingId]);

  const filtered = segments.filter((s) => s.text.toLowerCase().includes(query.toLowerCase()));

  if (segments.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        ยังไม่มีการถอดคำพูดในเบราว์เซอร์นี้ — ระบบบันทึกเฉพาะข้อความที่ถอดขณะเปิดซับไตเติลในแท็บนี้เท่านั้น
        (ยังไม่มีการเก็บส่วนกลาง หากเปิดจากเครื่อง/แท็บอื่นจะไม่เห็นข้อมูลนี้)
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <input
        className="w-full text-xs border rounded-md px-2 py-1"
        placeholder="ค้นหาในบทถอดคำพูด..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {filtered.map((s, i) => (
          <div key={i} className="text-xs flex gap-2">
            <span className="text-muted-foreground shrink-0">{formatSec(s.startSec)}</span>
            <span className="font-medium shrink-0">{s.speakerName}:</span>
            <span>{s.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
