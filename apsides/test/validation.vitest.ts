import { describe, expect, it } from "vitest";
import { matchEvents, measureCase, measurePhysicalCenters, renderReport } from "../scripts/validation.mjs";

const actual = (jdTt: number, kind = "perigee", body = "Moon") => ({
  body, kind, instant: { jdTt }, distanceKm: 100,
  refinement: { lower: { jdTt: jdTt - 1e-6 }, upper: { jdTt: jdTt + 1e-6 } }
});
const reference = (id: string, jdTt: number, kind = "perigee") => ({ id, jdTt, kind });

describe("independent validation event accounting", () => {
  it("retains a measurable timing failure instead of matching only passing times", () => {
    const result = matchEvents([reference("a", 10), reference("b", 20, "apogee")],
      [actual(11), actual(20, "apogee")], "Moon", 0, 30);
    expect(result.matches).toEqual([
      { referenceIndex: 0, actualIndex: 0, neighborhoodJdTt: [0, 15] },
      { referenceIndex: 1, actualIndex: 1, neighborhoodJdTt: [15, 30] }
    ]);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
  });

  it("does not let an extra duplicate replace a missing neighbor", () => {
    const result = matchEvents([reference("a", 10), reference("b", 20)],
      [actual(9), actual(11)], "Moon", 0, 30);
    expect(result.matches).toEqual([]);
    expect(result.ambiguous).toEqual([{ referenceId: "a", actualIndices: [0, 1], neighborhoodJdTt: [0, 15] }]);
    expect(result.missing).toEqual(["b"]);
    expect(result.extra).toEqual([]);
  });

  it("accounts for wrong kinds, bodies, and events outside the half-open window", () => {
    const result = matchEvents([reference("a", 10)], [actual(10, "apogee"), actual(10, "perigee", "Earth"),
      actual(0), actual(31)], "Moon", 0, 30);
    expect(result.missing).toEqual(["a"]);
    expect(result.extra).toEqual([0, 1, 2, 3]);
  });

  it("owns midpoint ties once and includes the end, never the start", () => {
    const result = matchEvents([reference("a", 10), reference("b", 20)],
      [actual(0), actual(15), actual(30)], "Moon", 0, 30);
    expect(result.matches.map((row: { actualIndex: number }) => row.actualIndex)).toEqual([1, 2]);
    expect(result.extra).toEqual([0]);
  });

  it("handles empty independent windows without inventing matched events", () => {
    expect(matchEvents([], [], "Moon", 0, 30)).toEqual({ matches: [], missing: [], extra: [], ambiguous: [] });
    expect(matchEvents([], [actual(10)], "Moon", 0, 30).extra).toEqual([0]);
  });

  it("rejects invalid reference chronology and nonfinite engine events", () => {
    expect(() => matchEvents([reference("a", 20), reference("b", 10)], [], "Moon", 0, 30)).toThrow();
    expect(() => matchEvents([reference("a", 0)], [], "Moon", 0, 30)).toThrow();
    expect(() => matchEvents([], [actual(NaN)], "Moon", 0, 30)).toThrow();
  });
});

const sample = (jdTt: number) => ({ jdTt, distanceKm: 100, radialSpeedKmPerSecond: 0,
  velocityKmPerSecond: [0, 3, 4] });
const fixture = {
  case: { id: "synthetic", body: "Moon", split: "held-out", fromTt: "2000-01-01", toTt: "2000-02-01", stepDays: 1 },
  target: {}, grid: [[0], [30]], sources: [{ header: {} }],
  events: [{ ...reference("a", 10), distanceKm: 100, bracketSeconds: 0.5,
    samples: { before: sample(9), at: sample(10), after: sample(11) } }]
};
const budget = { eventTimeSeconds: 120, distanceKm: 1, radialSpeedKmPerSecond: 0.01, orbitalSpeedKmPerSecond: 0.01 };
const sampler = (_body: string, { jd }: { jd: number }) => ({ status: "ok", instant: { jdTt: jd },
  distanceKm: 102, radialSpeedKmPerSecond: 0.02, orbitalSpeedKmPerSecond: 5.03 });

describe("validation errors and failure visibility", () => {
  it("records all independent metrics and probes after a search refusal", () => {
    const report = measureCase(fixture, budget, 1, { status: "refused", reason: "ambiguous-distance" }, sampler);
    expect(report.counts).toEqual({ reference: 1, returned: null, matched: 0, missed: null,
      extra: null, ambiguous: null, expectedSamples: 3, comparedSamples: 3 });
    expect(report.failures).toHaveLength(10);
    expect(report.maximumAbsoluteErrors.eventTimeSeconds).toBe(null);
    expect(report.maximumAbsoluteErrors.sameTtDistanceKm).toBe(2);
    expect(report.samples[0]!.signedErrors.sameTtOrbitalSpeedKmPerSecond).toBeCloseTo(0.03, 12);
    expect(report.pass).toBe(false);
  });

  it("keeps event distance separate from same-TT distance and time", () => {
    const report = measureCase(fixture, budget, 1, { status: "complete", events: [actual(10.01)] }, sampler);
    expect(report.events[0]!.signedErrors.eventTimeSeconds).toBeCloseTo(864, 7);
    expect(report.events[0]!.signedErrors.eventDistanceKm).toBe(0);
    expect(report.maximumAbsoluteErrors.sameTtDistanceKm).toBe(2);
    expect(report.counts.matched).toBe(1);
    expect(report.failures.some((row) => row.check === "eventTimeSeconds")).toBe(true);
    expect(report.failures.some((row) => row.check === "missed-event")).toBe(false);
  });

  it("does not drop sample refusals, exceptions, different epochs or nonfinite values", () => {
    for (const badSample of [() => ({ status: "refused", reason: "out-of-range" }),
      () => { throw new Error("sample failed"); },
      () => ({ ...sampler("Moon", { jd: 10 }), instant: { jdTt: -1 } }),
      (_body: string, time: { jd: number }) => ({ ...sampler("Moon", time), distanceKm: NaN })]) {
      const report = measureCase(fixture, budget, 1, { status: "complete", events: [actual(10)] }, badSample);
      expect(report.pass).toBe(false);
      expect(report.failures.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("separates center displacement from the engine error with each center", () => {
    const result = measurePhysicalCenters({ cases: [{ body: "Mars", target: {}, samples: [{ jdTt: 10,
      barycenter: sample(10), physicalCenter: { ...sample(10), distanceKm: 105 } }] }] }, sampler);
    expect(result[0]!.signedDifferences.physicalMinusBarycenter.distanceKm).toBe(5);
    expect(result[0]!.signedDifferences.engineMinusBarycenter.distanceKm).toBe(2);
    expect(result[0]!.signedDifferences.engineMinusPhysical.distanceKm).toBe(-3);
  });

  it("renders conservatively rounded error magnitudes without disguising failure", () => {
    const item = measureCase(fixture, budget, 1, { status: "complete", events: [actual(10)] }, sampler);
    item.maximumAbsoluteErrors.sameTtDistanceKm = 1.23456789;
    const text = renderReport({ pass: false, runtime: { node: "test", platform: "test", arch: "test" },
      identities: {}, cases: [item], physicalCenters: [] });
    expect(text).toContain("**FAIL**");
    expect(text).toContain("1.23457");
    expect(text).toContain("sameTtDistanceKm");
    expect(text).not.toContain("\u2014");
  });
});
