/**
 * From the J2000 mean equator and equinox, astronomy-engine's EQJ, to the
 * ecliptic of date: astronomy-engine's own precession, then the engine's
 * nutation (src/nutation.ts).
 *
 * Precession takes a direction to the mean equator and equinox of date, and a
 * rotation by the mean obliquity εA about the equinox to the mean ecliptic of
 * date. The true ecliptic and equinox of date differ from those only by the
 * nutation in longitude: the ecliptic does not nutate, and a longitude from
 * the true equinox is the longitude from the mean equinox plus Δψ. So a
 * longitude of date is the mean-ecliptic longitude plus Δψ, a latitude the
 * mean-ecliptic latitude, and the nutation in obliquity enters only through
 * the equator: the angles, the houses and declinations.
 */
import { tilt } from "./nutation.js";
import type { Tilt } from "./nutation.js";
import { normalizeLongitude } from "./signs.js";

const DEG = Math.PI / 180;
const ASEC2RAD = DEG / 3600;
const RAD = 180 / Math.PI;

/** EQJ to the mean ecliptic and equinox of date at a TT instant, and that instant's tilt. */
export interface EclipticFrame {
  /** TT, days from J2000.0. */
  readonly tt: number;
  /**
   * R1(εA) P, row by row: its first row is the mean equinox of date as an EQJ
   * direction, its third the pole of the mean ecliptic.
   */
  readonly rows: readonly number[];
  readonly tilt: Tilt;
}

let last: EclipticFrame | undefined;

/** The frame at `tt`, days of TT from J2000.0 (astronomy-engine's `time.tt`). */
export function eclipticFrame(tt: number): EclipticFrame {
  if (last !== undefined && last.tt === tt) return last;
  // astronomy-engine 2.1.19's precession_rot(time, From2000), term for term:
  // the IAU 2006 angles ψA, ωA and χA of Capitaine et al. (2003) with
  // ε0 = 84381.406″, in R3(χA) R1(−ωA) R3(−ψA) R1(ε0). astronomy-engine is
  // Copyright (c) 2019-2023 Don Cross, MIT License; NOTICE carries it.
  const t = tt / 36525;
  let eps0 = 84381.406;
  let psia = (((((-0.0000000951 * t + 0.000132851) * t - 0.00114045) * t - 1.0790069) * t + 5038.481507) * t);
  let omegaa = (((((+0.0000003337 * t - 0.000000467) * t - 0.00772503) * t + 0.0512623) * t - 0.025754) * t + eps0);
  let chia = (((((-0.0000000560 * t + 0.000170663) * t - 0.00121197) * t - 2.3814292) * t + 10.556403) * t);
  eps0 *= ASEC2RAD;
  psia *= ASEC2RAD;
  omegaa *= ASEC2RAD;
  chia *= ASEC2RAD;
  const sa = Math.sin(eps0);
  const ca = Math.cos(eps0);
  const sb = Math.sin(-psia);
  const cb = Math.cos(-psia);
  const sc = Math.sin(-omegaa);
  const cc = Math.cos(-omegaa);
  const sd = Math.sin(chia);
  const cd = Math.cos(chia);
  const xx = cd * cb - sb * sd * cc;
  const yx = cd * sb * ca + sd * cc * cb * ca - sa * sd * sc;
  const zx = cd * sb * sa + sd * cc * cb * sa + ca * sd * sc;
  const xy = -sd * cb - sb * cd * cc;
  const yy = -sd * sb * ca + cd * cc * cb * ca - sa * cd * sc;
  const zy = -sd * sb * sa + cd * cc * cb * sa + ca * cd * sc;
  const xz = sb * sc;
  const yz = -sc * cb * ca - sa * cc;
  const zz = -sc * cb * sa + cc * ca;
  // P's rows are (xx, yx, zx), (xy, yy, zy) and (xz, yz, zz); R1(εA) then
  // turns the mean equator of date onto the mean ecliptic.
  const at = tilt(tt);
  const e = at.mobl * DEG;
  const ce = Math.cos(e);
  const se = Math.sin(e);
  last = {
    tt,
    rows: [
      xx, yx, zx,
      ce * xy + se * xz, ce * yy + se * yz, ce * zy + se * zz,
      ce * xz - se * xy, ce * yz - se * yy, ce * zz - se * zy
    ],
    tilt: at
  };
  return last;
}

/** An EQJ vector on the mean ecliptic and equinox of date, [x, y, z]. */
export function meanEcliptic(frame: EclipticFrame, x: number, y: number, z: number): [number, number, number] {
  const m = frame.rows;
  return [
    m[0]! * x + m[1]! * y + m[2]! * z,
    m[3]! * x + m[4]! * y + m[5]! * z,
    m[6]! * x + m[7]! * y + m[8]! * z
  ];
}

/**
 * An EQJ vector's longitude and latitude on the true ecliptic and equinox of
 * date at `tt`, degrees: the mean-ecliptic longitude plus Δψ, and the latitude.
 */
export function eclipticOfDate(x: number, y: number, z: number, tt: number): { lon: number; lat: number } {
  const frame = eclipticFrame(tt);
  const [ex, ey, ez] = meanEcliptic(frame, x, y, z);
  return {
    lon: normalizeLongitude(Math.atan2(ey, ex) * RAD + frame.tilt.dpsi / 3600),
    lat: Math.asin(ez / Math.hypot(ex, ey, ez)) * RAD
  };
}
