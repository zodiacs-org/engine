/**
 * The apparent place of date from a DE440 pack: the research runtime's
 * reduction with its shipped options (`CORRECTED` in
 * examples/precision-alpha/src/core/reduce.mjs in the site repository),
 * operation for operation. Light-time by iteration (at most 12 steps, to
 * 1e-11 s); light deflection by the Sun in the eraLd form, with the Sun at
 * reception for the observer's direction and at emission for the source's,
 * and a limiter of 1e-14, except for a body behind the Sun's disc, whose
 * light is not bent (from 1.1.0-rc.12; below); relativistic annual aberration (eraAb without its
 * gravitational term) with the Earth's velocity from the Chebyshev
 * derivative; frame bias, IAU 2006 precession, IAU 2000B nutation with the
 * P03 adjustment, and the true obliquity. TT is turned into TDB by the
 * runtime's three-term form. Mars to Pluto are planetary-system
 * barycentres.
 *
 * Behind the disc (from 1.1.0-rc.12): where the body is farther than the
 * Sun and its light-time-corrected geometric direction is within the Sun's
 * apparent radius of the Sun's (asin(R / d), R = 695,700 km, the Sun's
 * radius JPL Horizons gives, d the Sun's distance at its own light time),
 * no deflection is applied. That is what JPL Horizons does: its apparent
 * places of Mercury in 1954, Uranus in 2029 and Jupiter in 2032 are the
 * kernel's with the deflection outside the disc and without it inside, to
 * the change at the limb (docs/evidence/1.1.0-rc.12-20261115/near-sun/).
 * Through 1.1.0-rc.11 the deflection was applied inside the disc too, where
 * it grows without limit towards the centre (308 arcseconds for Mercury on
 * 1954-05-08); ERFA's eraLdsun tapers it to nothing within about 0.08
 * degrees, which leaves up to 5.8 arcseconds from Horizons inside the disc.
 * At the limb the place therefore steps by the deflection there, at most
 * 1.7512 arcseconds (4GM/c^2R for a source at infinity).
 *
 * The geocentric Moon is formed as MoonRelEMB(t - tau) - EarthRelEMB(t) +
 * [EMB(t - tau) - EMB(t)], the bracket as -v tau + a tau^2 / 2 from the
 * barycentre's velocity and acceleration at t, so that its 30 km/s never
 * multiplies the rounding of the epoch t - tau (P4.1's preregistration, and
 * audit finding alpha-reduction-math-8).
 */
import { apply, eclipticLonLatDeg, equToEcl, npbMatrix } from "./frames.js";
import type { Vec3 } from "./frames.js";
import { fail } from "./pack.js";
import type { StateSource } from "./pack.js";

const AU_KM = 149597870.7;
/** Light-time for one au, seconds (IAU 2009). */
const LIGHT_TIME_AU = 499.004783836;
const C_KM_S = AU_KM / LIGHT_TIME_AU;
const DAY = 86400;
/** 2GM/c^2 for the Sun, au. */
const SRS = 1.97412574336e-8;
const LIGHT_TIME_ITERATIONS = 12;
const LIGHT_TIME_TOLERANCE_SEC = 1e-11;
const DEFLECTION_LIMIT = 1e-14;
/** The Sun's radius, km, as JPL Horizons gives it (IAU 2015 nominal): the edge of the disc behind which light is not bent. */
export const SUN_RADIUS_KM = 695700;
const NEAR_DISC_COS = Math.cos((Math.PI / 180) / 3);
/** Half the step of the central difference that gives the barycentre's acceleration, seconds. */
const ACCELERATION_STEP_SEC = 60;

/** The bodies this reduction places. */
export const REDUCED_BODIES = /*#__PURE__*/ Object.freeze([
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto"
] as const);
export type ReducedBody = (typeof REDUCED_BODIES)[number];

/** Bodies the kernel stores as a planetary-system barycentre, not a centre. */
export const BARYCENTRE_NOT_CENTRE = /*#__PURE__*/ Object.freeze(["Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"] as const);

const norm = (v: Vec3): number => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
const unit = (v: Vec3): Vec3 => scale(v, 1 / norm(v));
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const position = (s: Float64Array): Vec3 => [s[0]!, s[1]!, s[2]!];
const velocity = (s: Float64Array): Vec3 => [s[3]!, s[4]!, s[5]!];

/** TDB - TT, seconds: the Astronomical Almanac's form the runtime uses (three terms, error under 30 microseconds). */
export function tdbMinusTt(jdTt: number): number {
  const g = ((357.53 + 0.9856003 * (jdTt - 2451545.0)) * Math.PI) / 180;
  const l = ((246.11 + 0.90251792 * (jdTt - 2451545.0)) * Math.PI) / 180;
  return 0.001658 * Math.sin(g) + 0.000014 * Math.sin(2 * g) + 0.0000224 * Math.sin(l);
}

/** TDB seconds past J2000 for TT days past J2000, as the runtime forms them. */
export function etOf(ttDays: number): number {
  const jdTt = ttDays + 2451545.0;
  return ttDays * DAY + tdbMinusTt(jdTt);
}

/** An apparent geocentric place on the true ecliptic and equinox of date. */
export interface ApparentPlace {
  /** Degrees in [0, 360). */
  readonly lon: number;
  /** Degrees. */
  readonly lat: number;
  /** Kilometres, along the light-time-corrected geometric direction. */
  readonly distKm: number;
  readonly lightTimeSec: number;
  /** Whether the body is behind the Sun's disc, so that its light was not bent (from 1.1.0-rc.12). */
  readonly behindDisc: boolean;
}

interface LunarBasis {
  readonly earth: Vec3;
  readonly embVelocity: Vec3;
  readonly embAcceleration: Vec3;
}

export class Reducer {
  private readonly backend: StateSource;
  private readonly a = new Float64Array(6);
  private readonly b = new Float64Array(6);
  private readonly c = new Float64Array(6);
  private readonly emb = new Float64Array(6);
  private readonly moon = new Float64Array(6);
  private readonly earth = new Float64Array(6);

  constructor(backend: StateSource) {
    this.backend = backend;
  }

  private pos(body: string, et: number, buf: Float64Array): Vec3 {
    this.backend.state(body, et, buf);
    return position(buf);
  }

  /** The Earth relative to the barycentre at et, and the barycentre's velocity and acceleration there. */
  private lunarBasis(et: number): LunarBasis {
    this.backend.lunar(et + ACCELERATION_STEP_SEC, this.emb, this.moon, this.earth);
    const after = velocity(this.emb);
    this.backend.lunar(et - ACCELERATION_STEP_SEC, this.emb, this.moon, this.earth);
    const before = velocity(this.emb);
    this.backend.lunar(et, this.emb, this.moon, this.earth);
    const span = 2 * ACCELERATION_STEP_SEC;
    return {
      earth: position(this.earth),
      embVelocity: velocity(this.emb),
      embAcceleration: [(after[0] - before[0]) / span, (after[1] - before[1]) / span, (after[2] - before[2]) / span]
    };
  }

  /** MoonRelEMB(emission) - EarthRelEMB(et) + (-v tau + a tau^2 / 2). */
  private geocentricMoon(emission: number, tau: number, basis: LunarBasis): Vec3 {
    this.backend.lunar(emission, this.emb, this.moon, this.earth);
    const m = position(this.moon);
    const v = basis.embVelocity;
    const acc = basis.embAcceleration;
    const e = basis.earth;
    return [
      m[0] - e[0] + (-v[0] * tau + 0.5 * acc[0] * tau * tau),
      m[1] - e[1] + (-v[1] * tau + 0.5 * acc[1] * tau * tau),
      m[2] - e[2] + (-v[2] * tau + 0.5 * acc[2] * tau * tau)
    ];
  }

  /**
   * The apparent place of `body` at `ttDays` (TT days past J2000). `behind`,
   * when given, is taken as whether the body is behind the Sun's disc instead
   * of deciding it at `ttDays`: a speed's two samples take the decision of the
   * instant the speed is for, so that it is the rate of the place on that
   * instant's side of the step at the limb, not the step.
   */
  apparent(body: ReducedBody, ttDays: number, behind?: boolean): ApparentPlace {
    if (!REDUCED_BODIES.includes(body)) fail("unknown-body", `${String(body)} is not a body this reduction places`);
    if (!Number.isFinite(ttDays)) fail("bad-instant", "ttDays must be a finite number");
    const jdTt = ttDays + 2451545.0;
    const et = ttDays * DAY + tdbMinusTt(jdTt);
    const t = ttDays / 36525;
    if (!this.backend.covers(et)) fail("out-of-coverage", "the instant is outside the pack's coverage");

    this.backend.state("Earth", et, this.b);
    const observer = position(this.b);
    const observerVel = velocity(this.b);
    const lunar = body === "Moon" ? this.lunarBasis(et) : null;
    const geoAt = (tau: number): Vec3 =>
      lunar ? this.geocentricMoon(et - tau, tau, lunar) : sub(this.pos(body, et - tau, this.a), observer);

    // Light-time iteration.
    let tau = 0;
    let geo = geoAt(0);
    for (let i = 0; i < LIGHT_TIME_ITERATIONS; i += 1) {
      const next = (norm(geo) / AU_KM) * LIGHT_TIME_AU;
      if (Math.abs(next - tau) < LIGHT_TIME_TOLERANCE_SEC) {
        tau = next;
        break;
      }
      tau = next;
      if (!this.backend.covers(et - tau)) fail("out-of-coverage", "the light-time lookback reaches outside the pack's coverage");
      geo = geoAt(tau);
    }
    const distKm = norm(geo);

    // Gravitational light deflection by the Sun (eraLd form), except behind the Sun's disc.
    let p = unit(geo);
    const sunAtRecv = body === "Sun" ? null : this.pos("Sun", et, this.c);
    const behindDisc = sunAtRecv !== null && (behind ?? this.behindDisc(p, distKm, et, observer, sunAtRecv));
    if (sunAtRecv !== null && !behindDisc) {
      const eVec = sub(observer, sunAtRecv);
      const emAu = norm(eVec) / AU_KM;
      const e = unit(eVec);
      const sunAtEmit = this.pos("Sun", et - tau, this.c);
      const q = unit(sub(addv(observer, geo), sunAtEmit));
      const qdqpe = dot(q, addv(q, e));
      const w = SRS / emAu / Math.max(qdqpe, DEFLECTION_LIMIT);
      const peq = cross(p, cross(e, q));
      p = unit(addv(p, scale(peq, w)));
    }

    // Annual aberration, special-relativistic (eraAb without the
    // gravitational-potential refinement beyond 1/sqrt(1 - v^2)).
    const v = scale(observerVel, 1 / C_KM_S);
    const v2 = dot(v, v);
    const bm1 = Math.sqrt(1 - v2);
    const pdv = dot(p, v);
    const w1 = 1 + pdv / (1 + bm1);
    p = unit([(bm1 * p[0] + w1 * v[0]) / (1 + pdv), (bm1 * p[1] + w1 * v[1]) / (1 + pdv), (bm1 * p[2] + w1 * v[2]) / (1 + pdv)]);

    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2]) || !Number.isFinite(distKm)) {
      fail("bad-geometry-of-sky", `${body} has no determinable direction at this instant`);
    }

    const { matrix, epsTrue } = npbMatrix(t);
    const { lon, lat } = eclipticLonLatDeg(equToEcl(apply(matrix, p), epsTrue));
    return { lon, lat, distKm, lightTimeSec: tau, behindDisc };
  }

  /**
   * Whether a body at geometric direction `p` (a unit vector) and distance
   * `distKm` from the observer at `observer` is behind the Sun's disc at
   * `et`: farther than the Sun, and within its apparent radius of the Sun's
   * direction, the Sun taken at its own light time.
   */
  private behindDisc(p: Vec3, distKm: number, et: number, observer: Vec3, sunAtRecv: Vec3): boolean {
    const near = sub(sunAtRecv, observer);
    // Farther than a third of a degree (the disc is under 0.28 degrees across at most), it is not behind.
    if (!(distKm > norm(near)) || dot(p, unit(near)) < NEAR_DISC_COS) return false;
    const sun = sub(this.pos("Sun", et - (norm(near) / AU_KM) * LIGHT_TIME_AU, this.c), observer);
    const d = norm(sun);
    if (!(distKm > d)) return false;
    // The angle between p and the Sun's direction, from the cross and dot products (exact near zero).
    const s = unit(sun);
    const apart = Math.atan2(norm(cross(p, s)), dot(p, s));
    return apart < Math.asin(SUN_RADIUS_KM / d);
  }

  /**
   * The instants in [fromTtDays, toTtDays] (TT days past J2000) at which a
   * place this reduction gives, or the true node, may step by more than
   * rounding, in ascending order: where one of its reads passes a record
   * boundary of the pack. For each boundary B (TDB) of any stored series
   * these are B itself (the observer, the Sun at reception, the node), B - 60 s
   * and B + 60 s (the two reads the barycentre's acceleration is differenced
   * from), and for each body the instant whose light left it at B (its own
   * state, and the Sun's at emission). The list is one for every body: a
   * superset for each. Between two neighbours of it every read stays inside
   * one record of every series, so each place is a smooth function of time.
   */
  steps(fromTtDays: number, toTtDays: number): number[] {
    if (!Number.isFinite(fromTtDays) || !Number.isFinite(toTtDays)) fail("bad-instant", "ttDays must be a finite number");
    const coverage = { from: etOf(fromTtDays), to: etOf(toTtDays) };
    // A day back covers the longest light time, under seven hours for Pluto.
    const instants: number[] = [];
    const ttOf = (et: number): number => (et - tdbMinusTt(et / DAY + 2451545.0)) / DAY;
    for (const boundary of this.backend.boundaries(coverage.from - DAY, coverage.to + 2 * ACCELERATION_STEP_SEC)) {
      instants.push(boundary, boundary - ACCELERATION_STEP_SEC, boundary + ACCELERATION_STEP_SEC);
      for (const body of REDUCED_BODIES) {
        // t with t - tau(t) = boundary: tau changes by under 1e-3 of the change of t, so four rounds reach rounding.
        let at = boundary;
        for (let round = 0; round < 4; round += 1) {
          if (!this.backend.covers(at) || !this.backend.covers(at - DAY)) break;
          at = boundary + this.apparent(body, ttOf(at)).lightTimeSec;
        }
        instants.push(at);
      }
    }
    return [...new Set(instants.map(ttOf))].filter((tt) => tt >= fromTtDays && tt <= toTtDays).sort((x, y) => x - y);
  }

  /**
   * The geometric geocentric Moon at `ttDays` (TT days past J2000), in the
   * ICRF at TDB, with no light-time, aberration or deflection: the pack's
   * Moon less its Earth, each from the Earth-Moon barycentre, position in km
   * and velocity in km/s, as `trueNode` reads them (from 3.0.0).
   */
  moonState(ttDays: number): { position: [number, number, number]; velocity: [number, number, number] } {
    if (!Number.isFinite(ttDays)) fail("bad-instant", "ttDays must be a finite number");
    const et = etOf(ttDays);
    if (!this.backend.covers(et)) fail("out-of-coverage", "the instant is outside the pack's coverage");
    this.backend.lunar(et, this.emb, this.moon, this.earth);
    const [x, y, z] = sub(position(this.moon), position(this.earth));
    const [vx, vy, vz] = sub(velocity(this.moon), velocity(this.earth));
    return { position: [x, y, z], velocity: [vx, vy, vz] };
  }

  /**
   * The Earth's and the Sun's geometric states at `ttDays` (TT days past
   * J2000), from the solar-system barycentre, in the ICRF at TDB: positions
   * in km and velocities in km/s, the Earth's as the reduction takes its
   * observer (from 3.0.0, for `@zodiacs/engine/minor-bodies`).
   */
  earthAndSunState(ttDays: number): {
    earth: { position: [number, number, number]; velocity: [number, number, number] };
    sun: { position: [number, number, number]; velocity: [number, number, number] };
  } {
    if (!Number.isFinite(ttDays)) fail("bad-instant", "ttDays must be a finite number");
    const et = etOf(ttDays);
    if (!this.backend.covers(et)) fail("out-of-coverage", "the instant is outside the pack's coverage");
    const state = (body: string): { position: [number, number, number]; velocity: [number, number, number] } => {
      const s = this.backend.state(body, et, this.a);
      return { position: [s[0]!, s[1]!, s[2]!], velocity: [s[3]!, s[4]!, s[5]!] };
    };
    return { earth: state("Earth"), sun: state("Sun") };
  }

  /**
   * The Moon's true node: the ascending node, on the true ecliptic and
   * equinox of date, of the plane of r x v, r and v the Moon's geometric
   * geocentric position and velocity in the ICRF at TDB (no light-time,
   * aberration or deflection). Degrees in [0, 360).
   */
  trueNode(ttDays: number): number {
    if (!Number.isFinite(ttDays)) fail("bad-instant", "ttDays must be a finite number");
    const jdTt = ttDays + 2451545.0;
    const et = ttDays * DAY + tdbMinusTt(jdTt);
    const t = ttDays / 36525;
    if (!this.backend.covers(et)) fail("out-of-coverage", "the instant is outside the pack's coverage");
    this.backend.lunar(et, this.emb, this.moon, this.earth);
    const r = sub(position(this.moon), position(this.earth));
    const vel = sub(velocity(this.moon), velocity(this.earth));
    const h = cross(r, vel);
    const { matrix, epsTrue } = npbMatrix(t);
    const ecl = equToEcl(apply(matrix, h), epsTrue);
    let lon = (Math.atan2(ecl[0], -ecl[1]) * 180) / Math.PI;
    if (lon < 0) lon += 360;
    return lon;
  }
}
