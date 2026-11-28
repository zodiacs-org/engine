import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeSerial } from "../src/execution.js";
import type { ChartsJob } from "../src/model.js";
import type { ClaimedJob, QueueBackend } from "../src/queue.js";
import { validateJob } from "../src/validation.js";
import type { QueueFixture, QueueFixtureFactory } from "./queue-contract.js";

// Invented records. Engine values exercise result preservation, not accuracy.
const spec: ChartsJob = {
  version: 1, kind: "charts", births: [
    { id: "synthetic-retry-a", birth: { utc: "2001-02-03T04:05:06Z", timeKnown: false } },
    { id: "synthetic-retry-b", birth: { utc: "1998-07-08T09:10:11Z", latitude: 12, longitude: 34 } },
    { id: "synthetic-retry-c", birth: { utc: "1904-05-06T07:08:09Z", latitude: -23, longitude: 45 } },
  ],
};
const rows = [...executeSerial(validateJob(spec))];
const owner = { owner: "synthetic-retry-worker", leaseMs: 100 };

function required<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull();
  expect(value).not.toBeUndefined();
  return value!;
}

function alter(object: object, key: string, value: unknown): void {
  try { Reflect.set(object, key, value); }
  catch (error) { if (!(error instanceof TypeError)) throw error; }
}

/** Behavioral coverage shared by both backends, including independent handles. */
export function retryContract(name: string, create: QueueFixtureFactory): void {
  describe(`${name} retries and idempotency`, () => {
    let clock: number;
    let fixture: QueueFixture;
    let queue: QueueBackend;
    let peer: QueueBackend;

    beforeEach(async () => {
      clock = 1_700_000_000_000;
      fixture = await create(() => clock);
      ({ queue, peer } = fixture);
    });
    afterEach(async () => { await fixture?.cleanup(); });

    async function claim(): Promise<ClaimedJob> { return required(await peer.claim(owner)); }

    it("arbitrates simultaneous duplicate keys without inserting additional jobs", async () => {
      const submissions = await Promise.all(Array.from({ length: 12 }, (_, index) =>
        (index % 2 ? peer : queue).submit(spec, { idempotencyKey: "synthetic-duplicate" }),
      ));
      expect(new Set(submissions.map((job) => job.id)).size).toBe(1);
      expect(submissions.every((job) => job.claimCount === 0)).toBe(true);
      expect((await claim()).snapshot.id).toBe(submissions[0]!.id);
      expect(await queue.claim(owner)).toBeNull();
    });

    it("binds one payload when conflicting submissions compete for an unused key", async () => {
      const changed = { ...spec, births: spec.births.slice(1) };
      const outcomes = await Promise.allSettled([
        queue.submit(spec, { idempotencyKey: "synthetic-competing" }),
        peer.submit(changed, { idempotencyKey: "synthetic-competing" }),
      ]);
      expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.find((result) => result.status === "rejected"))
        .toMatchObject({ reason: { code: "idempotency-conflict" } });
      const firstWon = outcomes[0]!.status === "fulfilled";
      const expected = validateJob(firstWon ? spec : changed);
      const current = await claim();
      expect(current.job).toEqual(expected);
      expect(await peer.submit(firstWon ? spec : changed, { idempotencyKey: "synthetic-competing" }))
        .toEqual(current.snapshot);
      expect(await queue.claim(owner)).toBeNull();
    });

    it("matches canonical input and effective default policy and returns current progress", async () => {
      const submitted = await queue.submit(spec, { idempotencyKey: "synthetic-canonical" });
      const first = await claim();
      const progress = await peer.commit(first.lease, rows.slice(0, 1));
      const canonical = validateJob(spec).spec;
      expect(await queue.submit({ births: canonical.kind === "charts" ? canonical.births : [], kind: "charts", version: 1 }, {
        idempotencyKey: "synthetic-canonical", retry: { delayMs: 0, maxAttempts: 3 },
      })).toEqual(progress);
      expect(await peer.submit(spec, { retry: {}, idempotencyKey: "synthetic-canonical" })).toEqual(progress);
      expect(submitted.nextCursor).toBe(0);
      expect(JSON.stringify(progress)).not.toContain("synthetic-canonical");
    });

    it("detects changed payload, order and effective policy without leaking the key", async () => {
      const key = "SYNTHETIC_PRIVATE_KEY";
      const submitted = await queue.submit(spec, { idempotencyKey: key });
      const variants = [
        { ...spec, births: [...spec.births].reverse() },
        { ...spec, births: spec.births.slice(1) },
        { ...spec, births: [{ ...spec.births[0]!, id: "synthetic-changed" }, ...spec.births.slice(1)] },
        { ...spec, births: [{ ...spec.births[0]!, birth: { ...spec.births[0]!.birth, utc: "2001-02-03T04:05:07Z" } }, ...spec.births.slice(1)] },
      ];
      for (const changed of variants) {
        const failure: unknown = await peer.submit(changed, { idempotencyKey: key }).catch((error: unknown) => error);
        expect(failure).toMatchObject({ name: "QueueError", code: "idempotency-conflict" });
        expect((failure as Error).message).not.toContain(key);
        expect((failure as Error).cause).toBeUndefined();
      }
      for (const retry of [{ maxAttempts: 2 }, { delayMs: 1 }]) {
        await expect(queue.submit(spec, { idempotencyKey: key, retry })).rejects.toMatchObject({ code: "idempotency-conflict" });
      }
      expect(await peer.getJob(submitted.id)).toEqual(submitted);
      expect((await claim()).snapshot.id).toBe(submitted.id);
      expect(await peer.claim(owner)).toBeNull();
    });

    it("allows independent jobs without a key and distinct case-sensitive keys", async () => {
      const submitted = await Promise.all([
        queue.submit(spec), peer.submit(spec),
        queue.submit(spec, { idempotencyKey: "synthetic-A" }),
        peer.submit(spec, { idempotencyKey: "synthetic-a" }),
      ]);
      expect(new Set(submitted.map((job) => job.id)).size).toBe(submitted.length);
    });

    it("returns a keyed snapshot without consulting a clock needed only for new jobs", async () => {
      const options = { idempotencyKey: "synthetic-clock-replay" };
      const submitted = await queue.submit(spec, options);
      clock = NaN;
      expect(await peer.submit(spec, options)).toEqual(submitted);
      await expect(queue.submit(spec)).rejects.toMatchObject({ code: "invalid-argument" });
      expect(await peer.getJob(submitted.id)).toEqual(submitted);
    });

    it("keeps key bindings through completion and terminal failure", async () => {
      const completed = await queue.submit(spec, { idempotencyKey: "synthetic-completed" });
      const first = await claim();
      const final = await queue.commit(first.lease, rows);
      clock++;
      expect(await peer.submit(spec, { idempotencyKey: "synthetic-completed" })).toEqual(final);
      const failed = await queue.submit(spec, { idempotencyKey: "synthetic-failed", retry: { maxAttempts: 1 } });
      const second = await claim();
      expect(second.snapshot.id).toBe(failed.id);
      const terminal = await peer.fail(second.lease);
      expect(terminal.status).toBe("failed");
      clock++;
      expect(await queue.submit(spec, { retry: { maxAttempts: 1 }, idempotencyKey: "synthetic-failed" })).toEqual(terminal);
      expect(await peer.getJob(completed.id)).toEqual(final);
      expect(await queue.claim(owner)).toBeNull();
    });

    it("delays retries exactly until eligibility and skips delayed jobs in FIFO order", async () => {
      const earlier = await queue.submit(spec, { retry: { delayMs: 40 } });
      const first = await claim();
      const later = await peer.submit(spec);
      clock++;
      const failed = await queue.fail(first.lease);
      expect(failed).toMatchObject({
        id: earlier.id, status: "queued", claimCount: 1, failureCount: 1, retryAt: clock + 40,
        finishedAt: null, lease: null, lastFailure: { code: "execution-failed", at: clock, cursor: 0 },
      });
      const second = await claim();
      expect(second.snapshot.id).toBe(later.id);
      clock += 39;
      expect(await queue.claim(owner)).toBeNull();
      clock++;
      const retry = await claim();
      expect(retry.snapshot).toMatchObject({ id: earlier.id, status: "running", failureCount: 1, retryAt: null, claimCount: 2 });
      expect(retry.lease.token).not.toBe(first.lease.token);
      expect(retry.snapshot.lastFailure).toEqual(failed.lastFailure);
    });

    it("exhausts the failure budget, preserves committed rows and never reclaims terminal work", async () => {
      const submitted = await queue.submit(spec, { retry: { maxAttempts: 2 } });
      const first = await claim();
      await queue.commit(first.lease, rows.slice(0, 1));
      clock++;
      expect(await peer.fail(first.lease)).toMatchObject({ failureCount: 1, status: "queued", nextCursor: 1 });
      const second = await claim();
      expect(second.snapshot.nextCursor).toBe(1);
      await peer.commit(second.lease, rows.slice(1, 2));
      clock++;
      const terminal = await queue.fail(second.lease);
      expect(terminal).toMatchObject({
        status: "failed", failureCount: 2, claimCount: 2, nextCursor: 2, completedTasks: 2,
        finishedAt: clock, lease: null, retryAt: null,
        lastFailure: { code: "execution-failed", at: clock, cursor: 2 },
      });
      expect(await peer.readResults(submitted.id)).toEqual({ rows: rows.slice(0, 2), nextCursor: 2, snapshot: terminal });
      clock += 10_000;
      expect(await queue.claim(owner)).toBeNull();
      expect(await peer.getJob(submitted.id)).toEqual(terminal);
      await expect(queue.fail(second.lease)).rejects.toMatchObject({ code: "lease-lost" });
      await expect(queue.commit(second.lease, rows.slice(2))).rejects.toMatchObject({ code: "lease-lost" });
      await expect(peer.release(second.lease)).rejects.toMatchObject({ code: "lease-lost" });
    });

    it("does not charge graceful releases against the failure budget or erase failure history", async () => {
      await queue.submit(spec, { retry: { maxAttempts: 2 } });
      let current = await claim();
      for (let index = 0; index < 4; index++) {
        expect(await queue.release(current.lease)).toMatchObject({ failureCount: 0, retryAt: null, lastFailure: null });
        current = await claim();
      }
      const failed = await queue.fail(current.lease);
      current = await claim();
      expect(await peer.release(current.lease)).toMatchObject({ failureCount: 1, retryAt: null, lastFailure: failed.lastFailure });
      current = await claim();
      const completed = await queue.commit(current.lease, rows);
      expect(completed).toMatchObject({ status: "completed", failureCount: 1, claimCount: 7, lastFailure: failed.lastFailure });
    });

    it("fences stale, repeated and mismatched failure reports before and after retry", async () => {
      await queue.submit(spec);
      const first = await claim();
      await expect(queue.fail({ jobId: first.lease.jobId, token: "synthetic-wrong" })).rejects.toMatchObject({ code: "lease-lost" });
      await expect(queue.fail({ jobId: "synthetic-missing", token: first.lease.token })).rejects.toMatchObject({ code: "lease-lost" });
      const outcomes = await Promise.allSettled([queue.fail(first.lease), peer.fail(first.lease)]);
      expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "lease-lost" } });
      const current = await claim();
      await expect(queue.fail(first.lease)).rejects.toMatchObject({ code: "lease-lost" });
      await expect(peer.renew(first.lease, 100)).rejects.toMatchObject({ code: "lease-lost" });
      await expect(queue.release(first.lease)).rejects.toMatchObject({ code: "lease-lost" });
      expect(await peer.getJob(current.snapshot.id)).toEqual(current.snapshot);
      expect(current.snapshot.failureCount).toBe(1);
    });

    it("rejects malformed failure authority without reading accessor values", async () => {
      await queue.submit(spec);
      const first = await claim();
      const getter = vi.fn(() => first.lease.token);
      const invalid: unknown[] = [null, {}, [], { ...first.lease, extra: true },
        { ...first.lease, token: undefined }, { ...first.lease, jobId: 1 },
        { ...first.lease, token: "" },
        Object.defineProperty({ jobId: first.lease.jobId }, "token", { get: getter, enumerable: true }),
      ];
      for (const lease of invalid) {
        await expect(queue.fail(lease as Parameters<QueueBackend["fail"]>[0]))
          .rejects.toMatchObject({ code: "lease-lost" });
      }
      expect(getter).not.toHaveBeenCalled();
      expect(await peer.getJob(first.snapshot.id)).toEqual(first.snapshot);
    });

    it("atomically chooses completion or failure when the last commit races a failure", async () => {
      await queue.submit(spec, { retry: { maxAttempts: 1 } });
      const current = await claim();
      await queue.commit(current.lease, rows.slice(0, 2));
      const outcomes = await Promise.allSettled([
        peer.commit(current.lease, rows.slice(2)), queue.fail(current.lease),
      ]);
      expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "lease-lost" } });
      const final = required(await queue.readResults(current.snapshot.id));
      expect(["completed", "failed"]).toContain(final.snapshot.status);
      const completed = final.snapshot.status === "completed";
      expect(final.rows).toEqual(rows.slice(0, completed ? 3 : 2));
      expect(final.snapshot.failureCount).toBe(completed ? 0 : 1);
      expect(final.snapshot.lease).toBeNull();
    });

    it("counts expired leases once at the expiry time, including delayed recovery", async () => {
      await queue.submit(spec, { retry: { maxAttempts: 2, delayMs: 50 } });
      const first = await claim();
      await queue.commit(first.lease, rows.slice(0, 1));
      clock = first.lease.expiresAt;
      await expect(peer.fail(first.lease)).rejects.toMatchObject({ code: "lease-lost" });
      expect((await queue.getJob(first.snapshot.id))!.failureCount).toBe(0);
      expect(await peer.claim(owner)).toBeNull();
      const delayed = required(await queue.getJob(first.snapshot.id));
      expect(delayed).toMatchObject({
        status: "queued", failureCount: 1, claimCount: 1, retryAt: clock + 50, lease: null,
        lastFailure: { code: "lease-expired", at: clock, cursor: 1 },
      });
      for (let index = 0; index < 3; index++) expect(await queue.claim(owner)).toBeNull();
      expect(await peer.getJob(first.snapshot.id)).toEqual(delayed);
      clock += 49;
      expect(await queue.claim(owner)).toBeNull();
      clock++;
      const second = await claim();
      expect(second.snapshot).toMatchObject({ claimCount: 2, failureCount: 1, nextCursor: 1, retryAt: null });
      clock = second.lease.expiresAt + 500;
      expect(await queue.claim(owner)).toBeNull();
      const terminal = required(await peer.getJob(first.snapshot.id));
      expect(terminal).toMatchObject({
        status: "failed", failureCount: 2, lease: null, retryAt: null,
        finishedAt: second.lease.expiresAt, updatedAt: clock,
        lastFailure: { code: "lease-expired", at: second.lease.expiresAt, cursor: 1 },
      });
      expect((await queue.readResults(first.snapshot.id))!.rows).toEqual(rows.slice(0, 1));
    });

    it("claims immediately after an expired lease when its entire retry delay has passed", async () => {
      await queue.submit(spec, { retry: { delayMs: 50 } });
      const first = await claim();
      clock = first.lease.expiresAt + 50;
      const retry = await claim();
      expect(retry.snapshot).toMatchObject({ id: first.snapshot.id, claimCount: 2, failureCount: 1, retryAt: null });
      expect(retry.snapshot.lastFailure).toEqual({ code: "lease-expired", at: first.lease.expiresAt, cursor: 0 });
    });

    it("captures retry options and exposes detached nested policy and failure snapshots", async () => {
      const retry = { maxAttempts: 3, delayMs: 10 };
      const submitted = await queue.submit(spec, { retry });
      retry.maxAttempts = 1;
      retry.delayMs = 0;
      alter(submitted.retry, "maxAttempts", 100);
      expect((await peer.getJob(submitted.id))!.retry).toEqual({ maxAttempts: 3, delayMs: 10 });
      const first = await claim();
      const failed = await queue.fail(first.lease);
      alter(failed.lastFailure!, "cursor", 999);
      alter(failed.retry, "delayMs", 0);
      const stored = required(await peer.getJob(submitted.id));
      expect(stored.lastFailure).toEqual({ code: "execution-failed", at: clock, cursor: 0 });
      expect(stored.retry).toEqual({ maxAttempts: 3, delayMs: 10 });
      expect(await queue.claim(owner)).toBeNull();
    });

    it("validates submission options before claiming keys or mutating queue state", async () => {
      const invalidOptions: unknown[] = [
        null, [], { unknown: true }, { retry: null }, { retry: [] }, { retry: { extra: true } },
        { retry: undefined }, { idempotencyKey: undefined },
        ...[0, 101, -1, 0.5, NaN, Infinity, "3"].map((maxAttempts) => ({ retry: { maxAttempts } })),
        ...[-1, 86_400_001, 0.5, NaN, Infinity, "0"].map((delayMs) => ({ retry: { delayMs } })),
        ...["", "x".repeat(129), " bad", "bad ", "a/b", "_bad", "a\n", "a\0", "\u00e9", 1, null]
          .map((idempotencyKey) => ({ idempotencyKey })),
      ];
      const getter = vi.fn(() => "synthetic-getter");
      invalidOptions.push(Object.defineProperty({}, "idempotencyKey", { get: getter, enumerable: true }));
      invalidOptions.push({ retry: Object.defineProperty({}, "maxAttempts", { get: getter, enumerable: true }) });
      for (const options of invalidOptions) {
        await expect(queue.submit(spec, options as NonNullable<Parameters<QueueBackend["submit"]>[1]>))
          .rejects.toMatchObject({ code: "invalid-argument" });
      }
      expect(getter).not.toHaveBeenCalled();
      expect(await peer.claim(owner)).toBeNull();
      await expect(queue.submit({ ...spec, births: [] }, { idempotencyKey: "synthetic-unreserved" }))
        .rejects.toMatchObject({ name: "JobValidationError" });
      expect(await queue.submit(spec, {
        idempotencyKey: "a".repeat(128), retry: { maxAttempts: 100, delayMs: 86_400_000 },
      })).toMatchObject({ retry: { maxAttempts: 100, delayMs: 86_400_000 } });
      expect(await peer.submit(spec, { idempotencyKey: "synthetic-unreserved" })).toMatchObject({ status: "queued" });
    });

    it("saturates retry deadlines at the safe integer boundary without losing the failure", async () => {
      clock = Number.MAX_SAFE_INTEGER - 100;
      await queue.submit(spec, { retry: { delayMs: 1_000 } });
      const first = required(await queue.claim({ owner: owner.owner, leaseMs: 10 }));
      const delayed = await peer.fail(first.lease);
      expect(delayed).toMatchObject({ status: "queued", failureCount: 1, retryAt: Number.MAX_SAFE_INTEGER });
      expect(await queue.claim({ owner: owner.owner, leaseMs: 1 })).toBeNull();
      const other = await queue.submit(spec, { retry: { delayMs: 1_000 } });
      const expiring = required(await peer.claim({ owner: owner.owner, leaseMs: 10 }));
      expect(expiring.snapshot.id).toBe(other.id);
      clock = expiring.lease.expiresAt;
      expect(await queue.claim({ owner: owner.owner, leaseMs: 1 })).toBeNull();
      expect(await peer.getJob(other.id)).toMatchObject({ failureCount: 1, retryAt: Number.MAX_SAFE_INTEGER });
    });

    it("refuses failure reports on a closed handle", async () => {
      await queue.submit(spec);
      const first = await claim();
      await queue.close();
      await expect(queue.fail(first.lease)).rejects.toMatchObject({ code: "closed" });
    });
  });
}
