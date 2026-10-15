import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalcTime } from "@zodiacs/engine/calc";
import {
  AU_KM, distanceTarget, PLANETARY_SEARCH_POLICIES,
  searchDistanceExtremaWith, searchPlanetaryApsides
} from "../src/index.js";
import type { DistanceSample, PlanetaryBody, PlanetarySearchResult } from "../src/index.js";
import { searchAnalyticRateExtremaWith } from "../src/rate-solver.js";
import * as sampling from "../src/sample.js";

const tt = (jd: number): CalcTime => ({ jd, scale: "tt" });
afterEach(() => vi.restoreAllMocks());

// Mathematical curves and fabricated receipts only. These tests establish
// failure and boundary contracts, not an astronomical accuracy measurement.
describe("nonuniform scalar sampling", () => {
  it.each([1, -1])("retains a known extremum between strict witnesses with sign %s", (sign) => {
    const root = 0.371;
    const result = searchDistanceExtremaWith((time) => 1000 + sign * (time - root) ** 2, {
      sampleTimesSeconds: [-9, -8, 0, 0.5, 20], toleranceSeconds: 0.001, maxEvaluations: 1000
    });
    if (result.status !== "complete") throw new Error(result.reason);
    expect(result.extrema).toHaveLength(1);
    const event = result.extrema[0]!;
    expect(event.kind).toBe(sign === 1 ? "minimum" : "maximum");
    expect(event.lower.timeSeconds).toBeLessThan(root);
    expect(event.upper.timeSeconds).toBeGreaterThan(root);
    expect(event.upper.timeSeconds - event.lower.timeSeconds).toBeLessThanOrEqual(0.001);
    expect(sign * (event.lower.distanceKm - event.sample.distanceKm)).toBeGreaterThan(0);
    expect(sign * (event.upper.distanceKm - event.sample.distanceKm)).toBeGreaterThan(0);
  });
});

describe("analytic-rate search failure after earlier detections", () => {
  it("discards earlier turns when later samples have an unresolved zero plateau", () => {
    const calls: number[] = [];
    const grid = Array.from({ length: 17 }, (_, index) => index / 4 - 2);
    const result = searchAnalyticRateExtremaWith((time) => {
      calls.push(time);
      return {
        distanceKm: 100 + (time ** 2 - 1) ** 2,
        radialSpeedKmPerSecond: time >= 0.75 ? 0 : 4 * time * (time ** 2 - 1)
      };
    }, grid, 0.001);
    // Refinement near the earlier minimum actually ran before the late refusal.
    expect(calls.some((time) => time < -0.75 && !grid.includes(time))).toBe(true);
    expect(result).toMatchObject({
      status: "refused", reason: "ambiguous-distance", extrema: []
    });
    if (result.status !== "refused") throw new Error("Expected late refusal");
    expect(result.interval.fromSeconds).toBeGreaterThanOrEqual(0.5);
  });
});

describe("finite-grid completeness limitations", () => {
  it("does not certify hidden scalar turns in a monotone sequence of grid samples", () => {
    const distance = (time: number) => 100 + 0.01 * time + Math.cos(2 * Math.PI * time);
    // Continuity and this strict interior witness establish an intervening turn.
    expect(distance(0.5)).toBeLessThan(distance(0));
    expect(distance(0.5)).toBeLessThan(distance(1));
    const result = searchDistanceExtremaWith(distance, {
      sampleTimesSeconds: [0, 1, 2, 3], toleranceSeconds: 0.001, maxEvaluations: 100
    });
    expect(result).toMatchObject({ status: "complete", extrema: [] });
  });

  it("does not certify hidden rate crossings when sampled rates have one sign", () => {
    const rate = (time: number) => 1 + 2 * Math.PI * Math.cos(2 * Math.PI * time);
    expect(rate(0)).toBeGreaterThan(0);
    expect(rate(0.5)).toBeLessThan(0);
    expect(rate(1)).toBeGreaterThan(0);
    expect(searchAnalyticRateExtremaWith((time) => ({
      distanceKm: 100 + time + Math.sin(2 * Math.PI * time),
      radialSpeedKmPerSecond: rate(time)
    }), [-2, -1, 0, 1, 2, 3], 0.001)).toEqual({ status: "complete", extrema: [] });
  });
});

function syntheticSample(body: PlanetaryBody, jd: number, root: number, sign: number): DistanceSample {
  const stepDays = PLANETARY_SEARCH_POLICIES[body].stepSeconds / 86_400;
  const distanceKm = 100 + sign * ((jd - root) / stepDays) ** 2;
  const instant: DistanceSample["instant"] = {
    utc: new Date((jd - 2_440_587.5) * 86_400_000).toISOString(), jdTt: jd, jdUt1: jd,
    deltaT: { seconds: 0, sigma: null, model: "pinned", table: null, tableDigest: null, segment: "pinned" },
    timeScale: { input: "tt", basis: "pinned", ut1MinusUtc: null, leapSeconds: null }
  };
  return {
    status: "ok", target: distanceTarget(body), instant, distanceKm, distanceAu: distanceKm / AU_KM,
    radialSpeedKmPerSecond: sign * 2 * (jd - root) / stepDays ** 2 / 86_400,
    orbitalSpeedKmPerSecond: 1,
    bounds: {
      position: { value: null, unit: "arcsec", label: "estimated", basis: "synthetic test only" },
      distance: null, speed: null
    },
    receipt: {
      schema: "zodiacs.calc-receipt.v1", instants: [instant], conventions: ["synthetic-test-only"],
      request: { body, time: tt(jd), center: "heliocentric", frame: "equatorial-j2000",
        flags: { correction: "geometric", speeds: true, cartesian: true } },
      engine: { name: "@zodiacs/engine", version: "0.0.0-synthetic",
        ephemeris: { name: "astronomy-engine", version: "0.0.0-synthetic" } }
    }
  };
}

function complete(result: PlanetarySearchResult) {
  if (result.status !== "complete") throw new Error(`${result.reason}: ${result.detail}`);
  return result;
}

describe("planetary wrapper ownership at an exact analytic zero", () => {
  it.each([
    { body: "Mercury", sign: 1 }, { body: "Mercury", sign: -1 },
    { body: "Neptune", sign: 1 }, { body: "Neptune", sign: -1 }
  ] as const)("partitions synthetic $body turns with sign $sign without losing witnesses", ({ body, sign }) => {
    const policy = PLANETARY_SEARCH_POLICIES[body];
    const root = policy.originJdTt;
    const stepDays = policy.stepSeconds / 86_400;
    vi.spyOn(sampling, "sampleDistance").mockImplementation((requestedBody, time) => {
      if (requestedBody !== body || typeof time !== "object" || !("jd" in time) || time.scale !== "tt") {
        throw new Error("Synthetic test requires the selected body and TT JD");
      }
      return syntheticSample(body, time.jd, root, sign);
    });
    const from = tt(root - stepDays);
    const to = tt(root + stepDays);
    const whole = complete(searchPlanetaryApsides(body, { from, to }));
    expect(whole.events).toHaveLength(1);
    const event = whole.events[0]!;
    expect(event.instant.jdTt).toBe(root);
    expect(event.kind).toBe(sign === 1 ? "perihelion" : "aphelion");
    expect(Math.abs(event.radialSpeedKmPerSecond)).toBe(0);
    expect(sign * event.motion.before.radialSpeedKmPerSecond).toBeLessThan(0);
    expect(sign * event.motion.after.radialSpeedKmPerSecond).toBeGreaterThan(0);
    const left = complete(searchPlanetaryApsides(body, { from, to: tt(root) }));
    const right = complete(searchPlanetaryApsides(body, { from: tt(root), to }));
    expect(left.events).toEqual([event]);
    expect(right.events).toEqual([]);
    const tiny = complete(searchPlanetaryApsides(body, { from: tt(root - 2 ** -31), to: tt(root) }));
    expect(tiny.events).toEqual([event]);
    expect(event.motion.before.instant.jdTt).toBeLessThan(tiny.window.from.jdTt);
    expect(event.motion.after.instant.jdTt).toBeGreaterThan(tiny.window.to.jdTt);
  });
});
