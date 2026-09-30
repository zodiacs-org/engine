/**
 * The exact grid under every Jyotish boundary in this engine.
 *
 * Signs (30°), nakshatras (13°20′), padas (3°20′), KP subs and sub-subs
 * (Vimshottari shares of a nakshatra) and all sixteen Parashari vargas
 * (30°/n, and 5°, 7°, 8° for the trimsamsa) start on whole multiples of
 * 1/7560 degree, a "tick". A longitude is placed by the exact floor of
 * lon × 7560, computed on the binary value of the double, so a longitude on
 * a boundary belongs to the part that starts there, and one a single ulp
 * below it to the part before. Degrees are never compared with rounded
 * fractions such as 40/3.
 */

export const TICKS_PER_DEGREE = 7560;
export const SIGN_TICKS = 226_800;
export const NAKSHATRA_TICKS = 100_800;
export const PADA_TICKS = 25_200;
/** A nakshatra spans the 120 Vimshottari years: 840 ticks per year. */
export const YEAR_TICKS = 840;

const SPLIT = 134_217_729; // 2^27 + 1

/** Exact a·b − p for p = fl(a·b), by Dekker's product; its sign is exact. */
function productError(a: number, b: number, p: number): number {
  let t = SPLIT * a;
  const ah = t - (t - a);
  const al = a - ah;
  t = SPLIT * b;
  const bh = t - (t - b);
  const bl = b - bh;
  return ah * bh - p + ah * bl + al * bh + al * bl;
}

/**
 * floor(lon × 7560) for the exact binary value of `lon`, which must be a
 * finite number in [0, 360). Rounding can only land a product on an integer
 * it has not reached; that case is settled by the exact product error.
 */
export function ticksOf(lon: number): number {
  const p = lon * TICKS_PER_DEGREE;
  const f = Math.floor(p);
  return f === p && productError(lon, TICKS_PER_DEGREE, p) < 0 ? f - 1 : f;
}
