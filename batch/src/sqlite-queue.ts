import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { ResultRow } from "./execution.js";
import type { ValidatedJob } from "./model.js";
import {
  leaseDeadline, prepareResultBatch, queueFields, queueIdentifier, queueInteger,
  queueLeaseRef, queueOwner,
} from "./queue-data.js";
import { QUEUE_LIMITS, QueueError } from "./queue.js";
import type {
  ClaimedJob, ClaimOptions, JobLease, JobSnapshot, JobStatus, LeaseRef,
  QueueBackend, ResultPage, ResultPageOptions,
} from "./queue.js";
import { migrateQueue } from "./sqlite-schema.js";
import { validateJob } from "./validation.js";

export const SQLITE_QUEUE_DEFAULTS = Object.freeze({
  busyTimeoutMs: 1_000, maxBusyTimeoutMs: 60_000, minimumSqliteVersion: "3.51.3",
});

export interface SqliteQueueOptions {
  /** Shared host epoch-millisecond clock; override only for controlled tests. */
  readonly now?: () => number;
  /** Bounded SQLite lock wait. It blocks the calling thread. */
  readonly busyTimeoutMs?: number;
}

interface StoredJob {
  id: string;
  kind: ValidatedJob["spec"]["kind"];
  total_tasks: number;
  completed_tasks: number;
  status: JobStatus;
  claim_count: number;
  created_at: number;
  updated_at: number;
  finished_at: number | null;
  lease_token: string | null;
  lease_owner: string | null;
  lease_expires_at: number | null;
}

const STATUS_COLUMNS = `id, kind, total_tasks, completed_tasks, status, claim_count,
  created_at, updated_at, finished_at, lease_token, lease_owner, lease_expires_at`;

function requireSqliteRuntime(): void {
  // Earlier releases have the multi-connection WAL-reset corruption bug:
  // https://sqlite.org/wal.html#walresetbug . Require the fixed mainline floor.
  const version = process.versions.sqlite;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) throw new QueueError("unsupported-runtime");
  const installed = version.split(".").map(Number);
  const minimum = SQLITE_QUEUE_DEFAULTS.minimumSqliteVersion.split(".").map(Number);
  if (installed.some((part) => !Number.isSafeInteger(part))) throw new QueueError("unsupported-runtime");
  for (let index = 0; index < minimum.length; index++) {
    if (installed[index]! > minimum[index]!) return;
    if (installed[index]! < minimum[index]!) throw new QueueError("unsupported-runtime");
  }
}

function storageError(error: unknown): QueueError {
  if (error instanceof QueueError) return error;
  // SQLite extended codes retain the primary result code in the low byte.
  const code = (error as { errcode?: unknown } | null)?.errcode;
  if (typeof code === "number" && [5, 6].includes(code & 0xff)) return new QueueError("storage-busy");
  return new QueueError("storage-failure");
}

function snapshot(record: StoredJob): JobSnapshot {
  return {
    id: record.id, kind: record.kind, status: record.status,
    totalTasks: record.total_tasks, completedTasks: record.completed_tasks,
    nextCursor: record.completed_tasks, claimCount: record.claim_count,
    createdAt: record.created_at, updatedAt: record.updated_at, finishedAt: record.finished_at,
    lease: record.lease_owner === null ? null : {
      owner: record.lease_owner, expiresAt: record.lease_expires_at!,
    },
  };
}

/**
 * Default durable backend. Separate handles on the same local file share state.
 * Calls expose Promises for QueueBackend compatibility but SQLite IO is sync.
 * Computation and result preparation occur outside write transactions.
 */
export class SqliteQueue implements QueueBackend {
  readonly #db: DatabaseSync;
  readonly #now: () => number;
  #closed = false;

  constructor(filename: string, options: SqliteQueueOptions = {}) {
    const fields = queueFields(options, ["now", "busyTimeoutMs"]);
    if (typeof filename !== "string" || !filename.length || filename === ":memory:" || filename.includes("\0")
      || ("now" in fields && typeof fields.now !== "function")) throw new QueueError("invalid-argument");
    const timeout = queueInteger("busyTimeoutMs" in fields ? fields.busyTimeoutMs : SQLITE_QUEUE_DEFAULTS.busyTimeoutMs,
      0, SQLITE_QUEUE_DEFAULTS.maxBusyTimeoutMs);
    this.#now = fields.now as (() => number) | undefined ?? Date.now;
    requireSqliteRuntime();
    try {
      this.#db = new DatabaseSync(filename, { timeout, enableForeignKeyConstraints: true, allowExtension: false });
    } catch (error) { throw storageError(error); }
    try {
      this.#transaction("IMMEDIATE", () => migrateQueue(this.#db));
      const mode = this.#db.prepare("PRAGMA journal_mode = WAL").get();
      if (mode?.journal_mode !== "wal") throw new QueueError("storage-failure");
      this.#db.exec("PRAGMA synchronous = FULL");
    } catch (error) {
      try { this.#db.close(); } catch { /* Preserve the fixed original diagnostic. */ }
      this.#closed = true;
      throw storageError(error);
    }
  }

  #open(): void {
    if (this.#closed) throw new QueueError("closed");
  }

  #time(): number {
    return queueInteger(this.#now(), 0);
  }

  #transaction<T>(mode: "IMMEDIATE" | "DEFERRED", action: () => T): T {
    this.#open();
    let started = false;
    try {
      this.#db.exec(`BEGIN ${mode}`);
      started = true;
      const value = action();
      this.#db.exec("COMMIT");
      return value;
    } catch (error) {
      if (started && this.#db.isTransaction) {
        try { this.#db.exec("ROLLBACK"); } catch {
          // A handle whose transaction cannot be rolled back must not be reused.
          this.#closed = true;
          try { this.#db.close(); } catch { /* Preserve the fixed original diagnostic. */ }
        }
      }
      throw storageError(error);
    }
  }

  #record(id: string): StoredJob | null {
    try {
      return this.#db.prepare(`SELECT ${STATUS_COLUMNS} FROM batch_jobs WHERE id = ?`).get(id) as unknown as StoredJob | undefined ?? null;
    } catch (error) { throw storageError(error); }
  }

  #job(id: string): ValidatedJob {
    let encoded: string;
    try {
      const record = this.#db.prepare("SELECT spec_json FROM batch_jobs WHERE id = ?").get(id)!;
      encoded = record.spec_json as string;
    } catch (error) { throw storageError(error); }
    try { return validateJob(JSON.parse(encoded)); } catch { throw new QueueError("storage-failure"); }
  }

  #active(ref: LeaseRef, now: number): StoredJob {
    const record = this.#record(ref.jobId);
    if (!record || record.status !== "running" || record.lease_token !== ref.token
      || record.lease_expires_at === null || now >= record.lease_expires_at) throw new QueueError("lease-lost");
    return record;
  }

  async submit(spec: unknown): Promise<JobSnapshot> {
    this.#open();
    const job = validateJob(spec);
    const encoded = JSON.stringify(job.spec);
    return this.#transaction("IMMEDIATE", () => {
      const now = this.#time();
      const id = randomUUID();
      this.#db.prepare(`INSERT INTO batch_jobs (id, spec_json, kind, total_tasks, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(id, encoded, job.spec.kind, job.totalTasks, now, now);
      return snapshot(this.#record(id)!);
    });
  }

  async getJob(jobId: string): Promise<JobSnapshot | null> {
    this.#open();
    const record = this.#record(queueIdentifier(jobId));
    return record ? snapshot(record) : null;
  }

  async claim(options: ClaimOptions): Promise<ClaimedJob | null> {
    this.#open();
    const fields = queueFields(options, ["owner", "leaseMs"]);
    const owner = queueOwner(fields.owner);
    const leaseMs = queueInteger(fields.leaseMs, 1);
    return this.#transaction("IMMEDIATE", () => {
      const now = this.#time();
      const expiresAt = leaseDeadline(now, leaseMs);
      const record = this.#db.prepare(`SELECT ${STATUS_COLUMNS} FROM batch_jobs
        WHERE status != 'completed' AND (status = 'queued' OR lease_expires_at <= ?)
        ORDER BY sequence LIMIT 1`).get(now) as unknown as StoredJob | undefined;
      if (!record) return null;
      const job = this.#job(record.id);
      const count = queueInteger(record.claim_count + 1, 1);
      const lease: JobLease = { jobId: record.id, token: randomUUID(), owner, expiresAt };
      this.#db.prepare(`UPDATE batch_jobs SET status = 'running', claim_count = ?,
        lease_token = ?, lease_owner = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?`)
        .run(count, lease.token, owner, expiresAt, now, record.id);
      return { job, snapshot: snapshot(this.#record(record.id)!), lease };
    });
  }

  async renew(lease: LeaseRef, leaseMs: number): Promise<JobLease> {
    this.#open();
    const ref = queueLeaseRef(lease);
    const duration = queueInteger(leaseMs, 1);
    return this.#transaction("IMMEDIATE", () => {
      const now = this.#time();
      const deadline = leaseDeadline(now, duration);
      const record = this.#active(ref, now);
      const expiresAt = Math.max(record.lease_expires_at!, deadline);
      this.#db.prepare("UPDATE batch_jobs SET lease_expires_at = ?, updated_at = ? WHERE id = ?")
        .run(expiresAt, now, ref.jobId);
      return { ...ref, owner: record.lease_owner!, expiresAt };
    });
  }

  async commit(lease: LeaseRef, rows: readonly ResultRow[]): Promise<JobSnapshot> {
    this.#open();
    const ref = queueLeaseRef(lease);
    const record = this.#active(ref, this.#time());
    const cursor = record.completed_tasks;
    const encoded = prepareResultBatch(this.#job(ref.jobId), cursor, rows);
    // Waiting for the write lock and JSON preparation can both outlast a lease.
    // Recheck the token, deadline and cursor after obtaining that lock.
    return this.#transaction("IMMEDIATE", () => {
      const now = this.#time();
      const current = this.#active(ref, now);
      if (current.completed_tasks !== cursor) throw new QueueError("cursor-conflict");
      const insert = this.#db.prepare("INSERT INTO batch_results (job_id, cursor, row_json) VALUES (?, ?, ?)");
      encoded.forEach((row, offset) => insert.run(ref.jobId, cursor + offset, row));
      const nextCursor = cursor + encoded.length;
      const completed = nextCursor === current.total_tasks;
      this.#db.prepare(`UPDATE batch_jobs SET completed_tasks = ?, status = ?, updated_at = ?,
        finished_at = ?, lease_token = ?, lease_owner = ?, lease_expires_at = ? WHERE id = ?`)
        .run(nextCursor, completed ? "completed" : "running", now, completed ? now : null,
          completed ? null : current.lease_token, completed ? null : current.lease_owner,
          completed ? null : current.lease_expires_at, ref.jobId);
      return snapshot(this.#record(ref.jobId)!);
    });
  }

  async release(lease: LeaseRef): Promise<JobSnapshot> {
    this.#open();
    const ref = queueLeaseRef(lease);
    return this.#transaction("IMMEDIATE", () => {
      const now = this.#time();
      this.#active(ref, now);
      this.#db.prepare(`UPDATE batch_jobs SET status = 'queued', lease_token = NULL,
        lease_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ?`).run(now, ref.jobId);
      return snapshot(this.#record(ref.jobId)!);
    });
  }

  async readResults(jobId: string, options: ResultPageOptions = {}): Promise<ResultPage | null> {
    this.#open();
    const id = queueIdentifier(jobId);
    const fields = queueFields(options, ["cursor", "limit"]);
    const cursor = queueInteger("cursor" in fields ? fields.cursor : 0, 0);
    const limit = queueInteger("limit" in fields ? fields.limit : QUEUE_LIMITS.maxPageRows, 1, QUEUE_LIMITS.maxPageRows);
    return this.#transaction("DEFERRED", () => {
      const record = this.#record(id);
      if (!record) return null;
      queueInteger(cursor, 0, record.completed_tasks);
      const rows = this.#db.prepare(`SELECT row_json FROM batch_results WHERE job_id = ? AND cursor >= ?
        ORDER BY cursor LIMIT ?`).all(id, cursor, limit).map((row) => JSON.parse(row.row_json as string) as ResultRow);
      return { rows, nextCursor: cursor + rows.length, snapshot: snapshot(record) };
    });
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    try { this.#db.close(); } catch (error) { throw storageError(error); }
    this.#closed = true;
  }
}
