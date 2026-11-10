import { randomUUID } from "node:crypto";
import type { ResultRow } from "./execution.js";
import { queueFields, queueInteger, queueOwner } from "./queue-data.js";
import { QueueError } from "./queue.js";
import type { ClaimedJob, QueueBackend } from "./queue.js";
import { workItemAt } from "./work.js";
import type { WorkItem } from "./work.js";
import { WorkerPool } from "./worker-pool.js";

/** A trusted executor. Aborting a run must settle it and free its slot. */
export interface TaskPool {
  readonly capacity: number;
  run(item: WorkItem, signal?: AbortSignal): Promise<ResultRow>;
  close(): Promise<void>;
}

export interface SchedulerOptions {
  readonly workers?: number;
  readonly owner?: string;
  readonly leaseMs?: number;
  readonly heartbeatMs?: number;
  readonly pollMs?: number;
  /** Dedicated to this scheduler; it closes the supplied pool on exit. */
  readonly pool?: TaskPool;
}

export const SCHEDULER_DEFAULTS = Object.freeze({
  workers: 2,
  maxWorkers: 64,
  leaseMs: 30_000,
  pollMs: 100,
  maxTimerMs: 2_147_483_647,
});

export class SchedulerError extends Error {
  override readonly name = "SchedulerError";
  constructor(readonly code: "execution-failed" | "queue-failed") {
    super(code === "execution-failed"
      ? "Batch execution stopped before all work was committed."
      : "A batch queue operation failed; execution stopped.");
  }
}

/** A versioned wakeup prevents a completion between inspection and waiting. */
class Wakeup {
  version = 0;
  #waiters = new Set<() => void>();

  signal(): void {
    this.version++;
    for (const wake of this.#waiters) wake();
  }

  wait(version: number, delay?: number): Promise<void> {
    if (version !== this.version) return Promise.resolve();
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const wake = (): void => {
        clearTimeout(timer);
        this.#waiters.delete(wake);
        resolve();
      };
      this.#waiters.add(wake);
      if (delay !== undefined) timer = setTimeout(wake, delay);
    });
  }
}

interface PendingRow {
  readonly controller: AbortController;
  settled: Promise<void>;
  outcome: { row: ResultRow } | { failed: true } | null;
}

function leaseLost(error: unknown): boolean {
  return error instanceof QueueError && error.code === "lease-lost";
}

/**
 * One leased job at a time, parallel rows within it. The uncommitted window
 * never exceeds pool capacity, even if later rows finish first. Queue access
 * and checkpoints stay on this thread; calculation runs in the pool.
 */
export class Scheduler {
  readonly #queue: QueueBackend;
  readonly #pool: TaskPool;
  readonly #capacity: number;
  readonly #owner: string;
  readonly #leaseMs: number;
  readonly #heartbeatMs: number;
  readonly #pollMs: number;
  readonly #wake = new Wakeup();
  #stopping = false;
  #running: Promise<void> | undefined;

  constructor(queue: QueueBackend, options: SchedulerOptions = {}) {
    const fields = queueFields(options, ["workers", "owner", "leaseMs", "heartbeatMs", "pollMs", "pool"]);
    const workers = queueInteger("workers" in fields ? fields.workers : SCHEDULER_DEFAULTS.workers, 1, SCHEDULER_DEFAULTS.maxWorkers);
    this.#owner = queueOwner("owner" in fields ? fields.owner : `batch-${randomUUID()}`);
    this.#leaseMs = queueInteger("leaseMs" in fields ? fields.leaseMs : SCHEDULER_DEFAULTS.leaseMs, 2, SCHEDULER_DEFAULTS.maxTimerMs);
    this.#heartbeatMs = queueInteger("heartbeatMs" in fields ? fields.heartbeatMs : Math.max(1, Math.floor(this.#leaseMs / 3)), 1, this.#leaseMs - 1);
    this.#pollMs = queueInteger("pollMs" in fields ? fields.pollMs : SCHEDULER_DEFAULTS.pollMs, 1, SCHEDULER_DEFAULTS.maxTimerMs);
    if (fields.pool !== undefined) {
      const pool = fields.pool as TaskPool | null;
      if (!pool || typeof pool.run !== "function" || typeof pool.close !== "function" || "workers" in fields) {
        throw new QueueError("invalid-argument");
      }
      this.#capacity = queueInteger(pool.capacity, 1, SCHEDULER_DEFAULTS.maxWorkers);
      this.#pool = pool;
    } else {
      this.#capacity = workers;
      this.#pool = new WorkerPool({ size: workers });
    }
    this.#queue = queue;
  }

  /** Poll until stopped or failed. Repeated calls share this scheduler's run. */
  run(): Promise<void> {
    this.#running ??= this.#loop();
    return this.#running;
  }

  /** Stop dispatch, drain and checkpoint active rows, then release and close. */
  stop(): Promise<void> {
    this.#stopping = true;
    this.#wake.signal();
    return this.run();
  }

  async #loop(): Promise<void> {
    try {
      while (!this.#stopping) {
        const version = this.#wake.version;
        const claimed = await this.#queue.claim({ owner: this.#owner, leaseMs: this.#leaseMs });
        if (claimed) {
          const lost = await this.#process(claimed);
          // A backend repeatedly expiring leases must not create a hot loop.
          if (lost && !this.#stopping) await this.#wake.wait(this.#wake.version, this.#pollMs);
        } else if (!this.#stopping) {
          await this.#wake.wait(version, this.#pollMs);
        }
      }
    } catch (error) {
      if (error instanceof SchedulerError) throw error;
      throw new SchedulerError("queue-failed");
    } finally {
      this.#stopping = true;
      try { await this.#pool.close(); }
      catch { throw new SchedulerError("execution-failed"); }
    }
  }

  async #process(claimed: ClaimedJob): Promise<boolean> {
    const { job, lease } = claimed;
    const pending = new Map<number, PendingRow>();
    let cursor = claimed.snapshot.nextCursor;
    let dispatched = cursor;
    let completed = false;
    let executionFailed = false;
    let ended = false;
    let heartbeatError: { error: unknown } | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let renewing: Promise<void> = Promise.resolve();
    const scheduleRenewal = (): void => {
      timer = setTimeout(() => {
        renewing = (async () => {
          try { await this.#queue.renew(lease, this.#leaseMs); }
          catch (error) {
            if (!ended) heartbeatError = { error };
            this.#wake.signal();
          }
          if (!ended && !heartbeatError) scheduleRenewal();
        })();
      }, this.#heartbeatMs);
    };
    scheduleRenewal();
    try {
      while (cursor < job.totalTasks) {
        const version = this.#wake.version;
        if (heartbeatError) throw heartbeatError.error;
        for (const entry of pending.values()) {
          if (entry.outcome && "failed" in entry.outcome) throw new SchedulerError("execution-failed");
        }
        const next = pending.get(cursor);
        if (next?.outcome && "row" in next.outcome) {
          const snapshot = await this.#queue.commit(lease, [next.outcome.row]);
          pending.delete(cursor++);
          completed = snapshot.status === "completed";
          continue;
        }
        while (!this.#stopping && dispatched < job.totalTasks && dispatched - cursor < this.#capacity) {
          const entry: PendingRow = {
            controller: new AbortController(), settled: Promise.resolve(), outcome: null,
          };
          pending.set(dispatched, entry);
          const item = workItemAt(job, dispatched++);
          // Handle synchronous throws from an injected executor like rejected runs.
          entry.settled = Promise.resolve().then(() => this.#pool.run(item, entry.controller.signal)).then(
            (row) => { entry.outcome = { row }; this.#wake.signal(); },
            () => { entry.outcome = { failed: true }; this.#wake.signal(); },
          );
        }
        if (!pending.size && this.#stopping) break;
        await this.#wake.wait(version);
      }
      return false;
    } catch (error) {
      if (leaseLost(error)) return true;
      if (error instanceof SchedulerError && error.code === "execution-failed") {
        executionFailed = true;
        return false;
      }
      throw error;
    } finally {
      ended = true;
      clearTimeout(timer);
      await renewing;
      for (const entry of pending.values()) entry.controller.abort();
      await Promise.all([...pending.values()].map((entry) => entry.settled));
      if (!completed) {
        // A failed attempt is persisted once after sibling calculations stop.
        // Do not release again: it could erase a retry delay or an uncertain
        // failure operation's outcome on an asynchronous backend.
        try {
          if (executionFailed) await this.#queue.fail(lease);
          else await this.#queue.release(lease);
        }
        catch (error) { if (!leaseLost(error)) throw new SchedulerError("queue-failed"); }
      }
    }
  }
}
