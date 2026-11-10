import { performance } from "node:perf_hooks";
import type { FastifyInstance } from "fastify";
import { DEFAULT_RATE_LIMIT, validateRateLimit, type RateLimitOptions } from "./rate-limit.js";
import { failure } from "./responses.js";

export function admissionLimits(rateLimit: RateLimitOptions = DEFAULT_RATE_LIMIT) {
  validateRateLimit(rateLimit);
  return {
    capacity: Math.max(120, rateLimit.capacity, rateLimit.refillPerSecond * 60),
    windowMs: 60_000,
    maxClients: 4_096
  };
}

/** Fixed process-wide windows; a full table refuses new clients without eviction. */
export class AdmissionLimiter {
  readonly #counts = new Map<string, number>();
  readonly #limits: ReturnType<typeof admissionLimits>;
  readonly #now: () => number;
  #windowStart: number | undefined;
  #highWatermark = -Infinity;

  constructor(limits = admissionLimits(), now: () => number = () => performance.now()) {
    if (!Object.values(limits).every((value) => Number.isSafeInteger(value) && value > 0)) {
      throw new RangeError("Admission limit configuration is invalid.");
    }
    this.#limits = { ...limits };
    this.#now = now;
  }

  consume(client: string): { allowed: boolean; retryAfterSeconds: number } {
    const observed = this.#now();
    if (!Number.isFinite(observed)) throw new RangeError("Admission clock must return finite milliseconds.");
    const now = Math.max(observed, this.#highWatermark);
    this.#highWatermark = now;
    const { capacity, windowMs, maxClients } = this.#limits;
    if (this.#windowStart === undefined || now - this.#windowStart >= windowMs) {
      this.#counts.clear();
      this.#windowStart = now;
    }
    const count = this.#counts.get(client);
    const allowed = count === undefined ? this.#counts.size < maxClients : count < capacity;
    if (allowed) this.#counts.set(client, (count ?? 0) + 1);
    return {
      allowed,
      retryAfterSeconds: allowed ? 0 : Math.ceil((this.#windowStart + windowMs - observed) / 1_000)
    };
  }
}

/** Runs before authentication, body parsing and all public or protected handlers. */
export function registerAdmissionLimiting(app: FastifyInstance, rateLimit?: RateLimitOptions, now?: () => number): void {
  const limiter = new AdmissionLimiter(admissionLimits(rateLimit), now);
  app.addHook("onRequest", async (request, reply) => {
    // Use only the socket peer; caller-supplied forwarding headers are ignored.
    const result = limiter.consume(request.raw.socket.remoteAddress ?? "unknown");
    if (!result.allowed) {
      return reply.code(429).header("retry-after", result.retryAfterSeconds)
        .send(failure(request.id, "rate_limited", "Client request limit exceeded."));
    }
  });
}
