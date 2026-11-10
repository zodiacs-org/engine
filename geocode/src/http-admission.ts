import { performance } from "node:perf_hooks";

export interface AdmissionOptions {
  readonly capacity?: number;
  readonly refillPerSecond?: number;
  readonly maxClients?: number;
  readonly maxConcurrent?: number;
  readonly idleTimeoutMs?: number;
  readonly cleanupIntervalMs?: number;
  /** Trusted monotonic millisecond clock, intended for deterministic tests. */
  readonly clock?: () => number;
}

export const ADMISSION_DEFAULTS = Object.freeze({
  capacity: 60, refillPerSecond: 1, maxClients: 4096, maxConcurrent: 32,
  idleTimeoutMs: 60_000, cleanupIntervalMs: 10_000
});

type Bucket = { tokens: number; updated: number; seen: number; active: number };
export type Admission = { readonly status: "allowed"; release(): void }
  | { readonly status: "rate-limited" | "overloaded"; readonly retryAfterSeconds: number };

/** No timer on construction. The transport owns cleanup scheduling. */
export function createAdmissionController(options: AdmissionOptions = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)
      || Object.keys(options).some((key) => ![...Object.keys(ADMISSION_DEFAULTS), "clock"].includes(key))) {
    throw new RangeError("Invalid admission options.");
  }
  const settings = { ...ADMISSION_DEFAULTS, ...options };
  for (const [key, maximum] of [
    ["capacity", 1_000_000], ["maxClients", 100_000], ["maxConcurrent", 10_000],
    ["idleTimeoutMs", 86_400_000], ["cleanupIntervalMs", 3_600_000]
  ] as const) {
    const value = settings[key];
    if (!Number.isInteger(value) || value < 1 || value > maximum) throw new RangeError("Invalid admission limits.");
  }
  if (typeof settings.refillPerSecond !== "number" || !Number.isFinite(settings.refillPerSecond)
      || settings.refillPerSecond < 0.001 || settings.refillPerSecond > 1_000_000
      || (Object.hasOwn(options, "clock") && typeof options.clock !== "function")) {
    throw new RangeError("Invalid admission refill or clock.");
  }
  const clock = options.clock ?? (() => performance.now());
  const buckets = new Map<string, Bucket>();
  let lastNow = -Infinity;
  let lastSweep = -Infinity;
  let active = 0;
  let closed = false;

  function now(): number {
    const value = clock();
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new RangeError("Invalid admission clock reading.");
    // A bad backwards reading never grants extra tokens or moves a timestamp back.
    lastNow = Math.max(lastNow, value);
    return lastNow;
  }

  function refill(bucket: Bucket, time: number): void {
    bucket.tokens = Math.min(settings.capacity, bucket.tokens + (time - bucket.updated) / 1000 * settings.refillPerSecond);
    bucket.updated = time;
  }

  function sweepAt(time: number): void {
    lastSweep = time;
    for (const [client, bucket] of buckets) {
      if (bucket.active || time - bucket.seen < settings.idleTimeoutMs) continue;
      refill(bucket, time);
      // Eviction must not turn a partially exhausted bucket into a fresh burst.
      if (bucket.tokens === settings.capacity) buckets.delete(client);
    }
  }

  function acquire(client: string): Admission {
    if (closed || active >= settings.maxConcurrent) return { status: "overloaded", retryAfterSeconds: 1 };
    const time = now();
    let bucket = buckets.get(client);
    if (!bucket) {
      if (buckets.size >= settings.maxClients && time - lastSweep >= settings.cleanupIntervalMs) sweepAt(time);
      if (buckets.size >= settings.maxClients) return { status: "overloaded", retryAfterSeconds: 1 };
      bucket = { tokens: settings.capacity, updated: time, seen: time, active: 0 };
      buckets.set(client, bucket);
    }
    refill(bucket, time);
    bucket.seen = time;
    if (bucket.tokens < 1) {
      return { status: "rate-limited", retryAfterSeconds: Math.max(1, Math.ceil((1 - bucket.tokens) / settings.refillPerSecond)) };
    }
    bucket.tokens -= 1;
    bucket.active += 1;
    active += 1;
    let released = false;
    return { status: "allowed", release() {
      if (released) return;
      released = true;
      bucket.active -= 1;
      active -= 1;
    } };
  }

  return Object.freeze({
    acquire,
    sweep() { if (!closed) sweepAt(now()); },
    close() { closed = true; buckets.clear(); },
    cleanupIntervalMs: settings.cleanupIntervalMs,
    /** Aggregate diagnostics contain no client addresses. */
    snapshot() { return Object.freeze({ clients: buckets.size, active, closed }); }
  });
}
