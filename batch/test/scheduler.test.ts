import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeWorkItem } from "../src/execution.js";
import type { ResultRow } from "../src/execution.js";
import { MemoryQueue } from "../src/memory-queue.js";
import type { ChartsJob } from "../src/model.js";
import { QueueError } from "../src/queue.js";
import type { QueueBackend } from "../src/queue.js";
import { Scheduler, SchedulerError } from "../src/scheduler.js";
import type { SchedulerOptions, TaskPool } from "../src/scheduler.js";
import { workItemAt } from "../src/work.js";
import type { WorkItem } from "../src/work.js";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

interface Call {
  readonly item: WorkItem;
  readonly signal: AbortSignal | undefined;
  readonly result: ReturnType<typeof deferred<ResultRow>>;
  settled: boolean;
}

/** Gates execution independently from the queue and the scheduler timers. */
class ControlledPool implements TaskPool {
  readonly calls: Call[] = [];
  readonly close = vi.fn(async () => { this.rejectPending(); });

  constructor(readonly capacity: number) {}

  run(item: WorkItem, signal?: AbortSignal): Promise<ResultRow> {
    const result = deferred<ResultRow>();
    const call: Call = { item, signal, result, settled: false };
    this.calls.push(call);
    const abort = () => {
      call.settled = true;
      result.reject(new Error("Controlled execution aborted"));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    return result.promise.finally(() => {
      call.settled = true;
      signal?.removeEventListener("abort", abort);
    });
  }

  complete(index: number): void {
    const call = this.pending(index);
    call.settled = true;
    call.result.resolve(executeWorkItem(call.item));
  }

  fail(index: number): void {
    const call = this.pending(index);
    call.settled = true;
    call.result.reject(new Error("SYNTHETIC_PRIVATE_FAILURE"));
  }

  rejectPending(): void {
    for (const call of this.calls) {
      if (!call.settled) {
        call.settled = true;
        call.result.reject(new Error("Controlled pool cleanup"));
      }
    }
  }

  pending(index: number): Call {
    const call = this.calls.find((entry) => entry.item.index === index && !entry.settled);
    if (!call) throw new Error(`No pending synthetic work item ${index}`);
    return call;
  }

  indices(): number[] { return this.calls.map((call) => call.item.index); }
}

// Invented instants and identifiers only, unrelated to external birth records.
function charts(count: number, prefix = "synthetic"): ChartsJob {
  return {
    version: 1,
    kind: "charts",
    births: Array.from({ length: count }, (_, index) => ({
      id: `${prefix}-${index}`,
      birth: { utc: "2001-02-03T04:05:06Z", timeKnown: false },
    })),
  };
}

const pools: ControlledPool[] = [];
const schedulers: Scheduler[] = [];
const queues: QueueBackend[] = [];

function fixture(capacity = 2, queue = new MemoryQueue()) {
  const pool = new ControlledPool(capacity);
  const scheduler = new Scheduler(queue, {
    pool, owner: "synthetic-scheduler", leaseMs: 1_000, heartbeatMs: 100, pollMs: 10,
  });
  pools.push(pool);
  schedulers.push(scheduler);
  queues.push(queue);
  return { queue, pool, scheduler };
}

function run(scheduler: Scheduler): Promise<void> {
  const running = scheduler.run();
  // Error-path assertions attach later, after controlled work has settled.
  void running.catch(() => {});
  return running;
}

async function flush(): Promise<void> { await vi.advanceTimersByTimeAsync(0); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
});

afterEach(async () => {
  for (const pool of pools) pool.rejectPending();
  await Promise.allSettled(schedulers.map((scheduler) => scheduler.stop()));
  await Promise.all(queues.map((queue) => queue.close()));
  pools.length = 0;
  schedulers.length = 0;
  queues.length = 0;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("scheduler dispatch and checkpoints", () => {
  it("bounds all uncommitted work and commits only a contiguous prefix", async () => {
    const { queue, pool, scheduler } = fixture();
    const job = await queue.submit(charts(6));
    const commit = vi.spyOn(queue, "commit");
    const running = run(scheduler);
    await flush();
    expect(pool.indices()).toEqual([0, 1]);

    pool.complete(1);
    await flush();
    expect(pool.indices()).toEqual([0, 1]);
    expect(await queue.getJob(job.id)).toMatchObject({ completedTasks: 0, nextCursor: 0 });
    expect((await queue.readResults(job.id))!.rows).toEqual([]);

    pool.complete(0);
    await flush();
    expect(pool.indices()).toEqual([0, 1, 2, 3]);
    expect(await queue.getJob(job.id)).toMatchObject({ completedTasks: 2, nextCursor: 2 });
    expect(commit.mock.calls.map(([, rows]) => rows.map((row) => row.index))).toEqual([[0], [1]]);

    const stopping = scheduler.stop();
    pool.complete(3);
    await flush();
    expect(await queue.getJob(job.id)).toMatchObject({ nextCursor: 2 });
    pool.complete(2);
    await stopping;
    await running;
    expect(pool.indices()).toEqual([0, 1, 2, 3]);
    expect(await queue.getJob(job.id)).toMatchObject({ status: "queued", nextCursor: 4, lease: null });
    expect((await queue.readResults(job.id))!.rows.map((row) => row.index)).toEqual([0, 1, 2, 3]);
    expect(pool.close).toHaveBeenCalledTimes(1);
  });

  it("resumes directly from a stored prefix without repeating earlier computation", async () => {
    const { queue, pool, scheduler } = fixture();
    const job = await queue.submit(charts(3));
    const claim = (await queue.claim({ owner: "synthetic-previous", leaseMs: 1_000 }))!;
    const first = executeWorkItem(workItemAt(claim.job, 0));
    await queue.commit(claim.lease, [first]);
    await queue.release(claim.lease);
    const running = run(scheduler);
    await flush();
    expect(pool.indices()).toEqual([1, 2]);
    pool.complete(2);
    pool.complete(1);
    await flush();
    expect(await queue.getJob(job.id)).toMatchObject({ status: "completed", nextCursor: 3, claimCount: 2 });
    expect((await queue.readResults(job.id))!.rows.map((row) => row.index)).toEqual([0, 1, 2]);
    expect((await queue.readResults(job.id))!.rows[0]).toEqual(first);
    await scheduler.stop();
    await running;
  });

  it("finishes a job before claiming the next submitted job", async () => {
    const { queue, pool, scheduler } = fixture(1);
    const first = await queue.submit(charts(1, "synthetic-first"));
    const second = await queue.submit(charts(1, "synthetic-second"));
    const running = run(scheduler);
    await flush();
    expect(await queue.getJob(second.id)).toMatchObject({ status: "queued", claimCount: 0 });
    pool.complete(0);
    await flush();
    expect(await queue.getJob(first.id)).toMatchObject({ status: "completed" });
    expect(await queue.getJob(second.id)).toMatchObject({ status: "running", claimCount: 1 });
    expect(pool.calls.map(({ item }) => item.kind === "charts" && item.person.id))
      .toEqual(["synthetic-first-0", "synthetic-second-0"]);
    pool.complete(0);
    await flush();
    expect(await queue.getJob(second.id)).toMatchObject({ status: "completed" });
    await scheduler.stop();
    await running;
  });

  it("renews a lease while calculation is blocked, including during graceful draining", async () => {
    const { queue, pool, scheduler } = fixture(1);
    const job = await queue.submit(charts(2));
    const renew = vi.spyOn(queue, "renew");
    const running = run(scheduler);
    await flush();
    const originalExpiry = (await queue.getJob(job.id))!.lease!.expiresAt;
    await vi.advanceTimersByTimeAsync(1_200);
    expect(renew).toHaveBeenCalled();
    expect((await queue.getJob(job.id))!.lease!.expiresAt).toBeGreaterThan(originalExpiry);
    expect(await queue.claim({ owner: "synthetic-peer", leaseMs: 1_000 })).toBeNull();
    const stopping = scheduler.stop();
    const renewals = renew.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1_200);
    expect(renew.mock.calls.length).toBeGreaterThan(renewals);
    pool.complete(0);
    await stopping;
    await running;
    expect(await queue.getJob(job.id)).toMatchObject({ status: "queued", nextCursor: 1 });
    expect(pool.indices()).toEqual([0]);
  });
});

describe("scheduler shutdown", () => {
  it("waits for an active claim then releases it without dispatching", async () => {
    const { queue, pool, scheduler } = fixture();
    const job = await queue.submit(charts(2));
    const gate = deferred<void>();
    const original = queue.claim.bind(queue);
    const claim = vi.spyOn(queue, "claim").mockImplementationOnce(async (options) => {
      await gate.promise;
      return original(options);
    });
    const running = run(scheduler);
    await flush();
    expect(claim).toHaveBeenCalledTimes(1);
    const stopping = scheduler.stop();
    gate.resolve();
    await stopping;
    await running;
    expect(pool.calls).toEqual([]);
    expect(await queue.getJob(job.id)).toMatchObject({ status: "queued", nextCursor: 0, lease: null });
  });

  it("waits for an in-flight commit and releases the remaining suffix", async () => {
    const { queue, pool, scheduler } = fixture(1);
    const job = await queue.submit(charts(3));
    const gate = deferred<void>();
    const original = queue.commit.bind(queue);
    const commit = vi.spyOn(queue, "commit").mockImplementationOnce(async (lease, rows) => {
      await gate.promise;
      return original(lease, rows);
    });
    const running = run(scheduler);
    await flush();
    pool.complete(0);
    await flush();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(pool.indices()).toEqual([0]);
    const stopping = scheduler.stop();
    expect(pool.close).not.toHaveBeenCalled();
    gate.resolve();
    await stopping;
    await running;
    expect(pool.indices()).toEqual([0]);
    expect(await queue.getJob(job.id)).toMatchObject({ status: "queued", nextCursor: 1 });
  });

  it("can stop before running and leaves queue ownership with the caller", async () => {
    const { queue, pool, scheduler } = fixture();
    const job = await queue.submit(charts(1));
    const claim = vi.spyOn(queue, "claim");
    const close = vi.spyOn(queue, "close");
    await scheduler.stop();
    await scheduler.stop();
    await scheduler.run();
    expect(claim).not.toHaveBeenCalled();
    expect(pool.calls).toEqual([]);
    expect(pool.close).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    expect(await queue.getJob(job.id)).toMatchObject({ status: "queued" });
  });

  it("shares a running loop and stops idle polling immediately and idempotently", async () => {
    const { queue, pool, scheduler } = fixture();
    const claim = vi.spyOn(queue, "claim");
    const running = run(scheduler);
    expect(scheduler.run()).toBe(running);
    await flush();
    expect(claim).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(claim).toHaveBeenCalledTimes(2);
    await Promise.all([scheduler.stop(), scheduler.stop()]);
    await running;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(claim).toHaveBeenCalledTimes(2);
    expect(pool.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("scheduler failure cleanup and lease fencing", () => {
  it("keeps committed progress, aborts siblings and releases on execution failure without a retry loop", async () => {
    const { queue, pool, scheduler } = fixture();
    const job = await queue.submit(charts(4));
    const running = run(scheduler);
    await flush();
    pool.complete(0);
    await flush();
    expect(pool.indices()).toEqual([0, 1, 2]);
    pool.fail(1);
    await expect(running).rejects.toMatchObject({ name: "SchedulerError", code: "execution-failed" });
    const error = await running.catch((error: unknown) => error);
    expect(error).toBeInstanceOf(SchedulerError);
    expect((error as Error).message).not.toContain("SYNTHETIC_PRIVATE_FAILURE");
    expect((error as Error).cause).toBeUndefined();
    expect(pool.calls[2]!.signal!.aborted).toBe(true);
    expect(pool.close).toHaveBeenCalledTimes(1);
    expect(await queue.getJob(job.id)).toMatchObject({ status: "queued", nextCursor: 1, claimCount: 1 });
    expect((await queue.readResults(job.id))!.rows.map((row) => row.index)).toEqual([0]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await queue.getJob(job.id)).toMatchObject({ claimCount: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts outstanding work and preserves the cursor after a failed commit", async () => {
    const { queue, pool, scheduler } = fixture();
    const job = await queue.submit(charts(3));
    vi.spyOn(queue, "commit").mockRejectedValueOnce(new Error("SYNTHETIC_STORAGE_DETAILS"));
    const running = run(scheduler);
    await flush();
    pool.complete(0);
    await expect(running).rejects.toMatchObject({ name: "SchedulerError", code: "queue-failed" });
    expect(pool.calls[1]!.signal!.aborted).toBe(true);
    expect(await queue.getJob(job.id)).toMatchObject({ status: "queued", nextCursor: 0, claimCount: 1 });
    expect((await queue.readResults(job.id))!.rows).toEqual([]);
    expect(pool.close).toHaveBeenCalledTimes(1);
  });

  it("closes the pool and releases the lease when renewal fails for a storage reason", async () => {
    const { queue, pool, scheduler } = fixture();
    const job = await queue.submit(charts(3));
    vi.spyOn(queue, "renew").mockRejectedValueOnce(new QueueError("storage-failure"));
    const running = run(scheduler);
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    await expect(running).rejects.toMatchObject({ name: "SchedulerError", code: "queue-failed" });
    expect(pool.calls.every((call) => call.signal!.aborted)).toBe(true);
    expect(await queue.getJob(job.id)).toMatchObject({ status: "queued", nextCursor: 0 });
    expect(pool.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports claim errors with fixed diagnostics and closes only the pool", async () => {
    const { queue, pool, scheduler } = fixture();
    vi.spyOn(queue, "claim").mockRejectedValueOnce(new Error("SYNTHETIC_STORAGE_DETAILS"));
    const close = vi.spyOn(queue, "close");
    const running = run(scheduler);
    await expect(running).rejects.toMatchObject({ name: "SchedulerError", code: "queue-failed" });
    const error = await running.catch((error: unknown) => error);
    expect((error as Error).message).not.toContain("SYNTHETIC_STORAGE_DETAILS");
    expect((error as Error).cause).toBeUndefined();
    expect(pool.calls).toEqual([]);
    expect(pool.close).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    await expect(queue.submit(charts(1))).resolves.toMatchObject({ status: "queued" });
  });

  it("discards stale work after another owner claims the expired lease and keeps serving other jobs", async () => {
    let clock = 1_700_000_000_000;
    const { queue, pool, scheduler } = fixture(2, new MemoryQueue({ now: () => clock }));
    const first = await queue.submit(charts(3, "synthetic-first"));
    const second = await queue.submit(charts(1, "synthetic-second"));
    const running = run(scheduler);
    await flush();
    pool.complete(1);
    await flush();
    clock += 1_000;
    const peer = (await queue.claim({ owner: "synthetic-peer", leaseMs: 10_000 }))!;
    expect(peer.snapshot.id).toBe(first.id);
    await vi.advanceTimersByTimeAsync(100);
    expect(pool.calls[0]!.signal!.aborted).toBe(true);
    expect(await queue.getJob(first.id)).toMatchObject({ nextCursor: 0, lease: { owner: "synthetic-peer" } });
    expect((await queue.readResults(first.id))!.rows).toEqual([]);
    await vi.advanceTimersByTimeAsync(10);
    expect(pool.calls[2]!.item).toMatchObject({ kind: "charts", person: { id: "synthetic-second-0" } });
    pool.complete(0);
    await flush();
    expect(await queue.getJob(second.id)).toMatchObject({ status: "completed", nextCursor: 1 });
    await scheduler.stop();
    await running;
    expect(await queue.getJob(first.id)).toMatchObject({ nextCursor: 0, lease: { owner: "synthetic-peer" } });
  });

  it("fences a commit paused until after a replacement lease and keeps the replacement result", async () => {
    let clock = 1_700_000_000_000;
    const { queue, pool, scheduler } = fixture(1, new MemoryQueue({ now: () => clock }));
    const job = await queue.submit(charts(2));
    const gate = deferred<void>();
    const original = queue.commit.bind(queue);
    const commit = vi.spyOn(queue, "commit").mockImplementationOnce(async (lease, rows) => {
      await gate.promise;
      return original(lease, rows);
    });
    const running = run(scheduler);
    await flush();
    pool.complete(0);
    await flush();
    expect(commit).toHaveBeenCalledTimes(1);
    clock += 1_000;
    const peer = (await queue.claim({ owner: "synthetic-peer", leaseMs: 10_000 }))!;
    const replacement = executeWorkItem(workItemAt(peer.job, 0));
    await original(peer.lease, [replacement]);
    gate.resolve();
    await flush();
    expect(await queue.getJob(job.id)).toMatchObject({ nextCursor: 1, lease: { owner: "synthetic-peer" } });
    expect((await queue.readResults(job.id))!.rows).toEqual([replacement]);
    expect(pool.indices()).toEqual([0]);
    await scheduler.stop();
    await running;
  });

  it("continues renewing while a result commit is waiting on the backend", async () => {
    const { queue, pool, scheduler } = fixture(1);
    const job = await queue.submit(charts(2));
    const gate = deferred<void>();
    const original = queue.commit.bind(queue);
    vi.spyOn(queue, "commit").mockImplementationOnce(async (lease, rows) => {
      await gate.promise;
      return original(lease, rows);
    });
    const renew = vi.spyOn(queue, "renew");
    const running = run(scheduler);
    await flush();
    pool.complete(0);
    await flush();
    await vi.advanceTimersByTimeAsync(1_200);
    expect(renew).toHaveBeenCalled();
    expect(await queue.claim({ owner: "synthetic-peer", leaseMs: 1_000 })).toBeNull();
    expect(await queue.getJob(job.id)).toMatchObject({ nextCursor: 0 });
    const stopping = scheduler.stop();
    gate.resolve();
    await stopping;
    await running;
    expect(await queue.getJob(job.id)).toMatchObject({ status: "queued", nextCursor: 1 });
  });

  it("keeps final completion when a pending renewal reports the revoked lease afterward", async () => {
    const { queue, pool, scheduler } = fixture(1);
    const job = await queue.submit(charts(1));
    const gate = deferred<void>();
    const original = queue.renew.bind(queue);
    const renew = vi.spyOn(queue, "renew").mockImplementationOnce(async (lease, leaseMs) => {
      await gate.promise;
      // The final commit revokes this lease while renewal is still in flight.
      return original(lease, leaseMs);
    });
    const release = vi.spyOn(queue, "release");
    const running = run(scheduler);
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    expect(renew).toHaveBeenCalledTimes(1);
    pool.complete(0);
    await flush();
    expect(await queue.getJob(job.id)).toMatchObject({ status: "completed", nextCursor: 1, lease: null });
    const committed = (await queue.readResults(job.id))!.rows;
    const stopping = scheduler.stop();
    expect(pool.close).not.toHaveBeenCalled();
    gate.resolve();
    await expect(stopping).resolves.toBeUndefined();
    await expect(running).resolves.toBeUndefined();
    expect(await queue.getJob(job.id)).toMatchObject({ status: "completed", nextCursor: 1, lease: null });
    expect((await queue.readResults(job.id))!.rows).toEqual(committed);
    expect(committed.map((row) => row.index)).toEqual([0]);
    expect(release).not.toHaveBeenCalled();
    expect(pool.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles synchronous executor throws and still releases the job", async () => {
    const { queue, pool, scheduler } = fixture();
    const job = await queue.submit(charts(2));
    vi.spyOn(pool, "run").mockImplementation(() => { throw new Error("SYNTHETIC_PRIVATE_FAILURE"); });
    await expect(run(scheduler)).rejects.toMatchObject({ code: "execution-failed" });
    expect(await queue.getJob(job.id)).toMatchObject({ status: "queued", nextCursor: 0 });
    expect(pool.close).toHaveBeenCalledTimes(1);
  });

  it("closes the pool even if releasing the active job fails", async () => {
    const { queue, pool, scheduler } = fixture(1);
    const job = await queue.submit(charts(2));
    vi.spyOn(queue, "release").mockRejectedValueOnce(new QueueError("storage-failure"));
    const running = run(scheduler);
    await flush();
    const stopping = scheduler.stop();
    void stopping.catch(() => {});
    pool.complete(0);
    await expect(running).rejects.toMatchObject({ code: "queue-failed" });
    await expect(stopping).rejects.toMatchObject({ code: "queue-failed" });
    expect(pool.close).toHaveBeenCalledTimes(1);
    expect(await queue.getJob(job.id)).toMatchObject({ nextCursor: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("scheduler configuration", () => {
  it("rejects invalid timing, owner and capacity settings before queue activity", async () => {
    const { queue, pool } = fixture();
    const claim = vi.spyOn(queue, "claim");
    const invalid: unknown[] = [
      null, [], { unexpected: true }, { pool, workers: 2 },
      { pool, owner: "" }, { pool, owner: "synthetic owner" },
      { pool, owner: "a".repeat(81) },
      { pool, leaseMs: 1 }, { pool, leaseMs: 100, heartbeatMs: 100 },
      { pool, leaseMs: 100, heartbeatMs: 101 },
    ];
    for (const value of [undefined, null, 0, -1, 1.5, NaN, Infinity, 2_147_483_648, "100"]) {
      invalid.push({ pool, leaseMs: value }, { pool, heartbeatMs: value }, { pool, pollMs: value });
    }
    for (const value of [0, -1, 1.5, NaN, Infinity, 65]) {
      invalid.push({ workers: value }, { pool: { capacity: value, run: pool.run.bind(pool), close: pool.close } });
    }
    for (const options of invalid) {
      expect(() => new Scheduler(queue, options as SchedulerOptions))
        .toThrow(expect.objectContaining({ name: "QueueError", code: "invalid-argument" }));
    }
    expect(claim).not.toHaveBeenCalled();
    expect(pool.close).not.toHaveBeenCalled();
    await queue.submit(charts(1));
  });
});
