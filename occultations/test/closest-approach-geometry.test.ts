import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { searchLocalClosestApproaches } from "../src/closest-approach.js";
import type { LocalClosestApproachRequest, LocalClosestApproachResult } from "../src/closest-approach.js";

const DAY = 86_400_000, HOUR = 3_600_000, MODERN = Date.parse("2024-01-02T00:00:00Z");
let origin = MODERN;
const observer = { latitude: 13, longitude: -27, elevationMeters: 123 };
const baseline = engine.positionAt({ body: "Moon", time: new Date(origin), observer });
if (baseline.status !== "ok") throw new Error("test adapter baseline refused");
let direction: (body: engine.SolarSystemBody, elapsed: number) => readonly [number, number];
let evaluated: number[];
let refusedBody: string | null;
const request = (from = 0, to = HOUR): LocalClosestApproachRequest => ({ target: "Saturn", observer,
  window: { from: new Date(origin + from), to: new Date(origin + to) } });
function complete(result: LocalClosestApproachResult) {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Unexpected refusal: ${result.reason}`);
  return result;
}
const offsets = (result: LocalClosestApproachResult) => complete(result).events.map((event) => Date.parse(event.at) - origin);

beforeEach(() => {
  origin = MODERN;
  evaluated = [];
  refusedBody = null;
  direction = (body, ms) => body === "Moon" ? [(ms - HOUR / 2) / HOUR, 0] : [0, 0];
  vi.spyOn(engine, "positionAt").mockImplementation((input) => {
    const ms = new Date(input.time).getTime();
    evaluated.push(ms);
    expect(input.observer).toEqual(observer);
    expect(input.frame).toBe("equatorial-true-of-date");
    const receipt = { ...baseline.receipt, request: { ...baseline.receipt.request,
      body: input.body, time: new Date(ms).toISOString(), observer, frame: input.frame! } };
    if (input.body === refusedBody) return { status: "refused", reason: "unsupported-combination",
      detail: "Synthetic refused adapter sample.", receipt };
    const [lon, lat] = direction(input.body, ms - origin);
    return { ...baseline, body: input.body, lon, lat, receipt };
  });
});
afterEach(() => vi.restoreAllMocks());

describe("constructed local minimum trajectories, not sky accuracy", () => {
  it("finds a coincident minimum, charges all samples and records its numerical bracket", () => {
    const result = complete(searchLocalClosestApproaches(request()));
    expect(offsets(result)).toEqual([HOUR / 2]);
    const event = result.events[0]!;
    expect(event.separationDegrees).toBe(0);
    expect(event.bracket).toEqual({ from: event.at, to: event.at });
    expect(event.receipt.search).toBe(result.receipt);
    expect(result.receipt.search.samples * 2).toBe(evaluated.length);
    expect(Math.min(...evaluated)).toBeGreaterThanOrEqual(origin - 60_001);
    expect(Math.max(...evaluated)).toBeLessThanOrEqual(origin + HOUR + 60_001);
    expect(evaluated.every(Number.isInteger)).toBe(true);
  });

  it("finds a spherical minimum across right-ascension wrap", () => {
    direction = (body, ms) => body === "Moon" ? [360 + (ms - HOUR / 2) / HOUR, 3] : [0, -2];
    const result = complete(searchLocalClosestApproaches(request()));
    expect(result.events).toHaveLength(1);
    expect(Math.abs(offsets(result)[0]! - HOUR / 2)).toBeLessThanOrEqual(1);
    expect(result.events[0]!.separationDegrees).toBeCloseTo(5, 11);
  });

  it("finds a minimum without a right-ascension conjunction or occultation", () => {
    direction = (body, ms) => body === "Moon" ? [10, (ms - HOUR / 2) / HOUR] : [0, 0];
    const result = complete(searchLocalClosestApproaches(request()));
    expect(offsets(result)).toEqual([HOUR / 2]);
    expect(result.events[0]!.separationDegrees).toBeCloseTo(10, 11);
  });

  it("does not report a maximum, monotone endpoint or constant separation as a minimum", () => {
    for (const trajectory of [
      (ms: number) => [180 + (ms - HOUR / 2) / HOUR, 0] as const,
      (ms: number) => [10 + ms / HOUR, 0] as const,
      () => [30, 5] as const,
      (ms: number) => [360 * ms / HOUR, 90] as const
    ]) {
      direction = (body, ms) => body === "Moon" ? trajectory(ms) : [0, 0];
      expect(offsets(searchLocalClosestApproaches(request()))).toEqual([]);
    }
  });

  it("refuses a detected nonisolated zero plateau", () => {
    direction = (body, ms) => body === "Moon"
      ? [Math.max(0, Math.abs(ms - HOUR / 2) - 120_000) / HOUR, 0] : [0, 0];
    expect(searchLocalClosestApproaches({ ...request(), stepDays: 30_000 / DAY }))
      .toMatchObject({ status: "refused", reason: "unresolved-minimum", events: [] });
  });

  it.each([MODERN, Date.parse("1960-01-01T00:00:00Z")])("owns integer and fractional rate roots once at epoch %s", (epoch) => {
    origin = epoch;
    for (const root of [0.25, 1, 1.25, 9, 9.75]) {
      direction = (body, ms) => body === "Moon" ? [(ms - root) / 10_000, 0] : [0, 0];
      const at = Math.ceil(root);
      expect(offsets(searchLocalClosestApproaches(request(0, 10)))).toEqual([at]);
      const endpoint = complete(searchLocalClosestApproaches(request(at - 1, at)));
      expect(offsets(endpoint)).toEqual([at]);
      const bracket = endpoint.events[0]!.bracket;
      expect(Date.parse(bracket.to) - Date.parse(bracket.from)).toBeLessThanOrEqual(1);
      expect(offsets(searchLocalClosestApproaches(request(at, 11)))).toEqual([]);
    }
  });

  it("does not promote a stationary rate touch into a minimum", () => {
    const h = 60_000 / HOUR;
    direction = (body, ms) => {
      if (body !== "Moon") return [0, 0];
      const x = (ms - HOUR / 2) / HOUR;
      // Centered derivative of x³-h²x is 3x², with no sign change.
      const q = 1 + x * x * x - h * h * x;
      return [2 * Math.asin(Math.sqrt(q) / 2) * 180 / Math.PI, 0];
    };
    expect(offsets(searchLocalClosestApproaches(request()))).toEqual([]);
  });

  it("refuses a transformed zero that the raw rate does not confirm", () => {
    direction = (body, ms) => {
      if (body !== "Moon") return [0, 0];
      const x = (ms - HOUR / 2) / HOUR;
      // This centered derivative is strictly positive, even at x=0. The
      // inherited crossing solver can round the transformed rate to zero.
      const q = 1e-12 + 1e-18 * x * x * x;
      return [2 * Math.asin(Math.sqrt(q) / 2) * 180 / Math.PI, 0];
    };
    expect(searchLocalClosestApproaches(request()))
      .toMatchObject({ status: "refused", reason: "unresolved-minimum", events: [] });
  });

  it("explicitly exposes centered-difference bias for asymmetric angular motion", () => {
    // Squared chord q(x)=0.01+x²+0.1x³, x=(t-midpoint)/hour.
    // The actual minimum is x=0; the centered stencil's minimum solves
    // 0.3x²+2x+0.1h²=0. This independently checks the approximation itself.
    direction = (body, ms) => {
      if (body !== "Moon") return [0, 0];
      const x = (ms - HOUR / 2) / HOUR, q = 0.01 + x * x + 0.1 * x * x * x;
      return [2 * Math.asin(Math.sqrt(q) / 2) * 180 / Math.PI, 0];
    };
    const h = 60_000 / HOUR;
    const numericalRoot = -0.2 * h * h / (2 + Math.sqrt(4 - 0.12 * h * h));
    const result = complete(searchLocalClosestApproaches(request()));
    expect(result.events).toHaveLength(1);
    expect(Math.abs(offsets(result)[0]! - (HOUR / 2 + numericalRoot * HOUR))).toBeLessThanOrEqual(1);
    expect(Math.abs(offsets(result)[0]! - HOUR / 2)).toBeGreaterThan(40);
    expect(result.receipt.limitations).toContain("finite-difference-stationary-time-is-an-approximation;stencil-bias-unbounded");
  });

  it("charges every refinement and output pair and discards partial events on exhaustion", () => {
    const needed = complete(searchLocalClosestApproaches(request())).receipt.search.samples;
    for (const maxSamples of [1, 30, needed - 1, needed]) {
      evaluated = [];
      const result = searchLocalClosestApproaches({ ...request(), maxSamples });
      expect(result.receipt.search.samples).toBeLessThanOrEqual(maxSamples);
      expect(result.receipt.search.samples * 2).toBe(evaluated.length);
      if (maxSamples < needed) expect(result).toMatchObject({ status: "refused", reason: "sample-budget", events: [] });
      else expect(offsets(result)).toEqual([HOUR / 2]);
    }
  });

  it.each(["Moon", "Saturn"])("preserves a %s adapter refusal", (body) => {
    refusedBody = body;
    expect(searchLocalClosestApproaches(request())).toMatchObject({ status: "refused", reason: "position-refused",
      events: [], failure: { position: { request: { body } }, positionReason: "unsupported-combination" },
      receipt: { search: { samples: 1 } } });
    expect(evaluated).toHaveLength(body === "Moon" ? 1 : 2);
  });

  it.each([NaN, Infinity, 91])("refuses an invalid adapter declination %s", (lat) => {
    direction = () => [0, lat];
    expect(searchLocalClosestApproaches(request())).toMatchObject({ status: "refused", reason: "invalid-direction", events: [] });
  });
});
