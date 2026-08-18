import { describe, it, expect, vi, afterEach } from "vitest";
import {
  segmentsInWindow,
  transcriptToText,
  buildOverallPrompt,
  buildAgendaPrompt,
  parseAgendaJson,
  callClaude,
} from "./claudeSummarize";
import type { TranscriptSegment } from "@/services/transcription/types";

const segments: TranscriptSegment[] = [
  { speakerId: "u1", speakerName: "ประธาน", startSec: 0, endSec: 10, text: "เปิดประชุม" },
  { speakerId: "u2", speakerName: "เลขาฯ", startSec: 40, endSec: 50, text: "แจ้งวาระ" },
  { speakerId: "u1", speakerName: "ประธาน", startSec: 100, endSec: 110, text: "ปิดประชุม" },
];

describe("segmentsInWindow", () => {
  it("กรองเฉพาะ segment ที่อยู่ในช่วงเวลาที่กำหนด", () => {
    const result = segmentsInWindow(segments, { agendaId: "a1", startSec: 30, endSec: 60 });
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("แจ้งวาระ");
  });
});

describe("transcriptToText", () => {
  it("รวม segment เป็นข้อความ [ชื่อผู้พูด] ข้อความ ต่อบรรทัด", () => {
    expect(transcriptToText(segments.slice(0, 2))).toBe(
      "[ประธาน] เปิดประชุม\n[เลขาฯ] แจ้งวาระ"
    );
  });
});

describe("buildOverallPrompt / buildAgendaPrompt", () => {
  it("prompt มีข้อความ transcript อยู่ในตัว", () => {
    expect(buildOverallPrompt("บทสนทนาทดสอบ")).toContain("บทสนทนาทดสอบ");
    expect(buildAgendaPrompt("บทสนทนาทดสอบ")).toContain("บทสนทนาทดสอบ");
  });
});

describe("parseAgendaJson", () => {
  it("parse JSON ตรง schema ได้", () => {
    const raw = JSON.stringify({
      discussion: "อภิปรายเรื่องงบประมาณ",
      resolutions: ["เห็นชอบ"],
      actionItems: [{ text: "จัดทำรายงาน", ownerName: "เลขาฯ" }],
    });
    const result = parseAgendaJson("ag-1", raw);
    expect(result).toEqual({
      agendaId: "ag-1",
      discussion: "อภิปรายเรื่องงบประมาณ",
      resolutions: ["เห็นชอบ"],
      actionItems: [{ text: "จัดทำรายงาน", ownerName: "เลขาฯ" }],
    });
  });

  it("ตัด code fence ```json ... ``` ออกก่อน parse ได้ (Claude มักตอบแบบนี้)", () => {
    const raw = "```json\n" + JSON.stringify({ discussion: "d", resolutions: [], actionItems: [] }) + "\n```";
    expect(parseAgendaJson("ag-2", raw).discussion).toBe("d");
  });

  it("throw เมื่อ raw ไม่ใช่ JSON ที่ parse ได้", () => {
    expect(() => parseAgendaJson("ag-3", "ไม่ใช่ JSON")).toThrow();
  });
});

describe("callClaude", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ยิง POST ไป Claude Messages API พร้อม header ที่ถูกต้อง คืน content[0].text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: "text", text: "สรุปผลลัพธ์" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callClaude("test-key", "prompt ทดสอบ");
    expect(result).toBe("สรุปผลลัพธ์");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("test-key");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    expect(JSON.parse(init.body).messages[0].content).toBe("prompt ทดสอบ");
  });

  it("throw เมื่อ HTTP ไม่ ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve("unauthorized") })
    );
    await expect(callClaude("bad-key", "prompt")).rejects.toThrow(/401/);
  });
});
