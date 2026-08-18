import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { getTranscript, initTranscript } from "@/lib/transcriptStore";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/transcription/callback", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/transcription/callback", () => {
  beforeEach(() => {
    initTranscript("meeting-1", "task-1");
  });

  it("event ASRResult ที่มี Text ต่อ segment เข้า store ของ meetingId (=RoomId)", async () => {
    const res = await POST(
      makeRequest({
        Event: "ASRResult",
        RoomId: "meeting-1",
        Data: { UserId: "u1", Text: "สวัสดีครับ", StartTime: 1000, EndTime: 2000 },
      })
    );
    expect(res.status).toBe(200);

    const transcript = getTranscript("meeting-1");
    expect(transcript.segments).toHaveLength(1);
    expect(transcript.segments[0]).toEqual({
      speakerId: "u1",
      speakerName: "u1",
      startSec: 1,
      endSec: 2,
      text: "สวัสดีครับ",
    });
  });

  it("event Exception ทำให้ status เป็น failed", async () => {
    const res = await POST(makeRequest({ Event: "Exception", RoomId: "meeting-1" }));
    expect(res.status).toBe(200);
    expect(getTranscript("meeting-1").status).toBe("failed");
  });

  it("ไม่มี RoomId → 400", async () => {
    const res = await POST(makeRequest({ Event: "ASRResult" }));
    expect(res.status).toBe(400);
  });

  it("body ไม่ใช่ JSON → 400", async () => {
    const req = new NextRequest("http://localhost/api/transcription/callback", {
      method: "POST",
      body: "ไม่ใช่ JSON",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
