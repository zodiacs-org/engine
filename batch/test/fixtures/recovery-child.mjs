import { writeSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";

// Test-only process controls. No failpoint is exported by the queue or build.
// Every row is calculated from the parent's invented job definition.
function emit(message) {
  writeSync(1, `${JSON.stringify(message)}\n`);
}

function fail() {
  writeSync(2, "Recovery child fixture failed.\n");
  process.exit(1);
}

const watchdog = setTimeout(fail, 30_000);

function pause(point, db, extra = {}) {
  emit({ event: "boundary", point, inTransaction: db?.isTransaction ?? false, ...extra });
  // The synchronous write reaches the parent before this thread stops. It
  // cannot continue a transaction or run shutdown handlers before SIGKILL.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
  fail();
}

function armSql(point) {
  const originalPrepare = DatabaseSync.prototype.prepare;
  const originalExec = DatabaseSync.prototype.exec;
  DatabaseSync.prototype.prepare = function (sql) {
    const statement = originalPrepare.call(this, sql);
    const matches = point === "after-row" ? /^\s*INSERT INTO batch_results\b/i.test(sql)
      : point === "after-checkpoint" && /^\s*UPDATE batch_jobs SET completed_tasks\b/i.test(sql);
    if (matches) {
      const db = this;
      const originalRun = statement.run;
      statement.run = function (...parameters) {
        const result = originalRun.apply(this, parameters);
        pause(point, db);
        return result;
      };
    }
    return statement;
  };
  DatabaseSync.prototype.exec = function (sql) {
    const committing = /^\s*COMMIT\s*;?\s*$/i.test(sql);
    if (committing && point === "before-commit") pause(point, this);
    const result = originalExec.call(this, sql);
    if (committing && point === "after-commit") pause(point, this);
    return result;
  };
}

function takeRows(executeSerial, job, cursor, count) {
  const rows = [];
  if (count === 0) return rows;
  for (const row of executeSerial(job, cursor)) {
    rows.push(row);
    if (rows.length === count) break;
  }
  return rows;
}

async function resume(queue, config, Scheduler, WorkerPool) {
  const dispatched = [];
  const claims = [];
  let snapshot = await queue.getJob(config.jobId);
  if (!snapshot) throw new Error("Missing synthetic job.");
  if (snapshot.status !== "completed" && snapshot.status !== "failed") {
    const originalClaim = queue.claim.bind(queue);
    queue.claim = async (options) => {
      const claimed = await originalClaim(options);
      if (claimed) claims.push(claimed.snapshot.nextCursor);
      return claimed;
    };
    const pool = new WorkerPool({ size: 2 });
    const originalRun = pool.run.bind(pool);
    pool.run = (item, signal) => {
      dispatched.push(item.index);
      return originalRun(item, signal);
    };
    const scheduler = new Scheduler(queue, {
      pool, owner: "synthetic-resumed", leaseMs: 100, heartbeatMs: 25, pollMs: 5,
    });
    const running = scheduler.run();
    void running.catch(() => {});
    try {
      while (snapshot.status !== "completed" && snapshot.status !== "failed") {
        await Promise.race([delay(5), running]);
        snapshot = await queue.getJob(config.jobId);
        if (!snapshot) throw new Error("Missing synthetic job.");
      }
    } finally {
      await scheduler.stop();
    }
    await running;
  }
  await queue.close();
  emit({ event: "resumed", snapshot, dispatched, claims });
  clearTimeout(watchdog);
  process.disconnect();
}

async function schedulerCrash(queue, config, Scheduler, WorkerPool) {
  const submitted = await queue.submit(config.spec, config.submitOptions);
  const pool = new WorkerPool({ size: 2 });
  const originalRun = pool.run.bind(pool);
  const originalClaim = queue.claim.bind(queue);
  const originalCommit = queue.commit.bind(queue);
  const dispatched = [];
  let markHeld;
  const heldResult = new Promise((resolve) => { markHeld = resolve; });
  let lease;
  let prefixCommitted = false;
  queue.claim = async (options) => {
    const claimed = await originalClaim(options);
    lease = claimed?.lease;
    return claimed;
  };
  queue.commit = async (ref, rows) => {
    const snapshot = await originalCommit(ref, rows);
    if (snapshot.nextCursor === 1) {
      prefixCommitted = true;
      emit({ event: "prepared", snapshot, lease });
    }
    return snapshot;
  };
  pool.run = async (item, signal) => {
    dispatched.push(item.index);
    const row = await originalRun(item, signal);
    if (item.index === 1) {
      // The real worker has calculated this row, but delivery to the scheduler
      // stays pending so a later row can enter its out-of-order buffer.
      markHeld();
      await new Promise((_, reject) => {
        const abort = () => reject(new Error("Synthetic held row aborted."));
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      });
    }
    if (item.index === 2) {
      await heldResult;
      if (!prefixCommitted) throw new Error("Missing synthetic prefix.");
      emit({ event: "buffered", index: item.index });
      // Let the pool promise and scheduler's completion handler settle first.
      setImmediate(() => {
        void queue.getJob(submitted.id).then((snapshot) => {
          if (snapshot?.nextCursor !== 1) fail();
          pause("buffered-results", undefined, { snapshot, lease, dispatched });
        }).catch(fail);
      });
    }
    return row;
  };
  const scheduler = new Scheduler(queue, {
    pool, owner: "synthetic-crashed", leaseMs: 100, heartbeatMs: 25, pollMs: 5,
  });
  await scheduler.run();
  throw new Error("Synthetic crash boundary was not reached.");
}

async function main(config) {
  const { SqliteQueue, Scheduler, WorkerPool, executeSerial } = await import(config.entryUrl);
  const queue = new SqliteQueue(config.filename, { now: () => config.now });
  if (config.mode === "resume") return resume(queue, config, Scheduler, WorkerPool);
  if (config.mode === "scheduler") return schedulerCrash(queue, config, Scheduler, WorkerPool);
  if (config.mode === "submit") {
    armSql(config.point ?? "after-commit");
    await queue.submit(config.spec, config.submitOptions);
  } else if (config.mode === "claim") {
    armSql(config.point);
    await queue.claim({ owner: "synthetic-crashed", leaseMs: 100 });
  } else if (config.mode === "commit") {
    const submitted = await queue.submit(config.spec, config.submitOptions);
    const claimed = await queue.claim({ owner: "synthetic-crashed", leaseMs: 100 });
    if (!claimed || claimed.snapshot.id !== submitted.id) throw new Error("Missing synthetic claim.");
    const prefix = config.prefix ?? 1;
    if (prefix > 0) {
      await queue.commit(claimed.lease, takeRows(executeSerial, claimed.job, 0, prefix));
    }
    const snapshot = await queue.getJob(submitted.id);
    emit({ event: "prepared", snapshot, lease: claimed.lease });
    const count = config.finalBatch ? claimed.job.totalTasks - prefix : 2;
    const rows = takeRows(executeSerial, claimed.job, prefix, count);
    armSql(config.point);
    await queue.commit(claimed.lease, rows);
  }
  throw new Error("Synthetic crash boundary was not reached.");
}

process.once("message", (config) => { void main(config).catch(fail); });
process.once("disconnect", () => { clearTimeout(watchdog); });
