import { describe, it, expect, vi, afterEach } from "vitest";
import { computeSignature, callZegoServerApi } from "./zegoServerApi";
import { createHash } from "node:crypto";

describe("computeSignature", () => {
  it("คำนวณ md5(appId + nonce + secret + timestamp) ตรงสูตร ZegoCloud", () => {
    const appId = 123456;
    const nonce = "abcdef0123456789";
    const secret = "01234567890123456789012345678901";
    const timestamp = 1700000000;
    const expected = createHash("md5")
      .update(`${appId}${nonce}${secret}${timestamp}`)
      .digest("hex");
    expect(computeSignature(appId, nonce, secret, timestamp)).toBe(expected);
  });
});

describe("callZegoServerApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ยิง POST ไป baseUrl พร้อม query params (Action/AppId/Signature ฯลฯ) และ body เป็น JSON ของ params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ Code: 0, Message: "Success", RequestId: "r1", Data: { TaskId: "t1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callZegoServerApi<{ TaskId: string }>(
      "https://example.zegotech.cn/",
      "StartRealtimeASRTask",
      123456,
      "01234567890123456789012345678901",
      { RoomId: "room-1" }
    );

    expect(result.Code).toBe(0);
    expect(result.Data?.TaskId).toBe("t1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("Action=StartRealtimeASRTask");
    expect(String(url)).toContain("AppId=123456");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ RoomId: "room-1" });
  });
});
