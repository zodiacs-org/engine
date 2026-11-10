/**
 * The apparent place of date from a DE440 pack: the research runtime's
 * reduction with its shipped options (`CORRECTED` in
 * examples/precision-alpha/src/core/reduce.mjs in the site repository),
 * operation for operation. Light-time by iteration (at most 12 steps, to
 * 1e-11 s); light deflection by the Sun in the eraLd form, with the Sun at
 * reception for the observer's direction and at emission for the source's,
 * and a limiter of 1e-14; relativistic annual aberration (eraAb without its
 * gravitational term) with the Earth's velocity from the Chebyshev
 * derivative; frame bias, IAU 2006 precession, IAU 2000B nutation with the
 * P03 adjustment, and the true obliquity. TT is turned into TDB by the
 * runtime's three-term form. Mars to Pluto are planetary-system
 * barycentres.
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

  /** The apparent place of `body` at `ttDays` (TT days past J2000). */
  apparent(body: ReducedBody, ttDays: number): ApparentPlace {
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

    // Gravitational light deflection by the Sun (eraLd form).
    let p = unit(geo);
    if (body !== "Sun") {
      const sunAtRecv = this.pos("Sun", et, this.c);
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
    return { lon, lat, distKm, lightTimeSec: tau };
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
