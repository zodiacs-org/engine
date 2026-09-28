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
import {
  BaryState,
  Body,
  CorrectLightTravel,
  GeoMoon,
  GeoVector,
  HelioState,
  HelioVector,
  ObserverState,
  ObserverVector,
  Vector
} from "astronomy-engine";
import type { AstroTime, Observer } from "astronomy-engine";

import type { CalcCorrection as Correction, Vec3 } from "./calc-frames.js";

export type Center =
  | { readonly kind: "geocentric" }
  | { readonly kind: "heliocentric" }
  | { readonly kind: "barycentric" }
  | { readonly kind: "topocentric"; readonly observer: Observer };

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

function observerAt(center: Center, time: AstroTime): Vec3 {
  return center.kind === "topocentric" ? vec(ObserverVector(time, center.observer, false)) : ZERO;
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
  const site = split(ObserverState(time, center.observer, false));
  return { r: sub(r, site.r), v: sub(v, site.v) };
}
