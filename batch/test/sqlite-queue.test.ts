import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeSerial } from "../src/execution.js";
import type { JobSpec, Person } from "../src/model.js";
import { QueueError } from "../src/queue.js";
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
        () => queue.release(claim.lease),
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
    expect(db.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 1 });
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
    expect(db.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 1 });
  });

  it.each([
    { version: 2, application: 0x5A424154 },
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
});
