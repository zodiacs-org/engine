// Where a body is, as a vector on astronomy-engine's EQJ axes, for each center
// and correction the calc entry point offers.
//
// - geometric: the target and the observer at the same instant;
// - astrometric: the target when its light left, seen from where the observer
//   is when it arrives (light time only), on barycentric positions;
// - apparent: the observer is backdated with the target, as astronomy-engine's
//   GeoVector does, which adds the observer's aberration to first order:
//   annual, and for a topocentric observer diurnal too. No gravitational
//   deflection is applied. An apparent distance is the light path.
//
// The Moon seen from the geocentre is the exception: its apparent position
// keeps the engine's convention, the series at the instant, without light time
// or aberration, so that calc agrees with positions() and natalChart().
//
// A topocentric observer sits on the IERS 2003 ellipsoid, turned by the
// engine's apparent sidereal time and taken back to EQJ by the engine's own
// nutation and precession, without polar motion.
import {
  BaryState,
  Body,
  CorrectLightTravel,
  DEG2RAD,
  GeoMoon,
  GeoVector,
  HelioState,
  HelioVector,
  KM_PER_AU,
  Vector
} from "astronomy-engine";
import type { AstroTime } from "astronomy-engine";

import { apply, transpose } from "./calc-frames.js";
import type { CalcCorrection as Correction, Vec3 } from "./calc-frames.js";
import { gastHours } from "./ephemeris.js";
import { equatorRows } from "./equator.js";

/** Geodetic latitude and east longitude, degrees, and height above the ellipsoid, metres. */
export interface Site {
  readonly latitude: number;
  readonly longitude: number;
  readonly height: number;
}

export type Center =
  | { readonly kind: "geocentric" }
  | { readonly kind: "heliocentric" }
  | { readonly kind: "barycentric" }
  | { readonly kind: "topocentric"; readonly site: Site };

interface Cartesian {
  x: number;
  y: number;
  z: number;
}
interface State extends Cartesian {
  vx: number;
  vy: number;
  vz: number;
}

const ZERO: Vec3 = [0, 0, 0];
const vec = ({ x, y, z }: Cartesian): Vec3 => [x, y, z];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const length = ([x, y, z]: Vec3): number => Math.hypot(x, y, z);

// astronomy-engine 2.1.19's figure and rotation of the Earth, as its terra
// uses them: the IERS 2003 ellipsoid (a = 6378.1366 km, 1/f = 298.25642) and
// the Earth's angular velocity, rad/s.
const EARTH_FLATTENING = 0.996647180302104;
const EARTH_FLATTENING_SQUARED = EARTH_FLATTENING * EARTH_FLATTENING;
const EARTH_EQUATORIAL_RADIUS_KM = 6378.1366;
const ANGVEL = 7.292115e-5;

/**
 * The observer's position (au) and velocity (au/day) on the true equator and
 * equinox of date, at `st`, the Greenwich apparent sidereal time in hours:
 * astronomy-engine 2.1.19's terra, term for term. astronomy-engine is
 * Copyright (c) 2019-2023 Don Cross, MIT License; NOTICE carries it.
 */
function terra(site: Site, st: number): { pos: Vec3; vel: Vec3 } {
  const phi = site.latitude * DEG2RAD;
  const sinphi = Math.sin(phi);
  const cosphi = Math.cos(phi);
  const c = 1 / Math.hypot(cosphi, EARTH_FLATTENING * sinphi);
  const s = EARTH_FLATTENING_SQUARED * c;
  const heightKm = site.height / 1000;
  const ach = EARTH_EQUATORIAL_RADIUS_KM * c + heightKm;
  const ash = EARTH_EQUATORIAL_RADIUS_KM * s + heightKm;
  const stlocl = (15 * st + site.longitude) * DEG2RAD;
  const sinst = Math.sin(stlocl);
  const cosst = Math.cos(stlocl);
  return {
    pos: [(ach * cosphi * cosst) / KM_PER_AU, (ach * cosphi * sinst) / KM_PER_AU, (ash * sinphi) / KM_PER_AU],
    vel: [(-ANGVEL * ach * cosphi * sinst * 86400) / KM_PER_AU, (ANGVEL * ach * cosphi * cosst * 86400) / KM_PER_AU, 0]
  };
}

/**
 * The observer's geocentric position and velocity on EQJ axes: terra at the
 * engine's apparent sidereal time (src/ephemeris.ts), turned back from the
 * true equator and equinox of date by the engine's nutation and precession
 * (src/equator.ts). astronomy-engine's ObserverState does the same with its
 * five-term nutation and a sidereal time it caches by TT alone.
 */
function observerState(site: Site, time: AstroTime): { r: Vec3; v: Vec3 } {
  const { pos, vel } = terra(site, gastHours(time));
  const back = transpose(equatorRows(time.tt, "true"));
  return { r: apply(back, pos), v: apply(back, vel) };
}

function observerAt(center: Center, time: AstroTime): Vec3 {
  return center.kind === "topocentric" ? observerState(center.site, time).r : ZERO;
}

/** Geometric, from the geocentre: the Moon from its series, the rest from heliocentric vectors. */
function fromGeocentre(body: Body, time: AstroTime): Vec3 {
  return body === Body.Moon
    ? vec(GeoMoon(time))
    : sub(vec(HelioVector(body, time)), vec(HelioVector(Body.Earth, time)));
}

/** astronomy-engine's light-time solution of `at`, with the time the light left. */
function retarded(at: (time: AstroTime) => Vec3, time: AstroTime): { v: Vec3; left: AstroTime } {
  const found = CorrectLightTravel((t: AstroTime) => {
    const [x, y, z] = at(t);
    return new Vector(x, y, z, t);
  }, time);
  return { v: vec(found), left: found.t };
}

/**
 * astronomy-engine's barycentre is the Sun and the four giant planets, each
 * weighted m / (m + M☉). From 1800 to 2200 it is within these of DE441's:
 * calc-bounds.test.ts scans it daily against the full Newtonian barycentre and
 * compares it with Horizons where it is worst.
 */
export const BARYCENTRE_ERROR = { au: 1.4e-5, auPerDay: 1.2e-7 } as const;

/**
 * How far the Sun moved about the barycentre while the light travelled. Added
 * to a light-time vector found on heliocentric positions, it gives the
 * barycentric (astrometric) one.
 */
function sunMotion(left: AstroTime, time: AstroTime): Vec3 {
  return sub(vec(BaryState(Body.Sun, left)), vec(BaryState(Body.Sun, time)));
}

export interface Located {
  /** A vector along the reported direction, EQJ axes, au. */
  readonly v: Vec3;
  /** The reported distance, au: the light path for apparent and astrometric positions. */
  readonly dist: number;
}

export function locate(body: Body, center: Center, correction: Correction, time: AstroTime): Located {
  const found = (v: Vec3, dist = length(v)): Located => ({ v, dist });
  if (center.kind === "barycentric") {
    // The barycentre does not move, so apparent and astrometric coincide.
    const bary = (t: AstroTime) => vec(BaryState(body, t));
    return found(correction === "geometric" ? bary(time) : retarded(bary, time).v);
  }
  if (center.kind === "heliocentric") {
    const helio = (t: AstroTime) => vec(HelioVector(body, t));
    if (correction === "geometric") return found(helio(time));
    const { v, left } = retarded(helio, time);
    const astrometric = add(v, sunMotion(left, time));
    return correction === "apparent" ? found(v, length(astrometric)) : found(astrometric);
  }
  const place = observerAt(center, time);
  if (correction === "geometric") return found(sub(fromGeocentre(body, time), place));
  if (correction === "apparent" && body === Body.Moon && center.kind === "geocentric") {
    return found(vec(GeoMoon(time)));
  }
  const from = add(vec(HelioVector(Body.Earth, time)), place);
  const { v, left } = retarded((t) => sub(vec(HelioVector(body, t)), from), time);
  const astrometric = add(v, sunMotion(left, time));
  if (correction === "astrometric") return found(astrometric);
  const apparent =
    center.kind === "geocentric"
      ? vec(GeoVector(body, time, true))
      : retarded((t) => sub(fromGeocentre(body, t), observerAt(center, t)), time).v;
  return found(apparent, length(astrometric));
}

/**
 * A geometric position with its velocity (au/day) from astronomy-engine's
 * differentiated series, for every body but the Moon, whose velocity it only
 * differences.
 */
export function geometricState(body: Body, center: Center, time: AstroTime): { r: Vec3; v: Vec3 } | null {
  if (body === Body.Moon) return null;
  const split = (s: State) => ({ r: vec(s), v: [s.vx, s.vy, s.vz] as Vec3 });
  if (center.kind === "barycentric") return split(BaryState(body, time));
  const target = split(HelioState(body, time));
  if (center.kind === "heliocentric") return target;
  const earth = split(HelioState(Body.Earth, time));
  const r = sub(target.r, earth.r);
  const v = sub(target.v, earth.v);
  if (center.kind === "geocentric") return { r, v };
  const site = observerState(center.site, time);
  return { r: sub(r, site.r), v: sub(v, site.v) };
}
