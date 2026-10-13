import type { ResultRow } from "./execution.js";
import type { JobSpec, ValidatedJob } from "./model.js";

export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface RetryPolicy {
  /** Failed attempts allowed, including expired leases; graceful releases are free. */
  readonly maxAttempts: number;
  readonly delayMs: number;
}

export const RETRY_DEFAULTS: RetryPolicy = Object.freeze({ maxAttempts: 3, delayMs: 0 });

export interface SubmitOptions {
  readonly idempotencyKey?: string;
  readonly retry?: Partial<RetryPolicy>;
}

export interface JobFailure {
  readonly code: "execution-failed" | "lease-expired";
  readonly at: number;
  /** First uncommitted row when the failure was recorded. */
  readonly cursor: number;
}

/** Epoch milliseconds on the backend clock. Tokens are never in status views. */
export interface LeaseStatus {
  readonly owner: string;
  readonly expiresAt: number;
}

export interface JobSnapshot {
  readonly id: string;
  readonly kind: JobSpec["kind"];
  readonly status: JobStatus;
  readonly totalTasks: number;
  /** Only the contiguous, committed prefix counts as progress. */
  readonly completedTasks: number;
  readonly nextCursor: number;
  readonly claimCount: number;
  readonly retry: RetryPolicy;
  readonly failureCount: number;
  readonly retryAt: number | null;
  readonly lastFailure: JobFailure | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly finishedAt: number | null;
  readonly lease: LeaseStatus | null;
}

/** Possession of this token authorizes mutation until expiry or release. */
export interface LeaseRef {
  readonly jobId: string;
  readonly token: string;
}

export interface JobLease extends LeaseRef, LeaseStatus {}

export interface ClaimedJob {
  readonly job: ValidatedJob;
  readonly snapshot: JobSnapshot;
  readonly lease: JobLease;
}

export interface ClaimOptions {
  readonly owner: string;
  readonly leaseMs: number;
}

export interface ResultPageOptions {
  readonly cursor?: number;
  readonly limit?: number;
}

export interface ResultPage {
  readonly rows: readonly ResultRow[];
  readonly nextCursor: number;
  /** State observed atomically with this page, not a live view. */
  readonly snapshot: JobSnapshot;
}

export const QUEUE_LIMITS = Object.freeze({
  maxBatchRows: 128,
  maxBatchBytes: 1_000_000,
  maxPageRows: 128,
  maxOwnerLength: 80,
  maxIdentifierLength: 128,
  maxResultDepth: 64,
  maxResultNodes: 100_000,
  maxAttempts: 100,
  maxRetryDelayMs: 86_400_000,
  maxIdempotencyKeyLength: 128,
});

export type QueueErrorCode =
  | "invalid-argument" | "lease-lost" | "cursor-conflict" | "invalid-result" | "closed"
  | "storage-busy" | "storage-failure" | "unsupported-schema" | "unsupported-runtime"
  | "idempotency-conflict";

const ERROR_MESSAGES: Record<QueueErrorCode, string> = {
  "invalid-argument": "Invalid queue argument.",
  "lease-lost": "The job lease is absent, expired or no longer current.",
  "cursor-conflict": "Results must start at the current committed cursor.",
  "invalid-result": "Results must be bounded JSON rows matching the job's work items.",
  closed: "The queue handle is closed.",
  "storage-busy": "The queue database is busy; retry the operation later.",
  "storage-failure": "The queue database operation failed.",
  "unsupported-schema": "The database is not a supported batch queue schema.",
  "unsupported-runtime": "The SQLite queue requires a runtime with a newer SQLite library.",
  "idempotency-conflict": "The idempotency key is already bound to a different submission.",
};

/** Fixed diagnostics do not copy job data, lease tokens or result values. */
export class QueueError extends Error {
  override readonly name = "QueueError";

  constructor(readonly code: QueueErrorCode) {
    super(ERROR_MESSAGES[code]);
  }
}

/**
 * Every operation is atomic relative to other handles on the same backend.
 * Backend clocks, not worker clocks, decide expiry: now >= expiresAt is lost.
 * Definitions are validated on submission, then retained without expanded work.
 * Returned data must be detached from storage, or deeply immutable.
 */
export interface QueueBackend {
  /** Keys bind the canonical definition and retry policy for the store's lifetime. */
  submit(spec: unknown, options?: SubmitOptions): Promise<JobSnapshot>;
  getJob(jobId: string): Promise<JobSnapshot | null>;
  /** Record expired attempts, then claim the earliest job whose delay has elapsed. */
  claim(options: ClaimOptions): Promise<ClaimedJob | null>;
  /** Never shorten an existing lease, and never revive an expired lease. */
  renew(lease: LeaseRef, leaseMs: number): Promise<JobLease>;
  /**
   * Append a nonempty contiguous prefix and advance progress together, or do
   * neither. The final row completes the job and revokes its lease atomically.
   * With a current lease, replaying a committed prefix is a cursor conflict.
   * Validates row routing and JSON shape, not astronomical truth.
   */
  commit(lease: LeaseRef, rows: readonly ResultRow[]): Promise<JobSnapshot>;
  /** Requeue unfinished work without discarding the committed prefix. */
  release(lease: LeaseRef): Promise<JobSnapshot>;
  /** Record an execution failure, revoke the lease, and retry or fail atomically. */
  fail(lease: LeaseRef): Promise<JobSnapshot>;
  /** Read a bounded page from a cursor at or behind committed progress. */
  readResults(jobId: string, options?: ResultPageOptions): Promise<ResultPage | null>;
  /** Idempotent. All other operations reject on a closed handle. */
  close(): Promise<void>;
}
