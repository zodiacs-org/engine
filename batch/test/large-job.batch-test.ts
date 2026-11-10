import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { executeSerial } from "../src/execution.js";
import type { ChartsResultRow } from "../src/execution.js";
import { MemoryQueue } from "../src/memory-queue.js";
import type { ChartsJob } from "../src/model.js";
import { createResultStream } from "../src/result-stream.js";
import { Scheduler } from "../src/scheduler.js";
import type { TaskPool } from "../src/scheduler.js";
import { validateJob } from "../src/validation.js";
import { WorkerPool } from "../src/worker-pool.js";

const project = fileURLToPath(new URL("../", import.meta.url));
const chartCount = 2_000;
let scratch: string;
let workerUrl: URL;

beforeAll(() => {
  mkdirSync(join(project, ".generated"), { recursive: true });
  scratch = mkdtempSync(join(project, ".generated", "large-job-"));
  execFileSync(process.execPath, [join(project, "scripts", "build.mjs"), "--outdir", scratch], { stdio: "pipe" });
  workerUrl = pathToFileURL(join(scratch, "worker-entry.js"));
}, 15_000);

afterAll(() => { if (scratch) rmSync(scratch, { recursive: true, force: true }); });

it("executes one 2000-chart job with bounded worker dispatch and incremental NDJSON verification", async () => {
  // Invented daily births with distinct identifiers. The serial digest checks
  // execution and transport parity, not physical astronomical accuracy.
  const spec: ChartsJob = {
    version: 1, kind: "charts",
    births: Array.from({ length: chartCount }, (_, index) => ({
      id: `synthetic-large-${index}`,
      birth: {
        utc: new Date(Date.UTC(1999, 0, 1, 4, 5, 6) + index * 86_400_000).toISOString(),
        latitude: 12.125, longitude: 34.375, houseSystem: "whole",
      },
    })),
  };
  const validated = validateJob(spec);
  expect(validated.totalTasks).toBe(chartCount);
  const serialHash = createHash("sha256");
  let serialBytes = 0;
  for (const row of executeSerial(validated)) {
    const line = JSON.stringify(row) + "\n";
    serialHash.update(line);
    serialBytes += Buffer.byteLength(line);
  }

  const queue = new MemoryQueue();
  const pool = new WorkerPool({ size: 2, workerUrl });
  let committed = 0;
  let dispatched = 0;
  let active = 0;
  let peakWindow = 0;
  const commit = queue.commit.bind(queue);
  queue.commit = async (lease, rows) => {
    const snapshot = await commit(lease, rows);
    committed = snapshot.nextCursor;
    return snapshot;
  };
  // Counters do not retain work items or result objects. This observes the real
  // scheduler's uncommitted window, including completed out-of-order rows.
  const observedPool: TaskPool = {
    capacity: pool.capacity,
    async run(item, signal) {
      expect(item.index).toBe(dispatched++);
      expect(++active).toBeLessThanOrEqual(pool.capacity);
      const window = item.index - committed + 1;
      peakWindow = Math.max(peakWindow, window);
      expect(window).toBeLessThanOrEqual(pool.capacity);
      try { return await pool.run(item, signal); }
      finally { active--; }
    },
    close: () => pool.close(),
  };
  const scheduler = new Scheduler(queue, { pool: observedPool, owner: "synthetic-large-worker", pollMs: 5 });
  const submitted = await queue.submit(spec);
  const controller = new AbortController();
  const source = createResultStream(queue, submitted.id, {
    follow: true, pollMs: 5, pageSize: 8, signal: controller.signal,
  });
  const streamedHash = createHash("sha256");
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let count = 0;
  let streamedBytes = 0;
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done) {
      try {
        streamedHash.update(chunk);
        streamedBytes += chunk.length;
        pending += decoder.write(chunk);
        let end: number;
        while ((end = pending.indexOf("\n")) >= 0) {
          const row = JSON.parse(pending.slice(0, end)) as ChartsResultRow;
          pending = pending.slice(end + 1);
          expect(row.kind).toBe("charts");
          expect(row.index).toBe(count);
          expect(row.nextCursor).toBe(count + 1);
          expect(row.personId).toBe(spec.births[count]!.id);
          count++;
        }
        done();
      } catch (error) { done(error as Error); }
    },
  });
  const running = scheduler.run();
  void running.catch(() => controller.abort());
  try {
    await pipeline(source, sink);
    await scheduler.stop();
    await running;
    expect(pending + decoder.end()).toBe("");
    expect(count).toBe(chartCount);
    expect(dispatched).toBe(chartCount);
    expect(committed).toBe(chartCount);
    expect(active).toBe(0);
    expect(peakWindow).toBe(pool.capacity);
    expect(streamedBytes).toBe(serialBytes);
    expect(streamedHash.digest("hex")).toBe(serialHash.digest("hex"));
    expect(await queue.getJob(submitted.id)).toMatchObject({
      status: "completed", totalTasks: chartCount, completedTasks: chartCount,
      nextCursor: chartCount, claimCount: 1, failureCount: 0, lastFailure: null, lease: null,
    });
  } finally {
    controller.abort();
    try { await scheduler.stop(); }
    finally {
      try { await pool.close(); }
      finally { await queue.close(); }
    }
  }
  // No export file or complete result collection is created. MemoryQueue owns
  // its retained results by design; the verifier retains only the current line.
}, 60_000);
