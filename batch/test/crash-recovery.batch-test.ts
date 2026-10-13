import { execFileSync, fork } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { executeSerial } from "../src/execution.js";
import type { ResultRow } from "../src/execution.js";
import type { JobSpec, Person } from "../src/model.js";
import type { JobLease, JobSnapshot } from "../src/queue.js";
import { SqliteQueue } from "../src/sqlite-queue.js";
import { validateJob } from "../src/validation.js";

const project = fileURLToPath(new URL("../", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/recovery-child.mjs", import.meta.url));
const epoch = 1_700_000_000_000;
const owner = { owner: "synthetic-recovery", leaseMs: 100 };

// Invented inputs only. Serial parity establishes storage/execution behavior,
// not an independent astronomical accuracy claim.
const people: readonly Person[] = Array.from({ length: 6 }, (_, index) => ({
  id: `synthetic-recovery-${index}`,
  birth: { utc: `200${index}-02-03T04:05:06Z`, latitude: index * 5, longitude: -index * 7 },
}));
const specs: readonly JobSpec[] = [
  { version: 1, kind: "charts", births: people },
  {
    version: 1, kind: "transit-grid", births: people.slice(0, 2),
    start: "2010-01-02T00:00:00Z", end: "2010-01-05T00:00:00Z", stepMs: 86_400_000,
  },
  { version: 1, kind: "synastry-matrix", people: people.slice(0, 3) },
];
const workloads = specs.map((spec) => ({ spec, rows: [...executeSerial(validateJob(spec))] }));
const charts = workloads[0]!;

interface ChildEvent {
  event: string;
  point?: string;
  inTransaction?: boolean;
  snapshot?: JobSnapshot;
  lease?: JobLease;
  index?: number;
  dispatched?: number[];
  claims?: number[];
}

/** The parent only kills after a synchronous boundary report, never a sleep. */
class RecoveryChild {
  readonly process = fork(fixture, [], {
    execPath: process.execPath, execArgv: [], cwd: project,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  #messages: ChildEvent[] = [];
  #wake = new Set<() => void>();
  #closed = false;
  #stderr = "";
  #error: unknown;

  constructor(config: Record<string, unknown>) {
    const lines = createInterface({ input: this.process.stdout! });
    lines.on("line", (line) => {
      try { this.#messages.push(JSON.parse(line) as ChildEvent); }
      catch (error) { this.#error = error; }
      this.#notify();
    });
    this.process.stderr!.on("data", (chunk: Buffer) => {
      this.#stderr = (this.#stderr + chunk.toString()).slice(-16_384);
    });
    this.process.on("error", (error) => { this.#error = error; this.#notify(); });
    this.exited = new Promise((resolve) => {
      this.process.once("close", (code, signal) => {
        this.#closed = true;
        lines.close();
        resolve({ code, signal });
        this.#notify();
      });
    });
    this.process.send(config, (error) => {
      if (error) { this.#error = error; this.#notify(); }
    });
  }

  #notify(): void { for (const wake of this.#wake) wake(); }

  async event(name: string): Promise<ChildEvent> {
    return new Promise((resolve, reject) => {
      const finish = (): void => { clearTimeout(timer); this.#wake.delete(check); };
      const check = (): void => {
        const message = this.#messages.find((value) => value.event === name);
        if (this.#error) { finish(); reject(this.#error); }
        else if (message) { finish(); resolve(message); }
        else if (this.#closed) {
          finish(); reject(new Error(`Recovery child closed before ${name}: ${this.#stderr}`));
        }
      };
      const timer = setTimeout(() => {
        finish(); reject(new Error(`Recovery child timed out waiting for ${name}: ${this.#stderr}`));
      }, 10_000);
      this.#wake.add(check);
      check();
    });
  }

  async kill(): Promise<void> {
    expect(this.process.kill("SIGKILL")).toBe(true);
    expect(await this.exited).toEqual({ code: null, signal: "SIGKILL" });
  }

  async cleanup(): Promise<void> {
    if (!this.#closed) this.process.kill("SIGKILL");
    await this.exited;
  }
}

let suite: string;
let entryUrl: string;
let scratch: string;
let filename: string;
let clock: number;
let children: RecoveryChild[];
let handles: SqliteQueue[];

beforeAll(() => {
  mkdirSync(join(project, ".generated"), { recursive: true });
  suite = mkdtempSync(join(project, ".generated", "crash-recovery-"));
  const outdir = join(suite, "bundle");
  execFileSync(process.execPath, [join(project, "scripts/build.mjs"), "--outdir", outdir], { stdio: "pipe" });
  entryUrl = pathToFileURL(join(outdir, "index.js")).href;
}, 15_000);

beforeEach(() => {
  scratch = mkdtempSync(join(suite, "case-"));
  filename = join(scratch, "queue.sqlite");
  clock = epoch;
  children = [];
  handles = [];
});

afterEach(async () => {
  // Reap child processes before deleting live WAL files, including on failure.
  await Promise.all(children.map((child) => child.cleanup()));
  for (const queue of handles) await queue.close();
  rmSync(scratch, { recursive: true, force: true });
});

afterAll(() => { if (suite) rmSync(suite, { recursive: true, force: true }); });

function child(config: Record<string, unknown>): RecoveryChild {
  const instance = new RecoveryChild({ entryUrl, filename, now: clock, ...config });
  children.push(instance);
  return instance;
}

function open(): SqliteQueue {
  const queue = new SqliteQueue(filename, { now: () => clock });
  handles.push(queue);
  return queue;
}

async function killAtBoundary(instance: RecoveryChild, point: string): Promise<ChildEvent> {
  const boundary = await instance.event("boundary");
  expect(boundary.point).toBe(point);
  // The writer still has its connection open; these are not close/reopen tests.
  expect(statSync(`${filename}-wal`).size).toBeGreaterThan(0);
  await instance.kill();
  return boundary;
}

function storedRows(id: string, expected: readonly ResultRow[]): void {
  const db = new DatabaseSync(filename);
  try {
    expect(db.prepare("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    const rows = db.prepare("SELECT cursor, row_json FROM batch_results WHERE job_id = ? ORDER BY cursor").all(id);
    expect(rows.map((row) => row.cursor)).toEqual(expected.map((row) => row.index));
    expect(rows.map((row) => row.row_json)).toEqual(expected.map((row) => JSON.stringify(row)));
    expect(db.prepare("SELECT completed_tasks FROM batch_jobs WHERE id = ?").get(id)?.completed_tasks).toBe(expected.length);
  } finally { db.close(); }
}

async function assertPages(queue: SqliteQueue, id: string, expected: readonly ResultRow[]): Promise<void> {
  const rows: ResultRow[] = [];
  let cursor = 0;
  while (cursor < expected.length) {
    const page = (await queue.readResults(id, { cursor, limit: 2 }))!;
    expect(page.nextCursor).toBe(cursor + page.rows.length);
    expect(page.nextCursor).toBeGreaterThan(cursor);
    rows.push(...page.rows);
    cursor = page.nextCursor;
  }
  expect(rows).toEqual(expected);
  expect((await queue.readResults(id, { cursor }))!.rows).toEqual([]);
  storedRows(id, expected);
}

async function resume(id: string, cursor: number, rows: readonly ResultRow[]): Promise<JobSnapshot> {
  const restarted = child({ mode: "resume", jobId: id });
  const result = await restarted.event("resumed");
  expect(await restarted.exited).toEqual({ code: 0, signal: null });
  expect(result.dispatched).toEqual(rows.slice(cursor).map((row) => row.index));
  expect(result.claims).toEqual(cursor === rows.length ? [] : [cursor]);
  expect(result.snapshot).toMatchObject({
    id, status: "completed", completedTasks: rows.length, nextCursor: rows.length, lease: null,
  });
  await assertPages(open(), id, rows);
  return result.snapshot!;
}

const commitCases = workloads.flatMap(({ spec, rows }) => [false, true].flatMap((finalBatch) =>
  ["after-row", "after-checkpoint", "after-commit"].map((point) => ({
    kind: spec.kind, spec, rows, finalBatch, point, prefix: finalBatch ? rows.length - 2 : 1,
  }))));

describe("SQLite process-crash recovery", () => {
  it.each(commitCases)("recovers $kind at $point (final batch: $finalBatch)", async ({ spec, rows, point, prefix }) => {
    const crashed = child({ mode: "commit", spec, prefix, point });
    const prepared = await crashed.event("prepared");
    const id = prepared.snapshot!.id;
    const lease = prepared.lease!;
    const boundary = await killAtBoundary(crashed, point);
    expect(boundary.inTransaction).toBe(point !== "after-commit");

    const cursor = point === "after-commit" ? prefix + 2 : prefix;
    const completed = cursor === rows.length;
    storedRows(id, rows.slice(0, cursor));
    const queue = open();
    const before = (await queue.getJob(id))!;
    expect(before).toMatchObject({
      status: completed ? "completed" : "running", nextCursor: cursor,
      claimCount: 1, failureCount: 0, lastFailure: null,
    });
    clock = lease.expiresAt - 1;
    expect(await queue.claim(owner)).toBeNull();
    expect(await queue.getJob(id)).toEqual(before);
    clock = lease.expiresAt;
    const result = await resume(id, cursor, rows);
    expect(result.claimCount).toBe(completed ? 1 : 2);
    expect(result.failureCount).toBe(completed ? 0 : 1);
    expect(result.lastFailure).toEqual(completed ? null : { code: "lease-expired", at: clock, cursor });
    if (completed) expect(result).toEqual(before);
  }, 15_000);

  it("retains a keyed submission when its durable commit acknowledgement is lost", async () => {
    const options = { idempotencyKey: "synthetic-crash-submit", retry: { maxAttempts: 4, delayMs: 0 } };
    const crashed = child({ mode: "submit", spec: charts.spec, submitOptions: options, point: "after-commit" });
    expect((await killAtBoundary(crashed, "after-commit")).inTransaction).toBe(false);
    const db = new DatabaseSync(filename);
    let id: string;
    try {
      const jobs = db.prepare("SELECT id FROM batch_jobs").all();
      expect(jobs).toHaveLength(1);
      id = jobs[0]!.id as string;
    } finally { db.close(); }
    const queue = open();
    const original = (await queue.getJob(id))!;
    expect(original).toMatchObject({ status: "queued", nextCursor: 0, claimCount: 0, failureCount: 0 });
    expect(await queue.submit(charts.spec, options)).toEqual(original);
    await expect(queue.submit(charts.spec, { ...options, retry: { maxAttempts: 3 } }))
      .rejects.toMatchObject({ code: "idempotency-conflict" });
    await resume(id, 0, charts.rows);
    expect(await queue.claim(owner)).toBeNull();
    expect(await queue.submit(charts.spec, options)).toEqual(await queue.getJob(id));
  });

  it.each(["before-commit", "after-commit"])("recovers an initial claim killed %s", async (point) => {
    const queue = open();
    const submitted = await queue.submit(charts.spec);
    const crashed = child({ mode: "claim", point });
    expect((await killAtBoundary(crashed, point)).inTransaction).toBe(point === "before-commit");
    expect(await queue.getJob(submitted.id)).toMatchObject({
      status: point === "before-commit" ? "queued" : "running",
      claimCount: point === "before-commit" ? 0 : 1, failureCount: 0, nextCursor: 0,
    });
    if (point === "after-commit") {
      expect(await queue.claim(owner)).toBeNull();
      clock += owner.leaseMs;
    }
    const result = await resume(submitted.id, 0, charts.rows);
    expect(result.claimCount).toBe(point === "before-commit" ? 1 : 2);
    expect(result.failureCount).toBe(point === "before-commit" ? 0 : 1);
  });

  it("rolls back expiry accounting and the replacement claim together when killed before commit", async () => {
    const queue = open();
    const submitted = await queue.submit(charts.spec);
    const original = (await queue.claim(owner))!;
    await queue.commit(original.lease, charts.rows.slice(0, 1));
    const before = await queue.getJob(submitted.id);
    clock = original.lease.expiresAt;
    const crashed = child({ mode: "claim", point: "before-commit" });
    expect((await killAtBoundary(crashed, "before-commit")).inTransaction).toBe(true);
    expect(await queue.getJob(submitted.id)).toEqual(before);
    const replacement = (await queue.claim(owner))!;
    expect(replacement.snapshot).toMatchObject({ nextCursor: 1, claimCount: 2, failureCount: 1 });
    expect(replacement.lease.token).not.toBe(original.lease.token);
    for (const mutate of [
      () => queue.commit(original.lease, charts.rows.slice(1, 2)),
      () => queue.renew(original.lease, 100),
      () => queue.release(original.lease),
      () => queue.fail(original.lease),
    ]) await expect(mutate()).rejects.toMatchObject({ code: "lease-lost" });
    expect(await queue.getJob(submitted.id)).toEqual(replacement.snapshot);
    expect(await queue.claim(owner)).toBeNull();
    await queue.release(replacement.lease);
    const result = await resume(submitted.id, 1, charts.rows);
    expect(result).toMatchObject({ claimCount: 3, failureCount: 1 });
  });

  it("honors retry delay after a kill and stops reclaiming at the attempt budget", async () => {
    const crashed = child({
      mode: "commit", spec: charts.spec, prefix: 1, point: "after-row",
      submitOptions: { retry: { maxAttempts: 2, delayMs: 25 } },
    });
    const prepared = await crashed.event("prepared");
    const id = prepared.snapshot!.id;
    await killAtBoundary(crashed, "after-row");
    const queue = open();
    clock = prepared.lease!.expiresAt;
    expect(await queue.claim(owner)).toBeNull();
    const waiting = (await queue.getJob(id))!;
    expect(waiting).toMatchObject({ status: "queued", nextCursor: 1, failureCount: 1, retryAt: clock + 25 });
    clock = waiting.retryAt! - 1;
    expect(await queue.claim(owner)).toBeNull();
    expect(await queue.getJob(id)).toEqual(waiting);
    clock++;
    const second = child({ mode: "claim", point: "after-commit" });
    await killAtBoundary(second, "after-commit");
    const running = (await queue.getJob(id))!;
    expect(running).toMatchObject({ status: "running", nextCursor: 1, failureCount: 1, claimCount: 2 });
    clock = running.lease!.expiresAt;
    expect(await queue.claim(owner)).toBeNull();
    const failed = (await queue.getJob(id))!;
    expect(failed).toMatchObject({
      status: "failed", failureCount: 2, claimCount: 2, nextCursor: 1,
      lease: null, retryAt: null, finishedAt: clock,
      lastFailure: { code: "lease-expired", at: clock, cursor: 1 },
    });
    clock += 1_000;
    expect(await open().claim(owner)).toBeNull();
    expect(await queue.getJob(id)).toEqual(failed);
    await assertPages(queue, id, charts.rows.slice(0, 1));
  });

  it("discards uncommitted out-of-order worker results and restarts at the stored cursor", async () => {
    const crashed = child({ mode: "scheduler", spec: charts.spec });
    expect(await crashed.event("buffered")).toMatchObject({ index: 2 });
    const boundary = await killAtBoundary(crashed, "buffered-results");
    expect(boundary.dispatched).toEqual([0, 1, 2]);
    expect(boundary.inTransaction).toBe(false);
    const before = boundary.snapshot!;
    expect(before).toMatchObject({ status: "running", nextCursor: 1, failureCount: 0, claimCount: 1 });
    storedRows(before.id, charts.rows.slice(0, 1));
    clock = before.lease!.expiresAt;
    const result = await resume(before.id, 1, charts.rows);
    expect(result).toMatchObject({ failureCount: 1, claimCount: 2 });
  });
});
