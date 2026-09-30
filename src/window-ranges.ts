/**
 * Enclosures for the birth-window search: for an interval of time, a range of
 * longitudes that contains every value a quantity takes in it. Pure geometry;
 * no ephemeris. A range is unwrapped, [lo, hi] in degrees with lo <= hi, and
 * stands for every longitude congruent to a point in it; null means unknown.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export type Range = readonly [number, number] | null;

export function wrap360(value: number): number {
  return ((value % 360) + 360) % 360;
}

/** Signed shortest angular step from `from` to `to`, degrees in (-180, 180]. */
export function signedDelta(from: number, to: number): number {
  const difference = wrap360(to - from);
  return difference > 180 ? difference - 360 : difference;
}

/**
 * The advance of a longitude known to increase, from `from` to `to`, in
 * [0, 360): a result just below 360 is a rounding-level step backwards and is
 * returned as that small negative number.
 */
export function advance(from: number, to: number): number {
  const step = wrap360(to - from);
  return step > 300 ? step - 360 : step;
}

/** Whether [lo - pad, hi + pad] contains offset + k * period for some integer k. */
export function reaches(range: Range, period: number, offset: number, pad: number): boolean {
  if (range === null) return true;
  return Math.floor((range[1] + pad - offset) / period) * period + offset >= range[0] - pad;
}

/** The range from `from`, moved on by a known advance, widened by `pad`. */
export function hull(from: number, step: number, pad: number): Range {
  return [Math.min(from, from + step) - pad, Math.max(from, from + step) + pad];
}

export function shift(range: Range, by: number): Range {
  return range === null ? null : [range[0] + by, range[1] + by];
}

/** The range of f over [a1, a2], degrees, a1 <= a2, for f cos or sin, with its maximum at `top` + 360k. */
function trigRange(f: (x: number) => number, top: number, a1: number, a2: number): [number, number] {
  const v1 = f(a1 * DEG);
  const v2 = f(a2 * DEG);
  const has = (at: number) => Math.floor((a2 - at) / 360) * 360 + at >= a1;
  return [has(top + 180) ? -1 : Math.min(v1, v2), has(top) ? 1 : Math.max(v1, v2)];
}

/** Ranges of cos and sin over [a1, a2], degrees, a1 <= a2. */
export function cosRange(a1: number, a2: number): [number, number] {
  return trigRange(Math.cos, 0, a1, a2);
}

export function sinRange(a1: number, a2: number): [number, number] {
  return trigRange(Math.sin, 90, a1, a2);
}

/** atan2(sin a, c cos a - K), degrees: houses.ts's oblique longitude with K = tan(pole) sin(obliquity). */
function oblique(a: number, K: number, c: number): number {
  const r = a * DEG;
  return Math.atan2(Math.sin(r), Math.cos(r) * c - K) * RAD;
}

export interface ObliqueRange {
  range: [number, number];
  /** An upper bound of |dλ/da| over the arc. */
  rate: number;
}

/**
 * The exact range of the oblique longitude λ(a) = atan2(sin a, c cos a - K)
 * over a in [a1, a2] (degrees, a2 - a1 < 180), at the obliquity whose cosine
 * is c, widened for rounding and for an obliquity that may differ from it by
 * `dEps` degrees; null within 1e-6 of the singular point.
 *
 * The point (c cos a - K, sin a) runs round an ellipse centred on (-K, 0).
 * When |K| < c the origin is inside it and λ increases through a full turn;
 * when |K| > c the origin is outside, λ turns back where dλ/da = 0, at
 * cos a = c / K, and each monotone piece spans less than 180°. The range is
 * read from the ends and those turning points. With D = x² + y² concave in
 * v = cos a, its smallest value on the arc is at an end of the v range; that
 * gives the distance from the origin, which bounds the rounding, the rate
 * |dλ/da| = |c - K v| / D and |∂λ/∂ε| <= (sin ε + |tan pole| c) / sqrt(D).
 */
export function obliqueRange(
  a1: number,
  a2: number,
  K: number,
  c: number,
  tanPole: number,
  dEps: number
): ObliqueRange | null {
  const s2 = 1 - c * c;
  const [v1, v2] = cosRange(a1, a2);
  const d = (v: number) => 1 + K * K - s2 * v * v - 2 * c * K * v;
  const d2 = Math.min(d(v1), d(v2));
  if (!(d2 >= 1e-12)) return null;
  const distance = Math.sqrt(d2);
  const points = [a1];
  const monotone = Math.abs(K) < c;
  if (!monotone) {
    const turn = Math.acos(c / K) * RAD;
    for (const base of [turn, -turn]) {
      for (let x = base + 360 * Math.ceil((a1 - base) / 360); x < a2; x += 360) {
        if (x > a1) points.push(x);
      }
    }
    points.sort((x, y) => x - y);
  }
  points.push(a2);
  let previous = oblique(a1, K, c);
  let at = previous;
  let lo = previous;
  let hi = previous;
  for (let index = 1; index < points.length; index += 1) {
    const current = oblique(points[index]!, K, c);
    at += monotone ? advance(previous, current) : signedDelta(previous, current);
    lo = Math.min(lo, at);
    hi = Math.max(hi, at);
    previous = current;
  }
  const rate = Math.max(Math.abs(c - K * v1), Math.abs(c - K * v2)) / d2;
  // Rounding: of x and y (a few units in the last place of 1), and of the
  // ascension itself (well under 1e-12°), carried at the rate.
  const pad =
    (1e-15 / distance) * RAD +
    rate * 1e-12 +
    2 * ((Math.sqrt(s2) + Math.abs(tanPole) * c) / distance) * dEps;
  return { range: [lo - pad, hi + pad], rate };
}

/**
 * Morinus cusps, atan2(c sin a, cos a), which increase with a at a rate in
 * [c, 1/c]; |∂λ/∂ε| <= sin ε / (2c).
 */
export function morinusRange(a1: number, a2: number, c: number, dEps: number): Range {
  const at = (a: number) => Math.atan2(Math.sin(a * DEG) * c, Math.cos(a * DEG)) * RAD;
  const from = at(a1);
  const pad = (1e-15 / c) * RAD + (Math.sqrt(1 - c * c) / c) * dEps;
  return hull(from, advance(from, at(a2)), pad);
}
