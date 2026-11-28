import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { executeSerial, WorkExecutionError } from "../src/execution.js";
import { validateJob } from "../src/validation.js";
import { WorkerPool, WorkerPoolError } from "../src/worker-pool.js";
import type { WorkerPoolOptions } from "../src/worker-pool.js";
import { workItems } from "../src/work.js";
import type { WorkItem } from "../src/work.js";

const project = fileURLToPath(new URL("../", import.meta.url));
const fixture = new URL("./fixtures/pool-worker.mjs", import.meta.url);
const pools = new Set<WorkerPool>();
let scratch: string;
let realWorker: URL;

beforeAll(() => {
  mkdirSync(`${project}/.generated`, { recursive: true });
  scratch = mkdtempSync(`${project}/.generated/worker-pool-`);
  execFileSync(process.execPath, [`${project}/scripts/build.mjs`, "--outdir", scratch], { stdio: "pipe" });
  realWorker = pathToFileURL(`${scratch}/worker-entry.js`);
}, 15_000);

afterEach(async () => {
  await Promise.all([...pools].map((pool) => pool.close()));
  pools.clear();
});

afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

function pool(options: WorkerPoolOptions = {}): WorkerPool {
  const result = new WorkerPool({ workerUrl: realWorker, ...options });
  pools.add(result);
  return result;
}

function item(id = "synthetic-healthy", index = 0): WorkItem {
  return { kind: "charts", index, person: { id, birth: { utc: "2001-02-03T04:05:06Z" } } };
}

// These parity tests compare only execution transport with serial execution;
// they make no independent claim about the engine's astronomical accuracy.
describe("calculation workers", () => {
  it.each(["charts", "transit-grid", "synastry-matrix"] as const)("runs %s tasks through real workers with serial JSON parity", async (kind) => {
    const people = [
      { id: "synthetic-a", birth: { utc: "2001-02-03T04:05:06Z", latitude: 12, longitude: 34 } },
      { id: "synthetic-b", birth: { utc: "1998-07-08T09:10:11Z", timeKnown: false } },
    ];
    const job = validateJob(kind === "synastry-matrix"
      ? { version: 1, kind, people }
      : kind === "transit-grid"
        ? { version: 1, kind, births: people, start: "2005-06-07T00:00:00Z", end: "2005-06-07T00:00:00.001Z", stepMs: 1 }
        : { version: 1, kind, births: people });
    const workers = pool({ size: 2 });
    const expected = [...executeSerial(job)];
    expect(await Promise.all([...workItems(job)].map((task) => workers.run(task)))).toEqual(expected);
    // Reusing workers must not retain a prior calculation's input or result.
    expect(await workers.run([...workItems(job)][0]!)).toEqual(expected[0]);
  });

  it("reconstructs a calculation failure and keeps the worker usable", async () => {
    const workers = pool({ size: 1 });
    const invalid: WorkItem = { kind: "charts", index: 9, person: { id: "synthetic-range", birth: { utc: "0000-01-01T00:00:00Z" } } };
    const error: unknown = await workers.run(invalid).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(WorkExecutionError);
    expect(error).toMatchObject({ code: "calculation-failed", index: 9, kind: "charts" });
    expect((error as Error).message).toBe("Calculation failed at work item 9 (charts).");
    expect((error as Error).cause).toBeUndefined();
    expect(await workers.run(item())).toMatchObject({ index: 0, personId: "synthetic-healthy" });
  });

  it("uses the sibling bundled worker when no worker URL is provided", () => {
    const entry = pathToFileURL(`${scratch}/index.js`).href;
    const output = execFileSync(process.execPath, ["--input-type=module", "--eval", `
      import { WorkerPool } from ${JSON.stringify(entry)};
      const workers = new WorkerPool({ size: 1 });
      try {
        const row = await workers.run(${JSON.stringify(item())});
        process.stdout.write(JSON.stringify({ kind: row.kind, personId: row.personId }));
      } finally { await workers.close(); }
    `], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(JSON.parse(output)).toEqual({ kind: "charts", personId: "synthetic-healthy" });
  });
});

describe("bounded dispatch and lifecycle", () => {
  it("validates capacity without creating threads eagerly", () => {
    expect(pool().capacity).toBe(2);
    expect(pool({ size: 1 }).capacity).toBe(1);
    expect(pool({ size: 64 }).capacity).toBe(64);
    for (const size of [0, -1, 1.5, 65, NaN, Infinity, null, "2"]) {
      expect(() => new WorkerPool({ size: size as number })).toThrow(RangeError);
    }
  });

  it("rejects malformed configuration without evaluating option accessors", () => {
    const getter = vi.fn(() => 2);
    const accessor = Object.defineProperty({}, "size", { get: getter, enumerable: true });
    for (const options of [
      null, [], 2, { size: undefined }, { workerUrl: undefined }, { workerUrl: null },
      { workerUrl: fixture.href }, { extra: true }, accessor, Object.create({ size: 2 }),
    ]) {
      expect(() => new WorkerPool(options as WorkerPoolOptions)).toThrow(RangeError);
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects excess tasks immediately and runs occupied slots independently", async () => {
    const workers = pool({ size: 2, workerUrl: fixture });
    // Warm both threads so startup scheduling does not decide completion order.
    await Promise.all([workers.run(item()), workers.run(item())]);
    const order: number[] = [];
    const slow = workers.run(item("synthetic-slow", 0)).then((row) => { order.push(row.index); return row; });
    const fast = workers.run(item("synthetic-healthy", 1)).then((row) => { order.push(row.index); return row; });
    await expect(workers.run(item("synthetic-overflow", 2))).rejects.toMatchObject({ code: "busy" });
    const rows = await Promise.all([slow, fast]);
    expect(order).toEqual([1, 0]);
    expect(rows[0]!.value).not.toEqual(rows[1]!.value);
    expect(await workers.run(item("synthetic-healthy", 2))).toMatchObject({ index: 2 });
  });

  it.each(["throw", "exit", "malformed", "wrong-task", "wrong-routing", "bad-error", "bad-row"])("rejects %s and replaces the failed worker on the next task", async (failure) => {
    const workers = pool({ size: 1, workerUrl: fixture });
    const first = await workers.run(item());
    const error: unknown = await workers.run(item(`synthetic-${failure}`)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WorkerPoolError);
    expect(error).toMatchObject({ code: "worker-failed", message: "The calculation worker failed." });
    expect((error as Error).cause).toBeUndefined();
    const replacement = await workers.run(item());
    expect(replacement.value).not.toEqual(first.value);
  });

  it("reports a missing entry on each dispatch without an eager respawn loop", async () => {
    const workers = pool({ size: 1, workerUrl: new URL("./not-present.js", realWorker) });
    await expect(workers.run(item())).rejects.toMatchObject({ code: "worker-failed" });
    await expect(workers.run(item())).rejects.toMatchObject({ code: "worker-failed" });
    await workers.close();
  });

  it("rejects an already aborted dispatch without occupying a worker", async () => {
    const workers = pool({ size: 1, workerUrl: fixture });
    const signal = AbortSignal.abort(new Error("PRIVATE_ABORT_REASON"));
    await expect(workers.run(item(), signal)).rejects.toMatchObject({ code: "aborted", message: "The calculation was aborted." });
    expect(await workers.run(item())).toMatchObject({ personId: "synthetic-healthy" });
  });

  it("aborts and replaces only the owning worker while another task finishes", async () => {
    const workers = pool({ size: 2, workerUrl: fixture });
    const first = await workers.run(item());
    const controller = new AbortController();
    const pending = workers.run(item("synthetic-hang"), controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ code: "aborted", message: "The calculation was aborted." });
    const unaffected = workers.run(item("synthetic-slow", 1));
    controller.abort(new Error("PRIVATE_ABORT_REASON"));
    await rejected;
    const replacement = await workers.run(item());
    expect(replacement.value).not.toEqual(first.value);
    await expect(unaffected).resolves.toMatchObject({ index: 1 });
  });

  it("removes abort listeners when work settles, preserving later work", async () => {
    const workers = pool({ size: 1, workerUrl: fixture });
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const first = await workers.run(item(), controller.signal);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    const second = workers.run(item("synthetic-slow"));
    controller.abort();
    expect((await second).value).toEqual(first.value);
  });

  it("force-closes active and retiring slots and rejects all later work", async () => {
    const workers = pool({ size: 2, workerUrl: fixture });
    const controller = new AbortController();
    const cancelled = workers.run(item("synthetic-hang"), controller.signal);
    const cancelledCheck = expect(cancelled).rejects.toMatchObject({ code: "aborted" });
    controller.abort();
    const pending = workers.run(item("synthetic-hang"));
    const pendingCheck = expect(pending).rejects.toMatchObject({ code: "closed" });
    const other = workers.run(item("synthetic-hang"));
    const otherCheck = expect(other).rejects.toMatchObject({ code: "closed" });
    const closing = workers.close();
    expect(workers.close()).toBe(closing);
    await Promise.all([closing, cancelledCheck, pendingCheck, otherCheck]);
    await expect(workers.run(item())).rejects.toMatchObject({ code: "closed" });
  });
});
