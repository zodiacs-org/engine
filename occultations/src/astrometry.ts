/** Stellar direction geometry. Sources and model limits: ../DESIGN.md. */
import { fromSpherical } from "../../src/calc-frames.js";
import type { Vec3 } from "../../src/calc-frames.js";

export const JULIAN_YEAR_DAYS = 365.25;
export const AU_KM = 149_597_870.7;
export const C_AU_PER_DAY = 299_792.458 * 86400 / AU_KM;
const MAS = Math.PI / (180 * 3600 * 1000);
const DEG = Math.PI / 180;

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (p: Vec3, k: number): Vec3 => [p[0] * k, p[1] * k, p[2] * k];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]
];
export function unit(p: Vec3): Vec3 {
  const size = Math.hypot(...p);
  if (!Number.isFinite(size) || size === 0) throw new RangeError("Stellar direction must be finite and nonzero.");
  return scale(p, 1 / size);
}

/** Internal model input; the public API obtains this only from the frozen catalogue. */
export interface Astrometry {
  readonly raDegrees: number;
  readonly decDegrees: number;
  readonly epochJulianYear: number;
  readonly frame: "FK5-J2000" | "ICRS";
  readonly raCosDecMasPerYear: number;
  readonly decMasPerYear: number;
  readonly parallaxMas: number | null;
  readonly radialVelocityKmPerSecond: number | null;
}

// Mignard & Froeschle (2000), the orientation/spin convention documented by
// ERFA fk5hip. Passive Rodrigues rotation: the cross term is p x axis.
const ORIENTATION: Vec3 = [-19.9 * MAS, -9.1 * MAS, 22.9 * MAS];
const SPIN: Vec3 = [-0.30 * MAS, 0.60 * MAS, 0.70 * MAS];

export function fk5ToIcrs(p: Vec3): Vec3 {
  const angle = Math.hypot(...ORIENTATION);
  const axis = scale(ORIENTATION, 1 / angle);
  return add(add(scale(p, Math.cos(angle)), scale(cross(p, axis), Math.sin(angle))),
    scale(axis, dot(axis, p) * 2 * Math.sin(angle / 2) ** 2));
}

export function catalogueState(star: Astrometry): { direction: Vec3; motionPerYear: Vec3 } {
  const { raDegrees: ra, decDegrees: dec, raCosDecMasPerYear: pmRa, decMasPerYear: pmDec } = star;
  if (![ra, dec, star.epochJulianYear, pmRa, pmDec].every(Number.isFinite) ||
      ra < 0 || ra >= 360 || dec < -90 || dec > 90 ||
      (star.frame !== "ICRS" && star.frame !== "FK5-J2000") ||
      (star.frame === "FK5-J2000" && star.epochJulianYear !== 2000) ||
      (star.parallaxMas !== null && (!Number.isFinite(star.parallaxMas) || star.parallaxMas < 0)) ||
      (star.radialVelocityKmPerSecond !== null && !Number.isFinite(star.radialVelocityKmPerSecond))) {
    throw new RangeError("Invalid stellar astrometry or unsupported FK5 epoch.");
  }
  const p = fromSpherical(ra, dec, 1);
  const east: Vec3 = [-Math.sin(ra * DEG), Math.cos(ra * DEG), 0];
  const north: Vec3 = [-Math.cos(ra * DEG) * Math.sin(dec * DEG),
    -Math.sin(ra * DEG) * Math.sin(dec * DEG), Math.cos(dec * DEG)];
  // Distance-free transverse velocity, per Julian year. No division by cos(dec).
  const transverse = add(scale(east, pmRa * MAS), scale(north, pmDec * MAS));
  const radial = star.parallaxMas === null || star.radialVelocityKmPerSecond === null ? 0 :
    star.radialVelocityKmPerSecond * 86400 * JULIAN_YEAR_DAYS / AU_KM * star.parallaxMas * MAS;
  const motion = add(transverse, scale(p, radial));
  return star.frame === "ICRS" ? { direction: p, motionPerYear: motion } : {
    direction: fk5ToIcrs(p), motionPerYear: fk5ToIcrs(add(motion, cross(p, SPIN)))
  };
}

/**
 * Rectilinear motion and observer parallax in ICRS, following the astrometric
 * model described by ERFA pmpx. TT approximates TDB. Unknown parallax/RV omit
 * those terms; the caller must retain that limitation, never a measured zero.
 */
export function propagateAstrometry(star: Astrometry, ttDays: number, observerAu: Vec3): Vec3 {
  if (!Number.isFinite(ttDays) || !observerAu.every(Number.isFinite)) {
    throw new RangeError("Stellar epoch and observer must be finite.");
  }
  const { direction, motionPerYear } = catalogueState(star);
  const elapsed = ttDays / JULIAN_YEAR_DAYS - (star.epochJulianYear - 2000);
  // Reception epoch is at the barycentre. Only the small observer Rømer delay
  // is added; subtracting an absolute stellar light time would double-count it.
  const years = elapsed + dot(direction, observerAu) / (C_AU_PER_DAY * JULIAN_YEAR_DAYS);
  const parallax = star.parallaxMas === null ? 0 : star.parallaxMas * MAS;
  return unit(add(add(direction, scale(motionPerYear, years)), scale(observerAu, -parallax)));
}

/** Special-relativistic aberration, without solar deflection or potential term. */
export function aberrate(direction: Vec3, velocityAuPerDay: Vec3): Vec3 {
  const p = unit(direction);
  const beta = scale(velocityAuPerDay, 1 / C_AU_PER_DAY);
  const square = dot(beta, beta);
  if (!Number.isFinite(square) || square >= 1) throw new RangeError("Observer velocity must be below light speed.");
  const inverseGamma = Math.sqrt(1 - square);
  return unit(add(scale(p, inverseGamma), scale(beta, 1 + dot(p, beta) / (1 + inverseGamma))));
}
