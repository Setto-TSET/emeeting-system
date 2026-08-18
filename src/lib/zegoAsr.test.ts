import { describe, it, expect, vi, afterEach } from "vitest";
import { startAsrTask, stopAsrTask } from "./zegoAsr";

describe("startAsrTask", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("คืน TaskId เมื่อ Code เป็น 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ Code: 0, Message: "Success", RequestId: "r1", Data: { TaskId: "task-1" } }),
      })
    );
    const taskId = await startAsrTask(1, "s".repeat(32), "room-1");
    expect(taskId).toBe("task-1");
  });

  it("throw เมื่อ Code ไม่ใช่ 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ Code: 1000001, Message: "AppId invalid", RequestId: "r1" }),
      })
    );
    await expect(startAsrTask(1, "s".repeat(32), "room-1")).rejects.toThrow(/1000001/);
  });
});

describe("stopAsrTask", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolve เมื่อ Code เป็น 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ Code: 0, Message: "Success", RequestId: "r1" }),
      })
    );
    await expect(stopAsrTask(1, "s".repeat(32), "task-1")).resolves.toBeUndefined();
  });

  it("throw เมื่อ Code ไม่ใช่ 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ Code: 5000001, Message: "Task not found", RequestId: "r1" }),
      })
    );
    await expect(stopAsrTask(1, "s".repeat(32), "bad-task")).rejects.toThrow(/5000001/);
  });
});
