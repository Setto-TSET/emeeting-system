// src/components/meeting/VoteTopicCard.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { VoteTopic } from "@/services/voting/types";

type Props = {
  topic: VoteTopic;
  currentUserId: string;
  canManage: boolean;
  onVote: (optionId: string) => void;
  onClose: () => void;
  onViewResults: () => void;
};

export function VoteTopicCard({ topic, currentUserId, canManage, onVote, onClose, onViewResults }: Props) {
  const myVote = topic.votes.find((v) => v.userId === currentUserId);
  const total = topic.votes.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{topic.title}</CardTitle>
          <Badge variant={topic.status === "open" ? "default" : "secondary"}>
            {topic.status === "open" ? "เปิดโหวต" : "ปิดแล้ว"}
          </Badge>
        </div>
        {topic.description && <p className="text-xs text-muted-foreground">{topic.description}</p>}
      </CardHeader>
      <CardContent className="space-y-2">
        {topic.options.map((opt) => {
          const count = topic.votes.filter((v) => v.optionId === opt.id).length;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isMine = myVote?.optionId === opt.id;
          return (
            <button
              key={opt.id}
              disabled={topic.status === "closed"}
              onClick={() => onVote(opt.id)}
              className={`w-full text-left px-3 py-2 rounded-md border text-xs flex items-center justify-between disabled:opacity-60 ${
                isMine ? "border-primary bg-primary/10" : "border-border"
              }`}
            >
              <span>{opt.label}</span>
              <span className="text-muted-foreground">{count} ({pct}%)</span>
            </button>
          );
        })}
        <div className="flex items-center justify-between pt-1">
          <button onClick={onViewResults} className="text-xs text-primary underline">
            ดูรายละเอียดผลโหวต
          </button>
          {canManage && topic.status === "open" && (
            <Button size="sm" variant="outline" onClick={onClose}>ปิดโหวต</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
