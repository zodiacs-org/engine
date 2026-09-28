/**
 * Test oracle: exact rational arithmetic on BigInt numerators and
 * denominators, written independently of src/exact.ts. A double becomes the
 * exact rational it denotes by doubling it until it is an integer, which is
 * exact for every finite double. Nothing here is imported by the package.
 */

export interface Rational {
  readonly n: bigint;
  /** Always positive. */
  readonly d: bigint;
}

export function rational(value: number): Rational {
  if (!Number.isFinite(value)) throw new RangeError("rational() takes finite numbers only");
  let scaled = value;
  let exponent = 0n;
  while (!Number.isInteger(scaled)) {
    scaled *= 2;
    exponent += 1n;
  }
  return { n: BigInt(scaled), d: 1n << exponent };
}

const of = (value: Rational | number): Rational => (typeof value === "number" ? rational(value) : value);

export function sum(...terms: (Rational | number)[]): Rational {
  let n = 0n;
  let d = 1n;
  for (const term of terms.map(of)) {
    n = n * term.d + term.n * d;
    d *= term.d;
  }
  return { n, d };
}

export const neg = (value: Rational | number): Rational => {
  const exact = of(value);
  return { n: -exact.n, d: exact.d };
};
export const sub = (a: Rational | number, b: Rational | number): Rational => sum(a, neg(b));
export const sign = (value: Rational | number): -1 | 0 | 1 => {
  const n = of(value).n;
  return n > 0n ? 1 : n < 0n ? -1 : 0;
};
export const cmp = (a: Rational | number, b: Rational | number): -1 | 0 | 1 => sign(sub(a, b));
export const abs = (value: Rational | number): Rational => (sign(value) < 0 ? neg(value) : of(value));
export const min = (a: Rational, b: Rational): Rational => (cmp(a, b) <= 0 ? a : b);
const half = (value: Rational): Rational => ({ n: value.n, d: value.d * 2n });

const float = new Float64Array(1);
const bits = new BigInt64Array(float.buffer);

/** The adjacent double above a finite double. */
function nextAbove(value: number): number {
  if (value === 0) return Number.MIN_VALUE;
  float[0] = value;
  bits[0] = value > 0 ? bits[0]! + 1n : bits[0]! - 1n;
  return float[0]!;
}
const nextBelow = (value: number): number => -nextAbove(-value);
function evenSignificand(value: number): boolean {
  float[0] = value;
  return (bits[0]! & 1n) === 0n;
}

/**
 * Whether value is the exact rational rounded to the nearest double with ties
 * to even: the exact value lies between the midpoints to value's neighbours,
 * and on a midpoint only an even significand is allowed. Exact zero must be +0.
 */
export function isRoundedHalfEven(value: number, exact: Rational): boolean {
  if (!Number.isFinite(value)) return false;
  if (sign(exact) === 0) return Object.is(value, 0);
  const low = half(sum(nextBelow(value), value));
  const high = half(sum(value, nextAbove(value)));
  const below = cmp(exact, low);
  const above = cmp(exact, high);
  if (below < 0 || above > 0) return false;
  return below === 0 || above === 0 ? evenSignificand(value) : true;
}

/** Decimal digits of an exact rational, for failure messages. */
export function describe(value: Rational, digits = 30): string {
  const negative = value.n < 0n;
  const n = negative ? -value.n : value.n;
  const whole = n / value.d;
  let remainder = n % value.d;
  let fraction = "";
  for (let i = 0; i < digits && remainder !== 0n; i += 1) {
    remainder *= 10n;
    fraction += String(remainder / value.d);
    remainder %= value.d;
  }
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}${remainder !== 0n ? "…" : ""}`;
}
