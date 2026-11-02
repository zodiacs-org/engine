/**
 * `@zodiacs/engine/stars`: the 411 IAU-named fixed stars of the Hipparcos new
 * reduction, and the Galactic Center, as positions on the ecliptic of date.
 * docs/stars.md is the guide.
 *
 * The method follows Ephemera's src/stars.cpp: straight-line space motion of
 * the catalogue place from J2000.0, annual parallax, light deflection by the
 * Sun, aberration with the Earth's barycentric velocity, then precession and
 * nutation. The precession (IAU 2006) and nutation (IAU 2000B) are the
 * engine's own (src/frame.ts, src/nutation.ts, through src/equator.ts), and
 * the Earth's barycentric state is astronomy-engine's.
 *
 * Method ported from Ephemera, https://github.com/intellecat/ephemera
 * Copyright (c) 2026 Intellecat. MIT License: see NOTICE.
 *
 * @module
 */
import { BaryState, Body, MakeTime, type AstroTime } from "astronomy-engine";

import { eclipticRows } from "./equator.js";
// The whole ephemeris module, though only its frame is read: so that this
// entry reaches the ephemeris chunk as a whole and the build splits no chunk
// that the other entries share (their import graphs stay byte for byte as
// they were).
import "./ephemeris.js";
import { STAR_ROWS } from "./stars-data.js";

const DEG = Math.PI / 180;
const ARCSEC = DEG / 3600;
const MAS_PER_YEAR_TO_RAD_PER_DAY = ARCSEC / 1000 / 365.25;
const AU_PER_PARSEC = 206264.80624709636;
const AU_KM = 149597870.7;
/** Light time for one astronomical unit, days. */
const AU_LIGHT_DAYS = 499.004783836 / 86400;
/** Schwarzschild radius of the Sun, AU (2GM/c^2, as ERFA's ERFA_SRS). */
const SUN_SRS = 1.97412574336e-8;

/** A fixed star of the catalogue. */
export interface FixedStar {
  /** IAU name, e.g. "Regulus". */
  readonly name: string;
  /** Bayer or Flamsteed designation in the catalogue's form, e.g. "alf Leo", or "". */
  readonly designation: string;
  /** Hipparcos number, or 0 for the Galactic Center. */
  readonly hip: number;
  /** V magnitude (0 for the Galactic Center). */
  readonly magnitude: number;
  /** ICRS right ascension at J2000.0, degrees. */
  readonly ra: number;
  /** ICRS declination at J2000.0, degrees. */
  readonly dec: number;
  /** Proper motion in right ascension times cos(dec), mas per year. */
  readonly pmRa: number;
  /** Proper motion in declination, mas per year. */
  readonly pmDec: number;
  /** Parallax, mas (0 when unknown). */
  readonly parallax: number;
  /** Radial velocity, km/s. */
  readonly radialVelocity: number;
}

/** Options for fixedStarPosition. */
export interface FixedStarOptions {
  /**
   * true (the default): the apparent place, true ecliptic and equinox of date,
   * with light deflection by the Sun, aberration and nutation. false: the
   * astrometric place (space motion and parallax only) on the mean ecliptic
   * and equinox of date.
   */
  readonly apparent?: boolean;
}

/** A star's place on the ecliptic of date. */
export interface FixedStarPosition {
  readonly star: FixedStar;
  /** Ecliptic longitude, degrees in [0, 360). */
  readonly longitude: number;
  /** Ecliptic latitude, degrees. */
  readonly latitude: number;
  /** Distance from the Earth, parsecs, or null without a parallax. */
  readonly distanceParsecs: number | null;
}

let cache: readonly FixedStar[] | undefined;

/** Every star of the catalogue, in the catalogue's (alphabetical) order. */
export function fixedStars(): readonly FixedStar[] {
  cache ??= Object.freeze(
    STAR_ROWS.map(([name, designation, hip, magnitude, ra, dec, pmRa, pmDec, parallax, radialVelocity]) =>
      Object.freeze({ name, designation, hip, magnitude, ra: ra / DEG, dec: dec / DEG, pmRa, pmDec, parallax, radialVelocity })
    )
  );
  return cache;
}

const GREEK: Readonly<Record<string, string>> = {
  alpha: "alf", beta: "bet", gamma: "gam", delta: "del", epsilon: "eps", zeta: "zet", eta: "eta", theta: "tet",
  iota: "iot", kappa: "kap", lambda: "lam", mu: "mu", nu: "nu", xi: "ksi", omicron: "omi", pi: "pi", rho: "rho",
  sigma: "sig", tau: "tau", upsilon: "ups", phi: "phi", chi: "chi", psi: "psi", omega: "ome"
};

function fold(text: string): string {
  return text.trim().replace(/\s+/gu, " ").toLowerCase();
}

/**
 * A star by IAU name ("Regulus"), designation ("alf Leo" or "alpha Leo"), or
 * Hipparcos number ("HIP 49669"). Matching ignores case and repeated spaces.
 * Returns undefined when nothing matches.
 */
export function findFixedStar(query: string): FixedStar | undefined {
  const q = fold(query);
  const hip = /^hip\s*(\d+)$/u.exec(q);
  if (hip) {
    const n = Number(hip[1]);
    return n > 0 ? fixedStars().find((s) => s.hip === n) : undefined;
  }
  const byName = fixedStars().find((s) => fold(s.name) === q);
  if (byName) return byName;
  const words = q.split(" ");
  const greek = GREEK[words[0]!];
  const alt = greek ? [greek, ...words.slice(1)].join(" ") : q;
  return fixedStars().find((s) => s.designation !== "" && (fold(s.designation) === q || fold(s.designation) === alt));
}

/** The frame bias, ICRS to the mean equator and equinox of J2000.0 (IERS Conventions 2010, eq. 5.21). */
const BIAS = (() => {
  const da = -0.0146 * ARCSEC;
  const xi = -0.041775 * ARCSEC * Math.sin(84381.448 * ARCSEC);
  const eta = -0.0068192 * ARCSEC;
  // Small-angle rotation R1(-eta) R2(xi) R3(da), first order, as ERFA's eraBp00 frame bias to 1e-13.
  return [1, da, -xi, -da, 1, -eta, xi, eta, 1] as const;
})();

type Rows = readonly [number, number, number, number, number, number, number, number, number];

function turn(m: Rows, x: number, y: number, z: number): [number, number, number] {
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}

function bias(x: number, y: number, z: number): [number, number, number] {
  return turn(BIAS, x, y, z);
}

function toTime(date: Date | AstroTime): AstroTime {
  return date instanceof Date ? MakeTime(date) : date;
}

/**
 * The place of a fixed star at a moment, on the ecliptic of date. `star` is a
 * FixedStar or a name findFixedStar accepts; an unknown name throws a
 * RangeError.
 */
export function fixedStarPosition(
  star: FixedStar | string,
  date: Date | AstroTime,
  options: FixedStarOptions = {}
): FixedStarPosition {
  const s = typeof star === "string" ? findFixedStar(star) : star;
  if (!s) throw new RangeError(`unknown fixed star: ${String(star)}`);
  const apparent = options.apparent ?? true;
  const time = toTime(date);
  const tt = time.tt;

  // Space motion from J2000.0 (ICRS, AU), straight-line, as ERFA's pmsafe/starpm.
  const ra = s.ra * DEG;
  const dec = s.dec * DEG;
  const ca = Math.cos(ra), sa = Math.sin(ra), cd = Math.cos(dec), sd = Math.sin(dec);
  const u = [cd * ca, cd * sa, sd];
  const ea = [-sa, ca, 0];
  const ed = [-sd * ca, -sd * sa, cd];
  const far = !(s.parallax > 0);
  const ma = s.pmRa * MAS_PER_YEAR_TO_RAD_PER_DAY * tt;
  const md = s.pmDec * MAS_PER_YEAR_TO_RAD_PER_DAY * tt;
  const d = far ? 1 : (AU_PER_PARSEC * 1000) / s.parallax;
  const radial = far ? 0 : ((s.radialVelocity * 86400) / AU_KM) * tt;
  let p = bias(
    d * (u[0]! + ma * ea[0]! + md * ed[0]!) + radial * u[0]!,
    d * (u[1]! + ma * ea[1]! + md * ed[1]!) + radial * u[1]!,
    d * (u[2]! + ma * ea[2]! + md * ed[2]!) + radial * u[2]!
  );

  // Annual parallax: from the Earth's barycentric position (EQJ, AU).
  const earth = BaryState(Body.Earth, time);
  const sun = BaryState(Body.Sun, time);
  if (!far) p = [p[0] - earth.x, p[1] - earth.y, p[2] - earth.z];
  const dist = Math.hypot(p[0], p[1], p[2]);
  let q = [p[0] / dist, p[1] / dist, p[2] / dist];

  if (apparent) {
    // Light deflection by the Sun (ERFA eraLdsun): e is the unit vector Sun to Earth.
    const ex = earth.x - sun.x, ey = earth.y - sun.y, ez = earth.z - sun.z;
    const em = Math.hypot(ex, ey, ez);
    const e = [ex / em, ey / em, ez / em];
    const dlim = 1e-6 / Math.max(em * em, 1);
    const qpe = [q[0]! + e[0]!, q[1]! + e[1]!, q[2]! + e[2]!];
    const qdqpe = q[0]! * qpe[0]! + q[1]! * qpe[1]! + q[2]! * qpe[2]!;
    const w = SUN_SRS / em / Math.max(qdqpe, dlim);
    const eq = cross(e, q);
    const peq = cross(q, eq);
    q = [q[0]! + w * peq[0]!, q[1]! + w * peq[1]!, q[2]! + w * peq[2]!];

    // Aberration (ERFA eraAb), the Earth's barycentric velocity in units of c.
    const v = [(earth.vx) * AU_LIGHT_DAYS, (earth.vy) * AU_LIGHT_DAYS, (earth.vz) * AU_LIGHT_DAYS];
    const v2 = v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!;
    const bm1 = Math.sqrt(1 - v2);
    const pdv = q[0]! * v[0]! + q[1]! * v[1]! + q[2]! * v[2]!;
    const w1 = 1 + pdv / (1 + bm1);
    const w2 = SUN_SRS / em;
    const r = [0, 1, 2].map((i) => q[i]! * bm1 + w1 * v[i]! + w2 * (v[i]! - pdv * q[i]!));
    const n = Math.hypot(r[0]!, r[1]!, r[2]!);
    q = [r[0]! / n, r[1]! / n, r[2]! / n];
  }

  const [x, y, z] = turn(eclipticRows(tt, apparent ? "true" : "mean"), q[0]!, q[1]!, q[2]!);
  let lon = Math.atan2(y, x) / DEG;
  if (lon < 0) lon += 360;
  if (lon >= 360) lon -= 360;
  const lat = Math.atan2(z, Math.hypot(x, y)) / DEG;
  return { star: s, longitude: lon, latitude: lat, distanceParsecs: far ? null : dist / AU_PER_PARSEC };
}

function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}
