import { catalog } from "./catalog.js";
import {
  dateFrom, eclipticRows, equatorRows, EPHEMERIS_SPAN, fromSpherical,
  onChartClock, RA_POLE_TOLERANCE, tilt, toSpherical, turn
} from "./engine.js";
import type { BirthInput, TimeBasis, Vec3 } from "./engine.js";
import type { CatalogStar } from "./types.js";

const DEG = Math.PI / 180;
const MAS_TO_RAD = DEG / 3_600_000;
const JULIAN_YEAR_DAYS = 365.25;

export const STAR_POSITION_CONVENTIONS = Object.freeze({
  sourceFrame: "j2000-mean-equator-equinox",
  equatorialFrame: "true-equator-equinox-of-date",
  eclipticFrame: "ecliptic-true-equinox-of-date",
  motion: "normalized-linear-j2000-tangent;no-radial-motion",
  clock: "tt-days-from-j2000;Julian-year",
  precession: "engine-frame",
  nutation: "engine-iau2000b",
  excludedCorrections: Object.freeze([
    "stellar-parallax", "perspective-acceleration", "annual-aberration", "gravitational-deflection"
  ])
} as const);

export type StarPositionTime = Pick<BirthInput, "utc" | "timeScale" | "deltaT">;

export interface StarPosition {
  readonly starId: string;
  /** Days of TT since J2000, used for motion and both frame rotations. */
  readonly ttDays: number;
  readonly elapsedJulianYears: number;
  /** Unavailable motion retains the catalog direction; it is not a measured zero. */
  readonly motion: "linear-tangent" | "unavailable";
  readonly directionJ2000: Vec3;
  /** Degrees, null at a numerical ecliptic pole. */
  readonly lonDeg: number | null;
  readonly lonDefined: boolean;
  readonly latDeg: number;
  /** Degrees, null at a numerical celestial pole under the engine's convention. */
  readonly raDeg: number | null;
  readonly raDefined: boolean;
  readonly decDeg: number;
}

export interface StarPositions {
  readonly positions: readonly StarPosition[];
  /** Native engine time-basis record, not a chart or sky receipt. */
  readonly timeBasis: TimeBasis;
  readonly trueObliquityDeg: number;
  readonly conventions: typeof STAR_POSITION_CONVENTIONS;
}

function validateStar(star: CatalogStar): void {
  if (!star || typeof star.id !== "string" || star.id.trim() === "" ||
      star.frame !== "j2000-mean-equator-equinox" || star.epochJulianYear !== 2000 ||
      !Number.isFinite(star.raDeg) || star.raDeg < 0 || star.raDeg >= 360 ||
      !Number.isFinite(star.decDeg) || Math.abs(star.decDeg) > 90) {
    throw new RangeError("Star astrometry requires a J2000 mean-equator/equinox direction at epoch J2000.");
  }
  const pm = star.properMotion;
  if (pm !== null && (!pm || !Number.isFinite(pm.raCosDecMasPerYear) || !Number.isFinite(pm.decMasPerYear))) {
    throw new RangeError("Proper motion requires finite tangent components or explicit null.");
  }
  if (Math.abs(star.decDeg) === 90 && pm !== null &&
      (pm.raCosDecMasPerYear !== 0 || pm.decMasPerYear !== 0)) {
    throw new RangeError("Motion at a catalog celestial pole requires a different tangent convention.");
  }
}

/**
 * Pure motion on fixed J2000 axes: normalize(u + years * tangent).
 * mu_alpha_star already includes cos(dec); there is no division by cos(dec).
 * This transverse model omits distance and radial velocity, rather than
 * supplying unknown values. No bias or original Hipparcos epoch shift occurs.
 */
export function propagateStarDirection(star: CatalogStar, ttDays: number): Vec3 {
  validateStar(star);
  if (!Number.isFinite(ttDays)) throw new RangeError("TT days must be finite.");
  const u = fromSpherical(star.raDeg, star.decDeg, 1);
  const pm = star.properMotion;
  if (pm === null) return Object.freeze(u);
  const a = star.raDeg * DEG;
  const d = star.decDeg * DEG;
  const years = ttDays / JULIAN_YEAR_DAYS;
  const east = years * pm.raCosDecMasPerYear * MAS_TO_RAD;
  const north = years * pm.decMasPerYear * MAS_TO_RAD;
  const moved: Vec3 = [
    u[0] - east * Math.sin(a) - north * Math.sin(d) * Math.cos(a),
    u[1] + east * Math.cos(a) - north * Math.sin(d) * Math.sin(a),
    u[2] + north * Math.cos(d)
  ];
  const length = Math.hypot(...moved);
  if (!Number.isFinite(length)) throw new RangeError("Motion displacement exceeds finite vector arithmetic.");
  return Object.freeze([moved[0] / length, moved[1] / length, moved[2] / length]);
}

/** Pure frame conversion, restricted to the engine's ephemeris span on TT. */
export function starPositionAtTt(star: CatalogStar, ttDays: number): StarPosition {
  const { from, to } = EPHEMERIS_SPAN.daysFromJ2000;
  if (!Number.isFinite(ttDays) || ttDays < from || ttDays > to) {
    throw new RangeError("TT instant is outside the engine EPHEMERIS_SPAN.");
  }
  const directionJ2000 = propagateStarDirection(star, ttDays);
  const ecl = turn(eclipticRows(ttDays, "true"), ...directionJ2000);
  const eq = turn(equatorRows(ttDays, "true"), ...directionJ2000);
  const eclSpherical = toSpherical(ecl);
  const eqSpherical = toSpherical(eq);
  const lonDefined = Math.hypot(ecl[0], ecl[1]) / Math.hypot(...ecl) > RA_POLE_TOLERANCE;
  const raDefined = Math.hypot(eq[0], eq[1]) / Math.hypot(...eq) > RA_POLE_TOLERANCE;
  return Object.freeze({
    starId: star.id, ttDays, elapsedJulianYears: ttDays / JULIAN_YEAR_DAYS,
    motion: star.properMotion === null ? "unavailable" : "linear-tangent",
    directionJ2000,
    lonDeg: lonDefined ? eclSpherical.lon : null, lonDefined, latDeg: eclSpherical.lat,
    raDeg: raDefined ? eqSpherical.lon : null, raDefined, decDeg: eqSpherical.lat
  });
}

/**
 * Resolve an instant exactly as the engine chart clock does, then place the
 * supplied stars in input order. This makes no chart or sky solver call.
 */
export function starPositions(input: StarPositionTime, stars: readonly CatalogStar[] = catalog): StarPositions {
  if (!input || typeof input !== "object") throw new RangeError("A resolved instant is required.");
  const ms = dateFrom(input.utc, "starPositions.utc").getTime();
  const scale = input.timeScale === undefined ? "utc" : input.timeScale;
  const pin = input.deltaT;
  if (scale !== "utc" && scale !== "ut1" && scale !== "tt") {
    throw new RangeError("timeScale must be utc, ut1 or tt.");
  }
  if (pin !== undefined && (!Number.isFinite(pin) || Math.abs(pin) > 1e10)) {
    throw new RangeError("deltaT must be finite seconds, at most 1e10 in size.");
  }
  if (!Array.isArray(stars)) throw new RangeError("Stars must be an array.");
  const seen = new Set<string>();
  for (const star of stars) {
    validateStar(star);
    if (seen.has(star.id)) throw new RangeError("Star ids must be unique.");
    seen.add(star.id);
  }
  return onChartClock(ms, scale, pin, (time, basis) => ({
    positions: Object.freeze(stars.map((star) => starPositionAtTt(star, time.tt))),
    timeBasis: basis,
    trueObliquityDeg: tilt(time.tt).tobl,
    conventions: STAR_POSITION_CONVENTIONS
  }));
}
