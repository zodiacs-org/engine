import { Worker } from "node:worker_threads";
import { WorkExecutionError } from "./execution.js";
import type { ResultRow } from "./execution.js";
import { matchingResponse } from "./worker-protocol.js";
import type { WorkerRequest } from "./worker-protocol.js";
import type { WorkItem } from "./work.js";

export type WorkerPoolErrorCode = "busy" | "closed" | "worker-failed" | "aborted";

const MESSAGES: Record<WorkerPoolErrorCode, string> = {
  busy: "All calculation workers are occupied.",
  closed: "The calculation worker pool is closed.",
  "worker-failed": "The calculation worker failed.",
  aborted: "The calculation was aborted.",
};

/** Do not expose raw worker errors, submitted values or abort reasons. */
export class WorkerPoolError extends Error {
  override readonly name = "WorkerPoolError";

  constructor(readonly code: WorkerPoolErrorCode) { super(MESSAGES[code]); }
}

export interface WorkerPoolOptions {
  readonly size?: number;
  /** Trusted JavaScript entry implementing the pool's internal protocol. */
  readonly workerUrl?: URL;
}

function captureOptions(value: WorkerPoolOptions): WorkerPoolOptions {
  const invalid = () => new RangeError("Invalid worker pool configuration.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw invalid();
  const captured: { size?: number; workerUrl?: URL } = {};
  for (const key of Reflect.ownKeys(value)) {
    if (key !== "size" && key !== "workerUrl") throw invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !("value" in descriptor) || descriptor.value === undefined) throw invalid();
    if (key === "size") {
      if (typeof descriptor.value !== "number") throw invalid();
      captured.size = descriptor.value;
    } else {
      if (!(descriptor.value instanceof URL)) throw invalid();
      captured.workerUrl = descriptor.value;
    }
  }
  return captured;
}

interface Pending {
  readonly request: WorkerRequest;
  readonly resolve: (row: ResultRow) => void;
  readonly reject: (error: Error) => void;
  readonly cleanup: () => void;
}

interface Slot {
  worker: Worker | undefined;
  pending: Pending | undefined;
  retiring: Promise<void> | undefined;
}

/** One task per worker slot, with no additional in-process work queue. */
export class WorkerPool {
  readonly capacity: number;
  readonly #workerUrl: URL;
  readonly #slots: Slot[];
  #nextId = 0n;
  #closed = false;
  #closing: Promise<void> | undefined;

  constructor(options: WorkerPoolOptions = {}) {
    const captured = captureOptions(options);
    const size = captured.size ?? 2;
    if (!Number.isInteger(size) || size < 1 || size > 64) {
      throw new RangeError("Worker pool size must be an integer from 1 to 64.");
    }
    this.capacity = size;
    this.#workerUrl = new URL(captured.workerUrl ?? new URL("./worker-entry.js", import.meta.url));
    this.#slots = Array.from({ length: size }, () => ({ worker: undefined, pending: undefined, retiring: undefined }));
  }

  run(item: WorkItem, signal?: AbortSignal): Promise<ResultRow> {
    if (this.#closed) return Promise.reject(new WorkerPoolError("closed"));
    if (signal?.aborted) return Promise.reject(new WorkerPoolError("aborted"));
    const slot = this.#slots.find((candidate) => !candidate.pending);
    if (!slot) return Promise.reject(new WorkerPoolError("busy"));
    return new Promise<ResultRow>((resolve, reject) => {
      let request: WorkerRequest;
      try {
        request = { taskId: String(++this.#nextId), item: structuredClone(item) };
      } catch {
        reject(new WorkerPoolError("worker-failed"));
        return;
      }
      const abort = () => { this.#fail(slot, new WorkerPoolError("aborted")); };
      const pending: Pending = {
        request, resolve, reject,
        cleanup: () => { signal?.removeEventListener("abort", abort); },
      };
      slot.pending = pending;
      signal?.addEventListener("abort", abort, { once: true });
      // Retiring threads finish before a replacement starts. Reserving their
      // slot immediately still bounds all accepted tasks by capacity.
      void this.#dispatch(slot, pending);
    });
  }

  async #dispatch(slot: Slot, pending: Pending): Promise<void> {
    try {
      if (slot.retiring) await slot.retiring;
      if (this.#closed || slot.pending !== pending) return;
      if (!slot.worker) {
        const worker = new Worker(this.#workerUrl, { execArgv: [] });
        slot.worker = worker;
        worker.on("message", (message: unknown) => {
          if (slot.worker !== worker) return;
          const current = slot.pending;
          if (!current || !matchingResponse(message, current.request)) {
            this.#fail(slot, new WorkerPoolError("worker-failed"));
            return;
          }
          slot.pending = undefined;
          current.cleanup();
          worker.unref();
          if (message.ok) current.resolve(message.row);
          else current.reject(new WorkExecutionError(current.request.item.index, current.request.item.kind));
        });
        const fail = () => {
          if (slot.worker === worker) this.#fail(slot, new WorkerPoolError("worker-failed"));
        };
        worker.on("error", fail);
        worker.on("messageerror", fail);
        worker.on("exit", fail);
      }
      slot.worker.ref();
      slot.worker.postMessage(pending.request);
    } catch {
      if (slot.pending === pending) this.#fail(slot, new WorkerPoolError("worker-failed"));
    }
  }

  #fail(slot: Slot, error: WorkerPoolError): void {
    const pending = slot.pending;
    slot.pending = undefined;
    const worker = slot.worker;
    slot.worker = undefined;
    if (worker) {
      const retirement = worker.terminate().then(() => {}, () => {});
      slot.retiring = retirement;
      void retirement.then(() => { if (slot.retiring === retirement) slot.retiring = undefined; });
    }
    if (pending) {
      pending.cleanup();
      pending.reject(error);
    }
  }

  /** Force-close the pool. A scheduler must drain its work before calling. */
  close(): Promise<void> {
    if (this.#closing) return this.#closing;
    this.#closed = true;
    for (const slot of this.#slots) this.#fail(slot, new WorkerPoolError("closed"));
    this.#closing = Promise.all(this.#slots.map((slot) => slot.retiring)).then(() => {});
    return this.#closing;
  }
}
