/**
 * From astronomy-engine's EQJ, the J2000 mean equator and equinox, to the
 * equator and equinox of date, mean or true, on the engine's own precession
 * and nutation (src/frame.ts, src/nutation.ts). For the entries that use the
 * equator, calc and sky; the root's charts need only the ecliptic of date,
 * which src/frame.ts gives.
 *
 * The frame's rows M are R1(εA) P, EQJ to the mean ecliptic and equinox of
 * date. The mean equator of date is R1(−εA) M = P, precession alone. The true
 * equator and equinox of date is R1(−ε) R3(−Δψ) M, with ε = εA + Δε: the
 * nutation matrix R1(−ε) R3(−Δψ) R1(εA) times P, as IERS Conventions (2010),
 * eq. 5.34, compose it. Rotations are in ERFA's sense (eraRx, eraRz).
 */
import { eclipticFrame } from "./frame.js";

const DEG = Math.PI / 180;
const ARCSEC = DEG / 3600;

/** Rows of a 3 × 3 rotation, row by row, acting on column vectors. */
export type Rows = readonly [number, number, number, number, number, number, number, number, number];

/** R1(−angle) applied to a matrix's rows: the ecliptic onto the equator, rows 2 and 3 mixed. */
function toEquator(m: readonly number[], angle: number): Rows {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    m[0]!, m[1]!, m[2]!,
    c * m[3]! - s * m[6]!, c * m[4]! - s * m[7]!, c * m[5]! - s * m[8]!,
    s * m[3]! + c * m[6]!, s * m[4]! + c * m[7]!, s * m[5]! + c * m[8]!
  ];
}

/** R3(−Δψ) applied to a matrix's rows: the mean equinox of date onto the true one, rows 1 and 2 mixed. */
function toTrueEquinox(m: readonly number[], dpsi: number): Rows {
  const c = Math.cos(dpsi);
  const s = Math.sin(dpsi);
  return [
    c * m[0]! - s * m[3]!, c * m[1]! - s * m[4]!, c * m[2]! - s * m[5]!,
    s * m[0]! + c * m[3]!, s * m[1]! + c * m[4]!, s * m[2]! + c * m[5]!,
    m[6]!, m[7]!, m[8]!
  ];
}

/** EQJ to the ecliptic and equinox of date at `tt` (days of TT from J2000.0), mean or true. */
export function eclipticRows(tt: number, kind: "mean" | "true"): Rows {
  const frame = eclipticFrame(tt);
  const m = frame.rows as Rows;
  return kind === "mean" ? m : toTrueEquinox(m, frame.tilt.dpsi * ARCSEC);
}

/** EQJ to the equator and equinox of date at `tt` (days of TT from J2000.0), mean or true. */
export function equatorRows(tt: number, kind: "mean" | "true"): Rows {
  const frame = eclipticFrame(tt);
  const { mobl, tobl, dpsi } = frame.tilt;
  return kind === "mean"
    ? toEquator(frame.rows, mobl * DEG)
    : toEquator(toTrueEquinox(frame.rows, dpsi * ARCSEC), tobl * DEG);
}

/** A vector turned by rows, in the operation order of astronomy-engine's RotateVector. */
export function turn(m: Rows, x: number, y: number, z: number): [number, number, number] {
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}
