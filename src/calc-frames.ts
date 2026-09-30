/**
 * The frames of the calc entry point. A position is first found as a vector on
 * astronomy-engine's EQJ axes, the mean equator and equinox of J2000.0 that its
 * precession starts from, and is then turned into one of eight frames. The
 * precession (IAU 2006, astronomy-engine's own, reproduced in src/frame.ts) and
 * the nutation (IAU 2000B, src/nutation.ts) are the engine's, as positions()
 * and natalChart() use them (src/equator.ts); the J2000.0-ecliptic and ICRS
 * frames are built here.
 */
import type { AstroTime } from "astronomy-engine";

import { eclipticRows, equatorRows } from "./equator.js";
import { normalizeLongitude } from "./signs.js";

/**
 * A reference plane (the ecliptic or the equator) and the equinox its
 * longitudes count from: the true or the mean equinox of date, the mean
 * equinox of J2000.0, or the ICRS axes.
 */
export type CalcFrame =
  | "ecliptic-true-of-date"
  | "ecliptic-mean-of-date"
  | "ecliptic-j2000"
  | "ecliptic-icrs"
  | "equatorial-true-of-date"
  | "equatorial-mean-of-date"
  | "equatorial-j2000"
  | "equatorial-icrs";

export const CALC_FRAMES = [
  "ecliptic-true-of-date",
  "ecliptic-mean-of-date",
  "ecliptic-j2000",
  "ecliptic-icrs",
  "equatorial-true-of-date",
  "equatorial-mean-of-date",
  "equatorial-j2000",
  "equatorial-icrs"
] as const satisfies readonly CalcFrame[];

/**
 * "apparent": light time and aberration (annual, and diurnal for a topocentric
 * observer), without gravitational deflection. "astrometric": light time only.
 * "geometric": where the body is at the instant.
 */
export type CalcCorrection = "apparent" | "astrometric" | "geometric";

export type Vec3 = readonly [number, number, number];
/** A rotation, row by row, acting on column vectors: y = M x. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const ARCSEC = DEG / 3600;

const at = (m: Mat3, i: number): number => m[i] as number;

export function apply(m: Mat3, [x, y, z]: Vec3): Vec3 {
  // Row by row, in the operation order of astronomy-engine's RotateVector.
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}

function product(a: Mat3, b: Mat3): Mat3 {
  const c = (row: number, column: number) =>
    at(a, 3 * row) * at(b, column) + at(a, 3 * row + 1) * at(b, 3 + column) + at(a, 3 * row + 2) * at(b, 6 + column);
  return [c(0, 0), c(0, 1), c(0, 2), c(1, 0), c(1, 1), c(1, 2), c(2, 0), c(2, 1), c(2, 2)];
}

export function transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/** Rotations about the x, y and z axes, in ERFA's sense (eraRx, eraRy, eraRz). */
function r1(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [1, 0, 0, 0, c, s, 0, -s, c];
}
function r2(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}
function r3(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** The IAU 2006 mean obliquity of J2000.0, 84381.406″. */
const ECLIPTIC_J2000 = r1(84381.406 * ARCSEC);
/**
 * The frame bias from the ICRS to the mean equator and equinox of J2000.0: the
 * IAU 2000 offsets dψ = −0.041775″, dε = −0.0068192″ and dα₀ = −0.0146″,
 * composed as ERFA's eraBp00 composes them (IERS Conventions 2010, eq. 5.21).
 */
const BIAS = product(
  r1(0.0068192 * ARCSEC),
  product(r2(-0.041775 * ARCSEC * Math.sin(84381.448 * ARCSEC)), r3(-0.0146 * ARCSEC))
);
const J2000_TO_ICRS = transpose(BIAS);

/** The rotation from EQJ into `frame` at `time`. */
export function frameMatrix(frame: CalcFrame, time: AstroTime): Mat3 {
  switch (frame) {
    case "ecliptic-true-of-date":
      return eclipticRows(time.tt, "true");
    case "equatorial-true-of-date":
      return equatorRows(time.tt, "true");
    case "ecliptic-mean-of-date":
      return eclipticRows(time.tt, "mean");
    case "equatorial-mean-of-date":
      return equatorRows(time.tt, "mean");
    case "ecliptic-j2000":
      return ECLIPTIC_J2000;
    case "equatorial-j2000":
      return IDENTITY;
    case "ecliptic-icrs":
      return product(ECLIPTIC_J2000, J2000_TO_ICRS);
    case "equatorial-icrs":
      return J2000_TO_ICRS;
  }
}

/** Frames whose axes do not turn with time. */
export function inertial(frame: CalcFrame): boolean {
  return frame.endsWith("j2000") || frame.endsWith("icrs");
}

/** Longitude in [0, 360) and latitude, degrees, of a vector; the engine's own formulas. */
export function toSpherical([x, y, z]: Vec3): { lon: number; lat: number } {
  return { lon: normalizeLongitude(Math.atan2(y, x) * RAD), lat: Math.asin(z / Math.hypot(x, y, z)) * RAD };
}

export function fromSpherical(lon: number, lat: number, distance: number): Vec3 {
  const cosLat = Math.cos(lat * DEG);
  return [
    distance * cosLat * Math.cos(lon * DEG),
    distance * cosLat * Math.sin(lon * DEG),
    distance * Math.sin(lat * DEG)
  ];
}

/** Rates of longitude and latitude (degrees a day) and of distance, from a position and its velocity. */
export function sphericalRates([x, y, z]: Vec3, [vx, vy, vz]: Vec3): { lon: number; lat: number; dist: number } {
  const plane = x * x + y * y;
  const square = plane + z * z;
  return {
    lon: ((x * vy - y * vx) / plane) * RAD,
    lat: ((vz * plane - z * (x * vx + y * vy)) / (square * Math.sqrt(plane))) * RAD,
    dist: (x * vx + y * vy + z * vz) / Math.sqrt(square)
  };
}
