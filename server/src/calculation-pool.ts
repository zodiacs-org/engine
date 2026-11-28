import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import type { CalculationRunner, CalculationTask } from "./calculations.js";
import { DEFAULT_RESOURCE_LIMITS, RESOURCE_RANGES } from "./resource-limits.js";

export const CALCULATION_LIMITS = Object.freeze({
  timeoutMs: DEFAULT_RESOURCE_LIMITS.calculationTimeoutMs,
  maxQueue: DEFAULT_RESOURCE_LIMITS.calculationQueueSize
});

export type CalculationErrorCode =
  | "invalid_request" | "receipt_unavailable" | "internal_error"
  | "server_busy" | "calculation_timeout" | "calculation_failed" | "not_ready";

const messages: Record<CalculationErrorCode, string> = {
  invalid_request: "Request is invalid.",
  receipt_unavailable: "The engine could not produce a receipt for this calculation.",
  internal_error: "Internal server error.",
  server_busy: "Calculation capacity is full.",
  calculation_timeout: "Calculation deadline exceeded.",
  calculation_failed: "Calculation worker failed.",
  not_ready: "Server is not ready."
};

/** Only these fixed codes and messages may cross the worker boundary. */
export class CalculationError extends Error {
  constructor(readonly code: CalculationErrorCode) {
    super(messages[code]);
    this.name = "CalculationError";
  }
}

export interface CalculationPoolOptions {
  timeoutMs?: number;
  maxQueue?: number;
  workerUrl?: URL;
}

interface Job {
  id: number;
  task: CalculationTask;
  input: unknown;
  requestId: string;
  deadline: number;
  timer: NodeJS.Timeout;
  resolve: (value: unknown) => void;
  reject: (error: CalculationError) => void;
}

interface Generation {
  worker: Worker;
  initialized: boolean;
  stopped: boolean;
  timer: NodeJS.Timeout;
  resolve: () => void;
  reject: (error: CalculationError) => void;
}

/** One isolated engine, one running calculation and a bounded waiting queue. */
export class CalculationPool implements CalculationRunner {
  readonly #timeoutMs: number;
  readonly #maxQueue: number;
  readonly #workerUrl: URL;
  #generation: Generation | undefined;
  #starting: Promise<void> | undefined;
  #retiring: Promise<void> = Promise.resolve();
  #recovering = false;
  #replacementAvailable = true;
  #ready = false;
  #closing = false;
  #closePromise: Promise<void> | undefined;
  #resolveClose: (() => void) | undefined;
  #active: Job | undefined;
  #queue: Job[] = [];
  #nextId = 0;

  constructor(options: CalculationPoolOptions = {}) {
    this.#timeoutMs = options.timeoutMs ?? CALCULATION_LIMITS.timeoutMs;
    this.#maxQueue = options.maxQueue ?? CALCULATION_LIMITS.maxQueue;
    const [minimumTimeout, maximumTimeout] = RESOURCE_RANGES.calculationTimeoutMs;
    const [minimumQueue, maximumQueue] = RESOURCE_RANGES.calculationQueueSize;
    if (!Number.isInteger(this.#timeoutMs) || this.#timeoutMs < minimumTimeout || this.#timeoutMs > maximumTimeout
      || !Number.isInteger(this.#maxQueue) || this.#maxQueue < minimumQueue || this.#maxQueue > maximumQueue) {
      throw new RangeError("Invalid calculation pool limits.");
    }
    this.#workerUrl = options.workerUrl ?? new URL("../build/calculation-worker.js", import.meta.url);
  }

  get ready(): boolean { return this.#ready; }

  start(): Promise<void> {
    return this.#start(true);
  }

  #start(explicit: boolean): Promise<void> {
    if (this.#closing || this.#recovering) return Promise.reject(new CalculationError("not_ready"));
    if (this.#ready) return Promise.resolve();
    if (this.#starting !== undefined) return this.#starting;
    if (explicit) this.#replacementAvailable = true;
    const starting = this.#retiring.then(() => {
      if (this.#closing) throw new CalculationError("not_ready");
      return this.#spawn();
    });
    this.#starting = starting;
    // Both branches handle the original promise; callers still receive its
    // sanitized rejection. A failed startup never starts an automatic loop.
    void starting.then(
      () => { if (this.#starting === starting) this.#starting = undefined; },
      () => { if (this.#starting === starting) this.#starting = undefined; }
    );
    return starting;
  }

  run(task: CalculationTask, input: unknown, requestId: string): Promise<unknown> {
    if (!this.#ready || this.#closing) return Promise.reject(new CalculationError("not_ready"));
    if (this.#active !== undefined && this.#queue.length >= this.#maxQueue) {
      return Promise.reject(new CalculationError("server_busy"));
    }
    const deadline = performance.now() + this.#timeoutMs;
    return new Promise((resolve, reject) => {
      const job: Job = {
        id: ++this.#nextId, task, input, requestId, deadline, resolve, reject,
        timer: setTimeout(() => this.#expired(job), this.#timeoutMs)
      };
      this.#queue.push(job);
      this.#dispatch();
    });
  }

  close(): Promise<void> {
    if (this.#closePromise !== undefined) return this.#closePromise;
    this.#closing = true;
    this.#ready = false;
    this.#closePromise = new Promise((resolve) => { this.#resolveClose = resolve; });
    this.#rejectQueue("not_ready");
    if (this.#active === undefined) this.#finishClose();
    return this.#closePromise;
  }

  #spawn(): Promise<void> {
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(this.#workerUrl, {
          // Keys, local configuration paths and inherited preloads do not
          // belong in the calculation thread. Its output is never forwarded.
          env: {}, execArgv: [], stdout: true, stderr: true
        });
      } catch {
        reject(new CalculationError("calculation_failed"));
        return;
      }
      worker.stdout.resume();
      worker.stderr.resume();
      const generation: Generation = {
        worker, initialized: false, stopped: false, resolve, reject,
        // A short execution deadline must still allow the engine to start.
        timer: setTimeout(() => this.#failed(generation), 5000)
      };
      this.#generation = generation;
      worker.on("message", (message: unknown) => this.#message(generation, message));
      worker.on("error", () => this.#failed(generation));
      worker.on("exit", () => this.#failed(generation));
      worker.on("messageerror", () => this.#failed(generation));
    });
  }

  #message(generation: Generation, message: unknown): void {
    if (generation.stopped || this.#generation !== generation) return;
    if (message === null || typeof message !== "object") return this.#failed(generation);
    const response = message as Record<string, unknown>;
    if (!generation.initialized) {
      if (response.type !== "ready") return this.#failed(generation);
      generation.initialized = true;
      clearTimeout(generation.timer);
      this.#ready = !this.#closing;
      generation.resolve();
      return;
    }
    const job = this.#active;
    if (job === undefined || response.id !== job.id
      || (response.type !== "result" && response.type !== "error")) return this.#failed(generation);
    // Timers and worker messages can be delivered in either order after the
    // parent was busy. Late results never evade the admission-time deadline.
    if (performance.now() >= job.deadline) return this.#expired(job);
    this.#active = undefined;
    clearTimeout(job.timer);
    if (response.type === "result") {
      this.#replacementAvailable = true;
      job.resolve(response.result);
    }
    else {
      const kind = response.kind;
      job.reject(new CalculationError(kind === "invalid_request" || kind === "receipt_unavailable"
        ? kind : "internal_error"));
    }
    if (this.#closing) this.#finishClose();
    else this.#dispatch();
  }

  #dispatch(): void {
    if (this.#active !== undefined || !this.#ready || this.#closing) return;
    const job = this.#queue.shift();
    if (job === undefined) return;
    this.#active = job;
    if (performance.now() >= job.deadline) return this.#expired(job);
    try {
      this.#generation!.worker.postMessage({
        type: "calculate", id: job.id, task: job.task, input: job.input, requestId: job.requestId
      });
    } catch {
      // A structured-clone failure is local to this request; discard its raw
      // exception and keep the functioning worker available for other work.
      this.#active = undefined;
      clearTimeout(job.timer);
      job.reject(new CalculationError("internal_error"));
      this.#dispatch();
    }
  }

  #expired(job: Job): void {
    const remaining = job.deadline - performance.now();
    if (remaining > 0) {
      job.timer = setTimeout(() => this.#expired(job), Math.ceil(remaining));
      return;
    }
    if (this.#active === job) {
      const generation = this.#generation;
      if (generation !== undefined) this.#failed(generation, "calculation_timeout");
      return;
    }
    const index = this.#queue.indexOf(job);
    if (index < 0) return;
    this.#queue.splice(index, 1);
    clearTimeout(job.timer);
    job.reject(new CalculationError("calculation_timeout"));
  }

  #failed(generation: Generation, code: "calculation_timeout" | "calculation_failed" = "calculation_failed"): void {
    if (generation.stopped || this.#generation !== generation) return;
    this.#ready = false;
    if (!generation.initialized) generation.reject(new CalculationError("calculation_failed"));
    const active = this.#active;
    this.#active = undefined;
    if (active !== undefined) {
      clearTimeout(active.timer);
      active.reject(new CalculationError(code));
    }
    this.#rejectQueue("not_ready");
    this.#stop(generation);
    if (this.#closing) return this.#finishClose();
    if (!generation.initialized || !this.#replacementAvailable) return;
    this.#replacementAvailable = false;
    this.#recovering = true;
    void this.#retiring.then(() => {
      this.#recovering = false;
      if (this.#closing) this.#finishClose();
      else void this.#start(false).catch(() => { /* Unready until an explicit restart. */ });
    });
  }

  #rejectQueue(code: CalculationErrorCode): void {
    for (const job of this.#queue.splice(0)) {
      clearTimeout(job.timer);
      job.reject(new CalculationError(code));
    }
  }

  #stop(generation: Generation): void {
    if (generation.stopped) return;
    generation.stopped = true;
    clearTimeout(generation.timer);
    if (!generation.initialized) generation.reject(new CalculationError("not_ready"));
    if (this.#generation === generation) this.#generation = undefined;
    const termination = generation.worker.terminate().then(() => {}, () => {});
    this.#retiring = Promise.all([this.#retiring, termination]).then(() => {});
  }

  #finishClose(): void {
    if (this.#active !== undefined) return;
    if (this.#generation !== undefined) this.#stop(this.#generation);
    void this.#retiring.then(() => this.#resolveClose?.());
  }
}
