import { describe, expect, it } from "vitest";
import { executeWorkItem } from "../src/execution.js";
import { MemoryQueue } from "../src/memory-queue.js";
import { validateJob } from "../src/validation.js";
import { workItems } from "../src/work.js";
import { queueContract } from "./queue-contract.js";

queueContract("in-memory", async (now) => {
  const queue = new MemoryQueue({ now });
  return { queue, peer: queue, cleanup: () => queue.close() };
});

const spec = {
  version: 1, kind: "charts",
  births: [{ id: "synthetic-clock", birth: { utc: "2001-02-03T04:05:06Z", timeKnown: false } }],
};

describe("in-memory backend clock", () => {
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid epoch milliseconds %s", async (now) => {
    const queue = new MemoryQueue({ now: () => now });
    try {
      await expect(queue.submit(spec)).rejects.toMatchObject({ code: "invalid-argument" });
      await expect(queue.claim({ owner: "synthetic-worker", leaseMs: 1 })).rejects.toMatchObject({ code: "invalid-argument" });
    } finally { await queue.close(); }
  });

  it("rejects deadline overflow without claiming and accepts the largest safe deadline", async () => {
    let now = Number.MAX_SAFE_INTEGER - 1;
    const queue = new MemoryQueue({ now: () => now });
    try {
      const submitted = await queue.submit(spec);
      await expect(queue.claim({ owner: "synthetic-worker", leaseMs: 2 })).rejects.toMatchObject({ code: "invalid-argument" });
      expect(await queue.getJob(submitted.id)).toEqual(submitted);
      const claimed = await queue.claim({ owner: "synthetic-worker", leaseMs: 1 });
      expect(claimed!.lease.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
      await expect(queue.renew(claimed!.lease, 2)).rejects.toMatchObject({ code: "invalid-argument" });
      expect(await queue.getJob(submitted.id)).toEqual(claimed!.snapshot);
      now++;
      await expect(queue.release(claimed!.lease)).rejects.toMatchObject({ code: "lease-lost" });
    } finally { await queue.close(); }
  });

  it("checks expiry again after result preparation before advancing the checkpoint", async () => {
    let now = 1_700_000_000_000;
    let expireDuringCommit = false;
    let commitClockReads = 0;
    const queue = new MemoryQueue({ now: () => {
      if (expireDuringCommit && ++commitClockReads === 2) now += 100;
      return now;
    } });
    try {
      const submitted = await queue.submit(spec);
      const claimed = await queue.claim({ owner: "synthetic-worker", leaseMs: 100 });
      const rows = [...workItems(validateJob(spec))].map(executeWorkItem);
      expireDuringCommit = true;
      await expect(queue.commit(claimed!.lease, rows)).rejects.toMatchObject({ code: "lease-lost" });
      expireDuringCommit = false;
      expect(await queue.getJob(submitted.id)).toEqual(claimed!.snapshot);
      expect((await queue.readResults(submitted.id))!.rows).toEqual([]);
      const resumed = await queue.claim({ owner: "synthetic-worker", leaseMs: 100 });
      expect(resumed!.lease.token).not.toBe(claimed!.lease.token);
      expect(await queue.commit(resumed!.lease, rows)).toMatchObject({ status: "completed", nextCursor: 1 });
    } finally { await queue.close(); }
  });
});
