// src/components/meeting/VotePanel.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { VoteCreateDialog } from "./VoteCreateDialog";
import { VoteTopicCard } from "./VoteTopicCard";
import { VoteResultsDialog } from "./VoteResultsDialog";
import { useRoomSignaling } from "@/context/RoomSignalingContext";
import { useCurrentUser } from "@/context/UserContext";
import { listTopics, createTopic, castVote, closeTopic, VoteApiError } from "@/services/voting/api";
import type { VoteTopic } from "@/services/voting/types";

// ข้อมูลโหวตอยู่ที่ server แล้ว (ตาราง VoteTopic/VoteOption/VoteRecord) ไม่ใช่ IndexedDB
// ของแต่ละเครื่องอีกต่อไป — คนละเครื่องจึงเห็นหัวข้อและคะแนนชุดเดียวกันจริง
//
// การรู้ว่ามีคนโหวตใหม่มาจาก 3 ทางรวมกัน:
//   1. `voteRefreshToken` — RoomSignalBridge เพิ่มค่านี้เมื่อได้สัญญาณ vote_* ผ่าน SSE
//      (เร็วที่สุด และข้ามเครื่องได้แล้ว)
//   2. poll เป็นตาข่ายรับ — เผื่อสตรีมหลุดหรือเปิดไม่ได้ (เช่นไม่มี session cookie ในแท็บนั้น)
//   3. ตอนกลับมาโฟกัสแท็บ — ให้เห็นของล่าสุดทันทีโดยไม่ต้องรอรอบ poll
const POLL_INTERVAL_MS = 15000;

export function VotePanel({
  meetingId,
  canManage,
  voteRefreshToken,
}: {
  meetingId: string;
  canManage: boolean;
  voteRefreshToken: number;
}) {
  const { currentUser } = useCurrentUser();
  const { broadcast } = useRoomSignaling();
  const [topics, setTopics] = useState<VoteTopic[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [resultsTopic, setResultsTopic] = useState<VoteTopic | null>(null);

  // กันเขียนทับ: ถ้าผู้ใช้เพิ่งกดโหวตแล้วผลจาก poll รอบก่อนหน้ามาถึงทีหลัง
  // จะทำให้คะแนนกระพริบกลับไปค่าเก่า — เก็บลำดับคำขอไว้แล้วรับเฉพาะรอบล่าสุด
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const next = await listTopics(meetingId);
      if (seq !== requestSeq.current) return;
      setTopics(next);
      setLoadError(null);
    } catch (error) {
      if (seq !== requestSeq.current) return;
      const message =
        error instanceof VoteApiError && error.status === 401
          ? "เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่"
          : error instanceof Error
            ? error.message
            : "โหลดข้อมูลโหวตไม่สำเร็จ";
      setLoadError(message);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    // setState เกิดหลัง await (ตอน response กลับมา) ไม่ใช่ระหว่าง render
    // — เป็นการ subscribe ข้อมูลจาก server ตามปกติ ไม่ได้ทำให้ render ซ้อน
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh, voteRefreshToken]);

  useEffect(() => {
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  /** อัปเดตหัวข้อเดียวจาก response ของ API — ไม่ต้องรอ refresh ทั้งชุด */
  const mergeTopic = (updated: VoteTopic) => {
    requestSeq.current++; // ผลจาก API ตัวนี้ใหม่กว่า poll ที่ค้างอยู่
    setTopics((prev) => {
      const exists = prev.some((t) => t.id === updated.id);
      return exists ? prev.map((t) => (t.id === updated.id ? updated : t)) : [...prev, updated];
    });
  };

  const reportError = (error: unknown, fallback: string) => {
    toast.error(error instanceof Error ? error.message : fallback);
  };

  const handleCreate = async (draft: Pick<VoteTopic, "title" | "description" | "options">) => {
    try {
      const topic = await createTopic(meetingId, {
        title: draft.title,
        description: draft.description,
        // server เป็นคนออก id ให้แต่ละตัวเลือกเอง ที่นี่ส่งไปแค่ข้อความ
        options: draft.options.map((o) => o.label),
      });
      mergeTopic(topic);
      broadcast({ type: "vote_create", payload: { topicId: topic.id } });
    } catch (error) {
      reportError(error, "สร้างโหวตไม่สำเร็จ");
    }
  };

  const handleVote = useCallback(
    async (topicId: string, optionId: string) => {
      try {
        const updated = await castVote(meetingId, topicId, optionId);
        mergeTopic(updated);
        broadcast({ type: "vote_cast", payload: { topicId, optionId } });
      } catch (error) {
        reportError(error, "ลงคะแนนไม่สำเร็จ");
        refresh(); // อาจโดนปิดโหวตไปแล้ว — ดึงสถานะจริงมาแสดง
      }
    },
    [meetingId, broadcast, refresh]
  );

  const handleClose = async (topicId: string) => {
    try {
      const updated = await closeTopic(meetingId, topicId);
      mergeTopic(updated);
      broadcast({ type: "vote_close", payload: { topicId } });
    } catch (error) {
      reportError(error, "ปิดโหวตไม่สำเร็จ");
    }
  };

  // กล่องผลโหวตต้องอ่านจาก topics เสมอ ไม่ใช่ snapshot ตอนกดเปิด — ไม่งั้นคะแนนค้างที่ค่าเก่า
  const openResults = resultsTopic ? (topics.find((t) => t.id === resultsTopic.id) ?? resultsTopic) : null;

  return (
    <div className="space-y-3">
      {canManage && (
        <Button size="sm" className="w-full" onClick={() => setCreateOpen(true)}>
          + สร้างโหวต
        </Button>
      )}

      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {loadError}
          <button onClick={() => refresh()} className="ml-2 underline">
            ลองใหม่
          </button>
        </div>
      )}

      {loading && topics.length === 0 && !loadError && (
        <p className="text-xs text-muted-foreground text-center py-4">กำลังโหลดข้อมูลโหวต...</p>
      )}
      {!loading && topics.length === 0 && !loadError && (
        <p className="text-xs text-muted-foreground text-center py-4">ยังไม่มีโหวตในการประชุมนี้</p>
      )}

      {topics
        .slice()
        .reverse()
        .map((topic) => (
          <VoteTopicCard
            key={topic.id}
            topic={topic}
            currentUserId={currentUser.id}
            canManage={canManage || topic.createdBy === currentUser.id}
            onVote={(optionId) => handleVote(topic.id, optionId)}
            onClose={() => handleClose(topic.id)}
            onViewResults={() => setResultsTopic(topic)}
          />
        ))}
      <VoteCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      <VoteResultsDialog topic={openResults} onOpenChange={(open) => !open && setResultsTopic(null)} />
    </div>
  );
}
