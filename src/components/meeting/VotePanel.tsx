// src/components/meeting/VotePanel.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { VoteCreateDialog } from "./VoteCreateDialog";
import { VoteTopicCard } from "./VoteTopicCard";
import { VoteResultsDialog } from "./VoteResultsDialog";
import { useRoomSignaling } from "@/context/RoomSignalingContext";
import { useCurrentUser } from "@/context/UserContext";
import { listTopics } from "@/services/voting/store";
import type { VoteTopic } from "@/services/voting/types";

// server เป็นเจ้าของสถานะโหวต: กดโหวตแล้วส่งเจตนาไป แล้วรอ vote_state กลับมาทับของเดิม
// ไม่มีการอัปเดตแบบ optimistic เพราะ server อาจปฏิเสธ (หัวข้อปิดแล้ว/ไม่มีสิทธิ์)
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
  const { broadcast, useSignal } = useRoomSignaling();
  const [topics, setTopics] = useState<VoteTopic[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [resultsTopic, setResultsTopic] = useState<VoteTopic | null>(null);

  useEffect(() => {
    listTopics(meetingId).then(setTopics);
  }, [meetingId, voteRefreshToken]);

  const applyTopic = useCallback((incoming: VoteTopic) => {
    setTopics((prev) => {
      const exists = prev.some((t) => t.id === incoming.id);
      return exists ? prev.map((t) => (t.id === incoming.id ? incoming : t)) : [...prev, incoming];
    });
  }, []);

  useSignal(
    "vote_state",
    useCallback((signal) => applyTopic(signal.payload.topic), [applyTopic])
  );

  const handleCreate = (draft: Pick<VoteTopic, "title" | "description" | "options">) => {
    broadcast({
      type: "vote_create",
      payload: {
        title: draft.title,
        ...(draft.description ? { description: draft.description } : {}),
        options: draft.options,
      },
    });
    setCreateOpen(false);
  };

  const handleVote = (topicId: string, optionId: string) => {
    broadcast({ type: "vote_cast", payload: { topicId, optionId } });
  };

  const handleClose = (topicId: string) => {
    broadcast({ type: "vote_close", payload: { topicId } });
  };

  return (
    <div className="space-y-3">
      {canManage && (
        <Button size="sm" className="w-full" onClick={() => setCreateOpen(true)}>
          + สร้างโหวต
        </Button>
      )}
      {topics.length === 0 && (
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
      <VoteResultsDialog topic={resultsTopic} onOpenChange={(open) => !open && setResultsTopic(null)} />
    </div>
  );
}
