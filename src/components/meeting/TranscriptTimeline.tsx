// src/components/meeting/TranscriptTimeline.tsx
"use client";

import { useEffect, useState } from "react";
import { getTranscript, type TranscriptSegment } from "@/services/transcript/store";
import { InlineError } from "@/components/layout/PageState";

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TranscriptTimeline({ meetingId }: { meetingId: string }) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getTranscript(meetingId)
      .then((list) => {
        if (cancelled) return;
        setSegments(list);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [meetingId, retryToken]);

  const filtered = segments.filter((s) => s.text.toLowerCase().includes(query.toLowerCase()));

  if (status === "loading") {
    return <p role="status" className="text-xs text-muted-foreground py-4 text-center">กำลังโหลดบทถอดคำพูด...</p>;
  }
  if (status === "error") {
    return <InlineError message="โหลดบทถอดคำพูดไม่สำเร็จ" onRetry={() => setRetryToken((n) => n + 1)} />;
  }
  if (segments.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        ยังไม่มีบทถอดคำพูด — ระบบบันทึกเมื่อผู้เข้าร่วมเปิดคำบรรยายสดในห้องประชุม
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <input
        className="w-full text-xs border rounded-md px-2 py-1 pointer-coarse:min-h-11"
        aria-label="ค้นหาในบทถอดคำพูด"
        placeholder="ค้นหาในบทถอดคำพูด..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground py-2 text-center">ไม่พบข้อความที่ตรงกับ &quot;{query}&quot;</p>
        )}
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
