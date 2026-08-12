// src/components/meeting/VotePanel.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { VoteCreateDialog } from "./VoteCreateDialog";
import { VoteTopicCard } from "./VoteTopicCard";
import { VoteResultsDialog } from "./VoteResultsDialog";
import { useRoomSignaling } from "@/context/RoomSignalingContext";
import { useCurrentUser } from "@/context/UserContext";
import { listTopics, saveTopic, getTopic, castVote, closeTopic } from "@/services/voting/store";
import type { VoteTopic } from "@/services/voting/types";

export function VotePanel({ meetingId, canManage }: { meetingId: string; canManage: boolean }) {
  const { currentUser } = useCurrentUser();
  const { broadcast, useSignal } = useRoomSignaling();
  const [topics, setTopics] = useState<VoteTopic[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [resultsTopic, setResultsTopic] = useState<VoteTopic | null>(null);

  useEffect(() => {
    listTopics(meetingId).then(setTopics);
  }, [meetingId]);

  useSignal("vote_create", async (signal) => {
    const topic = await getTopic(meetingId, signal.payload.topicId);
    if (topic) {
      setTopics((prev) => (prev.some((t) => t.id === topic.id) ? prev : [...prev, topic]));
      toast.info(`${signal.senderName} สร้างโหวตใหม่: ${topic.title}`);
    }
  });

  useSignal("vote_cast", async (signal) => {
    const topic = await getTopic(meetingId, signal.payload.topicId);
    if (topic) setTopics((prev) => prev.map((t) => (t.id === topic.id ? topic : t)));
  });

  useSignal("vote_close", async (signal) => {
    const topic = await getTopic(meetingId, signal.payload.topicId);
    if (topic) setTopics((prev) => prev.map((t) => (t.id === topic.id ? topic : t)));
  });

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
