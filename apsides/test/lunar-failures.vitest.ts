import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalcRefusal, CalcTime } from "@zodiacs/engine/calc";
import { LUNAR_SEARCH_POLICY, searchLunarApsides } from "../src/lunar.js";
import type { LunarSearchOptions, LunarSearchResult } from "../src/lunar.js";
import { AU_KM } from "../src/sample.js";
import type { DistanceSample } from "../src/sample.js";
import { DISTANCE_TARGETS } from "../src/targets.js";
import * as sampling from "../src/sample.js";
import * as solver from "../src/solver.js";

const origin = LUNAR_SEARCH_POLICY.originJdTt;
const tt = (jd: number): CalcTime => ({ jd, scale: "tt" });
const window = { from: tt(origin - 1), to: tt(origin + 1) };
const originalSolver = solver.searchDistanceExtremaWith;

function jdOf(time: CalcTime): number {
  if (typeof time !== "object" || time === null || !("jd" in time) || time.scale !== "tt") {
    throw new Error("This synthetic sampler accepts only explicit TT JDs.");
  }
  return time.jd;
}

// Entirely synthetic receipt and geometry: these values exercise the wrapper,
// never call an ephemeris, and are not astronomical accuracy evidence.
function syntheticSample(jdTt: number, distanceKm: number): DistanceSample {
  const instant: DistanceSample["instant"] = {
    utc: new Date((jdTt - 2_440_587.5) * 86_400_000).toISOString(),
    jdTt, jdUt1: jdTt,
    deltaT: { seconds: 0, sigma: null, model: "pinned", table: null, tableDigest: null, segment: "pinned" },
    timeScale: { input: "tt", basis: "pinned", ut1MinusUtc: null, leapSeconds: null }
  };
  return {
    status: "ok", target: DISTANCE_TARGETS.Moon, instant,
    distanceAu: distanceKm / AU_KM, distanceKm,
    radialSpeedKmPerSecond: 0, orbitalSpeedKmPerSecond: 1,
    bounds: {
      position: { value: null, unit: "arcsec", label: "estimated", basis: "synthetic test only" },
      distance: null, speed: null
    },
    receipt: {
      schema: "zodiacs.calc-receipt.v1",
      request: {
        body: "Moon", time: tt(jdTt), center: "geocentric", frame: "equatorial-j2000",
        flags: { correction: "geometric", speeds: true, cartesian: true }
      },
      instants: [instant], conventions: ["synthetic-test-only"],
      engine: {
        name: "@zodiacs/engine", version: "0.0.0-synthetic",
        ephemeris: { name: "astronomy-engine", version: "0.0.0-synthetic" }
      }
    }
  };
}

function useCurve(distanceAtJd: (jdTt: number) => number | CalcRefusal) {
  return vi.spyOn(sampling, "sampleDistance").mockImplementation((_body, time) => {
    const jdTt = jdOf(time);
    const distance = distanceAtJd(jdTt);
    return typeof distance === "number" ? syntheticSample(jdTt, distance) : distance;
  });
}

function complete(options: LunarSearchOptions = window): Extract<LunarSearchResult, { status: "complete" }> {
  const result = searchLunarApsides(options);
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`${result.reason}: ${result.detail}`);
  return result;
}

afterEach(() => vi.restoreAllMocks());

describe("synthetic lunar turns at canonical grid boundaries", () => {
  it.each([
    { position: "grid node", offsetDays: 0, kind: "perigee", sign: 1 },
    { position: "grid node", offsetDays: 0, kind: "apogee", sign: -1 },
    { position: "equal-grid midpoint", offsetDays: 0.25, kind: "perigee", sign: 1 },
    { position: "equal-grid midpoint", offsetDays: 0.25, kind: "apogee", sign: -1 }
  ])("finds and partitions a $kind at a $position", ({ offsetDays, kind, sign }) => {
    const rootJd = origin + offsetDays;
    useCurve((jd) => 100 + sign * (jd - rootJd) ** 2);
    const whole = complete();
    expect(whole.events).toHaveLength(1);
    const event = whole.events[0]!;
    expect(event.kind).toBe(kind);
    expect(event.refinement.bracket[1].jdTt).toBe(rootJd);
    expect(event.refinement.lower.jdTt).toBeLessThan(rootJd);
    expect(event.refinement.upper.jdTt).toBeGreaterThan(rootJd);
    expect(Math.abs(event.instant.jdTt - rootJd) * 86_400).toBeLessThanOrEqual(1);

    const cut = event.instant.jdTt;
    const left = complete({ from: window.from, to: tt(cut) });
    const right = complete({ from: tt(cut), to: window.to });
    expect(left.events).toEqual([event]);
    expect(right.events).toEqual([]);
    expect([...left.events, ...right.events]).toEqual(whole.events);
    expect(complete({ from: tt(cut - 1 / 86_400), to: tt(cut + 1 / 86_400) }).events).toEqual([event]);
  });
});

describe("lunar failures discard the entire event list", () => {
  it("refuses a flat curve instead of reporting a completed empty search", () => {
    const samples = useCurve(() => 100);
    const result = searchLunarApsides(window);
    expect(result).toMatchObject({ status: "refused", reason: "ambiguous-distance", events: [], engineRefusal: null });
    expect(result.diagnostics.evaluations).toBe(samples.mock.calls.length);
    expect(result.window).not.toBeNull();
  });

  it("preserves a refusal from a required interior sample, including its payload", () => {
    const refusal: CalcRefusal = {
      status: "refused", reason: "sample-budget", detail: "Synthetic dependency refusal",
      samples: 8, maxSamples: 8
    };
    const samples = useCurve((jd) => jd === origin ? refusal : 100 + (jd - origin) ** 2);
    const result = searchLunarApsides(window);
    expect(result).toMatchObject({ status: "refused", reason: "engine-refusal", events: [] });
    if (result.status !== "refused") throw new Error("Interior refusal was lost");
    expect(result.engineRefusal).toBe(refusal);
    expect(result.window).not.toBeNull();
    expect(result.diagnostics.evaluations).toBe(samples.mock.calls.length);
    expect(jdOf(samples.mock.calls[samples.mock.calls.length - 1]![1])).toBe(origin);
  });
});

describe("lunar duplicate and conflicting detections", () => {
  it("is unchanged by a repeated canonical detection represented by a distinct object", () => {
    useCurve((jd) => 100 + (jd - origin) ** 2);
    const baseline = complete();
    vi.spyOn(solver, "searchDistanceExtremaWith").mockImplementation((distanceAt, options) => {
      const result = originalSolver(distanceAt, options);
      if (result.status !== "complete") return result;
      return { ...result, extrema: [...result.extrema, ...structuredClone(result.extrema)] };
    });
    const repeated = complete();
    expect(repeated.events).toEqual(baseline.events);
    expect(repeated.diagnostics.evaluations).toBe(baseline.diagnostics.evaluations);
  });

  it("refuses incompatible overlapping detections rather than merging by a time epsilon", () => {
    useCurve((jd) => 100 + (jd - origin) ** 2);
    vi.spyOn(solver, "searchDistanceExtremaWith").mockImplementation((distanceAt, options) => {
      const result = originalSolver(distanceAt, options);
      if (result.status !== "complete" || result.extrema.length === 0) return result;
      const first = result.extrema[0]!;
      // Model a second detector offering the same narrow interval from a
      // different source bracket. The wrapper must expose the conflict.
      const timeSeconds = first.bracket[0].timeSeconds + 1;
      const alternative: solver.DistanceExtremum = {
        ...first,
        bracket: [
          { timeSeconds, distanceKm: distanceAt(timeSeconds) },
          first.bracket[1], first.bracket[2]
        ]
      };
      return { ...result, extrema: [first, alternative] };
    });
    expect(searchLunarApsides(window)).toMatchObject({
      status: "refused", reason: "overlapping-extrema", events: [], engineRefusal: null
    });
  });
});
