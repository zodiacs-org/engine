import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeSerial } from "../src/execution.js";
import type { ResultRow } from "../src/execution.js";
import type { ChartsJob } from "../src/model.js";
import { QueueError } from "../src/queue.js";
import type { ClaimedJob, JobSnapshot, QueueErrorCode } from "../src/queue.js";
import { RedisQueue } from "../src/redis-queue.js";
import type { RedisQueueOptions } from "../src/redis-queue.js";
import { REDIS_QUEUE_MAX_PENDING } from "../src/redis-script.js";
import { validateJob } from "../src/validation.js";
import { queueContract } from "./queue-contract.js";
import type { QueueFixtureFactory } from "./queue-contract.js";
import { RedisMockServer } from "./redis-mock.js";
import { retryContract } from "./retry-contract.js";

const key = "synthetic-batch:queue";
const owner = { owner: "synthetic-redis-worker", leaseMs: 100 };
// Invented instants and coordinates; values test storage, not accuracy.
const spec: ChartsJob = {
  version: 1, kind: "charts", births: [
    { id: "synthetic-redis-a", birth: { utc: "2001-02-03T04:05:06Z", timeKnown: false } },
    { id: "synthetic-redis-b", birth: { utc: "1998-07-08T09:10:11Z", latitude: 12, longitude: 34 } },
    { id: "synthetic-redis-c", birth: { utc: "1904-05-06T07:08:09Z", latitude: -23, longitude: 45 } },
  ],
};
const rows = [...executeSerial(validateJob(spec))];

function required<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull();
  expect(value).not.toBeUndefined();
  return value!;
}

async function rejects(promise: Promise<unknown>, code: QueueErrorCode = "storage-failure"): Promise<void> {
  const error: unknown = await promise.catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(QueueError);
  expect(error).toMatchObject({ name: "QueueError", code });
  expect((error as Error).message).not.toContain("SYNTHETIC_PRIVATE");
  expect((error as Error).cause).toBeUndefined();
}

const fixture: QueueFixtureFactory = async (now) => {
  const server = new RedisMockServer(now);
  const queue = new RedisQueue({ client: server.client(), key });
  const peer = new RedisQueue({ client: server.client(), key });
  return { queue, peer, cleanup: async () => { await queue.close(); await peer.close(); } };
};

queueContract("Redis Lua mock", fixture);
retryContract("Redis Lua mock", fixture);

describe("Redis adapter transport and persistence boundary", () => {
  let clock: number;
  let server: RedisMockServer;
  let client: ReturnType<RedisMockServer["client"]>;
  let queue: RedisQueue;
  let peer: RedisQueue;
  let opened: RedisQueue[];

  beforeEach(() => {
    clock = 1_700_000_000_000;
    server = new RedisMockServer(() => clock);
    client = server.client();
    queue = new RedisQueue({ client, key });
    peer = new RedisQueue({ client: server.client(), key });
    opened = [queue, peer];
  });

  afterEach(async () => { await Promise.all(opened.map((handle) => handle.close())); });

  function reopen(): RedisQueue {
    const handle = new RedisQueue({ client: server.client(), key });
    opened.push(handle);
    return handle;
  }

  async function start(): Promise<ClaimedJob> {
    await queue.submit(spec);
    return required(await queue.claim(owner));
  }

  it("uses an explicit single key and isolates namespaces on the same client", async () => {
    const otherKey = "synthetic-batch:other";
    const other = new RedisQueue({ client, key: otherKey });
    opened.push(other);
    const first = await queue.submit(spec, { idempotencyKey: "synthetic-same-key" });
    const second = await other.submit(spec, { idempotencyKey: "synthetic-same-key" });
    expect(second.id).not.toBe(first.id);
    expect(await other.getJob(first.id)).toBeNull();
    expect(await peer.getJob(second.id)).toBeNull();
    expect(required(await queue.claim(owner)).snapshot.id).toBe(first.id);
    expect(required(await other.claim(owner)).snapshot.id).toBe(second.id);
    expect(server.commands.every((command) => command[0] === "EVAL" && command[2] === "1"
      && [key, otherKey].includes(command[3]!))).toBe(true);
  });

  it("closes one handle without deleting data or disconnecting the caller's client", async () => {
    const claimed = await start();
    const before = server.commands.length;
    await queue.close();
    await queue.close();
    expect(server.commands).toHaveLength(before);
    expect(await peer.getJob(claimed.snapshot.id)).toEqual(claimed.snapshot);
    const shared = new RedisQueue({ client, key });
    opened.push(shared);
    expect(await shared.commit(claimed.lease, rows)).toMatchObject({ status: "completed" });
    await rejects(queue.getJob(claimed.snapshot.id), "closed");
  });

  it("does not reserve a submission key when the transport fails before execution", async () => {
    const before = server.getHash(key);
    client.failNext("before", new Error("SYNTHETIC_PRIVATE_CONNECTION"));
    await rejects(queue.submit(spec, { idempotencyKey: "synthetic-before-submit" }));
    expect(server.getHash(key)).toEqual(before);
    const different = { ...spec, births: spec.births.slice(1) };
    const submitted = await peer.submit(different, { idempotencyKey: "synthetic-before-submit" });
    expect(required(await peer.claim(owner)).snapshot.id).toBe(submitted.id);
    expect(await peer.claim(owner)).toBeNull();
  });

  it("recovers a lost submission acknowledgement through an explicit keyed replay", async () => {
    client.failNext("after", new Error("SYNTHETIC_PRIVATE_ACK"));
    await rejects(queue.submit(spec, { idempotencyKey: "synthetic-submit-ack" }));
    expect(server.commands).toHaveLength(1);
    const claimed = required(await peer.claim(owner));
    const replay = await queue.submit(spec, { idempotencyKey: "synthetic-submit-ack" });
    expect(replay).toEqual(claimed.snapshot);
    expect(await peer.claim(owner)).toBeNull();
  });

  it("retains an unacknowledged claim until expiry and accounts for it exactly once", async () => {
    const submitted = await queue.submit(spec);
    const before = server.commands.length;
    client.failNext("after", new Error("SYNTHETIC_PRIVATE_CLAIM_ACK"));
    await rejects(queue.claim(owner));
    expect(server.commands).toHaveLength(before + 1);
    const running = required(await peer.getJob(submitted.id));
    expect(running).toMatchObject({ status: "running", claimCount: 1, failureCount: 0 });
    expect(await peer.claim(owner)).toBeNull();
    clock = required(running.lease).expiresAt;
    const recovered = required(await reopen().claim(owner));
    expect(recovered.snapshot).toMatchObject({ id: submitted.id, claimCount: 2, failureCount: 1 });
    expect(await queue.claim(owner)).toBeNull();
    expect(await queue.commit(recovered.lease, rows)).toMatchObject({ status: "completed" });
  });

  it("retains a committed prefix after its acknowledgement is lost and never replays the write", async () => {
    const claimed = await start();
    const pause = client.deferNext("after");
    const before = server.commands.length;
    const pending = queue.commit(claimed.lease, rows.slice(0, 1));
    const rejected = rejects(pending);
    await pause.entered;
    client.failNext("after", new Error("SYNTHETIC_PRIVATE_COMMIT_ACK"));
    pause.release();
    await rejected;
    expect(server.commands).toHaveLength(before + 2);
    const page = required(await peer.readResults(claimed.snapshot.id));
    expect(page.rows).toEqual(rows.slice(0, 1));
    expect(page.snapshot).toMatchObject({ status: "running", nextCursor: 1 });
    await rejects(queue.commit(claimed.lease, rows.slice(0, 1)), "cursor-conflict");
    expect(await peer.commit(claimed.lease, rows.slice(1))).toMatchObject({ status: "completed", nextCursor: 3 });
  });

  it("observes completed output after losing the final commit acknowledgement", async () => {
    const claimed = await start();
    const pause = client.deferNext("after");
    const pending = queue.commit(claimed.lease, rows);
    const rejected = rejects(pending);
    await pause.entered;
    client.failNext("after");
    pause.release();
    await rejected;
    const page = required(await reopen().readResults(claimed.snapshot.id));
    expect(page).toMatchObject({ rows, nextCursor: 3, snapshot: { status: "completed", lease: null } });
    await rejects(queue.commit(claimed.lease, rows), "lease-lost");
    expect(await peer.claim(owner)).toBeNull();
  });

  it("does not charge an unacknowledged failure a second time when explicitly reported again", async () => {
    const claimed = await start();
    await peer.commit(claimed.lease, rows.slice(0, 1));
    const before = server.commands.length;
    client.failNext("after", new Error("SYNTHETIC_PRIVATE_FAIL_ACK"));
    await rejects(queue.fail(claimed.lease));
    expect(server.commands).toHaveLength(before + 1);
    expect(await peer.getJob(claimed.snapshot.id)).toMatchObject({ status: "queued", failureCount: 1, nextCursor: 1 });
    await rejects(queue.fail(claimed.lease), "lease-lost");
    const recovered = required(await reopen().claim(owner));
    expect(recovered.snapshot).toMatchObject({ failureCount: 1, nextCursor: 1 });
    expect(await peer.commit(recovered.lease, rows.slice(1))).toMatchObject({ status: "completed", failureCount: 1 });
  });

  it("keeps claim, renewal, release and failure state unchanged on pre-execution errors", async () => {
    const submitted = await queue.submit(spec);
    const queued = server.getHash(key);
    client.failNext("before");
    await rejects(queue.claim(owner));
    expect(server.getHash(key)).toEqual(queued);
    const claimed = required(await queue.claim(owner));
    expect(claimed.snapshot.id).toBe(submitted.id);
    for (const operation of [
      () => queue.renew(claimed.lease, 200),
      () => queue.release(claimed.lease),
      () => queue.fail(claimed.lease),
    ]) {
      const before = server.getHash(key);
      client.failNext("before", new Error("SYNTHETIC_PRIVATE_BEFORE"));
      await rejects(operation());
      expect(server.getHash(key)).toEqual(before);
    }
    expect(await peer.commit(claimed.lease, rows)).toMatchObject({ status: "completed" });
  });

  it("keeps rows and progress unchanged when a commit command fails before execution", async () => {
    const claimed = await start();
    const before = server.getHash(key);
    const pause = client.deferNext("after");
    const pending = queue.commit(claimed.lease, rows.slice(0, 1));
    const rejected = rejects(pending);
    await pause.entered;
    client.failNext("before");
    pause.release();
    await rejected;
    expect(server.getHash(key)).toEqual(before);
    expect(await peer.commit(claimed.lease, rows)).toMatchObject({ status: "completed" });
  });

  it("rechecks expiry at the final write after preparation has completed", async () => {
    const claimed = await start();
    const before = server.getHash(key);
    const pause = client.deferNext("after");
    const pending = queue.commit(claimed.lease, rows.slice(0, 1));
    const rejected = rejects(pending, "lease-lost");
    await pause.entered;
    clock = claimed.lease.expiresAt;
    pause.release();
    await rejected;
    expect(server.getHash(key)).toEqual(before);
    const resumed = required(await peer.claim(owner));
    expect(resumed.snapshot).toMatchObject({ nextCursor: 0, failureCount: 1 });
  });

  it("fences a replacement token at the final write even if the owner is unchanged", async () => {
    const claimed = await start();
    const pause = client.deferNext("after");
    const pending = queue.commit(claimed.lease, rows.slice(0, 1));
    const rejected = rejects(pending, "lease-lost");
    await pause.entered;
    await peer.release(claimed.lease);
    const replacement = required(await peer.claim(owner));
    pause.release();
    await rejected;
    expect(await peer.getJob(claimed.snapshot.id)).toEqual(replacement.snapshot);
    expect(required(await peer.readResults(claimed.snapshot.id)).rows).toEqual([]);
  });

  it("fences a competing committed cursor at the final write", async () => {
    const claimed = await start();
    const pause = client.deferNext("after");
    const pending = queue.commit(claimed.lease, rows.slice(0, 1));
    const rejected = rejects(pending, "cursor-conflict");
    await pause.entered;
    await peer.commit(claimed.lease, rows.slice(0, 1));
    pause.release();
    await rejected;
    expect(required(await peer.readResults(claimed.snapshot.id)).rows).toEqual(rows.slice(0, 1));
  });

  it("does not write after this handle closes during result preparation", async () => {
    const claimed = await start();
    const before = server.getHash(key);
    const pause = client.deferNext("after");
    const pending = queue.commit(claimed.lease, rows.slice(0, 1));
    const rejected = rejects(pending, "closed");
    await pause.entered;
    await queue.close();
    pause.release();
    await rejected;
    expect(server.getHash(key)).toEqual(before);
  });

  it("reopens with canonical definitions and committed rows, then resumes only the suffix", async () => {
    const submitted = await queue.submit(spec, { idempotencyKey: "synthetic-reopen" });
    const first = required(await queue.claim(owner));
    await queue.commit(first.lease, rows.slice(0, 1));
    await queue.close();
    await peer.close();
    const resumedQueue = reopen();
    expect(await resumedQueue.submit(spec, { idempotencyKey: "synthetic-reopen" })).toMatchObject({ id: submitted.id, nextCursor: 1 });
    expect(await resumedQueue.claim(owner)).toBeNull();
    clock = first.lease.expiresAt;
    const resumed = required(await resumedQueue.claim(owner));
    expect(resumed.job).toEqual(validateJob(spec));
    expect(resumed.snapshot).toMatchObject({ nextCursor: 1, claimCount: 2, failureCount: 1 });
    await rejects(resumedQueue.commit(first.lease, rows.slice(1)), "lease-lost");
    expect(await resumedQueue.commit(resumed.lease, rows.slice(1))).toMatchObject({ status: "completed" });
    expect(required(await reopen().readResults(submitted.id)).rows).toEqual(rows);
  });

  it("preserves exact floating values, safe integers, empty arrays and escaped strings", async () => {
    const claimed = await start();
    const result = {
      ...rows[0]!, value: {
        syntheticPrecision: 1.2345678901234567, syntheticSafeInteger: Number.MAX_SAFE_INTEGER,
        syntheticTiny: Number.MIN_VALUE, syntheticEmpty: [], syntheticNull: null,
        syntheticText: "synthetic/\\\"\n\u0000\ud83c\udf0c\ud800",
      },
    } as unknown as ResultRow;
    await queue.commit(claimed.lease, [result]);
    expect(required(await peer.readResults(claimed.snapshot.id)).rows).toEqual([result]);
  });

  it("preserves submission order when the server wall clock goes backwards", async () => {
    const first = await queue.submit(spec);
    clock -= 500;
    const second = await peer.submit(spec);
    clock -= 500;
    const third = await queue.submit(spec);
    expect(first.createdAt).toBeGreaterThan(second.createdAt);
    expect(second.createdAt).toBeGreaterThan(third.createdAt);
    expect([
      required(await queue.claim(owner)).snapshot.id,
      required(await peer.claim(owner)).snapshot.id,
      required(await queue.claim(owner)).snapshot.id,
    ]).toEqual([first.id, second.id, third.id]);
  });

  it("preserves timestamps at the safe integer boundary and refuses overflowing leases", async () => {
    clock = Number.MAX_SAFE_INTEGER - 1;
    const submitted = await queue.submit(spec);
    expect(submitted.createdAt).toBe(clock);
    const before = server.getHash(key);
    await rejects(queue.claim({ ...owner, leaseMs: 2 }), "invalid-argument");
    expect(server.getHash(key)).toEqual(before);
    const claimed = required(await queue.claim({ ...owner, leaseMs: 1 }));
    expect(claimed.lease.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    await rejects(queue.renew(claimed.lease, 2), "invalid-argument");
    expect(await peer.getJob(submitted.id)).toEqual(claimed.snapshot);
    clock++;
    await rejects(queue.release(claimed.lease), "lease-lost");
    await rejects(queue.claim({ ...owner, leaseMs: 1 }), "invalid-argument");
    expect(await peer.getJob(submitted.id)).toEqual(claimed.snapshot);
  });

  it("uses bounded result field reads and one final HSET for each mutation", async () => {
    const claimed = await start();
    const before = server.redisCommands.length;
    await queue.commit(claimed.lease, rows.slice(0, 1));
    const writes = server.redisCommands.slice(before);
    expect(writes.filter((command) => command[0] === "HSET")).toHaveLength(1);
    expect(writes.at(-1)?.[0]).toBe("HSET");
    const readStart = server.redisCommands.length;
    const page = required(await peer.readResults(claimed.snapshot.id, { limit: 1 }));
    expect(page.rows).toEqual(rows.slice(0, 1));
    expect(server.redisCommands.slice(readStart).some((command) => ["HGETALL", "HKEYS", "HVALS", "HSCAN"].includes(command[0]!))).toBe(false);
  });

  it("discards earlier staged expiry changes when a later pending record is malformed", async () => {
    const first = await queue.submit(spec, { retry: { maxAttempts: 1 } });
    const second = await queue.submit(spec);
    const firstClaim = required(await queue.claim(owner));
    expect(firstClaim.snapshot.id).toBe(first.id);
    expect(required(await queue.claim(owner)).snapshot.id).toBe(second.id);
    server.setHashField(key, `job:${second.id}`, '{"snapshot":"SYNTHETIC_PRIVATE_CORRUPTION"}');
    clock = firstClaim.lease.expiresAt;
    const before = server.getHash(key);
    const startCommands = server.redisCommands.length;
    await rejects(queue.claim(owner));
    expect(server.getHash(key)).toEqual(before);
    expect(server.redisCommands.slice(startCommands).some((command) => command[0] === "HSET")).toBe(false);
    expect(await peer.getJob(first.id)).toEqual(firstClaim.snapshot);
  });

  it.each(["[]", "{}", "null", '["synthetic-missing"]', "SYNTHETIC_PRIVATE_INVALID_PENDING"])
    ("discards final result rows and progress when pending metadata is invalid: %s", async (pending) => {
      const claimed = await start();
      await peer.commit(claimed.lease, rows.slice(0, 1));
      server.setHashField(key, "pending", pending);
      const before = server.getHash(key);
      const startCommands = server.redisCommands.length;
      await rejects(queue.commit(claimed.lease, rows.slice(1)));
      expect(server.getHash(key)).toEqual(before);
      expect(server.redisCommands.slice(startCommands).some((command) => command[0] === "HSET")).toBe(false);
      expect(required(await peer.readResults(claimed.snapshot.id)).rows).toEqual(rows.slice(0, 1));
    });

  it.each(["synthetic invalid", "synthetic\n", "a".repeat(81)])
    ("refuses a corrupted stored lease owner before renewing: %s", async (invalidOwner) => {
      const claimed = await start();
      const record = JSON.parse(required(server.getHash(key).get(`job:${claimed.snapshot.id}`))) as {
        snapshot: JobSnapshot; token: string;
      };
      const corrupted = {
        ...record,
        snapshot: { ...record.snapshot, lease: { owner: invalidOwner, expiresAt: claimed.lease.expiresAt } },
      };
      server.setHashField(key, `job:${claimed.snapshot.id}`, JSON.stringify(corrupted));
      const before = server.getHash(key);
      const startCommands = server.redisCommands.length;
      await rejects(queue.renew(claimed.lease, 200));
      expect(server.getHash(key)).toEqual(before);
      expect(server.redisCommands.slice(startCommands).some((command) => command[0] === "HSET")).toBe(false);
    });

  it("keeps keyed replays available at capacity and frees a slot on completion", async () => {
    const original = await queue.submit(spec, { idempotencyKey: "synthetic-capacity-replay" });
    const hash = server.getHash(key);
    const template = JSON.parse(required(hash.get(`job:${original.id}`))) as { snapshot: JobSnapshot; token: null };
    const encoded = required(hash.get(`spec:${original.id}`));
    const ids = [original.id];
    for (let index = 1; index < REDIS_QUEUE_MAX_PENDING; index++) {
      const id = `synthetic-capacity-${index}`;
      ids.push(id);
      server.setHashField(key, `job:${id}`, JSON.stringify({ ...template, snapshot: { ...template.snapshot, id } }));
      server.setHashField(key, `spec:${id}`, encoded);
    }
    server.setHashField(key, "pending", JSON.stringify(ids));
    const before = server.getHash(key);
    await rejects(queue.submit(spec), "storage-busy");
    expect(server.getHash(key)).toEqual(before);
    expect(await peer.submit(spec, { idempotencyKey: "synthetic-capacity-replay" })).toEqual(original);
    const claimed = required(await queue.claim(owner));
    expect(claimed.snapshot.id).toBe(original.id);
    await queue.commit(claimed.lease, rows);
    expect(await queue.submit(spec)).toMatchObject({ status: "queued" });
    expect(JSON.parse(required(server.getHash(key).get("pending")))).toHaveLength(REDIS_QUEUE_MAX_PENDING);
  }, 20_000);

  it("sweeps the full supported unfinished directory into one HSET when every attempt expires", async () => {
    await queue.submit(spec, { retry: { maxAttempts: 1 } });
    const original = required(await queue.claim(owner));
    const hash = server.getHash(key);
    const template = JSON.parse(required(hash.get(`job:${original.snapshot.id}`))) as { snapshot: JobSnapshot; token: string };
    const encoded = required(hash.get(`spec:${original.snapshot.id}`));
    const ids = [original.snapshot.id];
    for (let index = 1; index < REDIS_QUEUE_MAX_PENDING; index++) {
      const id = `synthetic-expiry-${index}`;
      ids.push(id);
      server.setHashField(key, `job:${id}`, JSON.stringify({ ...template, snapshot: { ...template.snapshot, id } }));
      server.setHashField(key, `spec:${id}`, encoded);
    }
    server.setHashField(key, "pending", JSON.stringify(ids));
    clock = original.lease.expiresAt + 10;
    const startCommands = server.redisCommands.length;
    expect(await peer.claim(owner)).toBeNull();
    const commands = server.redisCommands.slice(startCommands);
    expect(commands.filter((command) => command[0] === "HSET")).toHaveLength(1);
    expect(commands.at(-1)?.[0]).toBe("HSET");
    const final = server.getHash(key);
    expect(JSON.parse(required(final.get("pending")))).toEqual([]);
    for (const id of ids) {
      const record = JSON.parse(required(final.get(`job:${id}`))) as { snapshot: JobSnapshot; token: null };
      expect(record).toMatchObject({ token: null, snapshot: {
        id, status: "failed", failureCount: 1, claimCount: 1, lease: null,
        updatedAt: clock, finishedAt: original.lease.expiresAt,
        lastFailure: { code: "lease-expired", at: original.lease.expiresAt, cursor: 0 },
      } });
    }
  }, 20_000);
});

describe("Redis adapter configuration and reply validation", () => {
  it.each([
    undefined, null, [], {}, { key }, { client: {} }, { client: null, key },
    { client: {}, key }, { client: { sendCommand: 1 }, key },
    ...[undefined, null, "", "has space", "trailing\n", "queue/key", "{queue}", "a".repeat(129)]
      .map((invalidKey) => ({ client: { sendCommand: async (): Promise<string> => "{}" }, key: invalidKey })),
    { client: { sendCommand: async (): Promise<string> => "{}" }, key, extra: true },
  ])("refuses invalid explicit configuration %#", (options) => {
    expect(() => new RedisQueue(options as unknown as RedisQueueOptions)).toThrow(expect.objectContaining({ code: "invalid-argument" }));
  });

  it("refuses option accessors without invoking caller code", () => {
    const getter = vi.fn(() => key);
    const options = Object.defineProperty({ client: { sendCommand: async () => "{}" } }, "key", {
      get: getter, enumerable: true,
    });
    expect(() => new RedisQueue(options as unknown as RedisQueueOptions)).toThrow(expect.objectContaining({ code: "invalid-argument" }));
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([
    undefined, null, 1, {}, [], Buffer.from("{}"), "SYNTHETIC_PRIVATE_NOT_JSON", "[]", "null", "{}",
    '{"ok":null,"error":"lease-lost"}', '{"ok":null,"extra":true}',
    '{"error":"SYNTHETIC_PRIVATE_UNKNOWN"}', '{"error":null}', '{"ok":{"id":"SYNTHETIC_PRIVATE_BAD_STATE"}}',
  ])("sanitizes malformed response envelopes %#", async (reply) => {
    const sendCommand = vi.fn(async () => reply);
    const queue = new RedisQueue({ client: { sendCommand }, key });
    await rejects(queue.getJob("synthetic-job"));
    expect(sendCommand).toHaveBeenCalledTimes(1);
    await queue.close();
  });

  it("sanitizes synchronous and asynchronous transport errors without retaining their cause", async () => {
    for (const sendCommand of [
      () => { throw new Error("SYNTHETIC_PRIVATE_SYNC"); },
      async () => { throw new Error("SYNTHETIC_PRIVATE_ASYNC"); },
      async () => { throw new QueueError("lease-lost"); },
    ]) {
      const queue = new RedisQueue({ client: { sendCommand }, key });
      await rejects(queue.getJob("synthetic-job"));
      await queue.close();
    }
  });

  it.each(["storage-busy", "unsupported-schema", "lease-lost", "cursor-conflict", "idempotency-conflict"] as const)
    ("recognizes the script's fixed %s error envelope", async (code) => {
      const queue = new RedisQueue({ client: { sendCommand: async () => JSON.stringify({ error: code }) }, key });
      await rejects(queue.getJob("synthetic-job"), code);
      await queue.close();
    });

  it("refuses malformed snapshots rather than exposing unchecked metadata", async () => {
    const server = new RedisMockServer(() => 1_700_000_000_000);
    const source = new RedisQueue({ client: server.client(), key });
    const valid = await source.submit(spec);
    const variants: unknown[] = [
      { ...valid, nextCursor: -1 }, { ...valid, completedTasks: 1 },
      { ...valid, createdAt: Number.MAX_SAFE_INTEGER + 1 }, { ...valid, status: "unknown" },
      { ...valid, id: "synthetic-other-job" }, { ...valid, finishedAt: valid.createdAt },
      { ...valid, status: "completed", finishedAt: valid.createdAt },
      { ...valid, nextCursor: valid.totalTasks, completedTasks: valid.totalTasks },
      { ...valid, failureCount: 1 },
      { ...valid, retry: { maxAttempts: 0, delayMs: 0 } }, { ...valid, lease: { owner: "synthetic", expiresAt: 42 } },
      { ...valid, lastFailure: { code: "unknown", at: 0, cursor: 0 } },
    ];
    for (const value of variants) {
      const queue = new RedisQueue({ client: { sendCommand: async () => JSON.stringify({ ok: value }) }, key });
      await rejects(queue.getJob(valid.id));
      await queue.close();
    }
    await source.close();
  });

  it("refuses a foreign hash or wrong key type without changing its contents", async () => {
    for (const foreign of ["hash", "string"] as const) {
      const server = new RedisMockServer(() => 1_700_000_000_000);
      if (foreign === "hash") server.setHashField(key, "synthetic-foreign", "SYNTHETIC_PRIVATE_FOREIGN");
      else server.setString(key, "SYNTHETIC_PRIVATE_FOREIGN");
      const before = server.getHash(key);
      const queue = new RedisQueue({ client: server.client(), key });
      await rejects(queue.submit(spec), "unsupported-schema");
      await rejects(queue.claim(owner), "unsupported-schema");
      expect(server.getHash(key)).toEqual(before);
      expect(server.redisCommands.some((command) => command[0] === "HSET")).toBe(false);
      await queue.close();
    }
  });

  it("returns null for absent reads without creating storage", async () => {
    const server = new RedisMockServer(() => 1_700_000_000_000);
    const queue = new RedisQueue({ client: server.client(), key });
    const before = server.getHash(key);
    expect(await queue.getJob("synthetic-missing")).toBeNull();
    expect(await queue.readResults("synthetic-missing")).toBeNull();
    expect(server.getHash(key)).toEqual(before);
    expect(server.redisCommands.some((command) => command[0] === "HSET")).toBe(false);
    await queue.close();
  });

  it("refuses an unsupported schema version on reads and writes without mutating the hash", async () => {
    const server = new RedisMockServer(() => 1_700_000_000_000);
    const queue = new RedisQueue({ client: server.client(), key });
    const submitted = await queue.submit(spec);
    server.setHashField(key, "schema", "SYNTHETIC_PRIVATE_UNSUPPORTED_SCHEMA");
    const before = server.getHash(key);
    for (const operation of [
      () => queue.getJob(submitted.id), () => queue.readResults(submitted.id),
      () => queue.submit(spec), () => queue.claim(owner),
    ]) await rejects(operation(), "unsupported-schema");
    expect(server.getHash(key)).toEqual(before);
    await queue.close();
  });
});
