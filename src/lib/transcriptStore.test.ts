import { describe, it, expect, beforeEach } from "vitest";
import {
  initTranscript,
  appendSegments,
  markReady,
  markFailed,
  getTranscript,
  getTaskId,
} from "./transcriptStore";

describe("transcriptStore", () => {
  it("meetingId ที่ไม่เคย init คืน status none, segments ว่าง", () => {
    expect(getTranscript("never-seen")).toEqual({
      meetingId: "never-seen",
      status: "none",
      language: "th",
      segments: [],
    });
    expect(getTaskId("never-seen")).toBeNull();
  });

  it("init → append → markReady ได้ transcript ครบ", () => {
    initTranscript("m1", "task-1");
    expect(getTaskId("m1")).toBe("task-1");
    expect(getTranscript("m1").status).toBe("processing");

    appendSegments("m1", [
      { speakerId: "u1", speakerName: "u1", startSec: 0, endSec: 5, text: "สวัสดี" },
    ]);
    appendSegments("m1", [
      { speakerId: "u2", speakerName: "u2", startSec: 5, endSec: 10, text: "สวัสดีครับ" },
    ]);
    markReady("m1");

    const result = getTranscript("m1");
    expect(result.status).toBe("ready");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[1].text).toBe("สวัสดีครับ");
  });

  it("markFailed เปลี่ยน status เป็น failed", () => {
    initTranscript("m2", "task-2");
    markFailed("m2");
    expect(getTranscript("m2").status).toBe("failed");
  });
});
