// src/services/signaling/channel.ts
import type { RoomSignal } from "./types";

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
