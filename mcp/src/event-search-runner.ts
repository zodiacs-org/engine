import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import type { eventSearchTool } from "./tools/events.js";

export const EVENT_SEARCH_DEFAULT_BUDGET_MS = 10_000;
export const EVENT_SEARCH_MAX_BUDGET_MS = 30_000;

type SearchResult = ReturnType<typeof eventSearchTool>;
type SearchOutcome = { result: SearchResult } | { error: Error };
type ActiveSearch = {
  owner: EventSearchRunner;
  finished: Promise<void>;
  cancel: (message: string) => void;
};

// A shared slot bounds heavy searches even when HTTP creates a server per request.
let activeSearch: ActiveSearch | undefined;

export type EventSearchRunnerOptions = {
  budgetMs?: number;
  /** Observes lifecycle only; input and output are never passed to the observer. */
  onWorker?: (worker: Worker) => void;
};

/** Runs the complete search, including chart receipts, in a stoppable worker. */
export class EventSearchRunner {
  readonly #budgetMs: number;
  readonly #onWorker: ((worker: Worker) => void) | undefined;
  #closed = false;
  #closing: Promise<void> | undefined;

  constructor({ budgetMs = EVENT_SEARCH_DEFAULT_BUDGET_MS, onWorker }: EventSearchRunnerOptions = {}) {
    if (!Number.isInteger(budgetMs) || budgetMs < 1 || budgetMs > EVENT_SEARCH_MAX_BUDGET_MS) {
      throw new RangeError("Event search budget must be an integer from 1 to 30000 milliseconds.");
    }
    this.#budgetMs = budgetMs;
    this.#onWorker = onWorker;
  }

  async run(input: unknown, { signal }: { signal?: AbortSignal } = {}): Promise<SearchResult> {
    if (this.#closed) throw new Error("Event search runner is closed.");
    if (signal?.aborted) throw new Error("Event search canceled.");
    if (activeSearch) throw new Error("Event search is busy.");

    const deadline = performance.now() + this.#budgetMs;
    let worker: Worker | undefined;
    let outcome: SearchOutcome | undefined;
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    let resolveResult!: (result: SearchResult) => void;
    let rejectResult!: (error: Error) => void;
    const result = new Promise<SearchResult>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    const cancel = (message: string) => {
      if (outcome && "error" in outcome) return;
      outcome = { error: new Error(message) };
      // Settlement and slot release happen only in the exit handler.
      if (worker) void worker.terminate().catch(() => {});
    };
    const active: ActiveSearch = { owner: this, finished, cancel };
    activeSearch = active;
    const abort = () => cancel("Event search canceled.");
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => cancel("Event search deadline exceeded."), this.#budgetMs);

    const settle = (code: number) => {
      if (performance.now() >= deadline && (!outcome || !("error" in outcome))) {
        outcome = { error: new Error("Event search deadline exceeded.") };
      }
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (activeSearch === active) activeSearch = undefined;
      finish();
      if (outcome && "error" in outcome) rejectResult(outcome.error);
      else if (code === 0 && outcome && "result" in outcome) resolveResult(outcome.result);
      else rejectResult(new Error("Event search calculation failed."));
    };

    try {
      worker = new Worker(new URL("../build/event-search-worker.js", import.meta.url), {
        workerData: input, env: {}, execArgv: [], stdout: true, stderr: true,
        name: "event-search"
      });
      // Never forward worker diagnostics, including an unexpected engine log.
      worker.stdout?.resume();
      worker.stderr?.resume();
      worker.on("message", (message: unknown) => {
        if (outcome && "error" in outcome) return;
        if (performance.now() >= deadline) {
          cancel("Event search deadline exceeded.");
          return;
        }
        if (typeof message !== "object" || message === null || !("type" in message)) {
          cancel("Event search calculation failed.");
        } else if (message.type === "result" && "result" in message) {
          outcome = { result: message.result as SearchResult };
        } else if (message.type !== "started") {
          cancel("Event search calculation failed.");
        }
      });
      worker.once("error", () => cancel("Event search calculation failed."));
      worker.once("exit", settle);
      this.#onWorker?.(worker);
      if (outcome && "error" in outcome) void worker.terminate().catch(() => {});
    } catch {
      cancel("Event search calculation failed.");
      if (!worker) settle(1);
    }
    return result;
  }

  close(): Promise<void> {
    if (this.#closing) return this.#closing;
    this.#closed = true;
    const active = activeSearch?.owner === this ? activeSearch : undefined;
    active?.cancel("Event search canceled.");
    this.#closing = active?.finished ?? Promise.resolve();
    return this.#closing;
  }
}
