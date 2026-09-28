/**
 * Exact decisions on binary64 values. Every input is taken as the exact
 * rational value of its double; nothing is rounded until a value is reported.
 *
 * A sum is carried as a nonoverlapping expansion: nonzero doubles in strictly
 * increasing magnitude whose exact sum is the value (Shewchuk 1997, "Adaptive
 * precision floating-point arithmetic and fast robust geometric predicates",
 * in the partial-sums form that Python's math.fsum publishes). Each step is an
 * error-free transformation, so no epsilon or tolerance is involved. Terms must
 * be finite and below SAFE_MAGNITUDE, where no partial sum can overflow;
 * exactSign falls back to integer arithmetic beyond it.
 */

/** Terms below this magnitude cannot make any partial sum overflow. */
const SAFE_MAGNITUDE = 2 ** 1000;

/** An exact sum: nonzero, nonoverlapping doubles in increasing magnitude. */
export type ExactSum = readonly number[];

function add(partials: number[], value: number): void {
  let x = value;
  let kept = 0;
  for (let index = 0; index < partials.length; index += 1) {
    let y = partials[index]!;
    if (Math.abs(x) < Math.abs(y)) {
      const larger = y;
      y = x;
      x = larger;
    }
    // Fast2Sum with |x| >= |y|: high + low is exactly x + y.
    const high = x + y;
    const low = y - (high - x);
    if (low !== 0) partials[kept++] = low;
    x = high;
  }
  partials.length = kept;
  if (x !== 0) partials.push(x);
}

/** The exact sum of the terms, each finite and below 2^1000 in magnitude. */
export function exactSum(...terms: readonly (number | ExactSum)[]): ExactSum {
  const partials: number[] = [];
  for (const term of terms) {
    if (typeof term === "number") add(partials, term);
    else for (const part of term) add(partials, part);
  }
  return partials;
}

export function negated(sum: ExactSum): ExactSum {
  return sum.map((part) => -part);
}

/** Sign of the exact value: that of the largest partial, which dominates the rest. */
export function signOf(sum: ExactSum): -1 | 0 | 1 {
  const top = sum[sum.length - 1];
  return top === undefined ? 0 : top > 0 ? 1 : -1;
}

/** Sign of a − b, exactly. */
export function compareExact(a: ExactSum | number, b: ExactSum | number): -1 | 0 | 1 {
  return signOf(exactSum(a, typeof b === "number" ? -b : negated(b)));
}

/** |sum|, exactly. */
export function absolute(sum: ExactSum): ExactSum {
  return signOf(sum) < 0 ? negated(sum) : sum;
}

/**
 * The exact value rounded once to the nearest double, ties to even. Exact zero
 * is +0. Summing from the largest partial down is exact until the first
 * inexact step, whose rounding error is then the only remainder that matters,
 * unless it is exactly half an ulp: then the partials still below it decide.
 */
export function roundedValue(sum: ExactSum): number {
  let index = sum.length;
  if (index === 0) return 0;
  let high = sum[--index]!;
  let low = 0;
  while (index > 0) {
    const x = high;
    const y = sum[--index]!;
    high = x + y;
    low = y - (high - x);
    if (low !== 0) break;
  }
  const below = index > 0 ? sum[index - 1]! : 0;
  if ((low < 0 && below < 0) || (low > 0 && below > 0)) {
    // A remainder of exactly half an ulp makes high + 2 × remainder a double.
    // The partials below lie on the same side, so the exact value is past
    // that tie and rounds to the neighbour instead of to even.
    const twice = low * 2;
    const moved = high + twice;
    if (moved - high === twice) high = moved;
  }
  return high;
}

/** value × 2^1074 as an integer: every finite double is a multiple of 2^-1074. */
function scaledInteger(value: number): bigint {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const upper = view.getUint32(0);
  const exponent = (upper >>> 20) & 0x7ff;
  let significand = (BigInt(upper & 0xfffff) << 32n) | BigInt(view.getUint32(4));
  if (exponent !== 0) significand = (significand | (1n << 52n)) << BigInt(exponent - 1);
  return upper >>> 31 === 1 ? -significand : significand;
}

/** Sign of the exact sum of finite doubles of any magnitude. */
export function exactSign(terms: readonly number[]): -1 | 0 | 1 {
  if (terms.every((term) => Math.abs(term) < SAFE_MAGNITUDE)) return signOf(exactSum(...terms));
  let total = 0n;
  for (const term of terms) total += scaledInteger(term);
  return total > 0n ? 1 : total < 0n ? -1 : 0;
}
