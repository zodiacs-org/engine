import { randomUUID } from "node:crypto";
import type { ResultRow } from "./execution.js";
import type { ValidatedJob } from "./model.js";
import {
  failureTransition, leaseDeadline, prepareResultBatch, prepareSubmission, queueFields, queueIdentifier, queueInteger,
  queueLeaseRef, queueOwner,
} from "./queue-data.js";
import { QUEUE_LIMITS, QueueError } from "./queue.js";
import type {
  ClaimedJob, ClaimOptions, JobLease, JobSnapshot, JobStatus, LeaseRef,
  QueueBackend, ResultPage, ResultPageOptions,
  JobFailure, RetryPolicy, SubmitOptions,
} from "./queue.js";

export interface MemoryQueueOptions {
  /** Backend epoch-millisecond clock; inject a controlled clock in tests. */
  readonly now?: () => number;
}

interface StoredJob {
  readonly id: string;
  readonly job: ValidatedJob;
  readonly createdAt: number;
  readonly rows: string[];
  readonly encoded: string;
  readonly retry: RetryPolicy;
  status: JobStatus;
  claimCount: number;
  failureCount: number;
  retryAt: number | null;
  lastFailure: JobFailure | null;
  updatedAt: number;
  finishedAt: number | null;
  lease: JobLease | null;
}

/**
 * One process, one shared instance. With ordinary data arguments, no await or
 * user callback occurs between a state check and its mutation. Promises provide
 * the durable-backend API,
 * not persistence or sharing across processes/worker threads.
 */
export class MemoryQueue implements QueueBackend {
  readonly #jobs = new Map<string, StoredJob>();
  readonly #keys = new Map<string, string>();
  readonly #now: () => number;
  #closed = false;

  constructor(options: MemoryQueueOptions = {}) {
    this.#now = options.now ?? Date.now;
  }

  #open(): void {
    if (this.#closed) throw new QueueError("closed");
  }

  #time(): number {
    return queueInteger(this.#now(), 0);
  }

  #snapshot(record: StoredJob): JobSnapshot {
    return {
      id: record.id,
      kind: record.job.spec.kind,
      status: record.status,
      totalTasks: record.job.totalTasks,
      completedTasks: record.rows.length,
      nextCursor: record.rows.length,
      claimCount: record.claimCount,
      retry: { ...record.retry },
      failureCount: record.failureCount,
      retryAt: record.retryAt,
      lastFailure: record.lastFailure ? { ...record.lastFailure } : null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      finishedAt: record.finishedAt,
      lease: record.lease ? { owner: record.lease.owner, expiresAt: record.lease.expiresAt } : null,
    };
  }

  #active(ref: LeaseRef, now: number): StoredJob {
    const record = this.#jobs.get(ref.jobId);
    if (!record || record.status !== "running" || !record.lease
      || record.lease.token !== ref.token || now >= record.lease.expiresAt) {
      throw new QueueError("lease-lost");
    }
    return record;
  }

  async submit(spec: unknown, options: SubmitOptions = {}): Promise<JobSnapshot> {
    this.#open();
    const { job, encoded, retry, idempotencyKey } = prepareSubmission(spec, options);
    const existing = (): JobSnapshot | null => {
      const previousId = idempotencyKey === null ? undefined : this.#keys.get(idempotencyKey);
      if (previousId === undefined) return null;
      const previous = this.#jobs.get(previousId)!;
      if (previous.encoded !== encoded || previous.retry.maxAttempts !== retry.maxAttempts || previous.retry.delayMs !== retry.delayMs) {
        throw new QueueError("idempotency-conflict");
      }
      return this.#snapshot(previous);
    };
    const replay = existing();
    if (replay) return replay;
    const now = this.#time();
    this.#open();
    // An injected clock is caller code; check again before reserving the key.
    const afterClock = existing();
    if (afterClock) return afterClock;
    let id = randomUUID();
    while (this.#jobs.has(id)) id = randomUUID();
    const record: StoredJob = {
      id, job, createdAt: now, updatedAt: now, finishedAt: null,
      status: "queued", claimCount: 0, lease: null, rows: [],
      encoded, retry, failureCount: 0, retryAt: null, lastFailure: null,
    };
    this.#jobs.set(id, record);
    if (idempotencyKey !== null) this.#keys.set(idempotencyKey, id);
    return this.#snapshot(record);
  }

  async getJob(jobId: string): Promise<JobSnapshot | null> {
    this.#open();
    const record = this.#jobs.get(queueIdentifier(jobId));
    return record ? this.#snapshot(record) : null;
  }

  async claim(options: ClaimOptions): Promise<ClaimedJob | null> {
    this.#open();
    const fields = queueFields(options, ["owner", "leaseMs"]);
    const owner = queueOwner(fields.owner);
    const now = this.#time();
    const expiresAt = leaseDeadline(now, fields.leaseMs);
    this.#open();
    for (const record of this.#jobs.values()) {
      if (record.status === "running" && record.lease && now >= record.lease.expiresAt) {
        const at = record.lease.expiresAt;
        Object.assign(record, failureTransition(record.failureCount, record.retry, "lease-expired", record.rows.length, at));
        record.lease = null;
        record.updatedAt = now;
      }
    }
    for (const record of this.#jobs.values()) {
      if (record.status !== "queued" || (record.retryAt !== null && now < record.retryAt)) continue;
      const claimCount = queueInteger(record.claimCount + 1, 1);
      const lease: JobLease = { jobId: record.id, token: randomUUID(), owner, expiresAt };
      record.lease = lease;
      record.status = "running";
      record.claimCount = claimCount;
      record.retryAt = null;
      record.updatedAt = now;
      return { job: record.job, snapshot: this.#snapshot(record), lease: { ...lease } };
    }
    return null;
  }

  async renew(lease: LeaseRef, leaseMs: number): Promise<JobLease> {
    this.#open();
    const ref = queueLeaseRef(lease);
    const now = this.#time();
    const expiresAt = leaseDeadline(now, leaseMs);
    this.#open();
    const record = this.#active(ref, now);
    const renewed = { ...record.lease!, expiresAt: Math.max(record.lease!.expiresAt, expiresAt) };
    record.lease = renewed;
    record.updatedAt = now;
    return { ...renewed };
  }

  async commit(lease: LeaseRef, rows: readonly ResultRow[]): Promise<JobSnapshot> {
    this.#open();
    const ref = queueLeaseRef(lease);
    // Validate the lease before inspecting potentially large result input.
    const record = this.#active(ref, this.#time());
    const cursor = record.rows.length;
    const encoded = prepareResultBatch(record.job, cursor, rows);
    // Preparation may take time. Fence again at the actual write boundary.
    const now = this.#time();
    this.#open();
    this.#active(ref, now);
    if (record.rows.length !== cursor) throw new QueueError("cursor-conflict");
    record.rows.push(...encoded);
    record.updatedAt = now;
    if (record.rows.length === record.job.totalTasks) {
      record.status = "completed";
      record.finishedAt = now;
      record.lease = null;
    }
    return this.#snapshot(record);
  }

  async release(lease: LeaseRef): Promise<JobSnapshot> {
    this.#open();
    const ref = queueLeaseRef(lease);
    const now = this.#time();
    this.#open();
    const record = this.#active(ref, now);
    record.status = "queued";
    record.lease = null;
    record.retryAt = null;
    record.updatedAt = now;
    return this.#snapshot(record);
  }

  async fail(lease: LeaseRef): Promise<JobSnapshot> {
    this.#open();
    const ref = queueLeaseRef(lease);
    const now = this.#time();
    this.#open();
    const record = this.#active(ref, now);
    Object.assign(record, failureTransition(record.failureCount, record.retry, "execution-failed", record.rows.length, now));
    record.lease = null;
    record.updatedAt = now;
    return this.#snapshot(record);
  }

  async readResults(jobId: string, options: ResultPageOptions = {}): Promise<ResultPage | null> {
    this.#open();
    const id = queueIdentifier(jobId);
    const fields = queueFields(options, ["cursor", "limit"]);
    const cursor = queueInteger("cursor" in fields ? fields.cursor : 0, 0);
    const limit = queueInteger("limit" in fields ? fields.limit : QUEUE_LIMITS.maxPageRows, 1, QUEUE_LIMITS.maxPageRows);
    this.#open();
    const record = this.#jobs.get(id);
    if (!record) return null;
    queueInteger(cursor, 0, record.rows.length);
    const rows = record.rows.slice(cursor, cursor + limit).map((row) => JSON.parse(row) as ResultRow);
    return { rows, nextCursor: cursor + rows.length, snapshot: this.#snapshot(record) };
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#jobs.clear();
    this.#keys.clear();
  }
}
