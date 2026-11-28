import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  MemoryQueue, SqliteQueue, Scheduler, WorkerPool, resultLines, validateJob, workItemAt,
} from "../src/index.js";
import type { JobSnapshot, QueueBackend, TaskPool } from "../src/index.js";
import { FILE_LIMIT, PROFILES, workloadSpec } from "./model.js";
import type { Backend, Profile, Sample, Workload } from "./model.js";

export interface CellConfig {
  backend: Backend;
  workload: Workload;
  workers: number;
  repetition: number;
  profile: Profile;
  expectedDigest: string;
}

/** Each sample uses a fresh process and pool; only its bounded jobs share workers. */
export async function runCell(config: CellConfig, generatedRoot: string) {
  const settings = PROFILES[config.profile];
  const spec = workloadSpec(config.workload);
  const job = validateJob(spec);
  mkdirSync(generatedRoot, { recursive: true });
  const scratch = mkdtempSync(join(generatedRoot, "cell-"));
  const pool = new WorkerPool({ size: config.workers });
  // The scheduler closes this borrowed view; this sample owns the real pool.
  const borrowed: TaskPool = {
    capacity: pool.capacity, run: pool.run.bind(pool), close: async () => {},
  };
  const sample: Sample = {
    backend: config.backend, workload: config.workload, workers: config.workers,
    repetition: config.repetition, status: "failed", elapsedMs: null,
    completedRows: 0, jobsCompleted: 0, failureCount: 0, claimCount: 0,
    rowsPerSecond: null, error: null,
    counterScope: "acknowledged-snapshots",
  };
  const startedAt = new Date().toISOString();
  const wallStart = performance.now();
  let warmupMs = 0;
  let elapsedMs = 0;
  let maxObservedFileBytes = 0;
  let verifiedNdjsonBytes = 0;
  const jobElapsedMs: number[] = [];
  const checkFiles = (file: string) => {
    for (const suffix of ["", "-wal", "-shm"]) {
      let size = 0;
      try { size = statSync(file + suffix).size; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      maxObservedFileBytes = Math.max(maxObservedFileBytes, size);
      if (size >= FILE_LIMIT) throw new Error("file-size-limit");
    }
  };
  try {
    const warming = performance.now();
    // Every round fills every slot before awaiting results, warming all threads.
    for (let round = 0; round < settings.warmupRounds; round++) {
      await Promise.all(Array.from({ length: config.workers }, (_, slot) =>
        pool.run(workItemAt(job, (round * config.workers + slot) % job.totalTasks))));
    }
    warmupMs = performance.now() - warming;
    for (let index = 0; index < settings.jobsPerSample; index++) {
      const filename = join(scratch, "queue.sqlite");
      const queue = config.backend === "memory" ? new MemoryQueue() : new SqliteQueue(filename);
      let scheduler: Scheduler | undefined;
      let settled: Promise<void> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let observed: JobSnapshot | undefined;
      const observe = (snapshot: JobSnapshot) => {
        sample.completedRows += snapshot.completedTasks - (observed?.completedTasks ?? 0);
        sample.claimCount += snapshot.claimCount - (observed?.claimCount ?? 0);
        sample.failureCount += snapshot.failureCount - (observed?.failureCount ?? 0);
        observed = snapshot;
      };
      try {
        let finish!: (value: { snapshot: JobSnapshot; at: number }) => void;
        const terminal = new Promise<{ snapshot: JobSnapshot; at: number }>((resolve) => { finish = resolve; });
        const measured: QueueBackend = {
          submit: queue.submit.bind(queue), getJob: queue.getJob.bind(queue),
          claim: async (options) => {
            const claimed = await queue.claim(options);
            if (claimed) observe(claimed.snapshot);
            return claimed;
          },
          renew: queue.renew.bind(queue),
          release: queue.release.bind(queue), readResults: queue.readResults.bind(queue),
          close: queue.close.bind(queue),
          commit: async (lease, rows) => {
            const snapshot = await queue.commit(lease, rows);
            observe(snapshot);
            // File guard overhead is included in all SQLite timings.
            if (config.backend === "sqlite") checkFiles(filename);
            if (snapshot.status === "completed") finish({ snapshot, at: performance.now() });
            return snapshot;
          },
          fail: async (lease) => {
            const snapshot = await queue.fail(lease);
            observe(snapshot);
            if (snapshot.status === "failed") finish({ snapshot, at: performance.now() });
            return snapshot;
          },
        };
        const start = performance.now();
        const submitted = await queue.submit(spec);
        observe(submitted);
        scheduler = new Scheduler(measured, { pool: borrowed });
        settled = scheduler.run();
        const deadline = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("job-timeout")), 30_000);
        });
        const result = await Promise.race([
          terminal, deadline,
          settled.then((): never => { throw new Error("scheduler-ended"); }),
        ]);
        clearTimeout(timer);
        const duration = result.at - start;
        elapsedMs += duration;
        jobElapsedMs.push(duration);
        sample.elapsedMs = elapsedMs;
        if (result.snapshot.status !== "completed" || result.snapshot.nextCursor !== job.totalTasks) {
          throw new Error("job-failed");
        }
        await scheduler.stop();
        await settled;
        const hash = createHash("sha256");
        let rows = 0;
        // Verify stored transport output outside the timed interval, retaining a
        // single row at a time. No raw results are written or returned to parent.
        for await (const line of resultLines(queue, submitted.id, { pageSize: 1 })) {
          const row = JSON.parse(line) as { index: number; nextCursor: number; kind: string };
          if (row.index !== rows || row.nextCursor !== rows + 1 || row.kind !== config.workload) {
            throw new Error("result-framing");
          }
          hash.update(line);
          verifiedNdjsonBytes += Buffer.byteLength(line);
          rows++;
        }
        if (rows !== job.totalTasks || hash.digest("hex") !== config.expectedDigest) {
          throw new Error("serial-digest-mismatch");
        }
        sample.jobsCompleted++;
      } finally {
        clearTimeout(timer);
        try { if (scheduler) await scheduler.stop(); }
        finally {
          await queue.close();
          if (config.backend === "sqlite") checkFiles(filename);
          for (const suffix of ["", "-wal", "-shm"]) rmSync(filename + suffix, { force: true });
        }
      }
    }
    if (sample.failureCount || sample.claimCount !== settings.jobsPerSample) throw new Error("unexpected-retry");
    sample.status = "ok";
    sample.rowsPerSecond = sample.completedRows * 1_000 / elapsedMs;
  } catch (error) {
    // Only fixed codes from this harness or the service, never raw paths/data.
    const code = (error as { code?: unknown }).code;
    const fixed = ["file-size-limit", "job-timeout", "scheduler-ended", "job-failed", "result-framing",
      "serial-digest-mismatch", "unexpected-retry"];
    sample.error = error instanceof Error && fixed.includes(error.message) ? error.message
      : typeof code === "string" && /^[a-z-]{1,40}$/.test(code) ? code : "sample-failed";
  } finally {
    await pool.close();
    rmSync(scratch, { recursive: true, force: true });
  }
  return {
    ...sample, startedAt, wallMs: performance.now() - wallStart, warmupMs,
    warmupRows: config.workers * settings.warmupRounds,
    jobElapsedMs, maxObservedFileBytes, verifiedNdjsonBytes,
    serialNdjsonSha256: config.expectedDigest,
  };
}
