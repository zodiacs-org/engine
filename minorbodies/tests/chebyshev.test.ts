import { describe, expect, it } from "vitest";
import {
  CHEBYSHEV_LIMITS, evaluateChebyshevSegment, fitChebyshevSegment, validateChebyshevSegment
} from "../src/chebyshev.ts";
import type { CartesianTriple, ChebyshevFitInput, ChebyshevSegment } from "../src/chebyshev.ts";

const START = 2_451_545;
const END = START + 32;
const normalized = (jd: number, start = START, end = END): number => 2 * ((jd - start) / (end - start)) - 1;

function epochs(count: number, start = START, end = END): number[] {
  // Emulate Horizons' printed epochs. The fit must use these rounded dates,
  // not treat them as the mathematically exact roots used to propose them.
  return Array.from({ length: count }, (_, i) => Number((
    start + (end - start) * (1 - Math.cos(Math.PI * (i + 0.5) / count)) / 2
  ).toFixed(9)));
}

function fitFunction(degree: number, count: number, fn: (x: number) => CartesianTriple,
  start = START, end = END): ChebyshevSegment {
  return fitChebyshevSegment({
    startJdTt: start, endJdTt: end, degree,
    samples: epochs(count, start, end).map((jdTt) => ({ jdTt, positionAu: fn(normalized(jdTt, start, end)) }))
  });
}

function checkTriple(actual: CartesianTriple, expected: CartesianTriple, tolerance: number): void {
  for (let axis = 0; axis < 3; axis++) expect(Math.abs(actual[axis]! - expected[axis]!)).toBeLessThanOrEqual(tolerance);
}

function polynomial(x: number): CartesianTriple {
  // Monomial arithmetic is independent of the Chebyshev basis and evaluator.
  return [3 + x * (2 + x * (-4 + x * 0.5)), -7 + 0.1 * x ** 5, 1.2 - 0.3 * x ** 6 + 2 * x ** 4];
}

function polynomialDerivative(x: number, span = END - START): CartesianTriple {
  const rate = 2 / span;
  return [(2 - 8 * x + 1.5 * x ** 2) * rate, 0.5 * x ** 4 * rate, (-1.8 * x ** 5 + 8 * x ** 3) * rate];
}

describe("Chebyshev numerical core, analytic references only", () => {
  it.each([7, 27])("reconstructs a polynomial from %i actual Julian epochs", (count) => {
    const segment = fitFunction(6, count, polynomial);
    for (const fraction of [0, 0.000013, 0.127, 0.431, 0.5, 0.79, 0.999983, 1]) {
      const jd = START + fraction * (END - START);
      const result = evaluateChebyshevSegment(segment, jd);
      checkTriple(result.positionAu, polynomial(normalized(jd)), 3e-14);
      checkTriple(result.velocityAuPerDay, polynomialDerivative(normalized(jd)), 3e-14);
    }
  });

  it("fits irregular epochs without assuming cosine nodes", () => {
    const samples = [0, 0.03, 0.1, 0.21, 0.4, 0.67, 0.72, 0.9, 0.98, 1]
      .map((fraction) => START + fraction * (END - START))
      .map((jdTt) => ({ jdTt, positionAu: polynomial(normalized(jdTt)) }));
    const segment = fitChebyshevSegment({ startJdTt: START, endJdTt: END, degree: 6, samples });
    for (const jd of [START, START + 1, START + 9, END]) {
      const result = evaluateChebyshevSegment(segment, jd);
      checkTriple(result.positionAu, polynomial(normalized(jd)), 3e-14);
      checkTriple(result.velocityAuPerDay, polynomialDerivative(normalized(jd)), 3e-14);
    }
  });

  it("uses rounded source dates even on a short segment", () => {
    const end = START + 0.01;
    const segment = fitFunction(6, 24, polynomial, START, end);
    for (const fraction of [0, 0.0417, 0.35, 0.682, 1]) {
      const jd = START + fraction * (end - START);
      const result = evaluateChebyshevSegment(segment, jd);
      checkTriple(result.positionAu, polynomial(normalized(jd, START, end)), 3e-14);
      checkTriple(result.velocityAuPerDay, polynomialDerivative(normalized(jd, START, end), end - START), 1e-10);
    }
  });

  it("agrees with trigonometric functions and their analytic rates at independent probes", () => {
    const fn = (x: number): CartesianTriple => [Math.sin(2.3 * x), Math.cos(1.7 * x), Math.sin(x) * Math.cos(x)];
    const segment = fitFunction(18, 40, fn);
    const training = new Set(epochs(40));
    for (let i = 0; i <= 120; i++) {
      const jd = START + (END - START) * i / 120;
      expect(training.has(jd)).toBe(false);
      const x = normalized(jd);
      const result = evaluateChebyshevSegment(segment, jd);
      checkTriple(result.positionAu, fn(x), 2e-14);
      checkTriple(result.velocityAuPerDay,
        [2.3 * Math.cos(2.3 * x) / 16, -1.7 * Math.sin(1.7 * x) / 16, Math.cos(2 * x) / 16], 2e-13);
    }
  });

  it("fits the highest permitted degree and differentiates both endpoints", () => {
    const n = CHEBYSHEV_LIMITS.maxDegree;
    const fn = (x: number): CartesianTriple => [Math.cos(n * Math.acos(x)), x ** n, x ** (n - 1)];
    const segment = fitFunction(n, 2 * n + 1, fn);
    for (const fraction of [0, 0.0001, 0.113, 0.5, 0.873, 0.9999, 1]) {
      const jd = START + (END - START) * fraction;
      const x = normalized(jd);
      const derivative = x === -1 ? -(n ** 2) : x === 1 ? n ** 2
        : n * Math.sin(n * Math.acos(x)) / Math.sqrt(1 - x * x);
      const result = evaluateChebyshevSegment(segment, jd);
      checkTriple(result.positionAu, fn(x), 8e-14);
      checkTriple(result.velocityAuPerDay,
        [derivative / 16, n * x ** (n - 1) / 16, (n - 1) * x ** (n - 2) / 16], 2e-10);
    }
  });

  it("solves overdetermined least squares rather than selecting interpolation rows", () => {
    const samples = [-1, -0.5, 0, 0.5, 1].map((x) => ({
      jdTt: START + (x + 1) * 16,
      positionAu: [x * x, 2 * x + 3 * x * x, 1 - x * x] as CartesianTriple
    }));
    const segment = fitChebyshevSegment({ startJdTt: START, endJdTt: END, degree: 1, samples });
    // For these symmetric nodes mean(x^2)=1/2 and sum(x^3)=0.
    for (const jd of [START, START + 3, END]) {
      const result = evaluateChebyshevSegment(segment, jd);
      checkTriple(result.positionAu, [0.5, 1.5 + 2 * normalized(jd), 0.5], 2e-15);
      checkTriple(result.velocityAuPerDay, [0, 2 / 16, 0], 2e-16);
    }
  });

  it("handles constants and linear trajectories including a single constant sample", () => {
    const constant = fitFunction(0, 1, () => [3, -7, 0]);
    const linear = fitFunction(1, 2, (x) => [2 + 3 * x, -x, x / 4]);
    for (const jd of [START, START + 17, END]) {
      checkTriple(evaluateChebyshevSegment(constant, jd).positionAu, [3, -7, 0], 0);
      checkTriple(evaluateChebyshevSegment(constant, jd).velocityAuPerDay, [0, 0, 0], 0);
      const result = evaluateChebyshevSegment(linear, jd);
      const x = normalized(jd);
      checkTriple(result.positionAu, [2 + 3 * x, -x, x / 4], 2e-15);
      checkTriple(result.velocityAuPerDay, [3 / 16, -1 / 16, 1 / 64], 2e-16);
    }
  });

  it("defines unhalved coefficients and scales rates by the segment duration", () => {
    const segment = validateChebyshevSegment({
      startJdTt: START, endJdTt: START + 4,
      coefficientsAu: [[1, 2, 3], [0, 0, 1], [-2, 0, 0]]
    });
    for (const x of [-1, -0.25, 0, 0.75, 1]) {
      const result = evaluateChebyshevSegment(segment, START + (x + 1) * 2);
      checkTriple(result.positionAu, [1 + 2 * x + 3 * (2 * x * x - 1), 2 * x * x - 1, -2], 0);
      checkTriple(result.velocityAuPerDay, [1 + 6 * x, 2 * x, 0], 0);
    }
  });

  it("has deterministic serialized output and does not mutate training arrays", () => {
    const samples = epochs(16).map((jdTt) => ({ jdTt, positionAu: [...polynomial(normalized(jdTt))] as [number, number, number] }));
    const input = { startJdTt: START, endJdTt: END, degree: 6, samples };
    const before = JSON.stringify(input);
    const first = fitChebyshevSegment(input);
    expect(JSON.stringify(fitChebyshevSegment(input))).toBe(JSON.stringify(first));
    expect(JSON.stringify(input)).toBe(before);
    samples[0]!.positionAu[0] = 999;
    expect(JSON.stringify(first)).toBe(JSON.stringify(fitFunction(6, 16, polynomial)));
  });
});

describe("Chebyshev validation and refusal", () => {
  const validData = () => ({ startJdTt: START, endJdTt: END, coefficientsAu: [[1, 2], [3, 4], [5, 6]] });
  const validFit = (): ChebyshevFitInput => ({
    startJdTt: START, endJdTt: END, degree: 1,
    samples: [{ jdTt: START, positionAu: [1, 2, 3] }, { jdTt: END, positionAu: [3, 4, 5] }]
  });

  it("preserves the documented operational caps, not accuracy bounds", () => {
    expect(CHEBYSHEV_LIMITS).toEqual({
      maxDegree: 64, maxSamples: 4096, maxAbsAu: 1_000_000,
      maxJdTt: 10_000_000, maxConditionInfinity: 100_000_000
    });
    expect(Object.isFrozen(CHEBYSHEV_LIMITS)).toBe(true);
  });

  it("freezes defensive snapshots and only reuses its own validated identities", () => {
    const input = validData();
    const segment = validateChebyshevSegment(input);
    expect(segment).not.toBe(input);
    expect(validateChebyshevSegment(segment)).toBe(segment);
    expect(Object.isFrozen(segment)).toBe(true);
    expect(Object.isFrozen(segment.coefficientsAu)).toBe(true);
    segment.coefficientsAu.forEach((axis) => expect(Object.isFrozen(axis)).toBe(true));
    input.coefficientsAu[0]![0] = 99;
    input.startJdTt = START - 10;
    expect(segment.coefficientsAu[0][0]).toBe(1);
    expect(segment.startJdTt).toBe(START);
    const externalFrozen = Object.freeze(validData());
    const externalSnapshot = validateChebyshevSegment(externalFrozen);
    expect(externalSnapshot).not.toBe(externalFrozen);
    externalFrozen.coefficientsAu[0]![0] = 99;
    expect(externalSnapshot.coefficientsAu[0][0]).toBe(1);
    const result = evaluateChebyshevSegment(segment, START);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.positionAu)).toBe(true);
    expect(Object.isFrozen(result.velocityAuPerDay)).toBe(true);
    expect(() => Object.assign(segment.coefficientsAu[0], { 0: 99 })).toThrow(TypeError);
  });

  it.each([
    null, undefined, [], {}, { ...validData(), extra: true },
    { ...validData(), startJdTt: NaN }, { ...validData(), endJdTt: Infinity },
    { ...validData(), startJdTt: 0 }, { ...validData(), endJdTt: CHEBYSHEV_LIMITS.maxJdTt + 1 },
    { ...validData(), endJdTt: START }, { ...validData(), endJdTt: START - 1 },
    { ...validData(), coefficientsAu: [[1], [2]] }, { ...validData(), coefficientsAu: [[], [], []] },
    { ...validData(), coefficientsAu: [[1], [2, 3], [4]] },
    { ...validData(), coefficientsAu: [[NaN], [2], [3]] },
    { ...validData(), coefficientsAu: [[Infinity], [2], [3]] },
    { ...validData(), coefficientsAu: [["1"], [2], [3]] },
    { ...validData(), coefficientsAu: [[CHEBYSHEV_LIMITS.maxAbsAu + 1], [2], [3]] },
    { ...validData(), coefficientsAu: [new Array(1), [2], [3]] },
    { ...validData(), coefficientsAu: Array.from({ length: 3 }, () => new Array(66).fill(0)) },
    { startJdTt: Number.MIN_VALUE, endJdTt: Number.MIN_VALUE * 2, coefficientsAu: [[1], [2], [3]] }
  ])("rejects malformed segment %j", (value) => {
    expect(() => validateChebyshevSegment(value)).toThrow(RangeError);
    expect(() => evaluateChebyshevSegment(value as ChebyshevSegment, START)).toThrow(RangeError);
  });

  it("rejects accessors and inherited fields without invoking their getters", () => {
    const input = validData();
    let calls = 0;
    Object.defineProperty(input, "startJdTt", { get: () => { calls++; return START; } });
    expect(() => validateChebyshevSegment(input)).toThrow(RangeError);
    expect(calls).toBe(0);
    expect(() => validateChebyshevSegment(Object.create(validData()))).toThrow(RangeError);
    const accessor = validData();
    Object.defineProperty(accessor.coefficientsAu[0], "0", { get: () => { calls++; return 1; } });
    expect(() => validateChebyshevSegment(accessor)).toThrow(RangeError);
    expect(calls).toBe(0);
  });

  it.each([START - 1e-9, END + 1e-9, NaN, Infinity, -Infinity, "2451545", null])(
    "refuses extrapolation and malformed query epoch %j", (jd) => {
      expect(() => evaluateChebyshevSegment(validateChebyshevSegment(validData()), jd as number)).toThrow(RangeError);
    }
  );

  it.each([
    { degree: -1 }, { degree: 1.5 }, { degree: 65 }, { degree: NaN }, { degree: "1" },
    { startJdTt: END }, { endJdTt: NaN }, { samples: [] }, { samples: new Array(2) },
    { samples: Array.from({ length: 4097 }, () => ({ jdTt: START, positionAu: [0, 0, 0] })) },
    { samples: [{ jdTt: START, positionAu: [1, 2, 3] }] },
    { samples: [{ jdTt: START, positionAu: [1, 2, 3] }, { jdTt: START, positionAu: [1, 2, 3] }] },
    { samples: [{ jdTt: END, positionAu: [1, 2, 3] }, { jdTt: START, positionAu: [1, 2, 3] }] },
    { samples: [{ jdTt: START - 1, positionAu: [1, 2, 3] }, { jdTt: END, positionAu: [1, 2, 3] }] },
    { samples: [{ jdTt: START, positionAu: [1, 2] }, { jdTt: END, positionAu: [1, 2, 3] }] },
    { samples: [{ jdTt: START, positionAu: [NaN, 2, 3] }, { jdTt: END, positionAu: [1, 2, 3] }] }
  ])("rejects malformed fit options %j", (overrides) => {
    expect(() => fitChebyshevSegment({ ...validFit(), ...overrides } as ChebyshevFitInput)).toThrow(RangeError);
  });

  it("refuses clustered sample geometries that lose numerical rank", () => {
    expect(() => fitChebyshevSegment({
      startJdTt: START, endJdTt: END, degree: 6,
      samples: Array.from({ length: 12 }, (_, i) => ({ jdTt: START + 1e-6 * i, positionAu: [1, 2, 3] }))
    })).toThrow(/rank-deficient/);
  });

  it("refuses an ill-conditioned full-rank fit", () => {
    expect(() => fitChebyshevSegment({
      startJdTt: START, endJdTt: END, degree: 6,
      samples: Array.from({ length: 12 }, (_, i) => ({
        jdTt: START + 16 + (i / 11 - 0.5), positionAu: [1, 2, 3]
      }))
    })).toThrow(/ill-conditioned/);
  });

  it("revalidates external mutable inputs and refuses rates that can overflow", () => {
    const input = validData();
    evaluateChebyshevSegment(input as unknown as ChebyshevSegment, START);
    input.coefficientsAu[0]![0] = NaN;
    expect(() => evaluateChebyshevSegment(input as unknown as ChebyshevSegment, START)).toThrow(RangeError);
    expect(() => validateChebyshevSegment({
      startJdTt: 1e-308, endJdTt: 3e-308, coefficientsAu: [[0, 1e6], [0, 0], [0, 0]]
    })).toThrow(/derivative can overflow/);
  });
});
