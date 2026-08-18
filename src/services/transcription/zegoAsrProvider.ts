// ═══════════════════════════════════════════
// ZegoCloud ASR Provider — client-side, implements TranscriptionProvider
//
// server (api/transcription/callback) ไม่รู้จัก roster ของประชุม (ระบบนี้ auth เป็น client-side
// mock ทั้งหมด ไม่มี DB ฝั่ง server) segment ที่ได้จาก server จึงมีแค่ speakerId ดิบ (=ZegoCloud UserId)
// resolveSpeakerNames() ทำหน้าที่เติมชื่อจริงจาก roster ฝั่ง client ก่อนส่งให้ UI/summarizer ใช้
// ═══════════════════════════════════════════

import type { TranscriptionProvider, MeetingTranscript } from "./types";
import type { Meeting } from "@/data";

export async function fetchRawTranscript(meetingId: string): Promise<MeetingTranscript> {
  const res = await fetch(`/api/transcription/result?meetingId=${encodeURIComponent(meetingId)}`);
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
  async getTranscript(meetingId: string): Promise<MeetingTranscript> {
    return fetchRawTranscript(meetingId);
  },
};
