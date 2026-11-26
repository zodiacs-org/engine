/**
 * A minor body's apparent geocentric place on the true ecliptic and equinox
 * of date, from its heliocentric table (src/minor-bodies/table.ts) and the
 * Earth's and the Sun's barycentric states, the reduction of the DE440 entry
 * (src/de440/reduce.ts) step for step, with the same constants:
 *
 * - light time by iteration, to 10⁻⁹ s (at most 12 steps): the body at the
 *   emission, with the Sun there, from the Earth at the reception;
 * - the Sun's gravitational light deflection in the form of ERFA's eraLd,
 *   except for a body farther than the Sun whose direction is within the
 *   Sun's apparent radius of the Sun's (radius 695,700 km, the Sun at its own
 *   light time), whose light is not bent, as JPL Horizons does;
 * - relativistic annual aberration (eraAb without its gravitational term),
 *   with the Earth's barycentric velocity;
 * - from the ICRF, taken for astronomy-engine's EQJ, to the true ecliptic and
 *   equinox of date as src/frame.ts carries a body (astronomy-engine's IAU
 *   2006 precession and the engine's IAU 2000B nutation, without the frame
 *   bias).
 *
 * The table's argument is TDB, formed from TT by the three-term form of
 * src/de440/reduce.ts.
 */
import { eclipticOfDate } from "../frame.js";

type Vec3 = readonly [number, number, number];

const AU_KM = 149597870.7;
/** Light-time for one au, seconds (IAU 2009). */
const LIGHT_TIME_AU = 499.004783836;
const C_KM_S = AU_KM / LIGHT_TIME_AU;
/** 2GM/c^2 for the Sun, au. */
const SRS = 1.97412574336e-8;
const LIGHT_TIME_ITERATIONS = 12;
const LIGHT_TIME_TOLERANCE_SEC = 1e-9;
const DEFLECTION_LIMIT = 1e-14;
/** The Sun's radius, km, as JPL Horizons gives it (IAU 2015 nominal). */
const SUN_RADIUS_KM = 695700;
const NEAR_DISC_COS = Math.cos(Math.PI / 180 / 3);
const DAY_SEC = 86400;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v: Vec3): number => Math.sqrt(dot(v, v));
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
const unit = (v: Vec3): Vec3 => scale(v, 1 / norm(v));
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** TDB - TT, seconds: the three-term form of src/de440/reduce.ts (the Astronomical Almanac's). */
export function tdbMinusTt(jdTt: number): number {
  const g = ((357.53 + 0.9856003 * (jdTt - 2451545.0)) * Math.PI) / 180;
  const l = ((246.11 + 0.90251792 * (jdTt - 2451545.0)) * Math.PI) / 180;
  return 0.001658 * Math.sin(g) + 0.000014 * Math.sin(2 * g) + 0.0000224 * Math.sin(l);
}

/** The Earth's and the Sun's states from the solar-system barycentre, in the ICRF: km and km/s. */
export interface EarthAndSun {
  readonly earth: { readonly position: Vec3; readonly velocity: Vec3 };
  readonly sun: { readonly position: Vec3; readonly velocity: Vec3 };
}

/** An apparent geocentric place on the true ecliptic and equinox of date. */
export interface MinorBodyPlace {
  /** Degrees in [0, 360). */
  readonly lon: number;
  /** Degrees. */
  readonly lat: number;
  /** Along the light-time-corrected geometric direction, au. */
  readonly distAu: number;
  readonly lightTimeSec: number;
  /** Whether the body is behind the Sun's disc, so that its light was not bent. */
  readonly behindDisc: boolean;
}

/**
 * The apparent place at `ttDays` (TT days past J2000.0) of the body whose
 * heliocentric ICRF position, km, at a TDB Julian date `heliocentric` gives,
 * seen from the Earth whose state, with the Sun's, `statesAt` gives at a TT
 * instant. `behind`, when given, is taken as whether the body is behind the
 * Sun's disc instead of deciding it here, as src/de440/reduce.ts takes it: a
 * speed's two samples hold the decision at their central instant, so that a
 * difference across the Sun's limb does not read the deflection's step there
 * as motion.
 */
export function apparentPlace(
  heliocentric: (jdTdb: number) => Vec3,
  ttDays: number,
  statesAt: (ttDays: number) => EarthAndSun,
  behind?: boolean
): MinorBodyPlace {
  const now = statesAt(ttDays);
  const observer = now.earth.position;
  const sunNow = now.sun.position;
  const jdTt = ttDays + 2451545.0;
  const jdTdb = jdTt + tdbMinusTt(jdTt) / DAY_SEC;

  // Light-time iteration: the body and the Sun at the emission, the Earth at the reception.
  let tau = 0;
  let body = heliocentric(jdTdb);
  let geo = sub(add(body, sunNow), observer);
  for (let i = 0; i < LIGHT_TIME_ITERATIONS; i += 1) {
    const next = (norm(geo) / AU_KM) * LIGHT_TIME_AU;
    if (Math.abs(next - tau) < LIGHT_TIME_TOLERANCE_SEC) {
      tau = next;
      break;
    }
    tau = next;
    body = heliocentric(jdTdb - tau / DAY_SEC);
    geo = sub(add(body, statesAt(ttDays - tau / DAY_SEC).sun.position), observer);
  }
  const distKm = norm(geo);

  // The Sun's gravitational light deflection (eraLd form), except behind the Sun's disc.
  let p = unit(geo);
  const behindDisc = behind ?? behindSunDisc(p, distKm, ttDays, observer, sunNow, statesAt);
  if (!behindDisc) {
    const eVec = sub(observer, sunNow);
    const emAu = norm(eVec) / AU_KM;
    const e = unit(eVec);
    const q = unit(body);
    const w = SRS / emAu / Math.max(dot(q, add(q, e)), DEFLECTION_LIMIT);
    p = unit(add(p, scale(cross(p, cross(e, q)), w)));
  }

  // Annual aberration, special-relativistic (eraAb without the gravitational-potential refinement).
  const v = scale(now.earth.velocity, 1 / C_KM_S);
  const bm1 = Math.sqrt(1 - dot(v, v));
  const pdv = dot(p, v);
  const w1 = 1 + pdv / (1 + bm1);
  p = unit([(bm1 * p[0] + w1 * v[0]) / (1 + pdv), (bm1 * p[1] + w1 * v[1]) / (1 + pdv), (bm1 * p[2] + w1 * v[2]) / (1 + pdv)]);

  if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2]) || !Number.isFinite(distKm)) {
    throw new RangeError("the minor body has no determinable direction at this instant");
  }
  const { lon, lat } = eclipticOfDate(p[0], p[1], p[2], ttDays);
  return { lon, lat, distAu: distKm / AU_KM, lightTimeSec: tau, behindDisc };
}

/**
 * Whether a body at geometric direction `p` (a unit vector) and distance
 * `distKm` from the observer is behind the Sun's disc: farther than the Sun,
 * and within its apparent radius of the Sun's direction, the Sun taken at its
 * own light time, as src/de440/reduce.ts decides it.
 */
function behindSunDisc(p: Vec3, distKm: number, ttDays: number, observer: Vec3, sunNow: Vec3, statesAt: (ttDays: number) => EarthAndSun): boolean {
  const near = sub(sunNow, observer);
  // Farther than a third of a degree from the Sun (its disc is under 0.28 degrees across), it is not behind.
  if (!(distKm > norm(near)) || dot(p, unit(near)) < NEAR_DISC_COS) return false;
  const sun = sub(statesAt(ttDays - norm(near) / C_KM_S / DAY_SEC).sun.position, observer);
  const d = norm(sun);
  if (!(distKm > d)) return false;
  const s = unit(sun);
  return Math.atan2(norm(cross(p, s)), dot(p, s)) < Math.asin(SUN_RADIUS_KM / d);
}
