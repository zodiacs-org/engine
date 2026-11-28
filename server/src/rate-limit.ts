import { performance } from "node:perf_hooks";

export interface RateLimitOptions {
  readonly capacity: number;
  readonly refillPerSecond: number;
}

export const DEFAULT_RATE_LIMIT: Readonly<RateLimitOptions> = Object.freeze({
  capacity: 60,
  refillPerSecond: 1
});

function snapshot(options: RateLimitOptions): RateLimitOptions {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new RangeError("Rate limit configuration is invalid.");
  }
  const { capacity, refillPerSecond } = options;
  if (![capacity, refillPerSecond].every((value) => Number.isInteger(value) && value >= 1 && value <= 10_000)) {
    throw new RangeError("Rate limit configuration is invalid.");
  }
  return { capacity, refillPerSecond };
}

export function validateRateLimit(options: RateLimitOptions): void {
  snapshot(options);
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  // One token costs 1,000 credits. Integer millisecond refills retain their
  // fractions exactly instead of rounding a token fraction on every request.
  credits: number;
  updatedAt: number;
}

/** One app-owned bucket per authenticated, opaque key identity. No timers. */
export class TokenBuckets {
  readonly #options: RateLimitOptions;
  readonly #now: () => number;
  readonly #buckets = new Map<string, Bucket>();

  constructor(options: RateLimitOptions = DEFAULT_RATE_LIMIT, now: () => number = () => performance.now()) {
    this.#options = snapshot(options);
    this.#now = now;
  }

  consume(keyId: string): RateLimitDecision {
    const now = this.#now();
    if (!Number.isFinite(now)) throw new RangeError("Rate limit clock must return finite milliseconds.");

    const { capacity, refillPerSecond } = this.#options;
    const bucket = this.#buckets.get(keyId) ?? { credits: capacity * 1_000, updatedAt: now };
    // Retain the high watermark if an injected clock goes backwards. Moving
    // it backwards would count the same elapsed interval again on recovery.
    const elapsed = Math.max(0, now - bucket.updatedAt);
    bucket.credits = Math.min(capacity * 1_000, bucket.credits + elapsed * refillPerSecond);
    bucket.updatedAt = Math.max(now, bucket.updatedAt);
    const allowed = bucket.credits >= 1_000;
    if (allowed) bucket.credits -= 1_000;
    this.#buckets.set(keyId, bucket);

    return {
      allowed,
      remaining: Math.floor(bucket.credits / 1_000),
      retryAfterSeconds: allowed ? 0 : Math.ceil((
        bucket.updatedAt - now + (1_000 - bucket.credits) / refillPerSecond
      ) / 1_000)
    };
  }
}
