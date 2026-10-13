import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RATE_LIMIT, TokenBuckets, validateRateLimit } from "../src/rate-limit.js";
import type { RateLimitOptions } from "../src/rate-limit.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("token buckets", () => {
  it("starts full with the documented defaults and exhausts without elapsed time", () => {
    const buckets = new TokenBuckets(undefined, () => 0);
    expect(DEFAULT_RATE_LIMIT).toEqual({ capacity: 60, refillPerSecond: 1 });
    expect(Object.isFrozen(DEFAULT_RATE_LIMIT)).toBe(true);
    for (let index = 0; index < 60; index++) {
      expect(buckets.consume("principal")).toEqual({ allowed: true, remaining: 59 - index, retryAfterSeconds: 0 });
    }
    expect(buckets.consume("principal")).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 1 });
  });

  it("preserves partial refills across rejections and refills at the exact boundary", () => {
    let now = 0;
    const buckets = new TokenBuckets({ capacity: 1, refillPerSecond: 1 }, () => now);
    expect(buckets.consume("principal").allowed).toBe(true);
    for (now = 100; now < 1_000; now += 100) {
      expect(buckets.consume("principal")).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 1 });
    }
    expect(buckets.consume("principal")).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
    expect(buckets.consume("principal").allowed).toBe(false);
  });

  it("retains fractional tokens after accepting a request", () => {
    let now = 0;
    const buckets = new TokenBuckets({ capacity: 2, refillPerSecond: 2 }, () => now);
    buckets.consume("principal");
    buckets.consume("principal");
    now = 750;
    expect(buckets.consume("principal")).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
    expect(buckets.consume("principal").allowed).toBe(false);
    now = 999;
    expect(buckets.consume("principal").allowed).toBe(false);
    now = 1_000;
    expect(buckets.consume("principal").allowed).toBe(true);
  });

  it("caps a long idle refill at capacity without retaining overflow credit", () => {
    let now = 0;
    const buckets = new TokenBuckets({ capacity: 2, refillPerSecond: 1 }, () => now);
    buckets.consume("principal");
    buckets.consume("principal");
    now = 1_000_000;
    expect(buckets.consume("principal").remaining).toBe(1);
    expect(buckets.consume("principal").remaining).toBe(0);
    expect(buckets.consume("principal").allowed).toBe(false);
    now += 500;
    expect(buckets.consume("principal").allowed).toBe(false);
    now += 500;
    expect(buckets.consume("principal").allowed).toBe(true);
  });

  it("keeps key identities and app instances independent", () => {
    let now = 0;
    const options = { capacity: 1, refillPerSecond: 1 };
    const buckets = new TokenBuckets(options, () => now);
    expect(buckets.consume("first").allowed).toBe(true);
    now = 500;
    expect(buckets.consume("second").allowed).toBe(true);
    expect(buckets.consume("first").allowed).toBe(false);
    expect(new TokenBuckets(options, () => now).consume("first").allowed).toBe(true);
    now = 1_000;
    expect(buckets.consume("first").allowed).toBe(true);
    expect(buckets.consume("second").allowed).toBe(false);
    now = 1_500;
    expect(buckets.consume("second").allowed).toBe(true);
  });

  it("never credits a backwards clock twice and reports a conservative retry time", () => {
    let now = 1_000;
    const buckets = new TokenBuckets({ capacity: 1, refillPerSecond: 1 }, () => now);
    buckets.consume("principal");
    now = 1_500;
    expect(buckets.consume("principal").allowed).toBe(false);
    now = 0;
    expect(buckets.consume("principal")).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 2 });
    now = 1_500;
    expect(buckets.consume("principal").allowed).toBe(false);
    now = 1_999;
    expect(buckets.consume("principal").allowed).toBe(false);
    now = 2_000;
    expect(buckets.consume("principal").allowed).toBe(true);
  });

  it("snapshots configuration before the caller mutates it", () => {
    let now = 0;
    const options = { capacity: 1, refillPerSecond: 1 };
    const buckets = new TokenBuckets(options, () => now);
    options.capacity = 10_000;
    options.refillPerSecond = 10_000;
    buckets.consume("principal");
    now = 999;
    expect(buckets.consume("principal").allowed).toBe(false);
    now = 1_000;
    expect(buckets.consume("principal")).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
    expect(buckets.consume("new-principal").remaining).toBe(0);
  });

  it("uses the monotonic performance clock by default and installs no timers", () => {
    vi.useFakeTimers();
    const clock = vi.spyOn(performance, "now").mockReturnValue(100);
    const buckets = new TokenBuckets({ capacity: 1, refillPerSecond: 1 });
    expect(buckets.consume("principal").allowed).toBe(true);
    clock.mockReturnValue(1_099);
    expect(buckets.consume("principal").allowed).toBe(false);
    clock.mockReturnValue(1_100);
    expect(buckets.consume("principal").allowed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([NaN, Infinity, -Infinity])("rejects invalid clock value %s without corrupting the bucket", (invalid) => {
    let now = 0;
    const buckets = new TokenBuckets({ capacity: 1, refillPerSecond: 1 }, () => now);
    buckets.consume("principal");
    now = invalid;
    expect(() => buckets.consume("principal")).toThrowError("Rate limit clock must return finite milliseconds.");
    now = 999;
    expect(buckets.consume("principal").allowed).toBe(false);
    now = 1_000;
    expect(buckets.consume("principal").allowed).toBe(true);
  });

  it("returns decisions that do not expose or mutate bucket state", () => {
    const buckets = new TokenBuckets({ capacity: 1, refillPerSecond: 1 }, () => 0);
    const decision = buckets.consume("principal");
    decision.remaining = 10_000;
    expect(buckets.consume("principal")).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 1 });
    expect(JSON.stringify(buckets)).toBe("{}");
  });
});

describe("rate limit configuration", () => {
  it.each([1, 10_000])("accepts the configuration boundary %i", (value) => {
    const options = { capacity: value, refillPerSecond: value };
    expect(() => validateRateLimit(options)).not.toThrow();
    expect(new TokenBuckets(options, () => 0).consume("principal").remaining).toBe(value - 1);
  });

  it.each([0, -1, 0.5, 10_001, NaN, Infinity, -Infinity, "1", null, undefined])("rejects invalid capacity or refill %s", (value) => {
    for (const field of ["capacity", "refillPerSecond"] as const) {
      const options = { capacity: 1, refillPerSecond: 1, [field]: value } as RateLimitOptions;
      expect(() => validateRateLimit(options)).toThrowError("Rate limit configuration is invalid.");
      expect(() => new TokenBuckets(options)).toThrowError("Rate limit configuration is invalid.");
    }
  });

  it.each([null, [], {}, true, 1, "options"])("rejects invalid option shape %j", (options) => {
    expect(() => validateRateLimit(options as RateLimitOptions)).toThrowError("Rate limit configuration is invalid.");
    expect(() => new TokenBuckets(options as RateLimitOptions)).toThrowError("Rate limit configuration is invalid.");
  });
});
