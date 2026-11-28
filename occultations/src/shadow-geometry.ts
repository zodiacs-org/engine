import type { Vec3 } from "../../src/calc-frames.js";
import { add, cross, dot, scale, unit } from "./astrometry.js";

/** Numerical policies for an algebraic spatial solve, not physical error bounds. */
export const SHADOW_GEOMETRY_MODEL = Object.freeze({
  polynomialRelativeTolerance: 128 * Number.EPSILON,
  rootParameterTolerance: 2e-13,
  rootMergeTolerance: 2e-11,
  orthogonalityTolerance: 1e-10
});

export interface ShadowCone {
  /** Radius of the cone at the plane through the lunar center, in km. */
  readonly radiusAtMoonKm: number;
  /** Change of radius per km along the axis toward the target. */
  readonly slope: number;
}
export interface ShadowGeometry {
  readonly moonKm: Vec3;
  readonly moonRadiusKm: number;
  readonly targetDirection: Vec3;
  readonly targetKm: Vec3 | null;
  readonly targetRadiusKm: number;
  readonly axis: Vec3;
  readonly east: Vec3;
  readonly north: Vec3;
  readonly overlap: ShadowCone;
  readonly full: ShadowCone;
}
export interface ShadowBoundary {
  readonly latitudeDegrees: number;
  readonly cause: "limb" | "horizon" | "pole";
}
export interface ShadowLatitudeInterval {
  readonly south: ShadowBoundary;
  readonly north: ShadowBoundary;
}
export interface MeridianShadowResult {
  /** Interiors satisfy disk coverage and a strictly positive target-center altitude. */
  readonly intervals: readonly ShadowLatitudeInterval[];
  /** Detected tangent, degenerate or numerically inseparable boundaries. */
  readonly unresolved: boolean;
}

function vector(value: Vec3, name: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) {
    throw new RangeError(`${name} must be a finite three-vector.`);
  }
  return value;
}
function nonnegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative.`);
  return value;
}

/**
 * Common tangents of two spheres, or a cylinder for an infinite point source.
 * All inputs must share one Cartesian frame. No astrometric correction is added.
 */
export function makeShadow(
  moonKm: Vec3,
  target: { readonly direction: Vec3; readonly distanceKm: number | null; readonly radiusKm: number },
  moonRadiusKm: number
): ShadowGeometry {
  vector(moonKm, "moonKm");
  const targetDirection = unit(vector(target.direction, "target.direction"));
  nonnegative(moonRadiusKm, "moonRadiusKm");
  nonnegative(target.radiusKm, "target.radiusKm");
  if (!(moonRadiusKm > 0) || !(Math.hypot(...moonKm) > moonRadiusKm)) {
    throw new RangeError("The lunar sphere must have a positive radius and exclude the geocenter.");
  }
  let targetKm: Vec3 | null = null, axis = targetDirection;
  let overlap: ShadowCone = { radiusAtMoonKm: moonRadiusKm, slope: 0 };
  let full = overlap;
  if (target.distanceKm === null) {
    if (target.radiusKm !== 0) throw new RangeError("An infinite point source must have zero radius.");
  } else {
    nonnegative(target.distanceKm, "target.distanceKm");
    if (!(target.distanceKm - target.radiusKm > Math.hypot(...moonKm) + moonRadiusKm)) {
      throw new RangeError("The finite target must lie beyond the whole lunar sphere.");
    }
    targetKm = scale(targetDirection, target.distanceKm);
    const relative = add(targetKm, scale(moonKm, -1)), distance = Math.hypot(...relative);
    axis = unit(relative);
    const cone = (difference: number): ShadowCone => {
      // Factoring the square difference avoids cancellation for nearly touching spheres.
      const denominator = Math.sqrt(distance - Math.abs(difference)) * Math.sqrt(distance + Math.abs(difference));
      if (!(denominator > 0) || !Number.isFinite(denominator)) throw new RangeError("Undefined tangent cone.");
      return { radiusAtMoonKm: moonRadiusKm * distance / denominator, slope: difference / denominator };
    };
    overlap = cone(-target.radiusKm - moonRadiusKm);
    full = cone(target.radiusKm - moonRadiusKm);
  }
  // At a celestial pole, choose a deterministic meridian. Coverage is independent of it.
  const east = unit(cross(Math.hypot(axis[0], axis[1]) > 1e-12 ? [0, 0, 1] : [0, 1, 0], axis));
  const north = cross(axis, east);
  return { moonKm: [...moonKm], moonRadiusKm, targetDirection, targetKm, targetRadiusKm: target.radiusKm,
    axis, east, north, overlap, full };
}

// Coefficients are in increasing powers. The half-angle substitution has degree
// at most four, so recursive derivative isolation gives every monotone segment.
type Polynomial = readonly number[];
const evaluate = (p: Polynomial, t: number): number => {
  let value = 0;
  for (let i = p.length - 1; i >= 0; --i) value = value * t + p[i]!;
  return value;
};
const magnitude = (p: Polynomial, t: number): number => {
  let value = 0;
  for (let i = p.length - 1; i >= 0; --i) value = value * Math.abs(t) + Math.abs(p[i]!);
  return value;
};
const zeroAt = (p: Polynomial, t: number): boolean => Math.abs(evaluate(p, t)) <=
  SHADOW_GEOMETRY_MODEL.polynomialRelativeTolerance * magnitude(p, t);
const derivative = (p: Polynomial): number[] => p.slice(1).map((value, i) => value * (i + 1));
function normalized(p: Polynomial): number[] {
  const result = [...p];
  while (result.length > 1 && result.at(-1) === 0) result.pop();
  const maximum = Math.max(...result.map(Math.abs));
  if (!Number.isFinite(maximum)) throw new RangeError("Shadow polynomial overflow.");
  return maximum === 0 ? [0] : result.map(value => value / maximum);
}
function multiply(a: Polynomial, b: Polynomial): number[] {
  const result = Array<number>(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => { result[i + j]! += x * y; }));
  return result;
}
function sum(a: Polynomial, b: Polynomial, factor = 1): number[] {
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + factor * (b[i] ?? 0));
}
interface Roots { readonly roots: number[]; readonly unresolved: boolean }
function isolate(input: Polynomial): Roots {
  const p = normalized(input);
  if (p.length === 1) return { roots: [], unresolved: p[0] === 0 };
  if (p.length === 2) {
    const root = -p[0]! / p[1]!;
    return { roots: root >= -1 && root <= 1 ? [root] : [], unresolved: false };
  }
  const critical = isolate(derivative(p)).roots.filter(t => t > -1 && t < 1);
  const cuts = [-1, ...critical, 1], roots: number[] = [];
  let unresolved = false;
  const append = (root: number) => {
    if (roots.some(old => Math.abs(old - root) <= SHADOW_GEOMETRY_MODEL.rootMergeTolerance)) {
      unresolved = true;
    } else roots.push(root);
  };
  for (const t of cuts) {
    if (zeroAt(p, t)) {
      append(t);
      // An extremum on the boundary might be a tangent or two unresolved roots.
      if (t !== -1 && t !== 1 || zeroAt(derivative(p), t)) unresolved = true;
    }
  }
  for (let i = 1; i < cuts.length; ++i) {
    let lo = cuts[i - 1]!, hi = cuts[i]!;
    if (zeroAt(p, lo) || zeroAt(p, hi)) continue;
    let flo = evaluate(p, lo);
    if (Math.sign(flo) === Math.sign(evaluate(p, hi))) continue;
    for (let iteration = 0; iteration < 64 && hi - lo > SHADOW_GEOMETRY_MODEL.rootParameterTolerance; ++iteration) {
      const mid = (lo + hi) / 2, fm = evaluate(p, mid);
      if (fm === 0) { lo = mid; hi = mid; break; }
      if (Math.sign(flo) === Math.sign(fm)) { lo = mid; flo = fm; } else hi = mid;
    }
    append((lo + hi) / 2);
  }
  roots.sort((a, b) => a - b);
  return { roots, unresolved };
}

/**
 * Intersect the shadow with one ellipsoid meridian supplied by the engine.
 * equatorKm and poleKm are orthogonal semiaxis vectors, in the shadow frame.
 * No latitude grid, Earth ellipsoid constants, or sidereal rotation is used here.
 */
export function meridianShadowIntervals(
  shadow: ShadowGeometry, equatorKm: Vec3, poleKm: Vec3, coverage: "overlap" | "full"
): MeridianShadowResult {
  const u = vector(equatorKm, "equatorKm"), v = vector(poleKm, "poleKm");
  const a = Math.hypot(...u), b = Math.hypot(...v);
  if (!(a > 0) || !(b > 0) || Math.abs(dot(scale(u, 1 / a), scale(v, 1 / b))) >
      SHADOW_GEOMETRY_MODEL.orthogonalityTolerance || coverage !== "overlap" && coverage !== "full") {
    throw new RangeError("Invalid ellipsoid meridian or coverage.");
  }
  if (!(Math.hypot(...shadow.moonKm) - Math.max(a, b) > shadow.moonRadiusKm) ||
      shadow.targetKm !== null && !(Math.hypot(...shadow.targetKm) - shadow.targetRadiusKm - Math.max(a, b) >
        Math.hypot(...shadow.moonKm) + shadow.moonRadiusKm + Math.max(a, b))) {
    throw new RangeError("Every observer must be outside the Moon, with the target wholly behind it.");
  }
  const cone = shadow[coverage], q = [1, 0, 1];
  // O = U cos(theta) + V sin(theta), t = tan(theta/2), -1 <= t <= 1.
  const projection = (direction: Vec3): number[] => {
    const x = dot(u, direction), y = dot(v, direction), m = dot(shadow.moonKm, direction);
    return [x - m, 2 * y, -x - m];
  };
  const x = projection(shadow.east), y = projection(shadow.north), z = projection(shadow.axis);
  const radius = sum(q.map(value => value * cone.radiusAtMoonKm), z, cone.slope);
  const limb = sum(sum(multiply(x, x), multiply(y, y)), multiply(radius, radius), -1);
  // N is the ellipsoid normal up to a positive factor. N dot O is exactly 1.
  const normalTarget = shadow.targetKm ?? shadow.targetDirection;
  const hU = dot(scale(u, 1 / a ** 2), normalTarget);
  const hV = dot(scale(v, 1 / b ** 2), normalTarget);
  const horizon = [hU, 2 * hV, -hU];
  if (shadow.targetKm !== null) { horizon[0]! -= 1; horizon[2]! -= 1; }
  const constraints = [
    { polynomial: normalized(limb), positive: false, cause: "limb" as const },
    { polynomial: normalized(horizon), positive: true, cause: "horizon" as const },
    { polynomial: normalized(z), positive: false, cause: "limb" as const },
    { polynomial: normalized(radius), positive: true, cause: "limb" as const }
  ];
  const cuts: { t: number; cause: ShadowBoundary["cause"] }[] = [
    { t: -1, cause: "pole" }, { t: 1, cause: "pole" }
  ];
  let unresolved = false;
  for (const constraint of constraints) {
    const result = isolate(constraint.polynomial);
    unresolved ||= result.unresolved;
    for (const t of result.roots) {
      const match = cuts.find(cut => Math.abs(cut.t - t) <= SHADOW_GEOMETRY_MODEL.rootMergeTolerance);
      if (match) {
        if (match.cause !== "pole") unresolved = true;
      } else cuts.push({ t, cause: constraint.cause });
    }
  }
  cuts.sort((one, two) => one.t - two.t);
  const latitude = (t: number): number => {
    if (Math.abs(t) === 1) return 90 * t;
    return Math.atan2(2 * a * t, b * (1 - t * t)) * 180 / Math.PI;
  };
  const intervals: ShadowLatitudeInterval[] = [];
  for (let i = 1; i < cuts.length; ++i) {
    const south = cuts[i - 1]!, north = cuts[i]!, midpoint = (south.t + north.t) / 2;
    if (north.t - south.t <= SHADOW_GEOMETRY_MODEL.rootMergeTolerance) { unresolved = true; continue; }
    const signs = constraints.map(({ polynomial, positive }) => {
      if (zeroAt(polynomial, midpoint)) { unresolved = true; return false; }
      return (evaluate(polynomial, midpoint) > 0) === positive;
    });
    if (signs.every(Boolean)) intervals.push({
      south: { latitudeDegrees: latitude(south.t), cause: south.cause },
      north: { latitudeDegrees: latitude(north.t), cause: north.cause }
    });
  }
  return { intervals, unresolved };
}
