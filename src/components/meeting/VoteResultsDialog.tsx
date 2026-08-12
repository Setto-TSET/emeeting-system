// src/components/meeting/VoteResultsDialog.tsx
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { VoteTopic } from "@/services/voting/types";

type Props = {
  topic: VoteTopic | null;
  onOpenChange: (open: boolean) => void;
};

export function VoteResultsDialog({ topic, onOpenChange }: Props) {
  return (
    <Dialog open={topic !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ผลโหวต: {topic?.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {topic?.options.map((opt) => {
            const voters = topic.votes.filter((v) => v.optionId === opt.id);
            return (
              <div key={opt.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>{opt.label}</span>
                  <Badge variant="secondary">{voters.length} เสียง</Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {voters.map((v) => (
                    <Badge key={v.userId} variant="outline" className="text-xs">
                      {v.userName}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
