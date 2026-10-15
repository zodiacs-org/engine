import { describe, expect, it } from "vitest";
import { searchDistanceExtremaWith } from "../src/index.js";
import type { DistanceSolverOptions, DistanceSolverResult } from "../src/index.js";

const options: DistanceSolverOptions = {
  sampleTimesSeconds: [-4, -2, 0, 2, 4],
  toleranceSeconds: 0.001,
  maxEvaluations: 1_000
};

function complete(result: DistanceSolverResult) {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Unexpected refusal: ${result.reason}`);
  return result;
}

// Analytic mathematical expectations only, not astronomical accuracy evidence.
describe("scalar distance extrema", () => {
  it.each(["minimum", "maximum"] as const)("encloses an asymmetric %s", (kind) => {
    const sign = kind === "minimum" ? 1 : -1;
    const root = 0.37;
    const distanceAt = (t: number) => 100 + sign * (t - root) ** 2 * (1 + 0.05 * (t - root));
    const result = complete(searchDistanceExtremaWith(distanceAt, options));
    expect(result.extrema).toHaveLength(1);
    const event = result.extrema[0]!;
    expect(event.kind).toBe(kind);
    expect(event.lower.timeSeconds).toBeLessThanOrEqual(root);
    expect(event.upper.timeSeconds).toBeGreaterThanOrEqual(root);
    expect(event.upper.timeSeconds - event.lower.timeSeconds).toBeLessThanOrEqual(options.toleranceSeconds);
    expect(Math.abs(event.sample.timeSeconds - root)).toBeLessThanOrEqual(options.toleranceSeconds);
    expect(event.sample.distanceKm).toBe(distanceAt(event.sample.timeSeconds));
    expect(event.sample.timeSeconds).toBeGreaterThan(event.lower.timeSeconds);
    expect(event.sample.timeSeconds).toBeLessThan(event.upper.timeSeconds);
    expect(sign * event.sample.distanceKm).toBeLessThan(sign * event.lower.distanceKm);
    expect(sign * event.sample.distanceKm).toBeLessThan(sign * event.upper.distanceKm);
    expect(event.bracket.map((point) => point.timeSeconds)).toEqual([-2, 0, 2]);
  });

  it("finds every witnessed turn of an analytic periodic curve in chronological order", () => {
    const times = Array.from({ length: 31 }, (_, index) => -1 + index / 2);
    const result = complete(searchDistanceExtremaWith((t) => 20 + Math.cos(t), {
      ...options, sampleTimesSeconds: times
    }));
    const expected = [0, Math.PI, 2 * Math.PI, 3 * Math.PI, 4 * Math.PI];
    expect(result.extrema).toHaveLength(expected.length);
    for (const [index, root] of expected.entries()) {
      const event = result.extrema[index]!;
      expect(event.kind).toBe(index % 2 === 0 ? "maximum" : "minimum");
      expect(event.lower.timeSeconds).toBeLessThanOrEqual(root);
      expect(event.upper.timeSeconds).toBeGreaterThanOrEqual(root);
      expect(event.upper.timeSeconds - event.lower.timeSeconds).toBeLessThanOrEqual(options.toleranceSeconds);
    }
  });

  it.each([-1, 1])("returns no event for a monotone curve with slope %s", (slope) => {
    const result = complete(searchDistanceExtremaWith((t) => 10 + slope * t, options));
    expect(result.extrema).toEqual([]);
    expect(result.evaluations).toBe(options.sampleTimesSeconds.length);
  });

  it("does not invent extrema at grid endpoints", () => {
    const result = complete(searchDistanceExtremaWith((t) => 10 + t ** 2, {
      ...options, sampleTimesSeconds: [0, 0.3, 0.7, 1]
    }));
    expect(result.extrema).toEqual([]);
  });

  it("handles an irregular grid and a short final interval", () => {
    const root = 9.9997;
    const result = complete(searchDistanceExtremaWith((t) => 1 + (t - root) ** 2, {
      ...options, sampleTimesSeconds: [0, 4, 9, 9.9998, 10], toleranceSeconds: 0.0001
    }));
    expect(result.extrema).toHaveLength(1);
    expect(Math.abs(result.extrema[0]!.sample.timeSeconds - root)).toBeLessThanOrEqual(0.0001);
  });

  it("preserves solutions under exact time translation and positive distance scaling", () => {
    const source = (t: number) => 4 + (t - 0.375) ** 2;
    const base = complete(searchDistanceExtremaWith(source, options));
    const shift = 1_000_000;
    const translated = complete(searchDistanceExtremaWith((t) => source(t - shift) * 8, {
      ...options, sampleTimesSeconds: options.sampleTimesSeconds.map((t) => t + shift)
    }));
    expect(translated.extrema).toHaveLength(base.extrema.length);
    expect(Math.abs(translated.extrema[0]!.sample.timeSeconds - shift - base.extrema[0]!.sample.timeSeconds))
      .toBeLessThanOrEqual(options.toleranceSeconds);
  });

  it("meets the one-second interval target on a synthetic curve with day-sized sampling", () => {
    // This is a mathematical parabola, not a model or observation of the Moon.
    const root = 123_456.789;
    const result = complete(searchDistanceExtremaWith((t) => 400_000 + ((t - root) / 1000) ** 2, {
      sampleTimesSeconds: [0, 86_400, 172_800, 259_200],
      toleranceSeconds: 1,
      maxEvaluations: 200
    }));
    expect(result.extrema).toHaveLength(1);
    const event = result.extrema[0]!;
    expect(event.lower.timeSeconds).toBeLessThanOrEqual(root);
    expect(event.upper.timeSeconds).toBeGreaterThanOrEqual(root);
    expect(event.upper.timeSeconds - event.lower.timeSeconds).toBeLessThanOrEqual(1);
  });
});

describe("work accounting and deterministic results", () => {
  it("counts each distinct callback invocation and reuses shared witnesses", () => {
    const calls: number[] = [];
    const distanceAt = (t: number) => {
      calls.push(t);
      return 10 + Math.cos(t);
    };
    const settings = { ...options, sampleTimesSeconds: [-1, 0, 1, 2, 3, 4, 5, 6, 7] };
    const result = complete(searchDistanceExtremaWith(distanceAt, settings));
    expect(result.extrema).toHaveLength(3);
    expect(result.evaluations).toBe(calls.length);
    expect(new Set(calls).size).toBe(calls.length);
    expect(calls.every((t) => t >= -1 && t <= 7)).toBe(true);
    expect(result.evaluations).toBeLessThanOrEqual(settings.maxEvaluations);

    calls.length = 0;
    expect(searchDistanceExtremaWith(distanceAt, settings)).toEqual(result);
    expect(calls.length).toBe(result.evaluations);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("snapshots the grid before a callback mutates the caller's array", () => {
    const grid = [-4, -2, 0, 2, 4];
    const distanceAt = (t: number) => 10 + (t - 0.3) ** 2;
    const expected = searchDistanceExtremaWith(distanceAt, { ...options, sampleTimesSeconds: grid });
    const result = searchDistanceExtremaWith((t) => {
      grid.length = 0;
      return distanceAt(t);
    }, { ...options, sampleTimesSeconds: grid });
    expect(result).toEqual(expected);
  });

  it("does not return an earlier completed extremum when a later refinement exhausts the budget", () => {
    const settings = { ...options, sampleTimesSeconds: [-1, 0, 1, 2, 3, 4, 5, 6, 7] };
    const distanceAt = (t: number) => 10 + Math.cos(t);
    const result = complete(searchDistanceExtremaWith(distanceAt, settings));
    const budget = result.evaluations - 1;
    expect(searchDistanceExtremaWith(distanceAt, { ...settings, maxEvaluations: budget })).toMatchObject({
      status: "refused", reason: "evaluation-budget", evaluations: budget, extrema: []
    });
    expect(searchDistanceExtremaWith(distanceAt, { ...settings, maxEvaluations: result.evaluations }))
      .toEqual({ ...result, maxEvaluations: result.evaluations });
  });
});
