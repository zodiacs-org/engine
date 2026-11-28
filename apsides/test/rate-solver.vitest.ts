import { describe, expect, it } from "vitest";
import { searchAnalyticRateExtremaWith } from "../src/rate-solver.js";

const grid = [-3, -2, -1, 0, 1, 2, 3];

// Analytic mathematical functions test the derivative solver independently of
// any astronomical model. This is numerical evidence, not ephemeris accuracy.
describe("analytic distance-rate refinement", () => {
  it.each([
    { root: 0.3, sign: 1, kind: "minimum" },
    { root: 0.3, sign: -1, kind: "maximum" },
    { root: 0, sign: 1, kind: "minimum" },
    { root: 0, sign: -1, kind: "maximum" }
  ])("locates a $kind at $root with signed rate and wide distance witnesses", ({ root, sign, kind }) => {
    const sample = (t: number) => ({
      distanceKm: 100 + sign * (t - root) ** 2,
      radialSpeedKmPerSecond: sign * 2 * (t - root)
    });
    const result = searchAnalyticRateExtremaWith(sample, grid, 0.001);
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error(result.reason);
    expect(result.extrema).toHaveLength(1);
    const event = result.extrema[0]!;
    expect(event.kind).toBe(kind);
    expect(event.lower.timeSeconds).toBeLessThan(root);
    expect(event.upper.timeSeconds).toBeGreaterThan(root);
    expect(event.upper.timeSeconds - event.lower.timeSeconds).toBeLessThanOrEqual(0.001);
    expect(Math.abs(event.sample.timeSeconds - root)).toBeLessThanOrEqual(0.0005);
    expect(sign * sample(event.lower.timeSeconds).radialSpeedKmPerSecond).toBeLessThan(0);
    expect(sign * sample(event.upper.timeSeconds).radialSpeedKmPerSecond).toBeGreaterThan(0);
    for (const point of [event.bracket[0], event.bracket[2]]) {
      expect(sign * (point.distanceKm - event.sample.distanceKm)).toBeGreaterThan(0);
    }
  });

  it("uses analytic rates when nearby scalar distances are indistinguishable", () => {
    const root = 0.125;
    const result = searchAnalyticRateExtremaWith((t) => ({
      distanceKm: 1e10 + (t - root) ** 2,
      radialSpeedKmPerSecond: 2 * (t - root)
    }), grid, 1e-6);
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error(result.reason);
    const event = result.extrema[0]!;
    expect(event.lower.distanceKm).toBe(event.upper.distanceKm);
    expect(event.sample.distanceKm).toBe(event.lower.distanceKm);
    expect(event.lower.timeSeconds).toBeLessThan(root);
    expect(event.upper.timeSeconds).toBeGreaterThan(root);
  });

  it.each([0, 1])("does not turn monotone distance or a stationary inflection into an event (%s)", (mode) => {
    expect(searchAnalyticRateExtremaWith((t) => ({
      distanceKm: 100 + (mode ? t ** 3 : t),
      radialSpeedKmPerSecond: mode ? 3 * t ** 2 : 1
    }), grid, 0.001)).toEqual({ status: "complete", extrema: [] });
  });

  it("detects multiple analytic turns without an assumed event count", () => {
    // Exact binary grid coordinates and independently known periodic roots.
    const times = Array.from({ length: 65 }, (_, i) => i / 8 - 4);
    const result = searchAnalyticRateExtremaWith((t) => ({
      distanceKm: 100 + Math.cos(Math.PI * t),
      radialSpeedKmPerSecond: -Math.PI * Math.sin(Math.PI * t)
    }), times, 0.00001);
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error(result.reason);
    expect(result.extrema).toHaveLength(7);
    for (let i = 0; i < result.extrema.length; i += 1) {
      expect(Math.abs(result.extrema[i]!.sample.timeSeconds - (i - 3))).toBeLessThan(0.00001);
    }
  });

  it("does not lose a sign change through underflow when multiplying small rates", () => {
    const result = searchAnalyticRateExtremaWith((t) => ({
      distanceKm: 100 + (t - 0.3) ** 2,
      radialSpeedKmPerSecond: 1e-200 * (t - 0.3)
    }), grid, 0.001);
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error(result.reason);
    expect(result.extrema).toHaveLength(1);
  });

  it.each([
    { name: "flat rates", sample: (_t: number) => ({ distanceKm: 100, radialSpeedKmPerSecond: 0 }), reason: "ambiguous-distance" },
    { name: "rates contradict distance", sample: (t: number) => ({ distanceKm: 100 + t, radialSpeedKmPerSecond: 2 * t }), reason: "non-unimodal" },
    { name: "zero plateau", sample: (t: number) => ({ distanceKm: 100 + t ** 2, radialSpeedKmPerSecond: Math.abs(t) < 0.8 ? 0 : t }), reason: "ambiguous-distance" }
  ])("refuses $name", ({ sample, reason }) => {
    expect(searchAnalyticRateExtremaWith(sample, grid, 0.001)).toMatchObject({
      status: "refused", reason, extrema: []
    });
  });

  it("propagates evaluation-budget exceptions from its wrapper", () => {
    const failure = new Error("Synthetic budget refusal");
    expect(() => searchAnalyticRateExtremaWith(() => { throw failure; }, grid, 1)).toThrow(failure);
  });

  it.each([
    { distanceKm: NaN, radialSpeedKmPerSecond: 1 },
    { distanceKm: 0, radialSpeedKmPerSecond: 1 },
    { distanceKm: 1, radialSpeedKmPerSecond: Infinity }
  ])("rejects invalid samples", (sample) => {
    expect(() => searchAnalyticRateExtremaWith(() => sample, grid, 1)).toThrow(RangeError);
  });
});
