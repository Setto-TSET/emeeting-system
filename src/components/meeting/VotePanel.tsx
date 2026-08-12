// src/components/meeting/VotePanel.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { VoteCreateDialog } from "./VoteCreateDialog";
import { VoteTopicCard } from "./VoteTopicCard";
import { VoteResultsDialog } from "./VoteResultsDialog";
import { useRoomSignaling } from "@/context/RoomSignalingContext";
import { useCurrentUser } from "@/context/UserContext";
import { listTopics, saveTopic, castVote, closeTopic } from "@/services/voting/store";
import type { VoteTopic } from "@/services/voting/types";

// `voteRefreshToken` เป็นตัวนับที่ RoomSignalBridge (mounted เสมอ ไม่ว่าจะเปิดแท็บโหวตอยู่หรือไม่)
// เพิ่มค่าทุกครั้งที่ได้รับสัญญาณ vote_create/vote_cast/vote_close — VotePanel แค่ฟังการเปลี่ยนแปลง
// ของค่านี้แล้วอ่าน topics ใหม่จาก IndexedDB เอง (ตัว toast และการฟังสัญญาณจริงย้ายไปอยู่ที่ RoomSignalBridge แล้ว
// เพื่อให้ทำงานได้ไม่ว่าผู้ใช้จะเปิดแท็บไหนอยู่ — ดู Fix 2 ในรายงานรีวิว)
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
  const [createOpen, setCreateOpen] = useState(false);
  const [resultsTopic, setResultsTopic] = useState<VoteTopic | null>(null);

  useEffect(() => {
    listTopics(meetingId).then(setTopics);
  }, [meetingId, voteRefreshToken]);

  const handleCreate = async (draft: Pick<VoteTopic, "title" | "description" | "options">) => {
    const topic: VoteTopic = {
      id: `vote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      meetingId,
      title: draft.title,
      description: draft.description,
      options: draft.options,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: Date.now(),
      status: "open",
      votes: [],
    };
    await saveTopic(topic);
    setTopics((prev) => [...prev, topic]);
    broadcast({ type: "vote_create", payload: { topicId: topic.id } });
  };

  const handleVote = useCallback(
    async (topicId: string, optionId: string) => {
      const updated = await castVote(meetingId, topicId, {
        userId: currentUser.id,
        userName: currentUser.name,
        optionId,
        timestamp: Date.now(),
      });
      if (updated) setTopics((prev) => prev.map((t) => (t.id === topicId ? updated : t)));
      broadcast({ type: "vote_cast", payload: { topicId, optionId } });
    },
    [meetingId, currentUser.id, currentUser.name, broadcast]
  );

  const handleClose = async (topicId: string) => {
    const updated = await closeTopic(meetingId, topicId);
    if (updated) setTopics((prev) => prev.map((t) => (t.id === topicId ? updated : t)));
    broadcast({ type: "vote_close", payload: { topicId } });
  };

  return (
    <div className="space-y-3">
      {canManage && (
        <Button size="sm" className="w-full" onClick={() => setCreateOpen(true)}>
          + สร้างโหวต
        </Button>
      )}
      {topics.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">ยังไม่มีโหวตในการประชุมนี้</p>}
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
      <VoteResultsDialog topic={resultsTopic} onOpenChange={(open) => !open && setResultsTopic(null)} />
    </div>
  );
}
