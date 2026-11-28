import { Buffer } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeWorkItem } from "../src/execution.js";
import type { ResultRow } from "../src/execution.js";
import type { ChartsJob, JobSpec, Person } from "../src/model.js";
import { DEFAULT_LIMITS } from "../src/model.js";
import { QUEUE_LIMITS, QueueError } from "../src/queue.js";
import type { ClaimOptions, ClaimedJob, LeaseRef, QueueBackend, QueueErrorCode, ResultPageOptions } from "../src/queue.js";
import { JobValidationError, validateJob } from "../src/validation.js";
import { workItems } from "../src/work.js";

/** Both handles must see the same store and use the supplied backend clock. */
export interface QueueFixture {
  readonly queue: QueueBackend;
  readonly peer: QueueBackend;
  readonly cleanup: () => Promise<void>;
}

export type QueueFixtureFactory = (now: () => number) => Promise<QueueFixture>;

// Invented people and instants, unrelated to external birth records.
function people(count: number): Person[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `synthetic-${index}`,
    birth: { utc: "2001-02-03T04:05:06Z", timeKnown: false },
  }));
}

function charts(count = 3): ChartsJob {
  return { version: 1, kind: "charts", births: people(count) };
}

const workloads: readonly JobSpec[] = [
  charts(),
  {
    version: 1, kind: "transit-grid", births: people(1),
    start: "2007-08-09T10:11:12Z", end: "2007-08-09T10:11:12.003Z", stepMs: 1,
  },
  { version: 1, kind: "synastry-matrix", people: people(2) },
];

// These values exercise storage and transport, not astronomical accuracy.
const workloadRows = workloads.map((spec) => [...workItems(validateJob(spec))].map(executeWorkItem));

async function rejects(promise: Promise<unknown>, code: QueueErrorCode): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: "QueueError", code });
}

function required<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull();
  expect(value).not.toBeUndefined();
  return value!;
}

function alter(object: object, key: PropertyKey, value: unknown): void {
  // A backend may return detached mutable copies or deeply frozen snapshots.
  try { Reflect.set(object, key, value); } catch (error) {
    if (!(error instanceof TypeError)) throw error;
  }
}

/** Run unchanged against an in-memory store or separate durable connections. */
export function queueContract(name: string, create: QueueFixtureFactory): void {
  describe(`${name} queue backend contract`, () => {
    let clock: number;
    let fixture: QueueFixture;
    let queue: QueueBackend;
    let peer: QueueBackend;
    const owner = { owner: "synthetic-worker", leaseMs: 100 };
    const rows = workloadRows[0]!;

    beforeEach(async () => {
      clock = 1_700_000_000_000;
      fixture = await create(() => clock);
      ({ queue, peer } = fixture);
    });

    afterEach(async () => { await fixture?.cleanup(); });

    async function start(spec: JobSpec = charts()): Promise<ClaimedJob> {
      await queue.submit(spec);
      return required(await peer.claim(owner));
    }

    it("starts empty and returns null for absent jobs", async () => {
      expect(await queue.claim(owner)).toBeNull();
      expect(await peer.getJob("missing-job")).toBeNull();
      expect(await peer.readResults("missing-job")).toBeNull();
    });

    it("validates definitions before submission and applies default workload limits", async () => {
      await expect(queue.submit({ ...charts(), births: [] })).rejects.toBeInstanceOf(JobValidationError);
      await expect(queue.submit({ ...charts(), version: 2 })).rejects.toBeInstanceOf(JobValidationError);
      await expect(queue.submit({
        version: 1, kind: "transit-grid", births: people(1),
        start: "2007-08-09T10:11:12Z", end: "2007-08-09T11:11:12Z", stepMs: 1,
      })).rejects.toMatchObject({ code: "limit-exceeded" });
      await expect(queue.submit(charts(DEFAULT_LIMITS.maxPeople + 1))).rejects.toMatchObject({ code: "limit-exceeded" });
      expect(await queue.claim(owner)).toBeNull();
      expect(await queue.submit(charts(1))).toMatchObject({ status: "queued", totalTasks: 1 });
    });

    it("returns detached status snapshots with canonical claimed definitions", async () => {
      const submitted = await queue.submit(charts());
      expect(submitted).toEqual({
        id: expect.any(String), kind: "charts", status: "queued", totalTasks: 3,
        completedTasks: 0, nextCursor: 0, claimCount: 0,
        createdAt: clock, updatedAt: clock, finishedAt: null, lease: null,
        retry: { maxAttempts: 3, delayMs: 0 }, failureCount: 0, retryAt: null, lastFailure: null,
      });
      clock += 5;
      const claimed = required(await peer.claim(owner));
      expect(claimed.job).toEqual(validateJob(charts()));
      expect(claimed.snapshot).toEqual({
        ...submitted, status: "running", claimCount: 1, updatedAt: clock,
        lease: { owner: owner.owner, expiresAt: clock + owner.leaseMs },
      });
      expect(claimed.lease).toEqual({
        jobId: submitted.id, owner: owner.owner, expiresAt: clock + owner.leaseMs,
        token: expect.any(String),
      });
      expect(claimed.lease.token.length).toBeGreaterThan(0);
      expect(JSON.stringify(claimed.snapshot)).not.toContain(claimed.lease.token);
      expect(await queue.getJob(submitted.id)).toEqual(claimed.snapshot);
      expect(submitted.status).toBe("queued");
      expect(submitted.lease).toBeNull();
    });

    it("claims in submission order and skips jobs with live leases", async () => {
      const first = await queue.submit(charts(1));
      const second = await peer.submit(charts(1));
      const third = await queue.submit(charts(1));
      const firstClaim = required(await peer.claim(owner));
      const secondClaim = required(await queue.claim({ ...owner, owner: "synthetic-other" }));
      const thirdClaim = required(await peer.claim(owner));
      expect([firstClaim.snapshot.id, secondClaim.snapshot.id, thirdClaim.snapshot.id])
        .toEqual([first.id, second.id, third.id]);
      expect(await queue.claim(owner)).toBeNull();
      await queue.release(secondClaim.lease);
      expect(required(await peer.claim(owner)).snapshot.id).toBe(second.id);
    });

    it("grants a single lease under competing claims on both handles", async () => {
      const submitted = await queue.submit(charts());
      const claims = await Promise.all(Array.from({ length: 12 }, (_, index) =>
        (index % 2 ? queue : peer).claim({ owner: `synthetic-worker-${index}`, leaseMs: 100 }),
      ));
      const winners = claims.filter((claim) => claim !== null);
      expect(winners).toHaveLength(1);
      expect(winners[0]!.snapshot).toMatchObject({ id: submitted.id, claimCount: 1 });
      expect(await peer.getJob(submitted.id)).toEqual(winners[0]!.snapshot);
    });

    it("does not duplicate jobs when claims compete across multiple submissions", async () => {
      const submitted = await Promise.all(Array.from({ length: 4 }, () => queue.submit(charts(1))));
      const claims = await Promise.all(Array.from({ length: 8 }, (_, index) =>
        (index % 2 ? queue : peer).claim({ owner: `synthetic-worker-${index}`, leaseMs: 100 }),
      ));
      const ids = claims.flatMap((claim) => claim ? [claim.snapshot.id] : []);
      expect(ids.sort()).toEqual(submitted.map((job) => job.id).sort());
      expect(new Set(ids).size).toBe(submitted.length);
    });

    it("commits a contiguous prefix and advances result visibility and progress together", async () => {
      const claimed = await start();
      clock += 2;
      const progress = await queue.commit(claimed.lease, rows.slice(0, 2));
      expect(progress).toEqual({
        ...claimed.snapshot, completedTasks: 2, nextCursor: 2, updatedAt: clock,
      });
      expect(await peer.getJob(progress.id)).toEqual(progress);
      expect(await peer.readResults(progress.id)).toEqual({ rows: rows.slice(0, 2), nextCursor: 2, snapshot: progress });
      expect(claimed.snapshot.completedTasks).toBe(0);
      expect(await peer.claim(owner)).toBeNull();
    });

    it("renews with the same token without shortening the existing deadline", async () => {
      const claimed = await start();
      clock += 10;
      const short = await queue.renew(claimed.lease, 1);
      expect(short).toEqual(claimed.lease);
      const extended = await peer.renew(claimed.lease, 200);
      expect(extended).toEqual({ ...claimed.lease, expiresAt: clock + 200 });
      clock = claimed.lease.expiresAt;
      expect(await queue.claim(owner)).toBeNull();
      expect(await peer.commit(claimed.lease, rows.slice(0, 1))).toMatchObject({ nextCursor: 1 });
      expect(required(await queue.getJob(claimed.snapshot.id)).lease).toEqual({
        owner: owner.owner, expiresAt: extended.expiresAt,
      });
    });

    it("expires exactly at the backend deadline without changing reads or losing progress", async () => {
      const claimed = await start();
      await queue.commit(claimed.lease, rows.slice(0, 1));
      clock = claimed.lease.expiresAt - 1;
      expect(await peer.claim(owner)).toBeNull();
      const beforeExpiry = await queue.getJob(claimed.snapshot.id);
      clock++;
      expect(await peer.getJob(claimed.snapshot.id)).toEqual(beforeExpiry);
      await rejects(queue.renew(claimed.lease, 100), "lease-lost");
      await rejects(queue.release(claimed.lease), "lease-lost");
      await rejects(queue.commit(claimed.lease, rows.slice(1, 2)), "lease-lost");
      const resumed = required(await peer.claim(owner));
      expect(resumed.snapshot).toMatchObject({
        id: claimed.snapshot.id, completedTasks: 1, nextCursor: 1, claimCount: 2,
      });
      expect(resumed.lease.token).not.toBe(claimed.lease.token);
      await rejects(queue.commit(claimed.lease, rows.slice(1, 2)), "lease-lost");
      expect(await queue.commit(resumed.lease, rows.slice(1))).toMatchObject({ status: "completed" });
    });

    it("reclaims the earliest eligible expired job before a newer queued job", async () => {
      const claimed = await start();
      clock++;
      const later = await peer.submit(charts());
      clock = claimed.lease.expiresAt;
      const resumed = required(await queue.claim({ ...owner, owner: "synthetic-replacement" }));
      expect(resumed.snapshot).toMatchObject({ id: claimed.snapshot.id, claimCount: 2 });
      expect(required(await peer.claim(owner)).snapshot.id).toBe(later.id);
    });

    it("requeues unfinished work and fences an old token even when the owner is reused", async () => {
      const claimed = await start();
      await peer.commit(claimed.lease, rows.slice(0, 1));
      clock += 2;
      const released = await queue.release(claimed.lease);
      expect(released).toMatchObject({
        status: "queued", completedTasks: 1, nextCursor: 1, lease: null,
        finishedAt: null, updatedAt: clock, claimCount: 1,
      });
      const resumed = required(await peer.claim(owner));
      expect(resumed.job).toEqual(claimed.job);
      expect(resumed.snapshot).toMatchObject({ nextCursor: 1, claimCount: 2 });
      expect(resumed.lease.token).not.toBe(claimed.lease.token);
      await rejects(queue.renew(claimed.lease, 100), "lease-lost");
      await rejects(queue.release(claimed.lease), "lease-lost");
      await rejects(queue.commit(claimed.lease, rows.slice(1, 2)), "lease-lost");
      expect(await queue.commit(resumed.lease, rows.slice(1))).toMatchObject({ status: "completed", nextCursor: 3 });
    });

    it("binds mutation authority to both the job id and the current token", async () => {
      const first = await start();
      const second = await start();
      for (const lease of [
        { jobId: first.lease.jobId, token: second.lease.token },
        { jobId: "missing-job", token: first.lease.token },
        { jobId: first.lease.jobId, token: "synthetic-wrong-token" },
      ]) {
        await rejects(queue.renew(lease, 100), "lease-lost");
        await rejects(peer.release(lease), "lease-lost");
        await rejects(queue.commit(lease, rows.slice(0, 1)), "lease-lost");
      }
      expect(await peer.getJob(first.snapshot.id)).toEqual(first.snapshot);
      expect(await queue.getJob(second.snapshot.id)).toEqual(second.snapshot);
    });

    it("rolls back every row and the checkpoint when the final row of a batch is invalid", async () => {
      const claimed = await start();
      const malformed = { ...rows[1]!, personId: "synthetic-wrong-person" } as ResultRow;
      await rejects(queue.commit(claimed.lease, [rows[0]!, malformed]), "invalid-result");
      expect(await peer.getJob(claimed.snapshot.id)).toEqual(claimed.snapshot);
      expect(await peer.readResults(claimed.snapshot.id)).toEqual({ rows: [], nextCursor: 0, snapshot: claimed.snapshot });
      expect(await queue.commit(claimed.lease, rows.slice(0, 2))).toMatchObject({ nextCursor: 2 });
    });

    it("rejects a repeated or out-of-order prefix and atomically arbitrates competing commits", async () => {
      const claimed = await start();
      await rejects(queue.commit(claimed.lease, rows.slice(1, 2)), "cursor-conflict");
      const outcomes = await Promise.allSettled([
        queue.commit(claimed.lease, rows.slice(0, 1)),
        peer.commit(claimed.lease, rows.slice(0, 1)),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      const rejected = outcomes.find((outcome) => outcome.status === "rejected");
      expect(rejected).toMatchObject({ status: "rejected", reason: { code: "cursor-conflict" } });
      await rejects(peer.commit(claimed.lease, rows.slice(0, 1)), "cursor-conflict");
      const page = required(await queue.readResults(claimed.snapshot.id));
      expect(page.rows).toEqual(rows.slice(0, 1));
      expect(page.snapshot).toMatchObject({ completedTasks: 1, nextCursor: 1 });
    });

    it("completes on the final commit, revokes the token and preserves the final snapshot", async () => {
      const claimed = await start();
      clock += 2;
      const completed = await queue.commit(claimed.lease, rows);
      expect(completed).toEqual({
        ...claimed.snapshot, completedTasks: 3, nextCursor: 3, status: "completed",
        lease: null, updatedAt: clock, finishedAt: clock,
      });
      await rejects(queue.renew(claimed.lease, 100), "lease-lost");
      await rejects(peer.release(claimed.lease), "lease-lost");
      await rejects(queue.commit(claimed.lease, rows), "lease-lost");
      clock += 10_000;
      expect(await peer.claim(owner)).toBeNull();
      expect(await queue.getJob(completed.id)).toEqual(completed);
      expect(required(await peer.readResults(completed.id)).snapshot).toEqual(completed);
    });

    it("reads bounded pages with stable cursors and a snapshot of each read", async () => {
      const claimed = await start();
      const empty = required(await queue.readResults(claimed.snapshot.id));
      expect(empty.rows).toEqual([]);
      await peer.commit(claimed.lease, rows.slice(0, 2));
      const first = required(await queue.readResults(claimed.snapshot.id, { limit: 1 }));
      const second = required(await peer.readResults(claimed.snapshot.id, { cursor: first.nextCursor, limit: 1 }));
      expect(first.rows).toEqual(rows.slice(0, 1));
      expect(second.rows).toEqual(rows.slice(1, 2));
      expect([first.nextCursor, second.nextCursor]).toEqual([1, 2]);
      expect(required(await queue.readResults(claimed.snapshot.id, { cursor: 2 })).rows).toEqual([]);
      await rejects(queue.readResults(claimed.snapshot.id, { cursor: 3 }), "invalid-argument");
      await peer.commit(claimed.lease, rows.slice(2));
      expect(empty.snapshot.nextCursor).toBe(0);
      expect(first.snapshot.nextCursor).toBe(2);
      expect(required(await queue.readResults(claimed.snapshot.id, { cursor: 2 })).rows).toEqual(rows.slice(2));
      expect(required(await queue.readResults(claimed.snapshot.id, { cursor: 3 })).rows).toEqual([]);
    });

    it("observes result rows and progress from the same state while a commit competes", async () => {
      const claimed = await start();
      await queue.commit(claimed.lease, rows.slice(0, 1));
      const [page] = await Promise.all([
        peer.readResults(claimed.snapshot.id),
        queue.commit(claimed.lease, rows.slice(1)),
      ]);
      const observed = required(page);
      expect([1, rows.length]).toContain(observed.rows.length);
      expect(observed.rows).toEqual(rows.slice(0, observed.rows.length));
      expect(observed.nextCursor).toBe(observed.rows.length);
      expect(observed.snapshot.completedTasks).toBe(observed.rows.length);
      expect(observed.snapshot.nextCursor).toBe(observed.rows.length);
      expect(observed.snapshot.status).toBe(observed.rows.length === rows.length ? "completed" : "running");
    });

    it("caps default pages and permits the exact row limit without collecting the suffix", async () => {
      const claimed = await start(charts(QUEUE_LIMITS.maxPageRows + 2));
      const resultRows = [...workItems(claimed.job)].map(executeWorkItem);
      // Small commits keep this paging test independent of the byte budget.
      for (let cursor = 0; cursor < resultRows.length; cursor += 8) {
        await peer.commit(claimed.lease, resultRows.slice(cursor, cursor + 8));
      }
      const defaultPage = required(await queue.readResults(claimed.snapshot.id));
      expect(defaultPage.rows).toEqual(resultRows.slice(0, QUEUE_LIMITS.maxPageRows));
      expect(defaultPage.nextCursor).toBe(QUEUE_LIMITS.maxPageRows);
      const maximumPage = required(await peer.readResults(claimed.snapshot.id, { limit: QUEUE_LIMITS.maxPageRows }));
      expect(maximumPage).toEqual(defaultPage);
      const suffix = required(await queue.readResults(claimed.snapshot.id, { cursor: defaultPage.nextCursor }));
      expect(suffix.rows).toEqual(resultRows.slice(QUEUE_LIMITS.maxPageRows));
      expect(suffix.nextCursor).toBe(claimed.job.totalTasks);
    });

    it.each(workloads.map((spec, index) => ({ spec, index })))
      ("accepts routed engine rows for $spec.kind and rejects mismatched row metadata", async ({ spec, index }) => {
        const claimed = await start(spec);
        const result = workloadRows[index]![0]!;
        const invalid: unknown[] = [
          { ...result, version: 2 }, { ...result, kind: "unknown" },
          { ...result, index: 0.5 }, { ...result, nextCursor: 2 },
          { ...result, extra: true },
        ];
        if (result.kind === "charts" || result.kind === "transit-grid") invalid.push({ ...result, personId: "synthetic-missing" });
        if (result.kind === "transit-grid") invalid.push({ ...result, sampleIndex: 1 }, { ...result, at: "2007-08-09T10:11:13.000Z" });
        if (result.kind === "synastry-matrix") invalid.push({ ...result, aId: result.bId, bId: result.aId });
        for (const row of invalid) await rejects(queue.commit(claimed.lease, [row as ResultRow]), "invalid-result");
        expect(await peer.getJob(claimed.snapshot.id)).toEqual(claimed.snapshot);
        expect(await queue.commit(claimed.lease, workloadRows[index]!)).toMatchObject({ status: "completed" });
      });

    it("refuses empty, sparse, oversized, gapped or repeated row batches without advancing", async () => {
      const claimed = await start();
      const batches: unknown[] = [
        [], null, {}, new Array(1),
        Array.from({ length: QUEUE_LIMITS.maxBatchRows + 1 }, () => rows[0]),
        [rows[0], rows[2]], [rows[0], rows[0]],
        [...rows, { ...rows[2]!, index: 3, nextCursor: 4 }],
      ];
      for (const batch of batches) await rejects(queue.commit(claimed.lease, batch as ResultRow[]), "invalid-result");
      expect(await peer.getJob(claimed.snapshot.id)).toEqual(claimed.snapshot);
      expect(required(await peer.readResults(claimed.snapshot.id)).rows).toEqual([]);
    });

    it("rejects non-JSON result values and accessor slots without invoking user code", async () => {
      const claimed = await start();
      const cycle: Record<string, unknown> = {};
      cycle.self = cycle;
      const getter = vi.fn(() => 42);
      const accessor = Object.defineProperty({}, "field", { get: getter, enumerable: true });
      const values: unknown[] = [
        undefined, null, "result", NaN, Infinity, 1n, () => 0, new Date(), new Map(),
        { field: undefined }, { field: NaN }, { field: Infinity }, { field: 1n },
        { field: Symbol("synthetic") }, { field: () => 0 }, cycle,
        { field: new Array(1) }, { field: accessor },
      ];
      for (const value of values) {
        await rejects(queue.commit(claimed.lease, [{ ...rows[0]!, value } as ResultRow]), "invalid-result");
      }
      const accessorRows = [rows[0]!];
      Object.defineProperty(accessorRows, "0", { get: getter, enumerable: true });
      await rejects(queue.commit(claimed.lease, accessorRows), "invalid-result");
      expect(getter).not.toHaveBeenCalled();
      expect(await peer.getJob(claimed.snapshot.id)).toEqual(claimed.snapshot);
    });

    it("bounds result bytes, nesting and node counts before accepting a batch", async () => {
      const claimed = await start();
      let deep: unknown = {};
      for (let depth = 0; depth <= QUEUE_LIMITS.maxResultDepth; depth++) deep = { child: deep };
      for (const value of [
        { text: "x".repeat(QUEUE_LIMITS.maxBatchBytes + 1) },
        { deep }, { nodes: Array.from({ length: QUEUE_LIMITS.maxResultNodes + 1 }, () => null) },
      ]) {
        await rejects(queue.commit(claimed.lease, [{ ...rows[0]!, value } as unknown as ResultRow]), "invalid-result");
      }
      expect(required(await peer.readResults(claimed.snapshot.id)).rows).toEqual([]);
      expect(await queue.commit(claimed.lease, rows.slice(0, 1))).toMatchObject({ nextCursor: 1 });
    });

    it("enforces the exact UTF-8 batch byte limit and counts repeated string occurrences", async () => {
      const claimed = await start();
      const result = structuredClone(rows[0]!);
      const value = result.value as unknown as Record<string, unknown>;
      value.syntheticPadding = "";
      const remaining = QUEUE_LIMITS.maxBatchBytes - Buffer.byteLength(JSON.stringify(result));
      expect(remaining).toBeGreaterThan(0);
      value.syntheticPadding = "x".repeat(remaining);
      expect(Buffer.byteLength(JSON.stringify(result))).toBe(QUEUE_LIMITS.maxBatchBytes);
      await rejects(queue.commit(claimed.lease, [{
        ...result, value: { ...value, syntheticPadding: `${value.syntheticPadding as string}x` },
      } as unknown as ResultRow]), "invalid-result");
      const repeated = "x".repeat(Math.floor(QUEUE_LIMITS.maxBatchBytes / 2) + 1);
      await rejects(queue.commit(claimed.lease, [{
        ...rows[0]!, value: { first: repeated, second: repeated },
      } as unknown as ResultRow]), "invalid-result");
      expect(required(await peer.readResults(claimed.snapshot.id)).rows).toEqual([]);
      expect(await queue.commit(claimed.lease, [result])).toMatchObject({ nextCursor: 1 });
      expect(required(await peer.readResults(claimed.snapshot.id)).rows).toEqual([result]);
    });

    it("detaches submitted definitions, returned leases and snapshots, and stored results", async () => {
      const input = structuredClone(charts());
      const expected = validateJob(input);
      const submitted = await queue.submit(input);
      alter(input.births[0]!.birth, "utc", "2002-03-04T05:06:07Z");
      alter(input.births[0]!, "id", "synthetic-mutated");
      alter(submitted, "status", "completed");
      const claimed = required(await peer.claim(owner));
      expect(claimed.job).toEqual(expected);
      const authorization = { jobId: claimed.lease.jobId, token: claimed.lease.token };
      alter(claimed.lease, "token", "synthetic-mutated-token");
      alter(claimed.snapshot.lease!, "expiresAt", 0);
      if (claimed.job.spec.kind !== "charts") throw new Error("Expected charts job");
      alter(claimed.job.spec.births[0]!.birth, "utc", "2002-03-04T05:06:07Z");
      const mutableRows = structuredClone(rows.slice(0, 1));
      await queue.commit(authorization, mutableRows);
      alter(mutableRows[0]!, "personId", "synthetic-mutated");
      alter(mutableRows[0]!.value, "engineVersion", "synthetic-mutated-version");
      const firstPage = required(await peer.readResults(authorization.jobId));
      expect(firstPage.rows).toEqual(rows.slice(0, 1));
      alter(firstPage.rows[0]!.value, "engineVersion", "synthetic-mutated-version");
      alter(firstPage.snapshot, "nextCursor", 123);
      const secondPage = required(await queue.readResults(authorization.jobId));
      expect(secondPage.rows).toEqual(rows.slice(0, 1));
      expect(secondPage.snapshot).toMatchObject({ status: "running", nextCursor: 1 });
      await queue.release(authorization);
      expect(required(await peer.claim(owner)).job).toEqual(expected);
    });

    it("rejects malformed claim options, owners and renewal durations without claiming", async () => {
      await queue.submit(charts());
      const invalidDurations: unknown[] = [undefined, null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, "100"];
      const options: unknown[] = [null, [], {}, { ...owner, extra: true }];
      for (const invalid of invalidDurations) options.push({ owner: owner.owner, leaseMs: invalid });
      for (const invalid of [undefined, null, "", "has space", " synthetic", "synthetic\n", "é", "a".repeat(QUEUE_LIMITS.maxOwnerLength + 1)]) {
        options.push({ ...owner, owner: invalid });
      }
      for (const option of options) await rejects(queue.claim(option as ClaimOptions), "invalid-argument");
      const claimed = required(await peer.claim({ ...owner, owner: "a".repeat(QUEUE_LIMITS.maxOwnerLength) }));
      expect(claimed.snapshot.claimCount).toBe(1);
      for (const duration of invalidDurations) await rejects(queue.renew(claimed.lease, duration as number), "invalid-argument");
      expect(await peer.getJob(claimed.snapshot.id)).toEqual(claimed.snapshot);
    });

    it("rejects malformed lease references without revealing submitted data", async () => {
      const claimed = await start();
      for (const lease of [null, [], {}, { jobId: claimed.snapshot.id }, { token: claimed.lease.token },
        { jobId: claimed.snapshot.id, token: "" }, { jobId: 1, token: claimed.lease.token }]) {
        await rejects(queue.commit(lease as LeaseRef, rows.slice(0, 1)), "lease-lost");
        await rejects(peer.release(lease as LeaseRef), "lease-lost");
        await rejects(queue.renew(lease as LeaseRef, 100), "lease-lost");
      }
      const marker = "SYNTHETIC_SUBMITTED_VALUE";
      try { await queue.release({ jobId: claimed.snapshot.id, token: marker }); } catch (error) {
        expect(error).toBeInstanceOf(QueueError);
        expect((error as Error).message).not.toContain(marker);
        expect((error as Error).cause).toBeUndefined();
      }
      expect(await peer.getJob(claimed.snapshot.id)).toEqual(claimed.snapshot);
    });

    it("rejects option and lease accessors without invoking code that could replace a lease", async () => {
      const claimed = await start();
      const getter = vi.fn(() => 1);
      const claimOptions = Object.defineProperty({ ...owner }, "owner", { get: getter, enumerable: true });
      await rejects(queue.claim(claimOptions), "invalid-argument");
      const pageOptions = Object.defineProperty({}, "cursor", { get: getter, enumerable: true });
      await rejects(peer.readResults(claimed.snapshot.id, pageOptions), "invalid-argument");
      const replaceLease = vi.fn(() => {
        void queue.release(claimed.lease).catch(() => {});
        void queue.claim(owner).catch(() => {});
        return claimed.lease.token;
      });
      const lease = Object.defineProperty({ jobId: claimed.snapshot.id }, "token", {
        get: replaceLease, enumerable: true,
      }) as LeaseRef;
      await rejects(queue.commit(lease, rows.slice(0, 1)), "lease-lost");
      await rejects(peer.renew(lease, 100), "lease-lost");
      await rejects(queue.release(lease), "lease-lost");
      expect(getter).not.toHaveBeenCalled();
      expect(replaceLease).not.toHaveBeenCalled();
      expect(await peer.getJob(claimed.snapshot.id)).toEqual(claimed.snapshot);
      expect(await queue.commit(claimed.lease, rows.slice(0, 1))).toMatchObject({ nextCursor: 1 });
    });

    it("rejects malformed ids and page options, including limits above the page budget", async () => {
      const claimed = await start();
      for (const id of [null, undefined, "", 1, {}, []]) {
        await rejects(queue.getJob(id as string), "invalid-argument");
        await rejects(peer.readResults(id as string), "invalid-argument");
      }
      const options: unknown[] = [null, [], { extra: true }, { cursor: undefined }, { limit: undefined }];
      for (const cursor of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "0"]) options.push({ cursor });
      for (const limit of [0, -1, 0.5, NaN, Infinity, QUEUE_LIMITS.maxPageRows + 1, "1"]) options.push({ limit });
      for (const option of options) await rejects(queue.readResults(claimed.snapshot.id, option as ResultPageOptions), "invalid-argument");
      expect(required(await peer.readResults(claimed.snapshot.id, { cursor: 0, limit: QUEUE_LIMITS.maxPageRows })).rows).toEqual([]);
    });

    it("closes idempotently and rejects every operation on the closed handle", async () => {
      const claimed = await start();
      await queue.close();
      await queue.close();
      for (const operation of [
        () => queue.submit(charts()), () => queue.getJob(claimed.snapshot.id),
        () => queue.claim(owner), () => queue.renew(claimed.lease, 100),
        () => queue.commit(claimed.lease, rows), () => queue.release(claimed.lease),
        () => queue.readResults(claimed.snapshot.id),
      ]) await rejects(operation(), "closed");
    });
  });
}
