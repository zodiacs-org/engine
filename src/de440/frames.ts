/**
 * Frame bias, IAU 2006 precession (Fukushima-Williams angles) and IAU 2000B
 * nutation as one matrix, and the rotation to the ecliptic of date, for the
 * DE440 reduction: the research runtime's frames.mjs, operation for
 * operation. Rotations follow ERFA: R1(a) = [[1,0,0],[0,cos a,sin a],
 * [0,-sin a,cos a]], R3(a) = [[cos a,sin a,0],[-sin a,cos a,0],[0,0,1]].
 */
import { adjustToP03, meanObliquityArcsec, nut00b } from "./nutation.js";

export const DAS2R = Math.PI / (180 * 3600);

export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [Vec3, Vec3, Vec3];

/** a b, each entry summed in the order a[i][0] b[0][j] + a[i][1] b[1][j] + a[i][2] b[2][j]. */
export function mul(a: Mat3, b: Mat3): Mat3 {
  const row = (r: Vec3): Vec3 => [
    r[0] * b[0][0] + r[1] * b[1][0] + r[2] * b[2][0],
    r[0] * b[0][1] + r[1] * b[1][1] + r[2] * b[2][1],
    r[0] * b[0][2] + r[1] * b[1][2] + r[2] * b[2][2]
  ];
  return [row(a[0]), row(a[1]), row(a[2])];
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}

const R1 = (a: number): Mat3 => {
  const s = Math.sin(a);
  const c = Math.cos(a);
  return [
    [1, 0, 0],
    [0, c, s],
    [0, -s, c]
  ];
};

const R3 = (a: number): Mat3 => {
  const s = Math.sin(a);
  const c = Math.cos(a);
  return [
    [c, s, 0],
    [-s, c, 0],
    [0, 0, 1]
  ];
};

/** Fukushima-Williams precession angles, IAU 2006, frame bias included (eraPfw06), radians. */
export function pfw06(t: number): { gamb: number; phib: number; psib: number; epsa: number } {
  const gamb = (-0.052928 + (10.556378 + (0.4932044 + (-0.00031238 + (-0.000002788 + 0.000000026 * t) * t) * t) * t) * t) * DAS2R;
  const phib = (84381.412819 + (-46.811016 + (0.0511268 + (0.00053289 + (-0.00000044 + -0.0000000176 * t) * t) * t) * t) * t) * DAS2R;
  const psib = (-0.041775 + (5038.481484 + (1.5584175 + (-0.00018522 + (-0.000026452 + -0.0000000148 * t) * t) * t) * t) * t) * DAS2R;
  const epsa = meanObliquityArcsec(t) * DAS2R;
  return { gamb, phib, psib, epsa };
}

/** eraFw2m: R1(-eps) R3(-psi) R1(phib) R3(gamb). */
export function fw2m(gamb: number, phib: number, psi: number, eps: number): Mat3 {
  return mul(R1(-eps), mul(R3(-psi), mul(R1(phib), R3(gamb))));
}

/** ICRF to the true equator and equinox of date, with the true obliquity, at t centuries of TT. */
export function npbMatrix(t: number): { matrix: Mat3; epsTrue: number; dpsiArcsec: number; depsArcsec: number } {
  const nut = adjustToP03(nut00b(t), t);
  const { gamb, phib, psib, epsa } = pfw06(t);
  const matrix = fw2m(gamb, phib, psib + nut.dpsi * DAS2R, epsa + nut.deps * DAS2R);
  return { matrix, epsTrue: epsa + nut.deps * DAS2R, dpsiArcsec: nut.dpsi, depsArcsec: nut.deps };
}

/** True equator of date to the ecliptic of date: a rotation by the true obliquity. */
export function equToEcl(v: Vec3, epsTrue: number): Vec3 {
  const c = Math.cos(epsTrue);
  const s = Math.sin(epsTrue);
  return [v[0], v[1] * c + v[2] * s, -v[1] * s + v[2] * c];
}

/**
 * Longitude in [0, 360) and latitude, degrees. Math.hypot is not used: its
 * last bits differ between engines, and sqrt is correctly rounded.
 */
export function eclipticLonLatDeg(v: Vec3): { lon: number; lat: number } {
  let lon = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
  if (lon < 0) lon += 360;
  const lat = (Math.atan2(v[2], Math.sqrt(v[0] * v[0] + v[1] * v[1])) * 180) / Math.PI;
  return { lon, lat };
}
