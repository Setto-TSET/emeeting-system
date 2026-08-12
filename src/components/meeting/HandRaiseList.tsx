// src/components/meeting/HandRaiseList.tsx
"use client";

import { Button } from "@/components/ui/button";
import { PanelTopClose } from "lucide-react"; // stand-in "hand" icon per existing lucide set

export type RaisedHand = { userId: string; userName: string; raisedAt: number };

type Props = {
  raised: RaisedHand[];
  isHost: boolean;
  onLower: (userId: string) => void;
};

export function HandRaiseList({ raised, isHost, onLower }: Props) {
  if (raised.length === 0) return null;
  const sorted = [...raised].sort((a, b) => a.raisedAt - b.raisedAt);
  return (
    <div className="border rounded-md p-2 space-y-1 bg-amber-50 dark:bg-amber-950/20">
      <div className="flex items-center gap-1 text-xs font-medium">
        <PanelTopClose className="w-3.5 h-3.5" />
        <span>{sorted.length} คนยกมือ</span>
      </div>
      {sorted.map((h) => (
        <div key={h.userId} className="flex items-center justify-between text-xs">
          <span>{h.userName}</span>
          {isHost && (
            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => onLower(h.userId)}>
              ลดมือ
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
