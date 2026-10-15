import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { searchAppulses } from "../src/appulses.js";
import type { AppulseRequest, AppulseResult } from "../src/appulses.js";

// Independently constructed spherical trajectories test numerical geometry and
// search ownership. Adapter receipts are test doubles, not sky accuracy evidence.
const HOUR = 3_600_000;
const MODERN = Date.parse("2024-01-01T00:00:00Z");
const HISTORICAL = Date.parse("1960-01-01T00:00:00Z");
const baseline = engine.positionAt({ body: "Moon", time: new Date(MODERN) });
if (baseline.status !== "ok") throw new Error("test adapter baseline refused");
let origin = MODERN;
let evaluated: number[];
let direction: (body: engine.SolarSystemBody, elapsed: number) => readonly [number, number];

function request(from = 0, to = HOUR): AppulseRequest {
  return { first: "Moon", second: "Mars", maximumSeparationDegrees: 180,
    window: { from: new Date(origin + from), to: new Date(origin + to) } };
}

function complete(result: AppulseResult) {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Unexpected refusal: ${result.reason}`);
  return result;
}

function offsets(result: AppulseResult): readonly number[] {
  return complete(result).events.map((event) => Date.parse(event.at) - origin);
}

beforeEach(() => {
  origin = MODERN;
  evaluated = [];
  direction = (body, ms) => body === "Moon" ? [(ms - HOUR / 2) / HOUR, 0] : [0, 0];
  vi.spyOn(engine, "positionAt").mockImplementation((input) => {
    const ms = new Date(input.time).getTime();
    evaluated.push(ms);
    const [lon, lat] = direction(input.body, ms - origin);
    return { ...baseline, body: input.body, lon, lat,
      receipt: { ...baseline.receipt, request: { ...baseline.receipt.request,
        body: input.body, time: new Date(ms).toISOString(), frame: input.frame! } } };
  });
});
afterEach(() => vi.restoreAllMocks());

describe("analytic appulse geometry, not sky accuracy", () => {
  it("finds an exact coincident minimum without an inverse-cosine singularity", () => {
    const result = complete(searchAppulses(request()));
    expect(offsets(result)).toEqual([HOUR / 2]);
    expect(result.events[0]!.separationDegrees).toBe(0);
    expect(result.receipt.search.samples * 2).toBe(evaluated.length);
  });

  it("finds a spherical minimum across the longitude wrap", () => {
    direction = (body, ms) => body === "Moon" ? [360 + (ms - HOUR / 2) / HOUR, 3] : [0, -2];
    const result = complete(searchAppulses(request()));
    expect(result.events).toHaveLength(1);
    expect(Math.abs(offsets(result)[0]! - HOUR / 2)).toBeLessThanOrEqual(1);
    expect(result.events[0]!.separationDegrees).toBeCloseTo(5, 11);
  });

  it("finds an appulse without any right-ascension conjunction", () => {
    direction = (body, ms) => body === "Moon" ? [10, (ms - HOUR / 2) / HOUR] : [0, 0];
    const result = complete(searchAppulses(request()));
    expect(offsets(result)).toEqual([HOUR / 2]);
    expect(result.events[0]!.separationDegrees).toBeCloseTo(10, 11);
    expect(offsets(searchAppulses({ ...request(), maximumSeparationDegrees: 9.9 }))).toEqual([]);
    expect(offsets(searchAppulses({ ...request(), maximumSeparationDegrees: 10.1 }))).toEqual([HOUR / 2]);
  });

  it("resolves a broad analytic minimum for a slow planetary angular rate", () => {
    const minimum = HOUR / 2 + 0.25;
    direction = (body, ms) => body === "Moon" ? [30 + 0.001 * (ms - minimum) / 86_400_000, 10] : [30, 0];
    const result = complete(searchAppulses(request()));
    expect(result.events).toHaveLength(1);
    expect(Math.abs(offsets(result)[0]! - minimum)).toBeLessThanOrEqual(1);
    expect(result.events[0]!.separationDegrees).toBeCloseTo(10, 11);
  });

  it("does not report an antipodal separation maximum as an appulse", () => {
    direction = (body, ms) => body === "Moon" ? [180 + (ms - HOUR / 2) / HOUR, 0] : [0, 0];
    expect(offsets(searchAppulses(request()))).toEqual([]);
  });

  it("does not report the clipped endpoint of monotone separation", () => {
    direction = (body, ms) => body === "Moon" ? [10 + ms / HOUR, 0] : [0, 0];
    expect(offsets(searchAppulses(request()))).toEqual([]);
  });

  it.each([90, -90])("ignores changing longitude at the exact %s degree pole", (pole) => {
    direction = (body, ms) => body === "Moon" ? [360 * ms / HOUR, pole] : [20, 0];
    expect(offsets(searchAppulses(request()))).toEqual([]);
  });

  it("reports no isolated event for constant separation", () => {
    direction = (body) => body === "Moon" ? [30, 5] : [30, -5];
    expect(offsets(searchAppulses(request()))).toEqual([]);
  });

  it("reports no isolated event when both directions share a longitude motion", () => {
    direction = (body, ms) => [ms / HOUR + (body === "Moon" ? 30 : 40), 0];
    expect(offsets(searchAppulses(request()))).toEqual([]);
  });

  it("refuses a nonisolated zero plateau instead of choosing its entry edge", () => {
    direction = (body, ms) => body === "Moon" ? [Math.max(0, Math.abs(ms - HOUR / 2) - 120_000) / HOUR, 0] : [0, 0];
    const result = searchAppulses({ ...request(), stepDays: 30_000 / 86_400_000 });
    expect(result).toMatchObject({ status: "refused", reason: "unresolved-minimum", events: [] });
  });

  it("does not promote a stationary rate touch into a minimum", () => {
    const h = 60_000 / HOUR;
    direction = (body, ms) => {
      if (body !== "Moon") return [0, 0];
      const x = (ms - HOUR / 2) / HOUR;
      // The centered derivative of x³-h²x is 3x². Its zero touches the
      // positive side and never changes from negative to positive.
      const q = 1 + x * x * x - h * h * x;
      return [2 * Math.asin(Math.sqrt(q) / 2) * 180 / Math.PI, 0];
    };
    expect(offsets(searchAppulses({ ...request(), stepDays: 1 / 48 }))).toEqual([]);
  });

  it("refuses an inherited solver zero that the untransformed rate cannot confirm", () => {
    direction = (body, ms) => {
      if (body !== "Moon") return [0, 0];
      const x = (ms - HOUR / 2) / HOUR;
      // The centered difference of this cubic is strictly positive, including
      // x=0. Only the crossing solver's circular normalization makes it zero.
      const q = 1e-12 + 1e-18 * x * x * x;
      return [2 * Math.asin(Math.sqrt(q) / 2) * 180 / Math.PI, 0];
    };
    expect(searchAppulses({ ...request(), stepDays: 1 / 48 })).toMatchObject({
      status: "refused", reason: "unresolved-minimum", events: []
    });
  });

  it.each([MODERN, HISTORICAL])("owns integer and fractional minima on the Date lattice at epoch %s", (epoch) => {
    origin = epoch;
    for (const root of [0.25, 1, 1.25, 9, 9.75]) {
      // Fast synthetic motion keeps the one-millisecond sign distinguishable,
      // while remaining within one angular turn throughout the derivative halo.
      direction = (body, ms) => body === "Moon" ? [(ms - root) / 10_000, 0] : [0, 0];
      const at = Math.ceil(root);
      expect(offsets(searchAppulses(request(0, 10)))).toEqual([at]);
      expect(offsets(searchAppulses(request(at - 1, at)))).toEqual([at]);
      expect(offsets(searchAppulses(request(at, 11)))).toEqual([]);
    }
  });

  it("checks the local minimum outside a clipped boundary using a recorded halo", () => {
    direction = (body, ms) => body === "Moon" ? [(ms - HOUR / 2) / HOUR, 0] : [0, 0];
    const result = complete(searchAppulses(request(HOUR / 2 - 1, HOUR / 2)));
    expect(offsets(result)).toEqual([HOUR / 2]);
    expect(Math.min(...evaluated)).toBeLessThan(origin + HOUR / 2 - 1);
    expect(Math.max(...evaluated)).toBeGreaterThan(origin + HOUR / 2);
    expect(evaluated.every((at) => Number.isInteger(at))).toBe(true);
  });

  it("bounds all paired evaluations, including the stencil and event verification", () => {
    const needed = complete(searchAppulses(request())).receipt.search.samples;
    for (const maxSamples of [1, 2, 10, needed - 1, needed]) {
      evaluated = [];
      const result = searchAppulses({ ...request(), maxSamples });
      expect(result.receipt.search.samples).toBeLessThanOrEqual(maxSamples);
      expect(result.receipt.search.samples * 2).toBe(evaluated.length);
      if (maxSamples < needed) expect(result).toMatchObject({ status: "refused", reason: "sample-budget", events: [] });
      else expect(offsets(result)).toEqual([HOUR / 2]);
    }
  });

  it("makes the centered-difference bias explicit for an asymmetric analytic minimum", () => {
    // Set the squared chord q exactly by a separately specified polynomial:
    // q(x)=1/100+x²+x³/10, x=(t-midpoint)/hour. Its true minimum is x=0.
    // For a symmetric stencil of width h=1/60 hour, the derivative root solves
    // 3x²/10+2x+h²/10=0. This is a numerical-stencil check, not a timing bound.
    direction = (body, ms) => {
      if (body !== "Moon") return [0, 0];
      const x = (ms - HOUR / 2) / HOUR;
      const q = 0.01 + x * x + 0.1 * x * x * x;
      return [2 * Math.asin(Math.sqrt(q) / 2) * 180 / Math.PI, 0];
    };
    const h = 60_000 / HOUR;
    const numericalRoot = -0.2 * h * h / (2 + Math.sqrt(4 - 0.12 * h * h));
    const expected = HOUR / 2 + numericalRoot * HOUR;
    const result = complete(searchAppulses(request()));
    expect(result.events).toHaveLength(1);
    expect(Math.abs(offsets(result)[0]! - expected)).toBeLessThanOrEqual(1);
    expect(Math.abs(offsets(result)[0]! - HOUR / 2)).toBeGreaterThan(40);
  });
});
