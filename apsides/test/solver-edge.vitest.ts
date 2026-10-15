import { describe, expect, it } from "vitest";
import { searchDistanceExtremaWith } from "../src/index.js";

type Options = Parameters<typeof searchDistanceExtremaWith>[1];

function options(overrides: Partial<Options> = {}): Options {
  return {
    sampleTimesSeconds: [-2, 0, 2],
    toleranceSeconds: 0.0001,
    maxEvaluations: 1000,
    ...overrides
  };
}

// These functions have analytic extrema. They test numerical search behavior,
// not the astronomical accuracy of the engine or the reference ephemeris.
describe("distance solver adversarial numerical cases", () => {
  it.each([
    { kind: "minimum", sign: 1 },
    { kind: "maximum", sign: -1 }
  ] as const)("keeps a %s between strict final endpoints", ({ kind, sign }) => {
    const center = 0.371;
    const toleranceSeconds = 0.0001;
    const result = searchDistanceExtremaWith(
      (time) => 100 + sign * (time - center) ** 2,
      options({ toleranceSeconds })
    );
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error("Unexpected numerical refusal");
    expect(result.extrema).toHaveLength(1);
    const event = result.extrema[0]!;
    expect(event.kind).toBe(kind);
    expect(event.lower.timeSeconds).toBeLessThanOrEqual(center);
    expect(event.upper.timeSeconds).toBeGreaterThanOrEqual(center);
    expect(event.upper.timeSeconds - event.lower.timeSeconds).toBeLessThanOrEqual(toleranceSeconds);
    expect(event.sample.timeSeconds).toBeGreaterThan(event.lower.timeSeconds);
    expect(event.sample.timeSeconds).toBeLessThan(event.upper.timeSeconds);
    expect(Math.abs(event.sample.timeSeconds - center)).toBeLessThanOrEqual(toleranceSeconds);
    expect(sign * (event.lower.distanceKm - event.sample.distanceKm)).toBeGreaterThan(0);
    expect(sign * (event.upper.distanceKm - event.sample.distanceKm)).toBeGreaterThan(0);
  });

  it("resolves equal coarse distances when their midpoint reveals a strict turn", () => {
    const result = searchDistanceExtremaWith(
      (time) => 10 + time ** 2,
      options({ sampleTimesSeconds: [-3, -1, 1, 3] })
    );
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error("Symmetric minimum was refused");
    expect(result.extrema).toHaveLength(1);
    expect(result.extrema[0]!.kind).toBe("minimum");
    expect(Math.abs(result.extrema[0]!.sample.timeSeconds)).toBeLessThanOrEqual(0.0001);
  });

  it.each([
    { name: "a true flat bottom", value: (time: number) => 100 + Math.max(0, Math.abs(time) - 0.5) ** 2 },
    { name: "a rounded floating-point bottom", value: (time: number) => 1e16 + time ** 2 },
    { name: "a true flat top", value: (time: number) => 100 - Math.max(0, Math.abs(time) - 0.5) ** 2 }
  ])("refuses $name instead of manufacturing a narrow event", ({ value }) => {
    const result = searchDistanceExtremaWith(value, options({ sampleTimesSeconds: [-4, 0, 4] }));
    expect(result).toMatchObject({ status: "refused", reason: "ambiguous-distance", extrema: [] });
  });

  it("refuses a constant distance rather than asserting that no extremum exists", () => {
    expect(searchDistanceExtremaWith(() => 20, options())).toMatchObject({
      status: "refused", reason: "ambiguous-distance", extrema: []
    });
  });

  it("encloses a narrow flat minimum instead of claiming a unique point inside it", () => {
    const halfWidth = 0.04;
    const result = searchDistanceExtremaWith(
      (time) => 10 + Math.max(0, Math.abs(time) - halfWidth) ** 2,
      options({ toleranceSeconds: 0.1 })
    );
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error("Resolvable enclosing interval was refused");
    expect(result.extrema).toHaveLength(1);
    const event = result.extrema[0]!;
    expect(event.lower.timeSeconds).toBeLessThan(-halfWidth);
    expect(event.upper.timeSeconds).toBeGreaterThan(halfWidth);
    expect(event.upper.timeSeconds - event.lower.timeSeconds).toBeLessThanOrEqual(0.1);
    expect(Math.abs(event.sample.timeSeconds)).toBeLessThanOrEqual(halfWidth);
    expect(event.lower.distanceKm).toBeGreaterThan(event.sample.distanceKm);
    expect(event.upper.distanceKm).toBeGreaterThan(event.sample.distanceKm);
  });

  it.each([1, -1])("completes a strictly monotone curve with slope %s without endpoint events", (slope) => {
    const result = searchDistanceExtremaWith((time) => 100 + slope * time, options());
    expect(result).toMatchObject({ status: "complete", extrema: [], evaluations: 3 });
  });

  it("refuses when the time coordinate cannot represent a narrow enough interval", () => {
    const origin = 2 ** 53;
    const result = searchDistanceExtremaWith(
      (time) => 100 + (time - (origin + 2)) ** 2,
      options({ sampleTimesSeconds: [origin, origin + 2, origin + 4], toleranceSeconds: 0.01 })
    );
    expect(result).toMatchObject({ status: "refused", reason: "time-resolution", extrema: [] });
  });
});

describe("distance solver evaluation boundary", () => {
  it("captures the input grid before a callback can mutate the caller's array", () => {
    const grid = [-2, 0, 2];
    const settings = options({ sampleTimesSeconds: grid });
    const calls: number[] = [];
    const result = searchDistanceExtremaWith((time) => {
      calls.push(time);
      grid[2] = 10_000;
      return 10 + (time - 0.371) ** 2;
    }, settings);
    expect(result.status).toBe("complete");
    expect(calls.every((time) => time >= -2 && time <= 2)).toBe(true);
    expect(calls).not.toContain(10_000);
  });

  it("evaluates each coordinate once, including shared brackets and symmetric probes", () => {
    const calls: number[] = [];
    const grid = Object.freeze([-2, -1, 0, 1, 2]);
    const result = searchDistanceExtremaWith((time) => {
      calls.push(time);
      return 10 + (time ** 2 - 1) ** 2;
    }, options({ sampleTimesSeconds: grid }));
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error("Polynomial search was refused");
    expect(result.extrema.map(({ kind }) => kind)).toEqual(["minimum", "maximum", "minimum"]);
    expect(result.extrema.map(({ sample }) => Math.round(sample.timeSeconds))).toEqual([-1, 0, 1]);
    expect(result.evaluations).toBe(calls.length);
    expect(new Set(calls).size).toBe(calls.length);
    expect(calls.every((time) => time >= grid[0]! && time <= grid[grid.length - 1]!)).toBe(true);
    expect(grid).toEqual([-2, -1, 0, 1, 2]);
  });

  it("accepts the exact work budget and returns no partial list one evaluation short", () => {
    const distance = (time: number) => 10 + (time ** 2 - 1) ** 2;
    const baseOptions = options({ sampleTimesSeconds: [-2, -1, 0, 1, 2] });
    const baseline = searchDistanceExtremaWith(distance, baseOptions);
    expect(baseline.status).toBe("complete");
    if (baseline.status !== "complete") throw new Error("Polynomial search was refused");
    const exact = searchDistanceExtremaWith(distance, { ...baseOptions, maxEvaluations: baseline.evaluations });
    expect(exact).toEqual({ ...baseline, maxEvaluations: baseline.evaluations });

    let calls = 0;
    const short = searchDistanceExtremaWith((time) => {
      calls += 1;
      return distance(time);
    }, { ...baseOptions, maxEvaluations: baseline.evaluations - 1 });
    expect(short).toMatchObject({
      status: "refused", reason: "evaluation-budget", extrema: [],
      evaluations: baseline.evaluations - 1, maxEvaluations: baseline.evaluations - 1
    });
    expect(calls).toBe(short.evaluations);
  });

  it("refuses an unaffordable coarse grid without calling the evaluator", () => {
    let calls = 0;
    const result = searchDistanceExtremaWith(() => {
      calls += 1;
      return 10;
    }, options({ maxEvaluations: 2 }));
    expect(result).toMatchObject({ status: "refused", reason: "evaluation-budget", extrema: [], evaluations: 0 });
    expect(calls).toBe(0);
  });

  it("counts a coarse-tie midpoint against the same budget", () => {
    let calls = 0;
    const result = searchDistanceExtremaWith((time) => {
      calls += 1;
      return 10 + time ** 2;
    }, options({ sampleTimesSeconds: [-3, -1, 1, 3], maxEvaluations: 4 }));
    expect(result).toMatchObject({ status: "refused", reason: "evaluation-budget", extrema: [], evaluations: 4 });
    expect(calls).toBe(4);
  });
});

describe("distance solver invalid input and callback failures", () => {
  it.each([
    { sampleTimesSeconds: [] },
    { sampleTimesSeconds: [0, 1] },
    { sampleTimesSeconds: [0, 0, 1] },
    { sampleTimesSeconds: [0, 2, 1] },
    { sampleTimesSeconds: [0, NaN, 2] },
    { sampleTimesSeconds: [0, 1, Infinity] },
    { sampleTimesSeconds: [-Number.MAX_VALUE, 0, Number.MAX_VALUE] },
    { toleranceSeconds: 0 },
    { toleranceSeconds: -1 },
    { toleranceSeconds: NaN },
    { toleranceSeconds: Infinity },
    { maxEvaluations: 0 },
    { maxEvaluations: 1.5 },
    { maxEvaluations: Infinity },
    { maxEvaluations: Number.MAX_SAFE_INTEGER + 1 }
  ])("validates all options before evaluation: %j", (invalid) => {
    let calls = 0;
    expect(() => searchDistanceExtremaWith(() => {
      calls += 1;
      return 10;
    }, options(invalid))).toThrow(RangeError);
    expect(calls).toBe(0);
  });

  it.each([NaN, Infinity, -Infinity, 0, -1])("rejects invalid distance %s", (value) => {
    expect(() => searchDistanceExtremaWith(() => value, options())).toThrow(RangeError);
  });

  it("validates distances returned during refinement", () => {
    let calls = 0;
    expect(() => searchDistanceExtremaWith((time) => {
      calls += 1;
      return calls <= 3 ? 10 + time ** 2 : Infinity;
    }, options())).toThrow(RangeError);
    expect(calls).toBe(4);
  });

  it("preserves exceptions raised by the callback", () => {
    const failure = new Error("Evaluator failed");
    expect(() => searchDistanceExtremaWith(() => { throw failure; }, options())).toThrow(failure);
  });
});
