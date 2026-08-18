// ═══════════════════════════════════════════
// ZegoCloud ASR Provider — client-side, implements TranscriptionProvider
//
// server (api/transcription/callback) ไม่รู้จัก roster ของประชุม (ระบบนี้ auth เป็น client-side
// mock ทั้งหมด ไม่มี DB ฝั่ง server) segment ที่ได้จาก server จึงมีแค่ speakerId ดิบ (=ZegoCloud UserId)
// resolveSpeakerNames() ทำหน้าที่เติมชื่อจริงจาก roster ฝั่ง client ก่อนส่งให้ UI/summarizer ใช้
// ═══════════════════════════════════════════

import type { TranscriptionProvider, MeetingTranscript } from "./types";
import type { Meeting } from "@/data";

// roomKey = meeting.conferenceRoomKey ?? meeting.id — server เก็บ transcript ด้วยคีย์นี้
// (callback ของ ZegoCloud ส่ง RoomId มา ไม่ใช่ meetingId) ผู้เรียกต้องส่ง roomKey ไม่ใช่ meeting.id
export async function fetchRawTranscript(roomKey: string): Promise<MeetingTranscript> {
  const res = await fetch(`/api/transcription/result?roomKey=${encodeURIComponent(roomKey)}`);
  if (!res.ok) {
    throw new Error(`ดึง transcript ไม่สำเร็จ: HTTP ${res.status}`);
  }
  return (await res.json()) as MeetingTranscript;
}

export function resolveSpeakerNames(transcript: MeetingTranscript, meeting: Meeting): MeetingTranscript {
  return {
    ...transcript,
    segments: transcript.segments.map((seg) => {
      const participant = meeting.participants.find((p) => p.userId === seg.speakerId);
      return participant ? { ...seg, speakerName: participant.name } : seg;
    }),
  };
}

export const zegoAsrProvider: TranscriptionProvider = {
  id: "zego_asr",
  // ⚠️ พารามิเตอร์ชื่อ meetingId ตาม type contract ของ TranscriptionProvider (ห้ามเปลี่ยน signature)
  // แต่ค่าที่ต้องส่งเข้ามาจริง ๆ คือ roomKey (conferenceRoomKey ?? meeting.id) เพราะ server เก็บด้วย roomKey
  // ปัจจุบัน UI ไม่ได้เรียกผ่านเมธอดนี้ — เรียก fetchRawTranscript() ตรง ๆ ด้วย roomKey
  async getTranscript(meetingId: string): Promise<MeetingTranscript> {
    return fetchRawTranscript(meetingId);
  },
};
