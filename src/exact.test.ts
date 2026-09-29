import { describe, expect, it } from "vitest";

import { absolute, compareExact, exactSign, exactSum, negated, roundedValue, signOf } from "./exact.js";
import { cmp, isRoundedHalfEven, rational, sign, sum } from "./fixtures/rational.js";

let seed = 0x5eed1234;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)]!;
const float = new Float64Array(1);
const bits = new BigUint64Array(float.buffer);
/** A finite nonzero double from random bits, scaled down by a power of two when its exponent exceeds maxExponent. */
function randomDouble(maxExponent: number): number {
  bits[0] = (BigInt(Math.floor(random() * 2 ** 32)) << 32n) | BigInt(Math.floor(random() * 2 ** 32));
  const value = float[0]!;
  if (!Number.isFinite(value) || value === 0) return random() - 0.5;
  const exponent = Math.floor(Math.log2(Math.abs(value)));
  return exponent > maxExponent ? value / 2 ** (exponent - maxExponent + Math.floor(random() * 60)) : value;
}
const decimal = () => Math.round((random() - 0.5) * 72_000) / 100;
function termsCase(): number[] {
  const count = 1 + Math.floor(random() * 7);
  const terms: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const kind = random();
    if (kind < 0.35) terms.push(decimal());
    else if (kind < 0.55) terms.push(randomDouble(12));
    else if (kind < 0.7 && terms.length > 0) terms.push(-pick(terms)); // exact cancellation
    else if (kind < 0.8) terms.push(pick([180, -180, 360, -360, 0, -0, 0.1, 0.2, 0.3, 1e-300, Number.MIN_VALUE]));
    else if (kind < 0.9 && terms.length > 0) {
      const base = pick(terms);
      terms.push(base === 0 ? Number.MIN_VALUE : Math.abs(base) * Number.EPSILON / 2 * pick([1, -1, 0.5, 1.5]));
    } else terms.push(randomDouble(900) * pick([1, -1]));
  }
  return terms;
}

describe("exact sums of binary64 terms", () => {
  it("round once to the nearest double, ties to even, and give the exact sign", () => {
    let checked = 0;
    for (let n = 0; n < 20_000; n += 1) {
      const terms = termsCase();
      const exact = sum(...terms);
      const partials = exactSum(...terms);
      expect(signOf(partials), terms.join(",")).toBe(sign(exact));
      expect(exactSign(terms), terms.join(",")).toBe(sign(exact));
      expect(isRoundedHalfEven(roundedValue(partials), exact), terms.join(",")).toBe(true);
      // Partials are nonzero and strictly increasing in magnitude.
      for (let i = 0; i < partials.length; i += 1) {
        expect(partials[i]).not.toBe(0);
        if (i > 0) expect(Math.abs(partials[i]!)).toBeGreaterThan(Math.abs(partials[i - 1]!));
      }
      checked += 1;
    }
    expect(checked).toBe(20_000);
  });

  it("resolves half-ulp ties by what lies below them", () => {
    // 1 + 2^-53 is a tie that rounds to even (1); anything below or above decides it.
    expect(roundedValue(exactSum(1, 2 ** -53))).toBe(1);
    expect(roundedValue(exactSum(1, 2 ** -53, 2 ** -200))).toBe(1 + Number.EPSILON);
    expect(roundedValue(exactSum(1, 2 ** -53, -(2 ** -200)))).toBe(1);
    expect(roundedValue(exactSum(1 + Number.EPSILON, 2 ** -53))).toBe(1 + 2 * Number.EPSILON);
    expect(roundedValue(exactSum(1e-16, 1, 1e16))).toBe(1e16 + 2);
    expect(Object.is(roundedValue(exactSum(0.1, -0.1)), 0)).toBe(true);
    expect(Object.is(roundedValue(exactSum(-0)), 0)).toBe(true);
  });

  it("compares, negates and takes magnitudes exactly", () => {
    expect(compareExact(exactSum(0.1, 0.2), 0.3)).toBe(1);
    expect(compareExact(exactSum(0.3), exactSum(0.1, 0.2))).toBe(-1);
    expect(compareExact(exactSum(1.1, -0.1), 1)).toBe(1);
    expect(compareExact(exactSum(13.3, -12.3), 1)).toBe(0);
    expect(signOf(negated(exactSum(0.1, -0.3)))).toBe(1);
    expect(signOf(absolute(exactSum(0.1, -0.3)))).toBe(1);
    expect(cmp(sum(...absolute(exactSum(0.1, -0.3))), sum(0.3, -0.1))).toBe(0);
  });

  it("decides signs of sums beyond the overflow-safe range with integers", () => {
    const max = Number.MAX_VALUE;
    expect(exactSign([max, max, -max, -max, Number.MIN_VALUE])).toBe(1);
    expect(exactSign([max, -max])).toBe(0);
    expect(exactSign([2 ** 1020, -(2 ** 1020), -Number.MIN_VALUE])).toBe(-1);
    expect(exactSign([1e308, 1e308, -Number.MAX_VALUE])).toBe(sign(sum(1e308, 1e308, -Number.MAX_VALUE)));
    for (let n = 0; n < 2_000; n += 1) {
      const terms = Array.from({ length: 1 + Math.floor(random() * 4) }, () => randomDouble(1023) * pick([1, -1]));
      if (random() < 0.5) terms.push(-terms[0]!, pick([Number.MIN_VALUE, -Number.MIN_VALUE, 0]));
      expect(exactSign(terms), terms.join(",")).toBe(sign(sum(...terms)));
    }
  });

  it("agrees with the oracle's own rounding check on known values", () => {
    expect(isRoundedHalfEven(0.30000000000000004, rational(0.1 + 0.2))).toBe(true);
    expect(isRoundedHalfEven(0.3, sum(0.1, 0.2))).toBe(false);
    expect(isRoundedHalfEven(0.30000000000000004, sum(0.1, 0.2))).toBe(true);
    expect(isRoundedHalfEven(1, sum(1, 2 ** -53))).toBe(true);
    expect(isRoundedHalfEven(1 + Number.EPSILON, sum(1, 2 ** -53))).toBe(false);
  });
});
