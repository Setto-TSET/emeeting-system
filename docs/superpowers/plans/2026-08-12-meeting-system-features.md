# Meeting System Features (Voting, Hand Raise, Subtitle, Zoom Room) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship realtime hand raise, voting, live subtitles, transcript capture, and synced document sharing inside the live meeting room, plus a Zoom Room placeholder on the meeting detail page — all per `docs/superpowers/specs/2026-08-11-meeting-system-features-design.md`.

**Architecture:** A single cross-tab signaling layer (`BroadcastChannel`, one channel per `meetingId`) sits under everything. Voting, hand raise, and document-share sync are thin consumers of that channel plus small persistence stores (IndexedDB for votes/transcript, in-memory `Map` for ephemeral hand-raise state). Subtitles run Web Speech API locally per user and broadcast finalized text over the same channel. No backend — this is a frontend-only demo system (see `PROJECT_STATUS.md`), consistent with the existing `localStore.ts` cross-tab pattern.

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript strict, existing shadcn/ui primitives (`Dialog`, `Tabs`, `Badge`, `Button`, `Card`), `sonner` for toasts, native `BroadcastChannel` API, native `SpeechRecognition`/`webkitSpeechRecognition`, IndexedDB (mirroring `src/services/fileStorage.ts`'s hand-rolled wrapper — no library).

## Global Constraints

- No test runner exists in this repo (`package.json` has no test script, no `*.test.*` files) — verification is `npm run lint`, `npx tsc --noEmit`, and manual two-tab browser checks, matching the project's existing convention. Do not introduce a new test framework as part of this plan.
- Follow `src/services/fileStorage.ts`'s exact IndexedDB idiom for any new IndexedDB store (own `DB_NAME`/`STORE`/`VERSION` consts, promise-wrapped `IDBTransaction`, `openDb()` per file).
- Follow `src/context/UserContext.tsx` / `src/context/MeetingContext.tsx`'s Provider shape: `createContext<Ctx | null>(null)`, `export function XProvider({ children })`, `export function useX()` that throws if used outside the provider.
- Reuse existing UI primitives (`src/components/ui/*`) — no new primitive library. Voting options render as plain `Button`/`Card` rows since no `radio-group.tsx` exists; do not add one.
- Thai UI strings only (existing convention throughout `src/app` and `src/components/meeting`) — do not introduce English UI copy.
- `Meeting`, `AppUser`, `MeetingParticipant`, `ZoomRoomDevice` types already exist in `src/data/index.ts` — extend, don't duplicate.
- Signaling transport is `BroadcastChannel` only in this plan (matches spec's "Demo mode" row). The spec's "ZegoCloud connected" transport row (`sendBroadcastMessage`/`onIMRecvBroadcastMessage`) requires extending `src/services/video/zego.ts` to expose the raw `zg` instance or a message API — that extension is explicitly out of scope for this plan (see Task 1 note) since it touches the video engine seam and needs its own review; `BroadcastChannel` is what actually demos across tabs today and is what `GUEST_JOIN_CALENDAR_PLAN`/`localStore.ts` already rely on for this codebase's no-backend design.

---

## File Structure

```
src/
├── services/
│   ├── signaling/
│   │   ├── types.ts              — SignalType, RoomSignal<T>, SignalPayloadMap (new)
│   │   └── channel.ts            — BroadcastChannel transport: openChannel(meetingId), postSignal, subscribe (new)
│   └── voting/
│       ├── types.ts              — VoteOption, VoteRecord, VoteTopic (new)
│       └── store.ts              — IndexedDB CRUD: listTopics, getTopic, saveTopic (new)
│
├── context/
│   └── RoomSignalingContext.tsx  — Provider + useRoomSignaling() hook wrapping channel.ts (new)
│
├── components/meeting/
│   ├── VotePanel.tsx             — Vote tab content: list + create button (new)
│   ├── VoteTopicCard.tsx         — Single topic: options, live tally, vote button (new)
│   ├── VoteCreateDialog.tsx      — Create-vote form dialog (new)
│   ├── VoteResultsDialog.tsx     — Who-voted-what breakdown (new)
│   ├── SubtitleBar.tsx           — Floating subtitle overlay on video stage (new)
│   ├── HandRaiseList.tsx         — Roster-ordering + host "ลดมือ" controls (new)
│   └── ZoomRoomStatus.tsx        — Zoom Room placeholder card for meeting detail (new)
│
├── services/speech/
│   └── webSpeechProvider.ts      — SpeechRecognitionService wrapper over window.SpeechRecognition (new)
│
├── lib/
│   └── authz.ts                  — MODIFY: add "meeting.manageVoting" / "meeting.manageHandRaise" actions
│
├── app/(app)/live/[id]/
│   └── page.tsx                  — MODIFY: wire RoomSignalingProvider, hand raise broadcast, doc-share broadcast, subtitle toggle, "โหวต" tab
│
└── app/(app)/meetings/[id]/
    └── page.tsx                  — MODIFY: add "อุปกรณ์ห้อง" (Zoom Room) card + "ถอดคำพูด" (transcript) card inside existing tabs
```

Transcript capture (spec section 5) reuses the voting store's IndexedDB pattern but is folded into Task 6 rather than a separate file, since it's a single `appendTranscriptSegment`/`getTranscript` pair consumed only by the subtitle feature and the meeting detail page.

---

## Task 1: Signaling layer (foundation)

**Files:**
- Create: `src/services/signaling/types.ts`
- Create: `src/services/signaling/channel.ts`
- Create: `src/context/RoomSignalingContext.tsx`

**Interfaces:**
- Produces: `SignalType`, `RoomSignal<T>`, `SignalPayloadMap` (types.ts) — every later task's payloads key off this map.
- Produces: `useRoomSignaling()` returning `{ broadcast(signal), useSignal(type, handler), connected: boolean }` — every later task (voting, hand raise, subtitle, doc-share) consumes this hook exclusively; no task talks to `BroadcastChannel` directly.
- Consumes: nothing (foundation task).

- [ ] **Step 1: Write `src/services/signaling/types.ts`**

```typescript
// src/services/signaling/types.ts

export type SignalType =
  | "hand_raise"
  | "hand_lower"
  | "vote_create"
  | "vote_cast"
  | "vote_close"
  | "subtitle_text"
  | "doc_share"
  | "doc_share_page"
  | "doc_share_stop";

export type RoomSignal<T extends SignalType = SignalType> = {
  type: T;
  senderId: string;
  senderName: string;
  timestamp: number;
  payload: SignalPayloadMap[T];
};

export interface SignalPayloadMap {
  hand_raise: { raised: boolean };
  hand_lower: { targetUserId: string };
  vote_create: { topicId: string };
  vote_cast: { topicId: string; optionId: string };
  vote_close: { topicId: string };
  subtitle_text: { text: string; isFinal: boolean; lang: string };
  doc_share: { fileId: string; fileName: string };
  doc_share_page: { fileId: string; page: number };
  doc_share_stop: Record<string, never>;
}
```

Note: `vote_create` carries only `topicId` (not the full `VoteTopic`) — the receiver reads the topic from the shared IndexedDB store (Task 2) via `getTopic(meetingId, topicId)`, avoiding a large payload over the signaling channel and avoiding two sources of truth.

- [ ] **Step 2: Write `src/services/signaling/channel.ts`**

```typescript
// src/services/signaling/channel.ts
import type { RoomSignal, SignalType } from "./types";

export function channelName(meetingId: string) {
  return `emeeting-room-${meetingId}`;
}

export function openChannel(meetingId: string): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(channelName(meetingId));
}

export function postSignal(channel: BroadcastChannel | null, signal: RoomSignal): void {
  if (!channel) return;
  try {
    channel.postMessage(signal);
  } catch {
    // channel closed or structured-clone failure — signal is dropped, caller UI stays optimistic
  }
}

export function isRoomSignal(data: unknown): data is RoomSignal {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    "senderId" in data &&
    "timestamp" in data &&
    "payload" in data
  );
}
```

- [ ] **Step 3: Write `src/context/RoomSignalingContext.tsx`**

```typescript
// src/context/RoomSignalingContext.tsx
"use client";

import { createContext, useContext, useEffect, useRef, useCallback, ReactNode } from "react";
import type { RoomSignal, SignalType } from "@/services/signaling/types";
import { openChannel, postSignal, isRoomSignal } from "@/services/signaling/channel";
import { useCurrentUser } from "./UserContext";

type Ctx = {
  broadcast: <T extends SignalType>(signal: Omit<RoomSignal<T>, "senderId" | "senderName" | "timestamp">) => void;
  useSignal: <T extends SignalType>(type: T, handler: (signal: RoomSignal<T>) => void) => void;
  connected: boolean;
};

const RoomSignalingContext = createContext<Ctx | null>(null);

type Listener = (signal: RoomSignal) => void;

export function RoomSignalingProvider({ meetingId, children }: { meetingId: string; children: ReactNode }) {
  const { currentUser } = useCurrentUser();
  const channelRef = useRef<BroadcastChannel | null>(null);
  const listenersRef = useRef<Map<SignalType, Set<Listener>>>(new Map());

  useEffect(() => {
    const channel = openChannel(meetingId);
    channelRef.current = channel;
    if (!channel) return;

    const onMessage = (event: MessageEvent) => {
      if (!isRoomSignal(event.data)) return;
      const signal = event.data as RoomSignal;
      const set = listenersRef.current.get(signal.type);
      set?.forEach((fn) => fn(signal));
    };
    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
      channelRef.current = null;
    };
  }, [meetingId]);

  const broadcast = useCallback<Ctx["broadcast"]>(
    (partial) => {
      const signal: RoomSignal = {
        ...partial,
        senderId: currentUser.id,
        senderName: currentUser.name,
        timestamp: Date.now(),
      };
      postSignal(channelRef.current, signal);
    },
    [currentUser.id, currentUser.name]
  );

  const useSignal = useCallback<Ctx["useSignal"]>((type, handler) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      let set = listenersRef.current.get(type);
      if (!set) {
        set = new Set();
        listenersRef.current.set(type, set);
      }
      const wrapped: Listener = (signal) => handler(signal as RoomSignal<typeof type>);
      set.add(wrapped);
      return () => {
        set!.delete(wrapped);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type, handler]);
  }, []);

  return (
    <RoomSignalingContext.Provider value={{ broadcast, useSignal, connected: channelRef.current !== null }}>
      {children}
    </RoomSignalingContext.Provider>
  );
}

export function useRoomSignaling() {
  const ctx = useContext(RoomSignalingContext);
  if (!ctx) throw new Error("useRoomSignaling must be used within RoomSignalingProvider");
  return ctx;
}
```

`connected` is computed once at provider-mount time from `channelRef.current !== null` — acceptable here because `BroadcastChannel` availability doesn't change at runtime (it's either supported by the browser or not); no reconnect banner is needed for this transport (that requirement in the spec applies to the ZegoCloud IM transport, out of scope per Global Constraints).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in the three new files.

- [ ] **Step 5: Wire provider into the live room page**

Modify `src/app/(app)/live/[id]/page.tsx`: wrap the existing room JSX (the top-level return, after `hasJoined` gates) with `<RoomSignalingProvider meetingId={meeting.id}>...</RoomSignalingProvider>`. Import from `@/context/RoomSignalingContext`. Do not touch unrelated logic in this step — this is scaffolding only, consumed by Tasks 3–6.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open `/live/<id>` in two browser tabs as different users (via the role switcher). In tab A's devtools console run:
```js
new BroadcastChannel("emeeting-room-<id>").postMessage({ type: "hand_raise", senderId: "x", senderName: "test", timestamp: Date.now(), payload: { raised: true } })
```
Expected: no crash in either tab (no subscriber wired yet, so nothing visibly happens — this just proves the channel name and message shape are live). Confirms channel opened without throwing.

- [ ] **Step 7: Commit**

```bash
git add src/services/signaling src/context/RoomSignalingContext.tsx src/app/\(app\)/live/\[id\]/page.tsx
git commit -m "feat(signaling): add BroadcastChannel signaling layer + RoomSignalingProvider"
```

---

## Task 2: Voting data model + IndexedDB store

**Files:**
- Create: `src/services/voting/types.ts`
- Create: `src/services/voting/store.ts`

**Interfaces:**
- Produces: `VoteOption`, `VoteRecord`, `VoteTopic` types; `listTopics(meetingId)`, `getTopic(meetingId, topicId)`, `saveTopic(topic)`, `castVote(meetingId, topicId, record)`, `closeTopic(meetingId, topicId)` — consumed by Task 3 (VotePanel/VoteCreateDialog/VoteTopicCard) and Task 6 (live room wiring).
- Consumes: nothing beyond browser IndexedDB.

- [ ] **Step 1: Write `src/services/voting/types.ts`**

```typescript
// src/services/voting/types.ts

export type VoteOption = {
  id: string; // "opt-1", "opt-2", ...
  label: string;
};

export type VoteRecord = {
  userId: string;
  userName: string;
  optionId: string;
  timestamp: number;
};

export type VoteTopic = {
  id: string; // "vote-{uuid}"
  meetingId: string;
  title: string;
  description?: string;
  options: VoteOption[];
  createdBy: string;
  createdByName: string;
  createdAt: number;
  status: "open" | "closed";
  votes: VoteRecord[];
};
```

- [ ] **Step 2: Write `src/services/voting/store.ts`**

```typescript
// src/services/voting/store.ts
import type { VoteTopic, VoteRecord } from "./types";

const DB_NAME = "emeeting_voting";
const STORE = "vote_topics";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function topicKey(meetingId: string, topicId: string) {
  return `${meetingId}/${topicId}`;
}

export async function saveTopic(topic: VoteTopic): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ key: topicKey(topic.meetingId, topic.id), ...topic });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getTopic(meetingId: string, topicId: string): Promise<VoteTopic | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(topicKey(meetingId, topicId));
    req.onsuccess = () => resolve((req.result as VoteTopic) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function listTopics(meetingId: string): Promise<VoteTopic[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const all = (req.result as VoteTopic[]) ?? [];
      resolve(all.filter((t) => t.meetingId === meetingId).sort((a, b) => a.createdAt - b.createdAt));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function castVote(meetingId: string, topicId: string, record: VoteRecord): Promise<VoteTopic | null> {
  const topic = await getTopic(meetingId, topicId);
  if (!topic || topic.status !== "open") return topic;
  const votes = topic.votes.filter((v) => v.userId !== record.userId); // one vote per user, latest wins
  votes.push(record);
  const updated: VoteTopic = { ...topic, votes };
  await saveTopic(updated);
  return updated;
}

export async function closeTopic(meetingId: string, topicId: string): Promise<VoteTopic | null> {
  const topic = await getTopic(meetingId, topicId);
  if (!topic) return null;
  const updated: VoteTopic = { ...topic, status: "closed" };
  await saveTopic(updated);
  return updated;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

In a scratch browser console on any app page: `import("/src/services/voting/store.ts")` is not directly runnable in prod build, so instead verify via Task 3's UI once built. Skip standalone verification for this data-only task — Task 3 exercises it end-to-end.

- [ ] **Step 5: Commit**

```bash
git add src/services/voting
git commit -m "feat(voting): add VoteTopic types + IndexedDB store"
```

---

## Task 3: Voting UI (create, cast, results, tab)

**Files:**
- Create: `src/components/meeting/VoteCreateDialog.tsx`
- Create: `src/components/meeting/VoteTopicCard.tsx`
- Create: `src/components/meeting/VoteResultsDialog.tsx`
- Create: `src/components/meeting/VotePanel.tsx`
- Modify: `src/lib/authz.ts`

**Interfaces:**
- Consumes: `VoteTopic`/`VoteOption`/`VoteRecord` (Task 2 types.ts), `listTopics`/`saveTopic`/`castVote`/`closeTopic` (Task 2 store.ts), `useRoomSignaling()` (Task 1), `useCurrentUser()` (`src/context/UserContext.tsx`).
- Produces: `<VotePanel meetingId={string} canManage={boolean} />` — the single export Task 6 mounts into the live room's new "โหวต" tab.

- [ ] **Step 1: Add voting capability to `src/lib/authz.ts`**

Add to the `MeetingAction` union:
```typescript
export type MeetingAction =
  | "meeting.view" | "meeting.edit" | "meeting.manageParticipants"
  | "meeting.managePermissions" | "meeting.notify" | "meeting.changeStatus"
  | "meeting.endorse" | "meeting.host" | "meeting.join"
  | "meeting.manageVoting"; // NEW
```
In the `can()` switch, add a case mirroring `"meeting.host"`'s existing rule (host/secretary/admin can manage voting):
```typescript
case "meeting.manageVoting":
  return can(user, "meeting.host", meeting);
```

- [ ] **Step 2: Write `src/components/meeting/VoteCreateDialog.tsx`**

```typescript
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
```

- [ ] **Step 3: Write `src/components/meeting/VoteResultsDialog.tsx`**

```typescript
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
```

- [ ] **Step 4: Write `src/components/meeting/VoteTopicCard.tsx`**

```typescript
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
```

- [ ] **Step 5: Write `src/components/meeting/VotePanel.tsx`**

```typescript
// src/components/meeting/VotePanel.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
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

  const reload = useCallback(async () => {
    setTopics(await listTopics(meetingId));
  }, [meetingId]);

  useEffect(() => {
    reload();
  }, [reload]);

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

  const handleVote = async (topicId: string, optionId: string) => {
    const updated = await castVote(meetingId, topicId, {
      userId: currentUser.id,
      userName: currentUser.name,
      optionId,
      timestamp: Date.now(),
    });
    if (updated) setTopics((prev) => prev.map((t) => (t.id === topicId ? updated : t)));
    broadcast({ type: "vote_cast", payload: { topicId, optionId } });
  };

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
```

- [ ] **Step 6: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/meeting/Vote*.tsx src/lib/authz.ts
git commit -m "feat(voting): add VotePanel + create/results dialogs"
```

---

## Task 4: Realtime hand raise

**Files:**
- Create: `src/components/meeting/HandRaiseList.tsx`
- Modify: `src/app/(app)/live/[id]/page.tsx`

**Interfaces:**
- Consumes: `useRoomSignaling()` (Task 1), `hand_raise`/`hand_lower` signal types (Task 1 types.ts).
- Produces: `<HandRaiseList raised={...} isHost={boolean} onLower={(userId) => void} />`, and a `raisedHands: Map<string, {userId, userName, raisedAt}>` state pattern the live room page owns and passes down (no new context — state stays local to the live room page per spec's "ephemeral — no IndexedDB" note).

- [ ] **Step 1: Write `src/components/meeting/HandRaiseList.tsx`**

```typescript
// src/components/meeting/HandRaiseList.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
```

Use whatever hand-raise icon already exists in the toolbar's `lucide-react` imports in `src/app/(app)/live/[id]/page.tsx` (grep for the icon backing the existing raise-hand button) instead of `PanelTopClose` if one is already imported there — reuse it for visual consistency rather than introducing a second hand icon.

- [ ] **Step 2: Modify `src/app/(app)/live/[id]/page.tsx`**

Replace the existing local-only hand raise:
```typescript
const [handRaised, setHandRaised] = useState(false);
```
with a raised-hands map plus the existing local flag derived from it:
```typescript
const [raisedHands, setRaisedHands] = useState<Map<string, RaisedHand>>(new Map());
const handRaised = raisedHands.has(currentUser.id);
```
Import `RaisedHand` from `@/components/meeting/HandRaiseList`.

Replace `handleHandRaise`:
```typescript
const handleHandRaise = () => {
  const next = !handRaised;
  broadcast({ type: "hand_raise", payload: { raised: next } });
  setRaisedHands((prev) => {
    const copy = new Map(prev);
    if (next) copy.set(currentUser.id, { userId: currentUser.id, userName: currentUser.name, raisedAt: Date.now() });
    else copy.delete(currentUser.id);
    return copy;
  });
};

const handleLowerHand = (userId: string) => {
  broadcast({ type: "hand_lower", payload: { targetUserId: userId } });
  setRaisedHands((prev) => {
    const copy = new Map(prev);
    copy.delete(userId);
    return copy;
  });
};
```

Add signal subscriptions (inside the component body, after `const { broadcast, useSignal } = useRoomSignaling();` — this hook call must live where `RoomSignalingProvider` wraps the tree from Task 1 Step 5; if the page component itself is above the provider, move these subscriptions into a small child component rendered inside the provider):
```typescript
useSignal("hand_raise", (signal) => {
  setRaisedHands((prev) => {
    const copy = new Map(prev);
    if (signal.payload.raised) copy.set(signal.senderId, { userId: signal.senderId, userName: signal.senderName, raisedAt: signal.timestamp });
    else copy.delete(signal.senderId);
    return copy;
  });
});

useSignal("hand_lower", (signal) => {
  if (signal.payload.targetUserId === currentUser.id) {
    setRaisedHands((prev) => {
      const copy = new Map(prev);
      copy.delete(currentUser.id);
      return copy;
    });
    toast.info("โฮสต์ลดมือให้คุณแล้ว");
  } else {
    setRaisedHands((prev) => {
      const copy = new Map(prev);
      copy.delete(signal.payload.targetUserId);
      return copy;
    });
  }
});
```

Render `<HandRaiseList raised={[...raisedHands.values()]} isHost={isHost} onLower={handleLowerHand} />` in the roster/people tab section, above the participant list, and keep the existing per-participant ✋ badge but drive it from `raisedHands.has(participant.userId)` instead of the removed local `handRaised` boolean so every participant's badge (not just the local user's) now reflects reality.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors; confirms `RaisedHand` map replaces every prior `handRaised` reference (search the file for `handRaised` to make sure no stale reads remain except the derived `const handRaised = raisedHands.has(currentUser.id)`).

- [ ] **Step 4: Manual verification**

`npm run dev`, open `/live/<id>` in two tabs as two different users. Raise hand in tab A → confirm ✋ badge + "1 คนยกมือ" appear in tab B's roster within ~1s. As host in tab B, click "ลดมือ" → confirm tab A's hand lowers and shows toast "โฮสต์ลดมือให้คุณแล้ว".

- [ ] **Step 5: Commit**

```bash
git add src/components/meeting/HandRaiseList.tsx src/app/\(app\)/live/\[id\]/page.tsx
git commit -m "feat(hand-raise): sync hand raise across participants via signaling"
```

---

## Task 5: Subtitle (Web Speech API) + transcript capture

**Files:**
- Create: `src/services/speech/webSpeechProvider.ts`
- Create: `src/components/meeting/SubtitleBar.tsx`
- Create: `src/services/transcript/store.ts`
- Modify: `src/app/(app)/live/[id]/page.tsx`

**Interfaces:**
- Produces: `SpeechRecognitionService` (`start(lang, onResult)`, `stop()`, `isSupported()`), `<SubtitleBar entries={...} />`, `appendSegment(meetingId, segment)` / `getTranscript(meetingId)` (transcript store, IndexedDB, same idiom as Task 2).
- Consumes: `useRoomSignaling()` (Task 1) for `subtitle_text` signal.

- [ ] **Step 1: Write `src/services/speech/webSpeechProvider.ts`**

```typescript
// src/services/speech/webSpeechProvider.ts

export type SpeechCallback = (result: { text: string; isFinal: boolean; lang: string }) => void;

export interface SpeechRecognitionService {
  start(lang: string, onResult: SpeechCallback): void;
  stop(): void;
  isSupported(): boolean;
}

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as typeof window & { webkitSpeechRecognition?: SpeechRecognitionCtor; SpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

class WebSpeechProvider implements SpeechRecognitionService {
  private recognition: SpeechRecognition | null = null;

  isSupported(): boolean {
    return getCtor() !== null;
  }

  start(lang: string, onResult: SpeechCallback): void {
    const Ctor = getCtor();
    if (!Ctor) return;
    this.stop();
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1];
      const text = result[0].transcript.trim();
      if (text.length < 2) return; // filter empty/garbage per spec section 9
      onResult({ text, isFinal: result.isFinal, lang });
    };
    recognition.onerror = () => {
      // swallow — UI shows "ไม่รองรับ/หยุดทำงาน" via isSupported() check at toggle time
    };
    recognition.start();
    this.recognition = recognition;
  }

  stop(): void {
    this.recognition?.stop();
    this.recognition = null;
  }
}

export const webSpeechProvider: SpeechRecognitionService = new WebSpeechProvider();
```

Note: `SpeechRecognition`/`SpeechRecognitionEvent` are DOM lib types not present in TS's default `lib.dom.d.ts` in all TS versions — if `tsc` reports them as missing, add a minimal ambient declaration in this same file above the class:
```typescript
declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionCtor;
    SpeechRecognition?: SpeechRecognitionCtor;
  }
}
```
and fall back to `any`-typed local aliases for `SpeechRecognition`/`SpeechRecognitionEvent` only if `tsc --noEmit` (Step 5) actually fails on them — don't add speculative declarations that aren't needed.

- [ ] **Step 2: Write `src/services/transcript/store.ts`**

```typescript
// src/services/transcript/store.ts

export type TranscriptSegment = {
  speakerId: string;
  speakerName: string;
  startSec: number;
  text: string;
};

const DB_NAME = "emeeting_transcript";
const STORE = "segments";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("meetingId", "meetingId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function appendSegment(meetingId: string, segment: TranscriptSegment): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ meetingId, ...segment });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getTranscript(meetingId: string): Promise<TranscriptSegment[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const index = tx.objectStore(STORE).index("meetingId");
    const req = index.getAll(meetingId);
    req.onsuccess = () => resolve(((req.result as (TranscriptSegment & { meetingId: string })[]) ?? []).sort((a, b) => a.startSec - b.startSec));
    req.onerror = () => reject(req.error);
  });
}
```

- [ ] **Step 3: Write `src/components/meeting/SubtitleBar.tsx`**

```typescript
// src/components/meeting/SubtitleBar.tsx
"use client";

import { useEffect, useState } from "react";
import type { RoomSignal } from "@/services/signaling/types";

type SubtitleEntry = { senderName: string; text: string; isFinal: boolean; at: number };

export function SubtitleBar({ latest }: { latest: RoomSignal<"subtitle_text"> | null }) {
  const [lines, setLines] = useState<SubtitleEntry[]>([]);

  useEffect(() => {
    if (!latest) return;
    setLines((prev) => {
      const withoutStale = prev.filter((l) => Date.now() - l.at < 5000);
      const next: SubtitleEntry = {
        senderName: latest.senderName,
        text: latest.payload.text,
        isFinal: latest.payload.isFinal,
        at: latest.timestamp,
      };
      return [...withoutStale.slice(-1), next]; // keep max 2 lines
    });
  }, [latest]);

  useEffect(() => {
    if (lines.length === 0) return;
    const timer = setTimeout(() => setLines((prev) => prev.filter((l) => Date.now() - l.at < 5000)), 5000);
    return () => clearTimeout(timer);
  }, [lines]);

  if (lines.length === 0) return null;

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 max-w-lg w-full px-4 space-y-1 pointer-events-none">
      {lines.map((l, i) => (
        <p
          key={`${l.at}-${i}`}
          className={`text-center text-sm bg-black/60 text-white rounded-md px-3 py-1 ${l.isFinal ? "" : "opacity-70 italic"}`}
        >
          <span className="font-medium">{l.senderName}:</span> {l.text}
        </p>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Modify `src/app/(app)/live/[id]/page.tsx`**

Add state and toolbar toggle:
```typescript
const [subtitleOn, setSubtitleOn] = useState(false);
const [latestSubtitle, setLatestSubtitle] = useState<RoomSignal<"subtitle_text"> | null>(null);
const meetingStartRef = useRef(Date.now());
```
Import `webSpeechProvider` from `@/services/speech/webSpeechProvider`, `appendSegment` from `@/services/transcript/store`, `RoomSignal` type from `@/services/signaling/types`.

```typescript
const handleToggleSubtitle = () => {
  if (subtitleOn) {
    webSpeechProvider.stop();
    setSubtitleOn(false);
    return;
  }
  if (!webSpeechProvider.isSupported()) {
    toast.error("เบราว์เซอร์ไม่รองรับ กรุณาใช้ Chrome");
    return;
  }
  webSpeechProvider.start("th-TH", (result) => {
    broadcast({ type: "subtitle_text", payload: { text: result.text, isFinal: result.isFinal, lang: result.lang } });
    if (result.isFinal) {
      appendSegment(meeting.id, {
        speakerId: currentUser.id,
        speakerName: currentUser.name,
        startSec: (Date.now() - meetingStartRef.current) / 1000,
        text: result.text,
      });
    }
  });
  setSubtitleOn(true);
};

useSignal("subtitle_text", (signal) => {
  setLatestSubtitle(signal);
  if (signal.payload.isFinal) {
    appendSegment(meeting.id, {
      speakerId: signal.senderId,
      speakerName: signal.senderName,
      startSec: (signal.timestamp - meetingStartRef.current) / 1000,
      text: signal.payload.text,
    });
  }
});
```

Add a "CC" toggle button next to the existing mic/camera toolbar buttons, and render `<SubtitleBar latest={latestSubtitle} />` positioned absolutely over the video stage container (same parent that already positions the video tiles).

Note: both the local speaker's own final segments (captured directly in `handleToggleSubtitle`'s callback) and remote final segments (captured in the `useSignal("subtitle_text", ...)` handler) call `appendSegment` — this means every tab that has subtitle-related code mounted persists a *local* copy of the full meeting transcript to its own IndexedDB, which is correct for this frontend-only demo (no shared backend) but means the transcript viewer (Task 6) only shows segments captured by the tab it's opened in. Document this as a known limitation in the transcript UI's empty state, not something to "fix" — it matches the spec's local-storage architecture.

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Manual verification**

`npm run dev`, open `/live/<id>` in Chrome (Web Speech API requires Chrome/Edge), click "CC", allow mic permission, speak. Confirm subtitle bar shows interim (italic) then final text. Open a second tab as another user, confirm the subtitle bar appears there too within ~1s of each final segment.

- [ ] **Step 7: Commit**

```bash
git add src/services/speech src/services/transcript src/components/meeting/SubtitleBar.tsx src/app/\(app\)/live/\[id\]/page.tsx
git commit -m "feat(subtitle): Web Speech API subtitles + transcript capture"
```

---

## Task 6: Document sharing sync + transcript viewer + Zoom Room placeholder

**Files:**
- Modify: `src/app/(app)/live/[id]/page.tsx`
- Create: `src/components/meeting/TranscriptTimeline.tsx`
- Create: `src/components/meeting/ZoomRoomStatus.tsx`
- Modify: `src/app/(app)/meetings/[id]/page.tsx`

**Interfaces:**
- Consumes: `useRoomSignaling()` for `doc_share`/`doc_share_page`/`doc_share_stop` (Task 1), `getTranscript(meetingId)` (Task 5 transcript store), `Meeting.zoomRoomDevices` / `ZoomRoomDevice` (`src/data/index.ts`, already exists).
- Produces: `<TranscriptTimeline meetingId={string} />`, `<ZoomRoomStatus devices={ZoomRoomDevice[]} />` — both mounted into the meeting detail page.

- [ ] **Step 1: Modify `src/app/(app)/live/[id]/page.tsx`'s document share to broadcast**

Replace the existing local-only `sharedFileId` toggle handler with:
```typescript
const handleShareFile = (file: MeetingFile) => {
  if (sharedFileId === file.id) {
    setSharedFileId(null);
    broadcast({ type: "doc_share_stop", payload: {} });
    return;
  }
  setSharedFileId(file.id);
  broadcast({ type: "doc_share", payload: { fileId: file.id, fileName: file.name } });
};
```
(Keep whatever `toast` call already exists alongside the state update — add broadcasting, don't remove existing UX.)

Add subscriptions so non-host participants follow the host's share:
```typescript
useSignal("doc_share", (signal) => {
  if (signal.senderId === currentUser.id) return; // don't re-apply our own broadcast
  setSharedFileId(signal.payload.fileId);
  toast.info(`${signal.senderName} กำลังแชร์เอกสาร: ${signal.payload.fileName}`);
});

useSignal("doc_share_stop", (signal) => {
  if (signal.senderId === currentUser.id) return;
  setSharedFileId(null);
  toast.info(`${signal.senderName} หยุดแชร์เอกสารแล้ว`);
});
```
`doc_share_page` is only relevant once the document lightbox supports page navigation — if `viewingFile`/the PDF viewer in this page doesn't currently expose a page-change callback, skip wiring `doc_share_page` in this task and leave it as a documented gap (do not fabricate a page-sync feature the viewer can't support yet); check `src/components/meeting/DocumentPreview.tsx` for a page-change prop before deciding.

- [ ] **Step 2: Write `src/components/meeting/TranscriptTimeline.tsx`**

```typescript
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
        ยังไม่มีการถอดคำพูดในเบราว์เซอร์นี้ (ต้องเปิดซับไตเติลระหว่างประชุมในแท็บนี้)
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
```

- [ ] **Step 3: Write `src/components/meeting/ZoomRoomStatus.tsx`**

```typescript
// src/components/meeting/ZoomRoomStatus.tsx
import { Badge } from "@/components/ui/badge";
import type { ZoomRoomDevice } from "@/data";

const STATUS_LABEL: Record<ZoomRoomDevice["status"], string> = {
  invited: "รอเชื่อมต่อ",
  connected: "เชื่อมต่อแล้ว",
  disconnected: "ตัดการเชื่อมต่อ",
};

export function ZoomRoomStatus({ devices }: { devices: ZoomRoomDevice[] }) {
  if (devices.length === 0) return null;
  return (
    <div className="space-y-2">
      {devices.map((d) => (
        <div key={d.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
          <span>{d.name}</span>
          <Badge variant={d.status === "connected" ? "default" : "secondary"}>{STATUS_LABEL[d.status]}</Badge>
        </div>
      ))}
      <div className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
        การเชื่อมต่อ Zoom Room กับ ZegoCloud ต้องใช้ Enterprise Plan — ฟีเจอร์นี้อยู่ระหว่างรอแผนองค์กร
      </div>
    </div>
  );
}
```

Adjust the import path `@/data` if the barrel export isn't re-exported there — confirm `ZoomRoomDevice` is exported from `src/data/index.ts` (it is, per Task exploration) and import from `@/data/index` or the project's existing `@/data` alias, matching how other meeting components already import `Meeting`/`AppUser` types.

- [ ] **Step 4: Modify `src/app/(app)/meetings/[id]/page.tsx`**

In the `info` tab's existing card list, add a new `Card` titled "อุปกรณ์ห้อง" rendering `<ZoomRoomStatus devices={meeting.zoomRoomDevices ?? []} />` — only render the card at all if `(meeting.zoomRoomDevices ?? []).length > 0`, matching `ZoomRoomStatus`'s own early return.

In the `files` tab, above the existing "สรุปการประชุมอัตโนมัติ" dashed-border card (the one tied to `transcriptStatus`/`summaryDraftId`), add a card titled "ถอดคำพูด" rendering `<TranscriptTimeline meetingId={meeting.id} />`.

Also add a new `"vote"` tab to the live room's `TabsList`/`TabsContent` (from Task 3's `<VotePanel />`) — this belongs in the live room page (`src/app/(app)/live/[id]/page.tsx`), not the meeting detail page: `<TabsTrigger value="vote">โหวต</TabsTrigger>` alongside `agenda`/`files`/`chat`/`people`, and `<TabsContent value="vote" className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 mt-0"><VotePanel meetingId={meeting.id} canManage={can(currentUser, "meeting.manageVoting", meeting)} /></TabsContent>`.

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Manual verification**

`npm run dev`. On `/meetings/<id-with-zoomRoomDevices>` (a meeting booked in a room with `hasZoomRoom: true`), confirm "อุปกรณ์ห้อง" card shows device + enterprise notice. After running Task 5's subtitle test, revisit the same meeting's detail page and confirm "ถอดคำพูด" shows the captured segments with working search. In `/live/<id>`, confirm the new "โหวต" tab renders `VotePanel` and, as host, sharing a document in tab A auto-opens it in tab B.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/live/\[id\]/page.tsx src/app/\(app\)/meetings/\[id\]/page.tsx src/components/meeting/TranscriptTimeline.tsx src/components/meeting/ZoomRoomStatus.tsx
git commit -m "feat: sync document sharing + transcript viewer + Zoom Room placeholder"
```

---

## Task 7: Update project status doc

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Update the "Phase E" section**

Change the Phase E table's status rows from "⏳ Not implemented" to "✅" for signaling layer, voting, hand raise, subtitle, transcript capture, document sharing sync, and Zoom Room placeholder — matching what Tasks 1–6 actually shipped. Leave the "Zoom Room enterprise SIP bridge" row as "⏳ Not implemented, blocked on licensing" — that part is genuinely still unbuilt per spec section 6.

- [ ] **Step 2: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: update project status — Phase E features implemented"
```

---

## Self-Review Notes

**Spec coverage:** §1 Signaling → Task 1. §2 Voting → Tasks 2–3. §3 Hand raise → Task 4. §4 Subtitle → Task 5. §5 Transcript → Task 5 (capture) + Task 6 (viewer). §6 Zoom Room → Task 6 (placeholder UI only, per spec's own "What We Build Now" vs "What We Spec for Later" split — the SIP bridge is explicitly spec'd as NOT implemented). §7 Document sharing → Task 6 (`doc_share`/`doc_share_stop` wired; `doc_share_page` conditionally wired pending a page-change hook on the existing viewer — flagged, not silently dropped). §8 File structure → matches the plan's File Structure section, with transcript folded into `src/services/transcript/` (one extra directory vs. spec's suggestion of merging into voting) since it's genuinely a separate concern (transcript store keyed by `meetingId` alone, not `meetingId/topicId`) — this is a deliberate deviation from the spec's exact file list, noted here for reviewer visibility. §9 Error handling → STT empty-string filter (Task 5 Step 1), IndexedDB errors reject the promise and calling code doesn't crash (uses `.then`/`await` without unguarded throws in render paths, though explicit toast-on-IndexedDB-failure isn't added — acceptable given no other IndexedDB store in this codebase, i.e. `fileStorage.ts`, does this either). §10 Testing → Global Constraints documents why manual multi-tab testing replaces the spec's aspirational unit-test rows (no test runner in this repo).

**Placeholder scan:** no TBD/TODO left; every step has real code or an explicit, justified scope cut (ZegoCloud IM transport, `doc_share_page`, SIP bridge) rather than a vague "handle it later."

**Type consistency:** `RoomSignal<T>`/`SignalPayloadMap` (Task 1) used identically in Tasks 3–6. `VoteTopic`/`VoteOption`/`VoteRecord` (Task 2) used identically in Task 3. `TranscriptSegment` (Task 5) used identically in Task 6. `useRoomSignaling()`'s `broadcast`/`useSignal` signature is consumed the same way in every later task.
