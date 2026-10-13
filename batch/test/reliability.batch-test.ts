import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { executeSerial } from "../src/execution.js";
import type { ResultRow } from "../src/execution.js";
import { createControlServer } from "../src/http-control.js";
import type { ControlServer } from "../src/http-control.js";
import { MemoryQueue } from "../src/memory-queue.js";
import type { JobSpec, Person } from "../src/model.js";
import type { JobSnapshot, QueueBackend } from "../src/queue.js";
import { RedisQueue } from "../src/redis-queue.js";
import { Scheduler } from "../src/scheduler.js";
import { SqliteQueue } from "../src/sqlite-queue.js";
import { validateJob } from "../src/validation.js";
import { WorkerPool } from "../src/worker-pool.js";
import { workItemAt } from "../src/work.js";
import { RedisMockServer } from "./redis-mock.js";

const project = fileURLToPath(new URL("../", import.meta.url));
let scratch: string;
let workerUrl: URL;
const requests = new Set<ClientRequest>();
const controls: ControlServer[] = [];
const queues: QueueBackend[] = [];
const pools: WorkerPool[] = [];
const schedulers: Scheduler[] = [];

// Invented people only. Serial comparisons establish integration and transport
// parity, not astronomical accuracy. Redis remains a production-Lua mock.
const people: readonly Person[] = [
  { id: "synthetic-reliability-a", birth: { utc: "2001-02-03T04:05:06Z", latitude: 12.125, longitude: 34.375 } },
  { id: "synthetic-reliability-b", birth: { utc: "1998-07-08T09:10:11Z", timeKnown: false } },
  { id: "synthetic-reliability-c", birth: { utc: "1904-05-06T07:08:09Z", latitude: -23.25, longitude: 45.625 } },
];
const workloads: readonly JobSpec[] = [
  { version: 1, kind: "charts", births: people },
  {
    version: 1, kind: "transit-grid", births: people.slice(0, 2),
    start: "2005-06-07T08:09:10Z", end: "2005-06-09T08:09:10Z", stepMs: 86_400_000,
  },
  { version: 1, kind: "synastry-matrix", people },
];
const retry = { maxAttempts: 3, delayMs: 0 };

beforeAll(() => {
  mkdirSync(join(project, ".generated"), { recursive: true });
  scratch = mkdtempSync(join(project, ".generated", "reliability-"));
  const build = join(scratch, "build");
  execFileSync(process.execPath, [join(project, "scripts", "build.mjs"), "--outdir", build], { stdio: "pipe" });
  workerUrl = pathToFileURL(join(build, "worker-entry.js"));
}, 15_000);

afterEach(async () => {
  for (const connection of requests) connection.destroy();
  await Promise.all(controls.splice(0).map((control) => control.close()));
  await Promise.allSettled(schedulers.splice(0).map((scheduler) => scheduler.stop()));
  await Promise.all(pools.splice(0).map((pool) => pool.close()));
  await Promise.all(queues.splice(0).map((queue) => queue.close()));
  vi.restoreAllMocks();
});

afterAll(() => { if (scratch) rmSync(scratch, { recursive: true, force: true }); });

interface Reply {
  readonly response: IncomingMessage;
  /** Resolves only on a clean HTTP message end, never a truncated close. */
  readonly body: Promise<string>;
}

function open(url: string, options: RequestOptions = {}, body?: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const connection = request(url, { agent: false, ...options }, (response) => {
      const body = new Promise<string>((complete, failed) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.once("error", failed);
        response.once("end", () => complete(Buffer.concat(chunks).toString("utf8")));
        response.once("aborted", () => failed(new Error("Synthetic reliability response was interrupted.")));
      });
      // A failed assertion may close pending following streams in afterEach.
      void body.catch(() => {});
      resolve({ response, body });
    });
    requests.add(connection);
    connection.once("close", () => requests.delete(connection));
    connection.once("error", reject);
    connection.setTimeout(15_000, () => connection.destroy(new Error("Synthetic reliability request timed out.")));
    connection.end(body);
  });
}

function submit(base: string, spec: JobSpec, key: string): Promise<Reply> {
  return open(`${base}/v1/jobs`, {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": key },
  }, JSON.stringify({ job: spec, retry }));
}

async function submitted(reply: Reply): Promise<JobSnapshot> {
  expect(reply.response.statusCode).toBe(202);
  const { job } = JSON.parse(await reply.body) as { job: JobSnapshot };
  expect(reply.response.complete).toBe(true);
  expect(reply.response.headers.location).toBe(`/v1/jobs/${job.id}`);
  return job;
}

async function listen(queue: QueueBackend): Promise<{ control: ControlServer; base: string }> {
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
  return { control, base: `http://127.0.0.1:${address.port}` };
}

function ndjson(rows: readonly ResultRow[]): string {
  return rows.map((row) => JSON.stringify(row) + "\n").join("");
}

describe.each(["memory", "sqlite", "mock-redis"] as const)("%s integrated reliability", (backend) => {
  it("resumes a mixed workload through reopened control, expired leases, worker retries and NDJSON cursors", async () => {
    let clock = 1_700_000_000_000;
    const now = () => clock;
    const memory = backend === "memory" ? new MemoryQueue({ now }) : undefined;
    const redis = backend === "mock-redis" ? new RedisMockServer(now) : undefined;
    const createQueue = (): QueueBackend => {
      const queue = memory ?? (redis
        ? new RedisQueue({ client: redis.client(), key: "synthetic-reliability" })
        : new SqliteQueue(join(scratch, "reliability.sqlite"), { now }));
      queues.push(queue);
      return queue;
    };
    let apiQueue = createQueue();
    let workerQueue = createQueue();
    let { control, base } = await listen(apiQueue);
    const jobs: JobSnapshot[] = [];
    const expected = workloads.map((spec) => [...executeSerial(validateJob(spec))]);
    for (const spec of workloads) {
      jobs.push(await submitted(await submit(base, spec, `synthetic-${spec.kind}`)));
    }
    expect(jobs.map((job) => job.status)).toEqual(workloads.map(() => "queued"));
    const first = jobs[0]!;
    const replay = await submitted(await submit(base, workloads[0]!, "synthetic-charts"));
    expect(replay).toEqual(first);
    const conflict = await submit(base, workloads[1]!, "synthetic-charts");
    expect(conflict.response.statusCode).toBe(409);
    expect(JSON.parse(await conflict.body)).toMatchObject({ error: { code: "idempotency-conflict" } });

    // Commit a genuine worker result, then abandon the unfinished lease. The
    // controlled clock makes recovery deterministic without a timing race.
    const abandoned = (await workerQueue.claim({ owner: "synthetic-abandoned", leaseMs: 100 }))!;
    expect(abandoned.snapshot.id).toBe(first.id);
    const seedingPool = new WorkerPool({ size: 1, workerUrl });
    pools.push(seedingPool);
    await workerQueue.commit(abandoned.lease, [await seedingPool.run(workItemAt(abandoned.job, 0))]);
    await seedingPool.close();
    const prefix = await open(`${base}/v1/jobs/${first.id}/results`);
    const retained = await prefix.body;
    expect(retained).toBe(ndjson(expected[0]!.slice(0, 1)));
    const cursor = (JSON.parse(retained) as ResultRow).nextCursor;
    const progress = await open(`${base}/v1/jobs/${first.id}/progress`);
    expect(JSON.parse(await progress.body)).toMatchObject({ status: "running", completedTasks: cursor, nextCursor: cursor });
    await control.close();

    // Memory has no persisted handle to reopen. SQLite opens the same file;
    // mocked Redis reconnects clients to the same simulated server state.
    if (backend !== "memory") {
      await apiQueue.close();
      await workerQueue.close();
      apiQueue = createQueue();
      workerQueue = createQueue();
    }
    ({ control, base } = await listen(apiQueue));
    clock += 100;
    await expect(workerQueue.commit(abandoned.lease, expected[0]!.slice(1, 2)))
      .rejects.toMatchObject({ code: "lease-lost" });
    const resumedJob = await submitted(await submit(base, workloads[0]!, "synthetic-charts"));
    expect(resumedJob).toMatchObject({ id: first.id, nextCursor: cursor, claimCount: 1 });

    const following: Reply[] = [];
    for (const [index, job] of jobs.entries()) {
      const stream = await open(`${base}/v1/jobs/${job.id}/results?follow=true&cursor=${index === 0 ? cursor : 0}`);
      expect(stream.response.statusCode).toBe(200);
      expect(stream.response.headers["content-type"]).toContain("application/x-ndjson");
      expect(stream.response.complete).toBe(false);
      following.push(stream);
    }

    const pool = new WorkerPool({ size: 2, workerUrl });
    pools.push(pool);
    const realRun = pool.run.bind(pool);
    let injected = false;
    const run = vi.spyOn(pool, "run").mockImplementation((item, signal) => {
      if (!injected && item.kind === "charts" && item.index === cursor) {
        injected = true;
        // Inject a rejected calculation inside a real worker, without altering
        // the saved definition. The retry receives the original valid item.
        return realRun({ ...item, person: { ...item.person, birth: { utc: "invalid-synthetic-instant" } } }, signal);
      }
      return realRun(item, signal);
    });
    const commit = vi.spyOn(workerQueue, "commit");
    const scheduler = new Scheduler(workerQueue, { pool, pollMs: 5, owner: "synthetic-recovered" });
    schedulers.push(scheduler);
    const running = scheduler.run();
    void running.catch(() => {});
    const streamed = await Promise.all(following.map((stream) => stream.body));
    await scheduler.stop();
    await running;
    expect(injected).toBe(true);

    for (const [index, job] of jobs.entries()) {
      const rows = expected[index]!;
      const start = index === 0 ? cursor : 0;
      expect(streamed[index]).toBe(ndjson(rows.slice(start)));
      expect(following[index]!.response.complete).toBe(true);
      const full = index === 0 ? retained + streamed[index]! : streamed[index]!;
      expect(full).toBe(ndjson(rows));
      const observed = full.trimEnd().split("\n").map((line) => JSON.parse(line) as ResultRow);
      expect(observed.map((row) => row.index)).toEqual(rows.map((row) => row.index));
      expect(observed.map((row) => row.nextCursor)).toEqual(rows.map((row) => row.index + 1));
      const final = await submitted(await submit(base, workloads[index]!, `synthetic-${job.kind}`));
      expect(final).toMatchObject({
        id: job.id, status: "completed", totalTasks: rows.length, completedTasks: rows.length,
        nextCursor: rows.length, lease: null, retryAt: null,
        claimCount: index === 0 ? 3 : 1, failureCount: index === 0 ? 2 : 0,
        lastFailure: index === 0 ? { code: "execution-failed", cursor } : null,
      });
      const status = await open(`${base}/v1/jobs/${job.id}`);
      expect(JSON.parse(await status.body)).toEqual({ job: final });
      const commits = commit.mock.calls.filter(([lease]) => lease.jobId === job.id).flatMap(([, rows]) => rows);
      expect(commits).toEqual(rows.slice(start));
    }
    // Claims/retries can repeat uncommitted calculation, but the stored prefix
    // is neither recalculated nor appended again by the recovering scheduler.
    const chartRuns = run.mock.calls.filter(([item]) => item.kind === "charts").map(([item]) => item.index);
    expect(chartRuns.every((index) => index >= cursor)).toBe(true);
    expect(chartRuns.filter((index) => index === cursor)).toHaveLength(2);
    expect(await workerQueue.claim({ owner: "synthetic-final-probe", leaseMs: 100 })).toBeNull();
  }, 20_000);
});
