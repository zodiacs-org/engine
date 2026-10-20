import type { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import { EventSearchRunner, EVENT_SEARCH_DEFAULT_BUDGET_MS, EVENT_SEARCH_MAX_BUDGET_MS } from "../src/event-search-runner.js";
import { eventSearchOutputSchema, eventSearchTool } from "../src/tools/events.js";

const quickInput = {
  body: "Sun", longitude: 0,
  from: "2026-01-01T00:00:00+02:00", to: "2026-01-02T00:00:00+02:00"
};
const longInput = {
  body: "Pluto", longitude: 0, from: "2024-01-01T00:00:00Z",
  to: "2025-01-01T00:00:00Z", maxSamples: 100_000
};
const runners: EventSearchRunner[] = [];
function runner(options: ConstructorParameters<typeof EventSearchRunner>[0] = {}) {
  const instance = new EventSearchRunner(options);
  runners.push(instance);
  return instance;
}
function observe() {
  let created: Worker | undefined;
  let exited = false;
  let resolveStarted!: () => void;
  const started = new Promise<void>((resolve) => { resolveStarted = resolve; });
  return {
    started,
    get worker() { return created; },
    get exited() { return exited; },
    onWorker(worker: Worker) {
      created = worker;
      worker.once("exit", () => { exited = true; });
      worker.on("message", (message: { type?: unknown }) => {
        if (message.type === "started") resolveStarted();
      });
    }
  };
}

afterEach(async () => {
  for (const instance of runners.splice(0)) await instance.close();
});

describe("stoppable event search workers", () => {
  it.each([
    quickInput,
    { body: "Mercury", longitude: 350, from: "2026-02-01T00:00:00Z", to: "2026-04-15T00:00:00Z" },
    { ...quickInput, maxSamples: 1 },
    { ...quickInput, to: quickInput.from }
  ])("preserves complete JSON, native receipts and search status for %j", async (input) => {
    const seen = observe();
    const result = await runner({ onWorker: seen.onWorker }).run(input);
    expect(result).toEqual(eventSearchTool(input));
    expect(eventSearchOutputSchema.parse(result.structuredContent)).toEqual(result.structuredContent);
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
    expect(seen.exited).toBe(true);
    expect(seen.worker?.threadId).toBe(-1);
  });

  it("cancels real computation and keeps the process slot until the worker exits", async () => {
    const seen = observe();
    const controller = new AbortController();
    const first = runner({ onWorker: seen.onWorker });
    const other = runner();
    const calculation = first.run(longInput, { signal: controller.signal });
    const canceled = expect(calculation).rejects.toThrow("Event search canceled.");
    await seen.started;
    // The worker has loaded the engine and entered the real annual calculation.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seen.exited).toBe(false);
    controller.abort(new Error("private cancellation details"));
    const busy = expect(other.run(quickInput)).rejects.toThrow("Event search is busy.");
    await canceled;
    await busy;
    expect(seen.exited).toBe(true);
    expect(seen.worker?.threadId).toBe(-1);
    expect(await other.run(quickInput)).toEqual(eventSearchTool(quickInput));
  });

  it("includes startup in its deadline and waits for actual worker termination", async () => {
    const seen = observe();
    await expect(runner({ budgetMs: 1, onWorker: seen.onWorker }).run(longInput))
      .rejects.toThrow("Event search deadline exceeded.");
    expect(seen.exited).toBe(true);
    expect(seen.worker?.threadId).toBe(-1);
    expect(await runner().run(quickInput)).toEqual(eventSearchTool(quickInput));
  });

  it("rejects concurrent searches across runner instances without creating a queue", async () => {
    const seen = observe();
    let otherCreated = 0;
    const first = runner({ onWorker: seen.onWorker });
    const other = runner({ onWorker: () => { otherCreated += 1; } });
    const calculation = first.run(longInput);
    await expect(first.run(quickInput)).rejects.toThrow("Event search is busy.");
    await expect(other.run(quickInput)).rejects.toThrow("Event search is busy.");
    expect(otherCreated).toBe(0);
    await calculation;
    expect(seen.exited).toBe(true);
    await other.run(quickInput);
    expect(otherCreated).toBe(1);
  });

  it("closes idempotently, cancels owned work and rejects new work", async () => {
    const seen = observe();
    const instance = runner({ onWorker: seen.onWorker });
    const calculation = instance.run(longInput);
    const canceled = expect(calculation).rejects.toThrow("Event search canceled.");
    await seen.started;
    const closing = instance.close();
    expect(instance.close()).toBe(closing);
    await closing;
    await canceled;
    expect(seen.exited).toBe(true);
    expect(seen.worker?.threadId).toBe(-1);
    await expect(instance.run(quickInput)).rejects.toThrow("Event search runner is closed.");
    expect(await runner().run(quickInput)).toEqual(eventSearchTool(quickInput));
  });

  it("closing another owner leaves the active calculation alone", async () => {
    const instance = runner();
    const calculation = instance.run(quickInput);
    await runner().close();
    expect(await calculation).toEqual(eventSearchTool(quickInput));
  });

  it("refuses a pre-aborted request without starting a worker", async () => {
    let created = 0;
    const instance = runner({ onWorker: () => { created += 1; } });
    const controller = new AbortController();
    controller.abort("private details");
    await expect(instance.run(longInput, { signal: controller.signal })).rejects.toThrow("Event search canceled.");
    expect(created).toBe(0);
    await instance.run(quickInput);
    expect(created).toBe(1);
  });

  it.each([0, -1, 1.5, NaN, Infinity, 30_001])("rejects an invalid operator budget %s", (budgetMs) => {
    expect(() => runner({ budgetMs })).toThrow(RangeError);
  });

  it("enforces the documented default and maximum budget policy", () => {
    expect(EVENT_SEARCH_DEFAULT_BUDGET_MS).toBe(10_000);
    expect(EVENT_SEARCH_MAX_BUDGET_MS).toBe(30_000);
    expect(() => runner({ budgetMs: 1 })).not.toThrow();
    expect(() => runner({ budgetMs: 30_000 })).not.toThrow();
  });

  it.each([
    { ...quickInput, from: "0000-01-01T00:00:00Z", to: "0000-01-01T00:00:00Z" },
    { ...quickInput, body: "private invalid body" },
    { ...quickInput, unexpected: "private details" }
  ])("sanitizes calculation errors and recovers for %j", async (input) => {
    const seen = observe();
    const instance = runner({ onWorker: seen.onWorker });
    await expect(instance.run(input)).rejects.toThrow(/^Event search calculation failed\.$/);
    expect(seen.exited).toBe(true);
    expect(await instance.run(quickInput)).toEqual(eventSearchTool(quickInput));
  });
});
