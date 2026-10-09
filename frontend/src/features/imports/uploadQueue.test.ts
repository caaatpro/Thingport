import { describe, expect, it } from "vitest";
import { queueReducer, queueSummary, queueTitle, runUploadQueue, type QueueAction, type QueueItem } from "./uploadQueue";

const item = (id: string, status: QueueItem["status"] = "uploading"): QueueItem => ({ id, name: `${id}.stl`, status });

describe("queueReducer", () => {
  it("appends in drop order and patches by id", () => {
    let state = queueReducer([], { type: "add", items: [item("a"), item("b")] });
    state = queueReducer(state, { type: "add", items: [item("c")] });
    state = queueReducer(state, { type: "update", id: "b", patch: { status: "ready", printId: "p" } });
    expect(state.map((i) => `${i.id}:${i.status}`)).toEqual(["a:uploading", "b:ready", "c:uploading"]);
  });
  it("clears finished items but keeps running ones", () => {
    const state = [item("a", "ready"), item("b"), item("c", "failed")];
    expect(queueReducer(state, { type: "clearFinished" }).map((i) => i.id)).toEqual(["b"]);
  });
});

describe("queue summary", () => {
  it("titles by what is happening", () => {
    expect(queueTitle([item("a"), item("b")])).toBe("Uploading 2 files…");
    expect(queueTitle([item("a")])).toBe("Uploading 1 file…");
    expect(queueTitle([item("a", "ready"), item("b", "failed")])).toBe("1 uploaded, 1 failed");
    expect(queueTitle([item("a", "ready")])).toBe("Upload complete");
    expect(queueSummary([item("a", "failed")]).failed).toBe(1);
  });
});

const collect = () => {
  const actions: QueueAction[] = [];
  return { actions, dispatch: (a: QueueAction) => actions.push(a) };
};

describe("runUploadQueue", () => {
  it("uploads strictly one at a time, in order, and survives a failure", async () => {
    const order: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const { actions, dispatch } = collect();
    const succeeded = await runUploadQueue(
      [
        { id: "1", payload: "a" },
        { id: "2", payload: "bad" },
        { id: "3", payload: "c" },
      ],
      async (name) => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await Promise.resolve();
        running -= 1;
        order.push(name);
        if (name === "bad") throw new Error("nope");
        return { printId: `print-${name}` };
      },
      dispatch,
    );
    expect(succeeded).toBe(2);
    expect(maxRunning).toBe(1);
    expect(order).toEqual(["a", "bad", "c"]);
    expect(actions).toEqual([
      { type: "update", id: "1", patch: { status: "ready", printId: "print-a" } },
      { type: "update", id: "2", patch: { status: "failed", error: "nope" } },
      { type: "update", id: "3", patch: { status: "ready", printId: "print-c" } },
    ]);
  });

  it("fails everything still waiting on a fatal error, without uploading it", async () => {
    const { actions, dispatch } = collect();
    const uploaded: string[] = [];
    const succeeded = await runUploadQueue(
      [
        { id: "1", payload: "a" },
        { id: "2", payload: "b" },
        { id: "3", payload: "c" },
      ],
      async (name) => {
        uploaded.push(name);
        if (name === "b") throw new Error("401");
        return {};
      },
      dispatch,
      (err) => err instanceof Error && err.message === "401",
      "Session expired",
    );
    expect(succeeded).toBe(1);
    expect(uploaded).toEqual(["a", "b"]);
    expect(actions.slice(1)).toEqual([
      { type: "update", id: "2", patch: { status: "failed", error: "Session expired" } },
      { type: "update", id: "3", patch: { status: "failed", error: "Session expired" } },
    ]);
  });
});
