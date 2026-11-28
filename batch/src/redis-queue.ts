import { randomUUID } from "node:crypto";
import type { ResultRow } from "./execution.js";
import {
  prepareResultBatch, prepareSubmission, queueFields, queueIdentifier, queueInteger,
  queueLeaseRef, queueOwner,
} from "./queue-data.js";
import { QUEUE_LIMITS, QueueError } from "./queue.js";
import type {
  ClaimedJob, ClaimOptions, JobLease, JobSnapshot, LeaseRef, QueueBackend,
  QueueErrorCode, ResultPage, ResultPageOptions, SubmitOptions,
} from "./queue.js";
import { REDIS_QUEUE_SCRIPT } from "./redis-script.js";
import { validateJob } from "./validation.js";

/** Connected client owned by the caller. Commands must not be silently replayed. */
export interface RedisQueueClient {
  sendCommand(args: readonly string[]): Promise<unknown>;
}

export interface RedisQueueOptions {
  readonly client: RedisQueueClient;
  /** Dedicated Redis hash key; no default, TTL, eviction or other writers. */
  readonly key: string;
}

// Only errors deliberately returned by our script cross the storage boundary.
const SCRIPT_ERRORS: readonly QueueErrorCode[] = [
  "invalid-argument", "lease-lost", "cursor-conflict", "invalid-result",
  "storage-failure", "storage-busy", "unsupported-schema", "idempotency-conflict",
];

function storageValue<T>(read: () => T): T {
  try { return read(); } catch { throw new QueueError("storage-failure"); }
}

function snapshot(value: unknown, expectedId?: string): JobSnapshot {
  return storageValue(() => {
    const fields = queueFields(value, [
      "id", "kind", "status", "totalTasks", "completedTasks", "nextCursor", "claimCount",
      "retry", "failureCount", "retryAt", "lastFailure", "createdAt", "updatedAt", "finishedAt", "lease",
    ]);
    queueIdentifier(fields.id);
    if (expectedId !== undefined && fields.id !== expectedId) throw new Error();
    if (!["charts", "transit-grid", "synastry-matrix"].includes(fields.kind as string)
      || !["queued", "running", "completed", "failed"].includes(fields.status as string)) throw new Error();
    const total = queueInteger(fields.totalTasks, 1);
    const cursor = queueInteger(fields.nextCursor, 0, total);
    if (fields.completedTasks !== cursor) throw new Error();
    queueInteger(fields.claimCount, 0);
    const retry = queueFields(fields.retry, ["maxAttempts", "delayMs"]);
    queueInteger(retry.maxAttempts, 1, QUEUE_LIMITS.maxAttempts);
    queueInteger(retry.delayMs, 0, QUEUE_LIMITS.maxRetryDelayMs);
    queueInteger(fields.failureCount, 0, retry.maxAttempts as number);
    queueInteger(fields.createdAt, 0);
    queueInteger(fields.updatedAt, 0);
    for (const field of ["retryAt", "finishedAt"] as const) {
      if (fields[field] !== null) queueInteger(fields[field], 0);
    }
    if (fields.lastFailure !== null) {
      const failure = queueFields(fields.lastFailure, ["code", "at", "cursor"]);
      if (failure.code !== "lease-expired" && failure.code !== "execution-failed") throw new Error();
      queueInteger(failure.at, 0);
      queueInteger(failure.cursor, 0, cursor);
    }
    if (fields.lease !== null) {
      const lease = queueFields(fields.lease, ["owner", "expiresAt"]);
      queueOwner(lease.owner);
      queueInteger(lease.expiresAt, 0);
    }
    if ((fields.status === "running") !== (fields.lease !== null)) throw new Error();
    const terminal = fields.status === "completed" || fields.status === "failed";
    if (terminal !== (fields.finishedAt !== null)
      || (fields.status === "completed") !== (cursor === total)
      || (fields.status === "failed") !== (fields.failureCount === retry.maxAttempts)
      || (fields.failureCount === 0) !== (fields.lastFailure === null)
      || (fields.status !== "queued" && fields.retryAt !== null)) throw new Error();
    return value as JobSnapshot;
  });
}

function jobLease(value: unknown): JobLease {
  return storageValue(() => {
    const fields = queueFields(value, ["jobId", "token", "owner", "expiresAt"]);
    return {
      jobId: queueIdentifier(fields.jobId), token: queueIdentifier(fields.token),
      owner: queueOwner(fields.owner), expiresAt: queueInteger(fields.expiresAt, 0),
    };
  });
}

function claimed(value: unknown): ClaimedJob {
  return storageValue(() => {
    const fields = queueFields(value, ["snapshot", "lease", "encoded"]);
    if (typeof fields.encoded !== "string") throw new Error();
    const job = validateJob(JSON.parse(fields.encoded) as unknown);
    const state = snapshot(fields.snapshot);
    const lease = jobLease(fields.lease);
    if (state.id !== lease.jobId || state.kind !== job.spec.kind || state.totalTasks !== job.totalTasks
      || state.lease?.owner !== lease.owner || state.lease.expiresAt !== lease.expiresAt) throw new Error();
    return { job, snapshot: state, lease };
  });
}

/**
 * Optional Redis backend. Each script observes or mutates a single dedicated
 * hash atomically. Result/spec JSON stays opaque in Lua to preserve numbers.
 * close() closes this handle only; it never closes the caller's connection.
 */
export class RedisQueue implements QueueBackend {
  readonly #client: RedisQueueClient;
  readonly #key: string;
  #closed = false;

  constructor(options: RedisQueueOptions) {
    const fields = queueFields(options, ["client", "key"]);
    const key = queueIdentifier(fields.key);
    if (/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.exec(key)?.[0] !== key) throw new QueueError("invalid-argument");
    if (!fields.client || typeof (fields.client as RedisQueueClient).sendCommand !== "function") {
      throw new QueueError("invalid-argument");
    }
    this.#client = fields.client as RedisQueueClient;
    this.#key = key;
  }

  #open(): void {
    if (this.#closed) throw new QueueError("closed");
  }

  async #request(operation: string, ...args: string[]): Promise<unknown> {
    this.#open();
    let reply: unknown;
    try {
      reply = await this.#client.sendCommand(["EVAL", REDIS_QUEUE_SCRIPT, "1", this.#key, operation, ...args]);
    } catch {
      // A connection loss may follow a successful write. Never replay here.
      throw new QueueError("storage-failure");
    }
    const fields = storageValue(() => {
      if (typeof reply !== "string") throw new Error();
      return queueFields(JSON.parse(reply) as unknown, ["ok", "error"]);
    });
    if (Object.keys(fields).length !== 1) throw new QueueError("storage-failure");
    if ("error" in fields) {
      if (!SCRIPT_ERRORS.includes(fields.error as QueueErrorCode)) throw new QueueError("storage-failure");
      throw new QueueError(fields.error as QueueErrorCode);
    }
    return fields.ok;
  }

  async submit(spec: unknown, options: SubmitOptions = {}): Promise<JobSnapshot> {
    this.#open();
    const { job, encoded, retry, idempotencyKey } = prepareSubmission(spec, options);
    return snapshot(await this.#request("submit", randomUUID(), encoded, job.spec.kind,
      String(job.totalTasks), String(retry.maxAttempts), String(retry.delayMs), idempotencyKey ?? ""));
  }

  async getJob(jobId: string): Promise<JobSnapshot | null> {
    this.#open();
    const id = queueIdentifier(jobId);
    const value = await this.#request("get", id);
    return value === null ? null : snapshot(value, id);
  }

  async claim(options: ClaimOptions): Promise<ClaimedJob | null> {
    this.#open();
    const fields = queueFields(options, ["owner", "leaseMs"]);
    const owner = queueOwner(fields.owner);
    const duration = queueInteger(fields.leaseMs, 1);
    const value = await this.#request("claim", randomUUID(), owner, String(duration));
    return value === null ? null : claimed(value);
  }

  async renew(lease: LeaseRef, leaseMs: number): Promise<JobLease> {
    this.#open();
    const ref = queueLeaseRef(lease);
    const duration = queueInteger(leaseMs, 1);
    const renewed = jobLease(await this.#request("renew", ref.jobId, ref.token, String(duration)));
    if (renewed.jobId !== ref.jobId || renewed.token !== ref.token) throw new QueueError("storage-failure");
    return renewed;
  }

  async commit(lease: LeaseRef, rows: readonly ResultRow[]): Promise<JobSnapshot> {
    this.#open();
    const ref = queueLeaseRef(lease);
    const current = claimed(await this.#request("prepareCommit", ref.jobId, ref.token));
    if (current.lease.jobId !== ref.jobId || current.lease.token !== ref.token) throw new QueueError("storage-failure");
    const encoded = prepareResultBatch(current.job, current.snapshot.nextCursor, rows);
    return snapshot(await this.#request("commit", ref.jobId, ref.token,
      String(current.snapshot.nextCursor), ...encoded), ref.jobId);
  }

  async release(lease: LeaseRef): Promise<JobSnapshot> {
    this.#open();
    const ref = queueLeaseRef(lease);
    return snapshot(await this.#request("release", ref.jobId, ref.token), ref.jobId);
  }

  async fail(lease: LeaseRef): Promise<JobSnapshot> {
    this.#open();
    const ref = queueLeaseRef(lease);
    return snapshot(await this.#request("fail", ref.jobId, ref.token), ref.jobId);
  }

  async readResults(jobId: string, options: ResultPageOptions = {}): Promise<ResultPage | null> {
    this.#open();
    const id = queueIdentifier(jobId);
    const fields = queueFields(options, ["cursor", "limit"]);
    const cursor = queueInteger("cursor" in fields ? fields.cursor : 0, 0);
    const limit = queueInteger("limit" in fields ? fields.limit : QUEUE_LIMITS.maxPageRows, 1, QUEUE_LIMITS.maxPageRows);
    const value = await this.#request("page", id, String(cursor), String(limit));
    if (value === null) return null;
    return storageValue(() => {
      const page = queueFields(value, ["snapshot", "rows", "nextCursor"]);
      const state = snapshot(page.snapshot, id);
      if (!Array.isArray(page.rows) || page.rows.length !== Math.min(limit, state.nextCursor - cursor)
        || page.nextCursor !== cursor + page.rows.length || (page.nextCursor as number) > state.nextCursor) throw new Error();
      const rows = page.rows.map((row: unknown, offset: number) => {
        if (typeof row !== "string") throw new Error();
        const parsed = JSON.parse(row) as ResultRow;
        if (parsed.index !== cursor + offset || parsed.nextCursor !== cursor + offset + 1
          || parsed.kind !== state.kind || parsed.version !== 1) throw new Error();
        return parsed;
      });
      return { rows, snapshot: state, nextCursor: page.nextCursor as number };
    });
  }

  async close(): Promise<void> {
    this.#closed = true;
  }
}
