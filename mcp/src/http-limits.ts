import { performance } from "node:perf_hooks";

export const MAX_REQUEST_BYTES = 65_536;
export const DEFAULT_HTTP_LIMITS = Object.freeze({
  maxRequests: 120,
  windowMs: 60_000,
  maxRequestBytes: MAX_REQUEST_BYTES
});

export type HttpLimits = { maxRequests: number; windowMs: number; maxRequestBytes: number };

/** Operator limits may reduce the body cap; no option disables the policies. */
export function resolveHttpLimits(limits: Partial<HttpLimits> = {}): Readonly<HttpLimits> {
  const invalid = () => new RangeError("Invalid HTTP request limits.");
  if (!limits || typeof limits !== "object" || Array.isArray(limits) ||
    Object.keys(limits).some((key) => !Object.hasOwn(DEFAULT_HTTP_LIMITS, key))) throw invalid();
  const resolved = { ...DEFAULT_HTTP_LIMITS, ...limits };
  if (Object.values(resolved).some((value) => !Number.isSafeInteger(value) || value < 1) ||
    resolved.maxRequestBytes > MAX_REQUEST_BYTES) throw invalid();
  return Object.freeze(resolved);
}

/** One fixed window per listener, with constant storage and no client identifiers. */
export class HttpRateLimiter {
  readonly #maxRequests: number;
  readonly #windowMs: number;
  #started: number | undefined;
  #used = 0;

  constructor({ maxRequests, windowMs }: Pick<HttpLimits, "maxRequests" | "windowMs">) {
    const limits = resolveHttpLimits({ maxRequests, windowMs });
    this.#maxRequests = limits.maxRequests;
    this.#windowMs = limits.windowMs;
  }

  /** Admit immediately, or return Retry-After in seconds. Refusals do not extend the window. */
  take(now = performance.now()): number | undefined {
    if (this.#started === undefined || now - this.#started >= this.#windowMs) {
      this.#started = now;
      this.#used = 0;
    }
    if (this.#used >= this.#maxRequests) {
      return Math.max(1, Math.ceil((this.#windowMs - (now - this.#started)) / 1000));
    }
    this.#used++;
    return undefined;
  }
}
