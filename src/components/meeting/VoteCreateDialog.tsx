// src/components/meeting/VoteCreateDialog.tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { VoteTopic, VoteOption } from "@/services/voting/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (topic: Pick<VoteTopic, "title" | "description" | "options">) => void;
};

export function VoteCreateDialog({ open, onOpenChange, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState<string[]>(["เห็นด้วย", "ไม่เห็นด้วย", "งดออกเสียง"]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setOptions(["เห็นด้วย", "ไม่เห็นด้วย", "งดออกเสียง"]);
  };

  const canSubmit = title.trim().length > 0 && options.filter((o) => o.trim()).length >= 2;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const voteOptions: VoteOption[] = options
      .filter((o) => o.trim())
      .map((label, i) => ({ id: `opt-${i + 1}`, label: label.trim() }));
    onCreate({ title: title.trim(), description: description.trim() || undefined, options: voteOptions });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>สร้างโหวต</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="หัวข้อโหวต เช่น อนุมัติงบประมาณ Q3" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="รายละเอียด (ไม่บังคับ)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={opt}
                  onChange={(e) => setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))}
                  placeholder={`ตัวเลือกที่ ${i + 1}`}
                />
                {options.length > 2 && (
                  <Button variant="ghost" size="sm" onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}>
                    ลบ
                  </Button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <Button variant="outline" size="sm" onClick={() => setOptions((prev) => [...prev, ""])}>
                + เพิ่มตัวเลือก
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button disabled={!canSubmit} onClick={handleSubmit}>สร้างโหวต</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
