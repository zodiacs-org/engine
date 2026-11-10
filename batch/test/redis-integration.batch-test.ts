import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { executeSerial } from "../src/execution.js";
import type { ResultRow } from "../src/execution.js";
import { createControlServer } from "../src/http-control.js";
import type { ControlServer } from "../src/http-control.js";
import type { JobSpec, Person } from "../src/model.js";
import type { JobSnapshot } from "../src/queue.js";
import { RedisQueue } from "../src/redis-queue.js";
import { Scheduler } from "../src/scheduler.js";
import { validateJob } from "../src/validation.js";
import { WorkerPool } from "../src/worker-pool.js";
import { workItemAt } from "../src/work.js";
import { RedisMockServer } from "./redis-mock.js";

const project = fileURLToPath(new URL("../", import.meta.url));
let scratch: string;
let workerUrl: URL;
const requests: ClientRequest[] = [];
const controls: ControlServer[] = [];
const queues: RedisQueue[] = [];
const pools: WorkerPool[] = [];
const schedulers: Scheduler[] = [];
const unblock: (() => void)[] = [];

// Invented people. Expected calculations check transport parity only, not
// astronomical accuracy. Redis is mocked; HTTP sockets and workers are real.
const people: readonly Person[] = [
  { id: "synthetic-redis-a", birth: { utc: "2001-02-03T04:05:06Z", latitude: 12.125, longitude: 34.375 } },
  { id: "synthetic-redis-b", birth: { utc: "1998-07-08T09:10:11Z", timeKnown: false } },
  { id: "synthetic-redis-c", birth: { utc: "1904-05-06T07:08:09Z", latitude: -23.25, longitude: 45.625 } },
];
const workloads: readonly JobSpec[] = [
  { version: 1, kind: "charts", births: people },
  {
    version: 1, kind: "transit-grid", births: people.slice(0, 2),
    start: "2005-06-07T08:09:10Z", end: "2005-06-07T08:09:10.003Z", stepMs: 1,
  },
  { version: 1, kind: "synastry-matrix", people },
];

beforeAll(() => {
  mkdirSync(`${project}/.generated`, { recursive: true });
  scratch = mkdtempSync(`${project}/.generated/redis-integration-`);
  execFileSync(process.execPath, [`${project}/scripts/build.mjs`, "--outdir", scratch], { stdio: "pipe" });
  workerUrl = pathToFileURL(`${scratch}/worker-entry.js`);
}, 15_000);

afterEach(async () => {
  for (const release of unblock.splice(0)) release();
  for (const connection of requests.splice(0)) connection.destroy();
  await Promise.all(controls.splice(0).map((control) => control.close()));
  await Promise.allSettled(schedulers.splice(0).map((scheduler) => scheduler.stop()));
  await Promise.all(pools.splice(0).map((pool) => pool.close()));
  await Promise.all(queues.splice(0).map((queue) => queue.close()));
  vi.restoreAllMocks();
});

afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => { resolve = yes; });
  return { promise, resolve };
}

async function fixture() {
  const server = new RedisMockServer(() => 1_700_000_000_123);
  const apiClient = server.client();
  const workerClient = server.client();
  const key = "synthetic-integration";
  const queue = new RedisQueue({ client: apiClient, key });
  const workerQueue = new RedisQueue({ client: workerClient, key });
  queues.push(queue, workerQueue);
  const control = createControlServer(queue, { streamPollMs: 5 });
  controls.push(control);
  await new Promise<void>((resolve, reject) => {
    control.server.once("error", reject);
    control.server.listen(0, "127.0.0.1", () => {
      control.server.off("error", reject);
      resolve();
    });
  });
  const address = control.server.address();
  if (!address || typeof address === "string") throw new Error("Expected a loopback socket.");
  return { server, apiClient, workerClient, key, queue, workerQueue, base: `http://127.0.0.1:${address.port}` };
}

function executor(queue: RedisQueue) {
  const pool = new WorkerPool({ size: 2, workerUrl });
  pools.push(pool);
  const scheduler = new Scheduler(queue, { pool, pollMs: 5, owner: "synthetic-redis-worker" });
  schedulers.push(scheduler);
  return { pool, scheduler };
}

function open(url: string, options: RequestOptions = {}, body?: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const connection = request(url, { agent: false, ...options }, (response) => {
      response.on("error", () => {});
      resolve(response);
    });
    requests.push(connection);
    connection.once("error", reject);
    connection.end(body);
  });
}

function text(response: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));
    response.once("close", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function firstRow(response: IncomingMessage): Promise<ResultRow> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk]);
      const end = buffer.indexOf(10);
      if (end < 0) return;
      response.off("data", onData);
      response.off("close", onClose);
      try { resolve(JSON.parse(buffer.subarray(0, end).toString("utf8")) as ResultRow); }
      catch (error) { reject(error); }
    };
    const onClose = (): void => reject(new Error("Expected a complete NDJSON row before close."));
    response.on("data", onData);
    response.once("close", onClose);
  });
}

function ndjson(rows: readonly ResultRow[]): string {
  return rows.map((row) => JSON.stringify(row) + "\n").join("");
}

describe("mock Redis with real workers and HTTP control sockets", () => {
  it.each(workloads)("streams and resumes $kind with exact serial JSON parity", async (spec) => {
    const { server, workerClient, key, workerQueue, base } = await fixture();
    const expected = [...executeSerial(validateJob(spec))];
    const submitted = await open(`${base}/v1/jobs`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": "synthetic-http-replay" },
    }, JSON.stringify({ job: spec }));
    expect(submitted.statusCode).toBe(202);
    const { job } = JSON.parse(await text(submitted)) as { job: JobSnapshot };
    expect(job).toMatchObject({ status: "queued", nextCursor: 0, totalTasks: expected.length });
    const following = await open(`${base}/v1/jobs/${job.id}/results?follow=true`);
    expect(following.statusCode).toBe(200);
    expect(following.headers["content-type"]).toContain("application/x-ndjson");
    expect(following.complete).toBe(false);
    const retainedRow = firstRow(following);

    // Stop delivery of the first commit acknowledgement after the Lua write.
    // API clients can read its committed prefix while real workers are active.
    const committed = deferred();
    const resume = deferred();
    unblock.push(resume.resolve);
    const send = workerClient.sendCommand.bind(workerClient);
    let waiting = false;
    vi.spyOn(workerClient, "sendCommand").mockImplementation(async (args) => {
      const reply = await send(args);
      if (args[4] === "commit" && !waiting) {
        waiting = true;
        committed.resolve();
        await resume.promise;
      }
      return reply;
    });
    const { scheduler } = executor(workerQueue);
    const running = scheduler.run();
    void running.catch(() => {});
    await committed.promise;
    const retained = await retainedRow;
    expect(retained).toEqual(expected[0]);
    following.destroy();

    const finite = await open(`${base}/v1/jobs/${job.id}/results`);
    expect(await text(finite)).toBe(ndjson(expected.slice(0, 1)));
    expect(finite.complete).toBe(true);
    const progress = await open(`${base}/v1/jobs/${job.id}/progress`);
    expect(JSON.parse(await text(progress))).toMatchObject({ status: "running", nextCursor: 1, completedTasks: 1 });
    const resumed = await open(`${base}/v1/jobs/${job.id}/results?follow=true&cursor=${retained.nextCursor}`);
    const suffix = text(resumed);
    resume.resolve();
    expect(await suffix).toBe(ndjson(expected.slice(1)));
    expect(resumed.complete).toBe(true);
    await scheduler.stop();
    await running;

    const status = await open(`${base}/v1/jobs/${job.id}`);
    expect(JSON.parse(await text(status))).toMatchObject({ job: { status: "completed", nextCursor: expected.length } });
    const hash = server.getHash(key);
    for (const row of expected) {
      // These exact strings contain engine floating point values. A Lua JSON
      // decode/re-encode of result objects must not reduce their precision.
      expect(hash.get(`row:${job.id}:${row.index}`)).toBe(JSON.stringify(row));
    }
    const replay = await open(`${base}/v1/jobs`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": "synthetic-http-replay" },
    }, JSON.stringify({ job: spec }));
    expect(JSON.parse(await text(replay))).toMatchObject({ job: { id: job.id, status: "completed", claimCount: 1 } });
  }, 15_000);

  it("preserves opaque JSON extremes and escaped text through Redis storage and NDJSON", async () => {
    const { queue, workerQueue, server, key, base } = await fixture();
    const job = await queue.submit({ version: 1, kind: "charts", births: people.slice(0, 1) });
    const claimed = (await workerQueue.claim({ owner: "synthetic-transport", leaseMs: 100 }))!;
    // Synthetic transport values only. These are not ephemeris expectations.
    const row = {
      version: 1, kind: "charts", index: 0, nextCursor: 1, personId: people[0]!.id,
      value: {
        smallest: Number.MIN_VALUE, largest: Number.MAX_VALUE, exact: 1.0000000000000002,
        text: 'synthetic "quote" \\ slash\nline\ttab\u0000 星🌙', nested: [null, false, [], {}],
      },
    } as unknown as ResultRow;
    await workerQueue.commit(claimed.lease, [row]);
    expect(server.getHash(key).get(`row:${job.id}:0`)).toBe(JSON.stringify(row));
    const response = await open(`${base}/v1/jobs/${job.id}/results`);
    expect(await text(response)).toBe(ndjson([row]));
    expect(response.complete).toBe(true);
  });

  it("closes real workers after a Redis command rejection and keeps another handle usable", async () => {
    const { queue, workerQueue, workerClient } = await fixture();
    const validated = validateJob(workloads[0]);
    const job = await queue.submit(validated.spec);
    const { pool, scheduler } = executor(workerQueue);
    const task = workItemAt(validated, 0);
    await pool.run(task);
    const closed = vi.spyOn(pool, "close");
    workerClient.failNext("before", new Error("synthetic connection rejected"));
    await expect(scheduler.run()).rejects.toMatchObject({ name: "SchedulerError", code: "queue-failed" });
    expect(closed).toHaveBeenCalledTimes(1);
    await expect(pool.run(task)).rejects.toMatchObject({ code: "closed" });
    expect(await queue.getJob(job.id)).toMatchObject({ status: "queued", claimCount: 0, nextCursor: 0 });
  });
});
