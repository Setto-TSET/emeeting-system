# Meeting System Features — Design Spec

**Date:** 2026-08-11  
**Status:** Approved  
**Scope:** Voting, Hand Raise, Realtime Subtitle, Transcript, Document Sharing, Zoom Room Placeholder  
**Video Platform:** ZegoCloud (free/starter plan)  
**AI Summary:** Mock pipeline (Claude API ready interface, not connected yet)  
**Storage:** IndexedDB + localStorage (no backend DB yet)

---

## 1. Signaling Layer (Foundation)

All realtime features share a single abstraction over ZegoCloud room messaging.

### Interface

```typescript
// src/services/signaling/types.ts

type SignalType =
  | "hand_raise"
  | "hand_lower"
  | "vote_create"
  | "vote_cast"
  | "vote_close"
  | "subtitle_text"
  | "doc_share"
  | "doc_share_page"
  | "doc_share_stop";

type RoomSignal<T extends SignalType = SignalType> = {
  type: T;
  senderId: string;
  senderName: string;
  timestamp: number;
  payload: SignalPayloadMap[T];
};

interface SignalPayloadMap {
  hand_raise: { raised: boolean };
  hand_lower: { targetUserId: string };  // host lowers someone's hand
  vote_create: { topic: VoteTopic };
  vote_cast: { topicId: string; optionId: string };
  vote_close: { topicId: string };
  subtitle_text: { text: string; isFinal: boolean; lang: string };
  doc_share: { fileId: string; fileName: string };
  doc_share_page: { fileId: string; page: number };
  doc_share_stop: {};
}
```

### Transport

| Mode | Channel | When |
|------|---------|------|
| ZegoCloud connected | `ZegoExpressEngine.sendBroadcastMessage()` / `onIMRecvBroadcastMessage` | Normal operation (SDK logged in) |
| Demo mode (no credential) | `BroadcastChannel("emeeting-room-{meetingId}")` | Local dev / demo without ZegoCloud keys |

### React Integration

```typescript
// src/context/RoomSignalingContext.tsx

type RoomSignalingContextValue = {
  /** Send signal to all participants */
  broadcast(signal: Omit<RoomSignal, "senderId" | "senderName" | "timestamp">): void;
  /** Subscribe to signals by type */
  useSignal<T extends SignalType>(type: T, handler: (signal: RoomSignal<T>) => void): void;
  /** Connection status */
  connected: boolean;
};
```

Provider wraps the live room page. Internally:
- On mount: register `onIMRecvBroadcastMessage` callback on ZegoExpressEngine (or `BroadcastChannel.onmessage` in demo mode)
- Deserialize JSON → dispatch to subscribers by `type`
- On unmount: clean up listeners

### Error Handling

- If `sendBroadcastMessage` fails: retry once, then show toast "ส่งข้อความไม่สำเร็จ กรุณาลองใหม่"
- If connection drops: show banner "กำลังเชื่อมต่อใหม่..." + auto-reconnect via ZegoCloud SDK

---

## 2. Voting System

### Data Model

```typescript
// src/services/voting/types.ts

type VoteOption = {
  id: string;      // "opt-1", "opt-2", ...
  label: string;   // "เห็นด้วย", "ไม่เห็นด้วย", "งดออกเสียง"
};

type VoteRecord = {
  userId: string;
  userName: string;
  optionId: string;
  timestamp: number;
};

type VoteTopic = {
  id: string;               // "vote-{uuid}"
  meetingId: string;
  title: string;             // "อนุมัติงบประมาณ Q3"
  description?: string;
  options: VoteOption[];
  createdBy: string;         // userId
  createdByName: string;
  createdAt: number;
  status: "open" | "closed";
  votes: VoteRecord[];
};
```

### Storage

- **IndexedDB** store: `vote_topics`
- Key: `{meetingId}/{topicId}`
- Persists after meeting ends — viewable from meeting detail page

### Flow

1. **Create:** Host/Secretary opens "สร้างโหวต" form → fills title + options (2–6 choices) → submit → broadcast `vote_create` signal → all participants see the topic appear
2. **Vote:** Participant selects option → broadcast `vote_cast` → all see live tally update
3. **View results:** Any participant can see who voted what (transparent — not anonymous)
4. **Close:** Host clicks "ปิดโหวต" → broadcast `vote_close` → topic locked, no more votes
5. **Multiple topics:** Can create unlimited topics during one meeting, each independent

### UI Components

```
src/components/meeting/
  VotePanel.tsx          — Tab content: list of topics + create button
  VoteTopicCard.tsx      — Single topic: title, options, tallies, vote button
  VoteCreateDialog.tsx   — Form: title, description, add/remove options
  VoteResultsDialog.tsx  — Full results: who voted what, option breakdown
```

### UI Location

- New tab "โหวต" in the meeting room sidebar (alongside วาระ, แชท, เอกสาร)
- Badge on tab showing count of open topics
- Toast notification when new topic created by someone else
- When a vote topic is created, auto-switch to the vote tab for all participants

### Permissions

| Action | Who can |
|--------|---------|
| Create topic | Host, Secretary, Admin |
| Cast vote | Any participant in the room |
| Close topic | Creator of the topic, Host, Admin |
| View results (who voted what) | Any participant |

---

## 3. Hand Raise (Upgrade: local → realtime)

### Current State

`handRaised` is a `useState(false)` local to the user — others cannot see it.

### New Design

#### State

```typescript
// Managed in RoomSignalingContext or a dedicated HandRaiseContext

type HandRaiseState = Map<string, {
  userId: string;
  userName: string;
  raisedAt: number;   // timestamp for ordering
}>;
```

Ephemeral — no IndexedDB. Clears when leaving the room.

#### Flow

1. User clicks raise hand → broadcast `hand_raise { raised: true }`
2. All participants receive → add to `HandRaiseState` map
3. User clicks lower hand → broadcast `hand_raise { raised: false }`
4. Host can click "ลดมือ" on a participant → broadcast `hand_lower { targetUserId }` → that user's hand is lowered
5. Audio notification for host when someone raises hand

#### UI Changes

- ✋ icon next to participant avatar in the roster
- Participants with raised hands sorted to top of roster
- Counter badge on roster section: "3 คนยกมือ"
- Host sees "ลดมือ" button next to each raised hand
- Raise/lower hand button in bottom toolbar (already exists — wire to signaling)

---

## 4. Realtime Subtitle (Speech-to-Text)

### Architecture

```
User's mic → Web Speech API (SpeechRecognition)
  → interim/final text
  → broadcast via signaling: subtitle_text { text, isFinal, lang }
  → all participants render subtitle bar
```

### Speech Recognition Service

```typescript
// src/services/speech/webSpeechProvider.ts

type SpeechCallback = (result: {
  text: string;
  isFinal: boolean;
  lang: string;
}) => void;

interface SpeechRecognitionService {
  start(lang: string, onResult: SpeechCallback): void;
  stop(): void;
  isSupported(): boolean;
}
```

- Uses `window.SpeechRecognition` (Chrome) or `window.webkitSpeechRecognition`
- `continuous: true`, `interimResults: true`
- Default language: `"th-TH"`
- Falls back gracefully: if not supported, show message "เบราว์เซอร์ไม่รองรับ กรุณาใช้ Chrome"

### UI

- **Toggle button** "CC" / "ซับไตเติล" in bottom toolbar
- When enabled: starts STT on own mic, broadcasts results
- **Subtitle bar**: semi-transparent bar at bottom of video area
  - Shows `[ชื่อผู้พูด]: ข้อความ`
  - Interim text in lighter color, final text in normal weight
  - Fades out after 5 seconds of no new text
  - Max 2 lines visible, scroll up old text
- Each user controls their own STT — can turn on/off independently
- Subtitle bar is visible to everyone (even those who haven't enabled STT on their mic)

### Limitations (Display to user)

- Chrome/Edge only (Web Speech API)
- Thai language accuracy varies
- STT captures own microphone only — cannot transcribe other participants' audio
- Requires internet (Chrome sends audio to Google servers for recognition)

---

## 5. Transcript + Meeting Summary (Enhanced Mock)

### Transcript Capture

During the meeting, if subtitle is enabled, **accumulate subtitle signals into TranscriptSegment[]**:

```typescript
// Each final subtitle_text signal becomes a segment
const segment: TranscriptSegment = {
  speakerId: signal.senderId,
  speakerName: signal.senderName,
  startSec: (signal.timestamp - meetingStartTime) / 1000,
  endSec: (signal.timestamp - meetingStartTime) / 1000 + estimatedDuration,
  text: signal.payload.text,
};
```

- Store in **IndexedDB** under key `transcript-{meetingId}`
- Append in realtime during meeting
- After meeting ends, transcript is available on meeting detail page

### Transcript Display

On `/meetings/[id]` (meeting detail):

- Section "ถอดคำพูด" showing timeline of who said what
- Filter by speaker
- Search within transcript
- Export as text file (manual copy)

### Summary Pipeline (Still Mock)

- Input: real transcript segments (if captured) or mock data (if no subtitle was used)
- Output: mock summary (same as current mockSummarizer)
- Interface unchanged — ready for Claude API swap later

### TranscriptionProvider Enhancement

```typescript
// Add to existing TranscriptionProvider interface
type TranscriptionProvider = {
  id: "assemblyai" | "azure" | "web_speech" | "mock";
  getTranscript(meetingId: string): Promise<MeetingTranscript>;
};

// New: web_speech provider reads from IndexedDB
// (segments captured during meeting via subtitle feature)
```

---

## 6. Zoom Room Integration (Spec + Placeholder)

### Current Data Model (Already Exists)

```typescript
// In src/data/index.ts — already defined
type ZoomRoomDevice = {
  id: string;
  name: string;       // "Zoom Room ห้อง A-301"
  roomId: string;     // links to Room.id
  status: "invited" | "connecting" | "connected" | "disconnected";
};

// Meeting already has:
interface Meeting {
  zoomRoomDevices?: ZoomRoomDevice[];
  zegoSipUri?: string;  // SIP URI for Zoom Room dial-in
}
```

### What We Build Now (UI Placeholder)

1. **Meeting Detail page** — "อุปกรณ์ห้อง" section:
   - Shows Zoom Room devices linked to the meeting room
   - Status badge per device
   - Info box: "การเชื่อมต่อ Zoom Room กับ ZegoCloud ต้องใช้ Enterprise Plan"

2. **Meeting creation** — when selecting a room with `hasZoomRoom: true`:
   - Auto-add the Zoom Room device to `zoomRoomDevices`
   - Show note: "ห้องนี้มี Zoom Room — จะเชื่อมต่ออัตโนมัติเมื่อระบบพร้อม"

3. **Live room** — Zoom Room status indicator:
   - Badge showing device status (mock: always "invited")
   - Placeholder button "เชิญ Zoom Room" (disabled, tooltip explains enterprise requirement)

### What We Spec for Later (Enterprise Plan)

When ZegoCloud enterprise plan with SIP Gateway is available:

1. Backend creates SIP URI for ZegoCloud room
2. Backend calls Zoom Room API to invite device via SIP
3. Zoom Room device dials into ZegoCloud room
4. Audio/video bridge established
5. Status updates: invited → connecting → connected

This flow is documented but NOT implemented.

---

## 7. Document Sharing Enhancement

### Current State

Host can click "แชร์" on a document → `sharedFileId` state is set locally → presentation view shows for the host.

### Enhancement: Sync Across Participants

#### Flow

1. Host clicks "แชร์เอกสาร" on a file → broadcast `doc_share { fileId, fileName }`
2. All participants receive → auto-open document lightbox
3. Host navigates to page N → broadcast `doc_share_page { fileId, page: N }`
4. All participants' lightbox jumps to page N
5. Host clicks "หยุดแชร์" → broadcast `doc_share_stop`
6. All participants' lightbox closes (or shows "โฮสต์หยุดแชร์แล้ว")

#### Participant Experience

- When host shares: lightbox opens automatically with "กำลังนำเสนอ" badge
- Participant can still scroll independently (optional: toggle "ตามโฮสต์" to auto-follow)
- When host changes page: if "ตามโฮสต์" is on, page syncs; if off, toast shows "โฮสต์อยู่หน้า N"

#### Permissions

- Only Host/Secretary/Admin can share documents
- Any participant can view shared document (respecting existing `canViewFile` check)

---

## 8. File Structure (New Files)

```
src/
├── services/
│   ├── signaling/
│   │   ├── types.ts              — Signal types + payloads
│   │   ├── zegoTransport.ts      — ZegoCloud broadcast impl
│   │   ├── localTransport.ts     — BroadcastChannel fallback
│   │   └── index.ts              — Factory: pick transport based on connection
│   │
│   ├── voting/
│   │   ├── types.ts              — VoteTopic, VoteRecord, VoteOption
│   │   └── store.ts              — IndexedDB CRUD for vote topics
│   │
│   └── speech/
│       ├── types.ts              — SpeechRecognitionService interface
│       └── webSpeechProvider.ts  — Web Speech API implementation
│
├── context/
│   ├── RoomSignalingContext.tsx   — Signaling provider + hooks
│   ├── VotingContext.tsx          — Vote state management
│   └── HandRaiseContext.tsx       — Hand raise state (or merged into signaling)
│
├── components/meeting/
│   ├── VotePanel.tsx             — Vote tab content
│   ├── VoteTopicCard.tsx         — Single topic card
│   ├── VoteCreateDialog.tsx      — Create vote form
│   ├── VoteResultsDialog.tsx     — Who voted what
│   ├── SubtitleBar.tsx           — Floating subtitle display
│   ├── HandRaiseIndicator.tsx    — Icon overlay on participant
│   ├── HandRaiseList.tsx         — List of raised hands (host view)
│   ├── ZoomRoomStatus.tsx        — Zoom Room placeholder UI
│   └── TranscriptTimeline.tsx    — Post-meeting transcript viewer
```

---

## 9. Error Handling

| Scenario | Handling |
|----------|---------|
| ZegoCloud signaling disconnected | Fallback to BroadcastChannel if same-machine; show reconnecting banner |
| Web Speech API not supported | Show "กรุณาใช้ Chrome" message, disable subtitle button |
| IndexedDB quota exceeded | Toast warning, continue without persisting new votes |
| Vote signal lost (network glitch) | Participant re-sends on retry; dedup by `userId + topicId` |
| STT returns empty/garbage | Don't broadcast empty strings; filter min 2 chars |

---

## 10. Testing Strategy

| Feature | Test Approach |
|---------|--------------|
| Signaling layer | Unit test: signal serialize/deserialize; integration: BroadcastChannel in 2 tabs |
| Voting | Unit test: VoteTopic CRUD; manual: create topic in tab A, vote in tab B |
| Hand raise | Manual: raise in tab A, verify icon in tab B |
| Subtitle | Manual: speak in Chrome tab, verify text appears in other tab |
| Document sharing | Manual: share in host tab, verify lightbox opens in participant tab |
| Zoom Room placeholder | Visual: verify UI shows device status + enterprise notice |

### Demo Testing (Multi-tab)

Since this is a frontend-only system, test by:
1. Open 2 Chrome tabs as different users (Admin + Staff)
2. Both enter same meeting room
3. Demo mode uses BroadcastChannel for cross-tab sync
4. Test all features: vote, hand raise, subtitle, doc share

---

## 11. Out of Scope (Future)

- [ ] Claude API integration for real summarization
- [ ] Azure/Google Cloud STT for better Thai accuracy
- [ ] ZegoCloud Enterprise Plan + SIP Gateway for Zoom Room bridge
- [ ] Backend API + MySQL for persistent storage
- [ ] Anonymous/secret voting mode
- [ ] Vote delegation (proxy voting)
- [ ] Recording + playback
- [ ] Mobile app
