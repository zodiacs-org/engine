import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeSerial } from "../src/execution.js";
import type { JobSpec, Person } from "../src/model.js";
import { QueueError, RETRY_DEFAULTS } from "../src/queue.js";
import { SqliteQueue } from "../src/sqlite-queue.js";
import { validateJob } from "../src/validation.js";
import { queueContract } from "./queue-contract.js";

const generated = fileURLToPath(new URL("../.generated/sqlite-tests/", import.meta.url));
const owner = { owner: "synthetic-worker", leaseMs: 100 };

async function directory(): Promise<string> {
  await mkdir(generated, { recursive: true });
  return mkdtemp(join(generated, "queue-"));
}

queueContract("SQLite independent connections", async (now) => {
  const dir = await directory();
  const filename = join(dir, "queue.sqlite");
  let queue: SqliteQueue | undefined;
  let peer: SqliteQueue | undefined;
  async function cleanup(): Promise<void> {
    try {
      await queue?.close();
      await peer?.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  try {
    queue = new SqliteQueue(filename, { now });
    peer = new SqliteQueue(filename, { now });
    return { queue, peer, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
});

// Invented people and instants. Calculated rows check storage, not accuracy.
const people: readonly Person[] = [
  { id: "synthetic-a", birth: { utc: "2001-02-03T04:05:06Z", timeKnown: false } },
  { id: "synthetic-b", birth: { utc: "1998-07-08T09:10:11Z", latitude: 12, longitude: 34 } },
  { id: "synthetic-c", birth: { utc: "1904-05-06T07:08:09Z", latitude: -23, longitude: 45 } },
];
const charts: JobSpec = { version: 1, kind: "charts", births: people };
const workloads: readonly JobSpec[] = [
  charts,
  {
    version: 1, kind: "transit-grid", births: people.slice(0, 1),
    start: "2007-08-09T10:11:12Z", end: "2007-08-09T10:11:12.003Z", stepMs: 1,
  },
  { version: 1, kind: "synastry-matrix", people: people.slice(0, 2) },
];
const rows = [...executeSerial(validateJob(charts))];

// Original M4 schema, kept independent of the current migration definitions.
// Rows in these tests are invented and assert persistence, not accuracy.
function createVersionOne(db: DatabaseSync): void {
  db.exec(`PRAGMA application_id = 1514291540;
    PRAGMA user_version = 1;
    CREATE TABLE batch_jobs (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      spec_json TEXT NOT NULL CHECK (json_valid(spec_json)),
      kind TEXT NOT NULL CHECK (kind IN ('charts', 'transit-grid', 'synastry-matrix')),
      total_tasks INTEGER NOT NULL CHECK (total_tasks > 0),
      completed_tasks INTEGER NOT NULL DEFAULT 0 CHECK (completed_tasks BETWEEN 0 AND total_tasks),
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed')),
      claim_count INTEGER NOT NULL DEFAULT 0 CHECK (claim_count >= 0),
      created_at INTEGER NOT NULL CHECK (created_at >= 0),
      updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
      finished_at INTEGER,
      lease_token TEXT,
      lease_owner TEXT,
      lease_expires_at INTEGER,
      CHECK (
        (status = 'running' AND lease_token IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
        OR (status != 'running' AND lease_token IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
      ),
      CHECK (
        (status = 'completed' AND completed_tasks = total_tasks AND finished_at IS NOT NULL)
        OR (status != 'completed' AND completed_tasks < total_tasks AND finished_at IS NULL)
      )
    ) STRICT;
    CREATE INDEX batch_jobs_eligible ON batch_jobs(sequence) WHERE status != 'completed';
    CREATE TABLE batch_results (
      job_id TEXT NOT NULL REFERENCES batch_jobs(id),
      cursor INTEGER NOT NULL CHECK (cursor >= 0),
      row_json TEXT NOT NULL CHECK (json_valid(row_json)),
      PRIMARY KEY (job_id, cursor)
    ) STRICT, WITHOUT ROWID;`);
}

describe("SQLite persistence and transaction boundaries", () => {
  let dir: string;
  let filename: string;
  let clock: number;
  let handles: SqliteQueue[];
  let rawHandles: DatabaseSync[];

  beforeEach(async () => {
    dir = await directory();
    filename = join(dir, "queue.sqlite");
    clock = 1_700_000_000_000;
    handles = [];
    rawHandles = [];
  });

  afterEach(async () => {
    for (const raw of rawHandles) if (raw.isOpen) raw.close();
    for (const queue of handles) await queue.close();
    await rm(dir, { recursive: true, force: true });
  });

  function open(options: ConstructorParameters<typeof SqliteQueue>[1] = {}): SqliteQueue {
    const queue = new SqliteQueue(filename, { now: () => clock, ...options });
    handles.push(queue);
    return queue;
  }

  function raw(): DatabaseSync {
    const db = new DatabaseSync(filename);
    rawHandles.push(db);
    return db;
  }

  async function withSqliteVersion(version: unknown, action: () => Promise<void>): Promise<void> {
    const original = Object.getOwnPropertyDescriptor(process.versions, "sqlite")!;
    Object.defineProperty(process.versions, "sqlite", { ...original, value: version });
    try { await action(); } finally { Object.defineProperty(process.versions, "sqlite", original); }
  }

  it.each(["3.51.2", "3.51.1", "3.50.7", "3.44.0"])("refuses SQLite %s before creating a database file", async (version) => {
    await withSqliteVersion(version, async () => {
      expect(() => open()).toThrow(expect.objectContaining({ name: "QueueError", code: "unsupported-runtime" }));
      expect(await readdir(dir)).toEqual([]);
    });
  });

  it.each(["3.51.3", "3.51.4", "3.52.0", "3.100.0", "4.0.0"])("accepts the runtime version boundary or later numeric SQLite version %s", async (version) => {
    // These substitutions exercise version comparison, not other SQLite builds.
    await withSqliteVersion(version, async () => {
      const queue = open();
      const submitted = await queue.submit(charts);
      expect(await open().getJob(submitted.id)).toEqual(submitted);
    });
  });

  it.each(["3.51", "3.51.3-extra", "", undefined, null, 35103])("refuses malformed or missing SQLite version %s before creating files", async (version) => {
    await withSqliteVersion(version, async () => {
      expect(() => open()).toThrow(expect.objectContaining({ name: "QueueError", code: "unsupported-runtime" }));
      expect(await readdir(dir)).toEqual([]);
    });
  });

  it.each(workloads)("retains the canonical $kind definition and queued order after reopening", async (spec) => {
    const queue = open();
    const submitted = await queue.submit(spec);
    const later = await queue.submit(charts);
    await queue.close();
    const reopened = open();
    expect(await reopened.getJob(submitted.id)).toEqual(submitted);
    const claim = (await reopened.claim(owner))!;
    expect(claim.job).toEqual(validateJob(spec));
    expect(claim.snapshot).toMatchObject({ id: submitted.id, nextCursor: 0, claimCount: 1 });
    expect((await reopened.claim(owner))!.snapshot.id).toBe(later.id);
  });

  it("retains live lease authority and renewal across closed connections", async () => {
    const queue = open();
    const submitted = await queue.submit(charts);
    const claim = (await queue.claim(owner))!;
    await queue.close();
    const reopened = open();
    expect(await reopened.getJob(submitted.id)).toEqual(claim.snapshot);
    expect(await reopened.claim(owner)).toBeNull();
    clock += 50;
    const renewal = await reopened.renew(claim.lease, 200);
    expect(renewal).toEqual({ ...claim.lease, expiresAt: clock + 200 });
    await reopened.close();
    const again = open();
    clock = claim.lease.expiresAt;
    expect(await again.claim(owner)).toBeNull();
    expect(await again.commit(claim.lease, rows.slice(0, 1))).toMatchObject({ nextCursor: 1 });
    expect((await again.getJob(submitted.id))!.lease).toEqual({ owner: owner.owner, expiresAt: renewal.expiresAt });
  });

  it("reopens an expired lease at its committed prefix and fences the old token", async () => {
    const queue = open();
    const submitted = await queue.submit(charts);
    const claim = (await queue.claim(owner))!;
    clock += 1;
    const prefix = await queue.commit(claim.lease, rows.slice(0, 1));
    await queue.close();
    const reopened = open();
    expect(await reopened.readResults(submitted.id)).toEqual({ rows: rows.slice(0, 1), nextCursor: 1, snapshot: prefix });
    clock = claim.lease.expiresAt;
    const resumed = (await reopened.claim({ ...owner, owner: "synthetic-replacement" }))!;
    expect(resumed.snapshot).toMatchObject({ id: submitted.id, claimCount: 2, nextCursor: 1 });
    expect(resumed.lease.token).not.toBe(claim.lease.token);
    await expect(reopened.commit(claim.lease, rows.slice(1))).rejects.toMatchObject({ code: "lease-lost" });
    const completed = await reopened.commit(resumed.lease, rows.slice(1));
    await reopened.close();
    const finished = open();
    expect(await finished.readResults(submitted.id)).toEqual({ rows, nextCursor: rows.length, snapshot: completed });
    expect(completed).toMatchObject({ status: "completed", lease: null, finishedAt: clock });
    clock += 10_000;
    expect(await finished.claim(owner)).toBeNull();
  });

  it("retains a released job and prefix through reopen with a fresh claim token", async () => {
    const queue = open();
    const submitted = await queue.submit(charts);
    const claim = (await queue.claim(owner))!;
    await queue.commit(claim.lease, rows.slice(0, 1));
    clock++;
    const released = await queue.release(claim.lease);
    await queue.close();
    const reopened = open();
    expect(await reopened.getJob(submitted.id)).toEqual(released);
    const resumed = (await reopened.claim(owner))!;
    expect(resumed.snapshot).toMatchObject({ status: "running", claimCount: 2, nextCursor: 1 });
    expect(resumed.lease.token).not.toBe(claim.lease.token);
    await expect(reopened.release(claim.lease)).rejects.toMatchObject({ code: "lease-lost" });
    await reopened.commit(resumed.lease, rows.slice(1));
    expect((await reopened.readResults(submitted.id))!.rows).toEqual(rows);
  });

  it("closes only its own connection and leaves another handle and persisted jobs usable", async () => {
    const queue = open();
    const peer = open();
    const submitted = await queue.submit(charts);
    await queue.close();
    expect(await peer.getJob(submitted.id)).toEqual(submitted);
    const claim = (await peer.claim(owner))!;
    await peer.commit(claim.lease, rows);
    expect((await open().readResults(submitted.id))!.rows).toEqual(rows);
    await expect(queue.getJob(submitted.id)).rejects.toMatchObject({ code: "closed" });
  });

  it("keeps FIFO submission order when the backend wall clock moves backwards", async () => {
    const first = await open().submit(charts);
    clock -= 100;
    const second = await open().submit(charts);
    clock -= 100;
    const third = await open().submit(charts);
    expect(third.createdAt).toBeLessThan(second.createdAt);
    expect(second.createdAt).toBeLessThan(first.createdAt);
    const claimant = open();
    const claimedIds = [];
    for (let index = 0; index < 3; index++) claimedIds.push((await claimant.claim(owner))!.snapshot.id);
    expect(claimedIds).toEqual([first.id, second.id, third.id]);
  });

  it.each([
    {
      name: "a later result insertion",
      trigger: "BEFORE INSERT ON batch_results WHEN NEW.cursor = 2",
    },
    {
      name: "the final checkpoint update",
      trigger: "BEFORE UPDATE ON batch_jobs WHEN NEW.completed_tasks > OLD.completed_tasks",
    },
  ])("rolls back result rows and completion state when $name fails in SQL", async ({ trigger }) => {
    const queue = open();
    const peer = open();
    const submitted = await queue.submit(charts);
    const claim = (await queue.claim(owner))!;
    const prefix = await queue.commit(claim.lease, rows.slice(0, 1));
    const db = raw();
    db.exec(`CREATE TRIGGER synthetic_failure ${trigger}
      BEGIN SELECT RAISE(ABORT, 'SYNTHETIC_SQL_FAILURE'); END`);
    const failure = await queue.commit(claim.lease, rows.slice(1)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(QueueError);
    expect(failure).toMatchObject({ code: "storage-failure" });
    expect((failure as Error).message).not.toContain("SYNTHETIC_SQL_FAILURE");
    expect((failure as Error).cause).toBeUndefined();
    expect(await peer.getJob(submitted.id)).toEqual(prefix);
    expect(await peer.readResults(submitted.id)).toEqual({ rows: rows.slice(0, 1), nextCursor: 1, snapshot: prefix });
    db.exec("DROP TRIGGER synthetic_failure");
    await queue.close();
    await peer.close();
    db.close();
    const reopened = open();
    expect(await reopened.getJob(submitted.id)).toEqual(prefix);
    expect((await reopened.readResults(submitted.id))!.rows).toEqual(rows.slice(0, 1));
    expect(await reopened.commit(claim.lease, rows.slice(1))).toMatchObject({ status: "completed", nextCursor: rows.length });
  });

  it("rejects contended writes without mutations and remains usable after the lock is released", async () => {
    const queue = open({ busyTimeoutMs: 0 });
    const first = await queue.submit(charts);
    const claim = (await queue.claim(owner))!;
    const second = await queue.submit(charts);
    const db = raw();
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const operation of [
        () => queue.submit(charts), () => queue.claim(owner),
        () => queue.renew(claim.lease, 200), () => queue.commit(claim.lease, rows),
        () => queue.release(claim.lease), () => queue.fail(claim.lease),
      ]) await expect(operation()).rejects.toMatchObject({ code: "storage-busy" });
      expect(await queue.getJob(first.id)).toEqual(claim.snapshot);
      expect(await queue.getJob(second.id)).toEqual(second);
      expect((await queue.readResults(first.id))!.rows).toEqual([]);
    } finally { db.exec("ROLLBACK"); }
    expect(await queue.commit(claim.lease, rows)).toMatchObject({ status: "completed" });
    const next = (await queue.claim(owner))!;
    expect(next.snapshot).toMatchObject({ id: second.id, claimCount: 1 });
    expect(await queue.claim(owner)).toBeNull();
  });

  it("checks lease expiry after preparing results before writing the checkpoint", async () => {
    let committing = false;
    let reads = 0;
    const queue = open({ now: () => {
      if (committing && ++reads === 2) clock += owner.leaseMs;
      return clock;
    } });
    const submitted = await queue.submit(charts);
    const claim = (await queue.claim(owner))!;
    committing = true;
    await expect(queue.commit(claim.lease, rows)).rejects.toMatchObject({ code: "lease-lost" });
    committing = false;
    expect(await queue.getJob(submitted.id)).toEqual(claim.snapshot);
    expect((await queue.readResults(submitted.id))!.rows).toEqual([]);
    const resumed = (await queue.claim(owner))!;
    expect(resumed.lease.token).not.toBe(claim.lease.token);
    expect(await queue.commit(resumed.lease, rows)).toMatchObject({ status: "completed" });
  });

  it("initializes the schema once and opens additional connections without losing rows", async () => {
    const first = open();
    const submitted = await first.submit(charts);
    for (let index = 0; index < 4; index++) expect(await open().getJob(submitted.id)).toEqual(submitted);
    const db = raw();
    expect(db.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 2 });
    expect(db.prepare("PRAGMA application_id").get()).toMatchObject({ application_id: 0x5A424154 });
    expect(db.prepare("PRAGMA journal_mode").get()).toMatchObject({ journal_mode: "wal" });
  });

  it("leaves initialization untouched under a competing write lock and initializes after release", async () => {
    const db = raw();
    db.exec("BEGIN IMMEDIATE");
    try {
      expect(() => open({ busyTimeoutMs: 0 })).toThrow(expect.objectContaining({ code: "storage-busy" }));
      expect(db.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 0 });
      expect(db.prepare("PRAGMA application_id").get()).toMatchObject({ application_id: 0 });
      expect(db.prepare("SELECT name FROM sqlite_schema").all()).toEqual([]);
    } finally { db.exec("ROLLBACK"); }
    const submitted = await open().submit(charts);
    expect(await open().getJob(submitted.id)).toEqual(submitted);
    expect(db.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 2 });
  });

  it.each([
    { version: 3, application: 0x5A424154 },
    { version: -1, application: 0x5A424154 },
    { version: 0, application: 0x5A424154 },
    { version: 0, application: 123 },
    { version: 1, application: 123 },
    { version: 1, application: 0 },
  ])("rejects unsupported schema markers $version/$application without overwriting them", ({ version, application }) => {
    const db = raw();
    db.exec(`PRAGMA user_version = ${version}; PRAGMA application_id = ${application}`);
    expect(() => open()).toThrow(expect.objectContaining({ name: "QueueError", code: "unsupported-schema" }));
    expect(db.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: version });
    expect(db.prepare("PRAGMA application_id").get()).toMatchObject({ application_id: application });
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all()).toEqual([]);
  });

  it.each(["synthetic_existing", "sqliteCache"])("refuses the unowned table %s without altering or adopting its schema", (table) => {
    const db = raw();
    db.exec(`CREATE TABLE ${table} (value TEXT); INSERT INTO ${table} VALUES ('synthetic-row')`);
    expect(() => open()).toThrow(expect.objectContaining({ code: "unsupported-schema" }));
    expect(db.prepare(`SELECT value FROM ${table}`).all()).toEqual([{ value: "synthetic-row" }]);
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all()).toEqual([{ name: table }]);
    expect(db.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 0 });
    expect(db.prepare("PRAGMA application_id").get()).toMatchObject({ application_id: 0 });
  });

  it("reports an inaccessible parent as a fixed storage failure without exposing its path", () => {
    const missing = join(dir, "SYNTHETIC_PRIVATE_PATH", "queue.sqlite");
    let failure: unknown;
    try { new SqliteQueue(missing); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(QueueError);
    expect(failure).toMatchObject({ code: "storage-failure" });
    expect((failure as Error).message).not.toContain("SYNTHETIC_PRIVATE_PATH");
    expect((failure as Error).cause).toBeUndefined();
  });

  it("validates durable filenames and timeout options before opening the database", () => {
    for (const name of ["", ":memory:", null, 1]) {
      expect(() => new SqliteQueue(name as string)).toThrow(expect.objectContaining({ code: "invalid-argument" }));
    }
    for (const busyTimeoutMs of [-1, 0.5, NaN, Infinity, 60_001, "1"]) {
      expect(() => open({ busyTimeoutMs: busyTimeoutMs as number })).toThrow(expect.objectContaining({ code: "invalid-argument" }));
    }
    const getter = vi.fn(() => 0);
    const options = Object.defineProperty({}, "busyTimeoutMs", { get: getter, enumerable: true });
    expect(() => new SqliteQueue(filename, options)).toThrow(expect.objectContaining({ code: "invalid-argument" }));
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid backend epoch milliseconds %s without inserting a job", async (now) => {
    const queue = open({ now: () => now });
    await expect(queue.submit(charts)).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(queue.claim(owner)).rejects.toMatchObject({ code: "invalid-argument" });
    expect(await open().claim(owner)).toBeNull();
  });

  it("preserves safe integer deadlines and rejects overflow without changing a lease", async () => {
    clock = Number.MAX_SAFE_INTEGER - 1;
    const queue = open();
    const submitted = await queue.submit(charts);
    await expect(queue.claim({ ...owner, leaseMs: 2 })).rejects.toMatchObject({ code: "invalid-argument" });
    expect(await queue.getJob(submitted.id)).toEqual(submitted);
    const claim = (await queue.claim({ ...owner, leaseMs: 1 }))!;
    expect(claim.lease.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    await expect(queue.renew(claim.lease, 2)).rejects.toMatchObject({ code: "invalid-argument" });
    expect(await open().getJob(submitted.id)).toEqual(claim.snapshot);
    clock++;
    await expect(queue.release(claim.lease)).rejects.toMatchObject({ code: "lease-lost" });
  });

  it("retains keyed retries and committed prefixes after reopening and retains the key after success", async () => {
    const options = { idempotencyKey: "synthetic-reopen", retry: { maxAttempts: 2, delayMs: 500 } };
    const queue = open();
    const submitted = await queue.submit(charts, options);
    const claim = (await queue.claim(owner))!;
    await queue.commit(claim.lease, rows.slice(0, 1));
    clock++;
    const failed = await queue.fail(claim.lease);
    expect(failed).toMatchObject({
      status: "queued", failureCount: 1, retryAt: clock + 500, nextCursor: 1,
      lastFailure: { code: "execution-failed", at: clock, cursor: 1 }, lease: null,
    });
    await queue.close();
    const reopened = open();
    expect(await reopened.submit(charts, options)).toEqual(failed);
    expect(await reopened.getJob(submitted.id)).toEqual(failed);
    expect((await reopened.readResults(submitted.id))!.rows).toEqual(rows.slice(0, 1));
    expect(await reopened.claim(owner)).toBeNull();
    await expect(reopened.submit(charts, { ...options, retry: { maxAttempts: 3, delayMs: 500 } }))
      .rejects.toMatchObject({ code: "idempotency-conflict" });
    clock = failed.retryAt!;
    const retry = (await reopened.claim(owner))!;
    expect(retry.snapshot).toMatchObject({ id: submitted.id, nextCursor: 1, failureCount: 1, retryAt: null });
    await expect(reopened.fail(claim.lease)).rejects.toMatchObject({ code: "lease-lost" });
    const completed = await reopened.commit(retry.lease, rows.slice(1));
    await reopened.close();
    expect(await open().submit(charts, options)).toEqual(completed);
    expect(completed).toMatchObject({ status: "completed", failureCount: 1, lastFailure: failed.lastFailure });
    expect(raw().prepare("SELECT COUNT(*) AS count FROM batch_jobs").get()).toEqual({ count: 1 });
  });

  it("persists terminal failure and its key across reopen without removing prefix results", async () => {
    const queue = open();
    const options = { idempotencyKey: "synthetic-terminal", retry: { maxAttempts: 1 } };
    const submitted = await queue.submit(charts, options);
    const claim = (await queue.claim(owner))!;
    await queue.commit(claim.lease, rows.slice(0, 1));
    clock++;
    const failed = await queue.fail(claim.lease);
    expect(failed).toMatchObject({
      status: "failed", failureCount: 1, nextCursor: 1, retryAt: null, finishedAt: clock,
      lastFailure: { code: "execution-failed", at: clock, cursor: 1 }, lease: null,
    });
    await queue.close();
    const reopened = open();
    expect(await reopened.submit(charts, options)).toEqual(failed);
    expect(await reopened.readResults(submitted.id)).toEqual({ rows: rows.slice(0, 1), nextCursor: 1, snapshot: failed });
    await expect(reopened.submit(workloads[1], options)).rejects.toMatchObject({ code: "idempotency-conflict" });
    clock += 1_000_000;
    expect(await reopened.claim(owner)).toBeNull();
    expect(await reopened.getJob(submitted.id)).toEqual(failed);
  });

  it("counts each expired lease once across reopen and dates retries from the expired deadline", async () => {
    const queue = open();
    const submitted = await queue.submit(charts, { retry: { maxAttempts: 2, delayMs: 500 } });
    const claim = (await queue.claim(owner))!;
    await queue.close();
    clock = claim.lease.expiresAt + 400;
    const reopened = open();
    expect(await reopened.claim(owner)).toBeNull();
    const failed = (await reopened.getJob(submitted.id))!;
    expect(failed).toMatchObject({
      status: "queued", failureCount: 1, updatedAt: clock,
      retryAt: claim.lease.expiresAt + 500,
      lastFailure: { code: "lease-expired", at: claim.lease.expiresAt, cursor: 0 },
    });
    await reopened.close();
    const again = open();
    expect(await again.claim(owner)).toBeNull();
    expect(await again.getJob(submitted.id)).toEqual(failed);
    clock = failed.retryAt!;
    const retry = (await again.claim(owner))!;
    await again.close();
    clock = retry.lease.expiresAt + 1_000;
    const final = open();
    expect(await final.claim(owner)).toBeNull();
    expect(await final.getJob(submitted.id)).toMatchObject({
      status: "failed", failureCount: 2, retryAt: null,
      updatedAt: clock, finishedAt: retry.lease.expiresAt,
      lastFailure: { code: "lease-expired", at: retry.lease.expiresAt, cursor: 0 },
    });
    expect(await final.claim(owner)).toBeNull();
    expect(await final.getJob(submitted.id)).toMatchObject({ failureCount: 2 });
  });

  it("rolls back a failed keyed insertion without reserving its key or sequence", async () => {
    const queue = open();
    const db = raw();
    db.exec(`CREATE TRIGGER synthetic_failure AFTER INSERT ON batch_jobs
      BEGIN SELECT RAISE(ABORT, 'SYNTHETIC_KEY_FAILURE'); END`);
    const options = { idempotencyKey: "synthetic-insert-rollback" };
    await expect(queue.submit(charts, options)).rejects.toMatchObject({ code: "storage-failure" });
    expect(db.prepare("SELECT COUNT(*) AS count FROM batch_jobs").get()).toEqual({ count: 0 });
    db.exec("DROP TRIGGER synthetic_failure");
    const submitted = await open().submit(charts, options);
    expect(await queue.submit(charts, options)).toEqual(submitted);
    expect(db.prepare("SELECT sequence FROM batch_jobs").all()).toEqual([{ sequence: 1 }]);
  });

  it("rolls back a failed failure transition and leaves the current lease usable", async () => {
    const queue = open();
    const submitted = await queue.submit(charts, { retry: { maxAttempts: 1 } });
    const claim = (await queue.claim(owner))!;
    const prefix = await queue.commit(claim.lease, rows.slice(0, 1));
    const db = raw();
    db.exec(`CREATE TRIGGER synthetic_failure AFTER UPDATE ON batch_jobs
      WHEN NEW.failure_count > OLD.failure_count
      BEGIN SELECT RAISE(ABORT, 'SYNTHETIC_FAIL_FAILURE'); END`);
    await expect(queue.fail(claim.lease)).rejects.toMatchObject({ code: "storage-failure" });
    expect(await open().getJob(submitted.id)).toEqual(prefix);
    expect((await queue.readResults(submitted.id))!.rows).toEqual(rows.slice(0, 1));
    db.exec("DROP TRIGGER synthetic_failure");
    expect(await queue.fail(claim.lease)).toMatchObject({ status: "failed", failureCount: 1, nextCursor: 1 });
  });

  it("rolls back all expired-lease transitions when the new claim fails", async () => {
    const queue = open();
    const first = await queue.submit(charts, { retry: { maxAttempts: 1 } });
    const second = await queue.submit(charts);
    const claim1 = (await queue.claim(owner))!;
    const claim2 = (await queue.claim(owner))!;
    const db = raw();
    db.exec(`CREATE TRIGGER synthetic_failure AFTER UPDATE ON batch_jobs
      WHEN NEW.claim_count > OLD.claim_count
      BEGIN SELECT RAISE(ABORT, 'SYNTHETIC_CLAIM_FAILURE'); END`);
    clock = claim1.lease.expiresAt;
    await expect(queue.claim(owner)).rejects.toMatchObject({ code: "storage-failure" });
    const peer = open();
    expect(await peer.getJob(first.id)).toEqual(claim1.snapshot);
    expect(await peer.getJob(second.id)).toEqual(claim2.snapshot);
    db.exec("DROP TRIGGER synthetic_failure");
    const resumed = (await peer.claim(owner))!;
    expect(resumed.snapshot).toMatchObject({ id: second.id, failureCount: 1, claimCount: 2 });
    expect(await queue.getJob(first.id)).toMatchObject({ status: "failed", failureCount: 1 });
  });

  it("migrates queued, running and completed jobs with leases, results, constraints and sequence intact", async () => {
    let db = raw();
    createVersionOne(db);
    const insert = db.prepare(`INSERT INTO batch_jobs (sequence, id, spec_json, kind, total_tasks,
      completed_tasks, status, claim_count, created_at, updated_at, finished_at,
      lease_token, lease_owner, lease_expires_at) VALUES (?, ?, ?, 'charts', 3, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const encoded = JSON.stringify(validateJob(charts).spec);
    insert.run(1, "synthetic-old-queued", encoded, 0, "queued", 0, clock, clock, null, null, null, null);
    insert.run(2, "synthetic-old-running", encoded, 1, "running", 7, clock, clock, null,
      "synthetic-old-token", owner.owner, clock + 100);
    insert.run(3, "synthetic-old-completed", encoded, 3, "completed", 2, clock, clock, clock, null, null, null);
    insert.run(40, "synthetic-old-deleted", encoded, 0, "queued", 0, clock, clock, null, null, null, null);
    db.exec("DELETE FROM batch_jobs WHERE sequence = 40");
    const insertRow = db.prepare("INSERT INTO batch_results VALUES (?, ?, ?)");
    insertRow.run("synthetic-old-running", 0, JSON.stringify(rows[0]));
    rows.forEach((row, cursor) => insertRow.run("synthetic-old-completed", cursor, JSON.stringify(row)));
    const before = db.prepare("SELECT * FROM batch_jobs ORDER BY sequence").all();
    db.close();
    const queue = open();
    db = raw();
    const after = db.prepare("SELECT * FROM batch_jobs ORDER BY sequence").all();
    expect(after).toEqual(before.map((record) => ({
      ...record, idempotency_key: null, retry_max_attempts: RETRY_DEFAULTS.maxAttempts,
      retry_delay_ms: RETRY_DEFAULTS.delayMs, failure_count: 0, retry_at: null,
      last_failure_code: null, last_failure_at: null, last_failure_cursor: null,
    })));
    expect(db.prepare("PRAGMA user_version").get()).toEqual({ user_version: 2 });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("PRAGMA foreign_key_list(batch_results)").all()).toContainEqual(expect.objectContaining({ table: "batch_jobs" }));
    expect(() => db.prepare("INSERT INTO batch_results VALUES ('synthetic-missing', 0, '{}')").run()).toThrow();
    expect(() => db.exec("UPDATE batch_jobs SET retry_max_attempts = 0 WHERE sequence = 1")).toThrow();
    expect(() => db.exec("UPDATE batch_jobs SET status = 'failed' WHERE sequence = 1")).toThrow();
    expect(() => db.exec("UPDATE batch_jobs SET lease_token = NULL WHERE sequence = 2")).toThrow();
    expect(() => db.exec("UPDATE batch_jobs SET status = 'completed' WHERE sequence = 1")).toThrow();
    expect((await queue.readResults("synthetic-old-completed"))!.rows).toEqual(rows);
    expect((await queue.readResults("synthetic-old-running"))!.rows).toEqual(rows.slice(0, 1));
    const newest = await queue.submit(charts, { idempotencyKey: "synthetic-new-after-migration" });
    expect(db.prepare("SELECT sequence FROM batch_jobs WHERE id = ?").get(newest.id)).toEqual({ sequence: 41 });
    expect((await queue.claim(owner))!.snapshot.id).toBe("synthetic-old-queued");
    expect((await queue.claim(owner))!.snapshot.id).toBe(newest.id);
    expect(await queue.commit({ jobId: "synthetic-old-running", token: "synthetic-old-token" }, rows.slice(1)))
      .toMatchObject({ status: "completed", claimCount: 7, failureCount: 0, retry: RETRY_DEFAULTS });
    expect(await open().submit(charts, { idempotencyKey: "synthetic-new-after-migration" }))
      .toMatchObject({ id: newest.id, status: "running" });
  });

  it("preserves the old sequence high-water mark when migrating an empty queue", async () => {
    const db = raw();
    createVersionOne(db);
    db.prepare(`INSERT INTO batch_jobs (sequence, id, spec_json, kind, total_tasks, created_at, updated_at)
      VALUES (40, 'synthetic-deleted', ?, 'charts', 3, ?, ?)`)
      .run(JSON.stringify(validateJob(charts).spec), clock, clock);
    db.exec("DELETE FROM batch_jobs");
    await open().submit(charts);
    expect(db.prepare("SELECT sequence FROM batch_jobs").all()).toEqual([{ sequence: 41 }]);
  });

  it("rolls back the entire migration when a late schema operation fails, then retries safely", async () => {
    const db = raw();
    createVersionOne(db);
    db.prepare(`INSERT INTO batch_jobs (id, spec_json, kind, total_tasks, completed_tasks,
      status, claim_count, created_at, updated_at, lease_token, lease_owner, lease_expires_at)
      VALUES ('synthetic-migrate-rollback', ?, 'charts', 3, 1, 'running', 1, ?, ?, 'synthetic-token', ?, ?)`)
      .run(JSON.stringify(validateJob(charts).spec), clock, clock, owner.owner, clock + 100);
    db.prepare("INSERT INTO batch_results VALUES ('synthetic-migrate-rollback', 0, ?)").run(JSON.stringify(rows[0]));
    // The final CREATE INDEX fails after both replacement tables were renamed.
    db.exec(`CREATE TABLE synthetic_conflict (value INTEGER);
      CREATE INDEX batch_jobs_expired ON synthetic_conflict(value)`);
    const beforeSchema = db.prepare("SELECT name, sql FROM sqlite_schema ORDER BY name").all();
    const beforeJobs = db.prepare("SELECT * FROM batch_jobs").all();
    const beforeResults = db.prepare("SELECT * FROM batch_results").all();
    const beforeSequence = db.prepare("SELECT * FROM sqlite_sequence").all();
    expect(() => open()).toThrow(expect.objectContaining({ code: "storage-failure" }));
    expect(db.prepare("PRAGMA user_version").get()).toEqual({ user_version: 1 });
    expect(db.prepare("SELECT name, sql FROM sqlite_schema ORDER BY name").all()).toEqual(beforeSchema);
    expect(db.prepare("SELECT * FROM batch_jobs").all()).toEqual(beforeJobs);
    expect(db.prepare("SELECT * FROM batch_results").all()).toEqual(beforeResults);
    expect(db.prepare("SELECT * FROM sqlite_sequence").all()).toEqual(beforeSequence);
    db.exec("DROP TABLE synthetic_conflict");
    const queue = open();
    expect(db.prepare("PRAGMA user_version").get()).toEqual({ user_version: 2 });
    expect((await queue.readResults("synthetic-migrate-rollback"))!.rows).toEqual(rows.slice(0, 1));
    expect(await queue.commit({ jobId: "synthetic-migrate-rollback", token: "synthetic-token" }, rows.slice(1)))
      .toMatchObject({ status: "completed" });
  });
});
