/**
 * `@zodiacs/engine/calc`: one calculation API over the engine's positions,
 * houses, longitude crossings and charts. The four functions share one
 * vocabulary for instants, places, frames, centers and the zodiac; each result
 * carries a receipt that names its conventions by id; positions carry bounds;
 * and what this version does not compute comes back as a typed refusal.
 * Malformed input throws RangeError, as everywhere in the engine. The
 * repository's docs/calc.md is the reference.
 */
import {
  AstroTime,
  Body,
  EclipticGeoMoon,
  GeoMoonState,
  MakeTime,
  Observer,
  SetDeltaTFunction,
  SiderealTime,
  e_tilt
} from "astronomy-engine";

// Imported first so that the build keeps the root entry's shared chunks byte for byte.
import { bodyLongitude, computeChart } from "./ephemeris.js";
import { assertDerivedFlags, snapshotFlags, timeFlags, validateBirthSettings } from "./birth-input.js";
import { MEASURED, MEASURED_BASIS } from "./calc-bounds.js";
import {
  CALC_FRAMES,
  apply,
  frameMatrix,
  fromSpherical,
  inertial,
  sphericalRates,
  toSpherical,
  transpose
} from "./calc-frames.js";
import type { CalcCorrection, CalcFrame, Vec3 } from "./calc-frames.js";
import { geometricState, length, locate } from "./calc-reduce.js";
import type { Center } from "./calc-reduce.js";
import { searchLongitudeCrossingsWith } from "./crossings.js";
import { dateFrom } from "./date-input.js";
import { deltaT, deltaTAt } from "./deltat.js";
import type { DeltaT } from "./deltat.js";
import { computeAngles, computeHouses, eastPointOf, isPolarUndefinedHouseSystem, ramcOf, vertexOf } from "./houses.js";
import { meanApogee, meanNodeLongitude } from "./points.js";
import { REFERENCE_SPAN, outsideReferenceSpan } from "./reference-span.js";
import { normalizeLongitude } from "./signs.js";
import { ENGINE_VERSION, EPHEMERIS } from "./types.js";
import type { Angles, BodyName, Chart, ChartFlag, ChartInput, HouseSystem } from "./types.js";

export { CALC_FRAMES };
export type { Angles, CalcCorrection, CalcFrame, Chart, ChartFlag, DeltaT, HouseSystem };

/** The Sun, Moon, Earth and planets, the true and mean lunar nodes, and Black Moon Lilith (the mean apogee). */
export type CalcBody =
  | "Sun"
  | "Moon"
  | "Mercury"
  | "Venus"
  | "Earth"
  | "Mars"
  | "Jupiter"
  | "Saturn"
  | "Uranus"
  | "Neptune"
  | "Pluto"
  | "North Node"
  | "South Node"
  | "Mean Node"
  | "Mean South Node"
  | "Black Moon Lilith";

const PLANETS = ["Sun", "Moon", "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const POINTS = ["North Node", "South Node", "Mean Node", "Mean South Node", "Black Moon Lilith"] as const;
type Point = (typeof POINTS)[number];
export const CALC_BODIES = [...PLANETS, ...POINTS] as readonly CalcBody[];
/** positions() gives these; events() searches them. */
const CHART_BODIES = CALC_BODIES.filter((body) => body !== "Earth" && !/^Mean|Lilith/.test(body));

/**
 * An instant: an ISO 8601 string or a Date, read as UT; or a Julian date with
 * its time scale, "UT" (UTC read as UT1, as everywhere in the engine) or "TT".
 * `deltaT` fixes ΔT = TT − UT1, seconds, in place of the engine's model.
 */
export type CalcTime =
  | string
  | Date
  | { readonly iso: string; readonly deltaT?: number }
  | { readonly jd: number; readonly scale: "UT" | "TT"; readonly deltaT?: number };

/** Geodetic latitude and east longitude, degrees; `height` in metres, 0 by default (topocentric only). */
export interface CalcPlace {
  readonly latitude: number;
  readonly longitude: number;
  readonly height?: number;
}

export type CalcCenter = "geocentric" | "heliocentric" | "barycentric" | { readonly topocentric: CalcPlace };

/** Ayanamsa names for the sidereal zodiac, which is refused in this version. */
export type CalcAyanamsa =
  | "lahiri"
  | "fagan-bradley"
  | "krishnamurti"
  | "raman"
  | "yukteswar"
  | "true-chitra"
  | "true-revati"
  | "true-pushya"
  | "galactic-center";

export const CALC_AYANAMSAS = [
  "lahiri",
  "fagan-bradley",
  "krishnamurti",
  "raman",
  "yukteswar",
  "true-chitra",
  "true-revati",
  "true-pushya",
  "galactic-center"
] as readonly CalcAyanamsa[];

export type CalcZodiac = "tropical" | { readonly sidereal: CalcAyanamsa };

export interface CalcFlags {
  /** Default "apparent". */
  readonly correction?: CalcCorrection;
  /** Rates of every coordinate, per day. Default true. */
  readonly speeds?: boolean;
  /** Also x, y, z (au) and their rates. Default false. */
  readonly cartesian?: boolean;
  /** Default "degrees". */
  readonly units?: "degrees" | "radians";
  /** Gravitational light deflection; true is refused in this version. */
  readonly deflection?: boolean;
}

export interface CalcRequest {
  readonly body: CalcBody;
  readonly time: CalcTime;
  /** Default "ecliptic-true-of-date". */
  readonly frame?: CalcFrame;
  /** Default "geocentric". */
  readonly center?: CalcCenter;
  /** Default "tropical". */
  readonly zodiac?: CalcZodiac;
  readonly flags?: CalcFlags;
}

/** An instant as the engine used it. */
export interface CalcInstant {
  /** UT, ISO 8601, to the millisecond. */
  readonly utc: string;
  readonly jdUt: number;
  readonly jdTt: number;
  readonly deltaT: DeltaT;
}

export const CALC_RECEIPT_SCHEMA = "zodiacs.calc-receipt.draft-v1";

export interface CalcReceipt<Request> {
  readonly schema: typeof CALC_RECEIPT_SCHEMA;
  /** The request as read, every default filled in, as JSON; passing it back repeats the calculation. */
  readonly request: Request;
  readonly instants: readonly CalcInstant[];
  /** Convention ids, such as "frame:ecliptic-j2000"; docs/calc.md defines each. */
  readonly conventions: readonly string[];
  readonly engine: {
    readonly name: "@zodiacs/engine";
    readonly version: string;
    readonly ephemeris: { readonly name: "astronomy-engine"; readonly version: string };
  };
}

/** A bound on a result, labelled by how it was found; none is proven. */
export interface CalcBound {
  /** null where nothing has been measured. */
  readonly value: number | null;
  readonly unit: "arcsec" | "arcsec/day" | "relative" | "s";
  readonly label: "measured" | "estimated";
  readonly basis: string;
}

export interface CalcBounds {
  /** Angle between the reported and the arbiter's direction. */
  readonly position: CalcBound;
  /** Relative distance difference; null for the nodes and Lilith. */
  readonly distance: CalcBound | null;
  /** Angular-rate difference, and how rates were found; null without speeds. */
  readonly speed:
    | (CalcBound & { readonly method: "analytic" | "central-difference"; readonly stepDays: number | null })
    | null;
}

export interface CalcPosition {
  readonly status: "ok";
  readonly body: CalcBody;
  readonly frame: CalcFrame;
  /** Ecliptic longitude, or right ascension in an equatorial frame, in [0, 360) degrees (or radians). */
  readonly lon: number;
  /** Ecliptic latitude, or declination. */
  readonly lat: number;
  /** au, the light path for apparent and astrometric positions; null for the nodes and Lilith. */
  readonly dist: number | null;
  /** Per day, in the units of lon and lat, and au. */
  readonly speeds: { readonly lon: number; readonly lat: number; readonly dist: number | null } | null;
  /** au and au per day, when `flags.cartesian`. */
  readonly cartesian: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly vx: number | null;
    readonly vy: number | null;
    readonly vz: number | null;
  } | null;
  readonly bounds: CalcBounds;
  readonly receipt: CalcReceipt<CalcRequest>;
}

/** Why a request was not computed; the crossing search uses the same `status` and `reason` words. */
export type CalcRefusal = {
  readonly status: "refused";
  readonly detail: string;
} & (
  | { readonly reason: "unsupported-combination" | "not-in-this-version" }
  | { readonly reason: "out-of-range"; readonly span: CalcSpan }
  | { readonly reason: "sample-budget"; readonly samples: number; readonly maxSamples: number }
);

/** From an ISO instant up to, not including, another. */
export interface CalcSpan {
  readonly from: string;
  readonly to: string;
}

/** calc() and the other functions compute instants in this span; positions() and natalChart() compute outside it, with a flag. */
export const CALC_SPAN: CalcSpan = REFERENCE_SPAN;

// ---------------------------------------------------------------- shared

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const DAY_MS = 86_400_000;
const J2000_JD = 2_451_545;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const SPAN_JD = [CALC_SPAN.from, CALC_SPAN.to].map((iso) => J2000_JD + (Date.parse(iso) - J2000_MS) / DAY_MS);
/** The engine's steps: 0.001 day, and 0.25 day for the true node (ephemeris.ts). */
const STEP_DAYS = 0.001;
const NODE_STEP_DAYS = 0.25;

function fields(value: unknown, label: string, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || value instanceof Date) {
    throw new RangeError(`${label} must be an object.`);
  }
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new RangeError(`${label} takes only ${keys.join(", ")}.`);
  }
  return value as Record<string, unknown>;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], label: string, fallback?: T): T {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !(options as readonly string[]).includes(value)) {
    throw new RangeError(`${label} must be one of ${options.join(", ")}.`);
  }
  return value as T;
}

function within(value: unknown, label: string, low: number, high: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) {
    throw new RangeError(`${label} must be a number from ${low} to ${high}.`);
  }
  return value;
}

function yesNo(value: unknown, label: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new RangeError(`${label} must be true or false.`);
  return value;
}

interface TimeInput {
  /** The time as receipts record it. */
  readonly record: Exclude<CalcTime, string | Date>;
  /** An ISO string or a Date, as the rest of the engine reads it. */
  readonly date: Date | null;
  readonly jd: number;
  readonly tt: boolean;
  readonly pin: number | undefined;
}

function readTime(value: unknown, label: string): TimeInput {
  const iso = (text: string | Date) => {
    try {
      return dateFrom(text, label);
    } catch {
      throw new RangeError(`${label} must be a valid Date, or an ISO 8601 date or date-time with a UTC offset.`);
    }
  };
  if (typeof value === "string" || value instanceof Date) {
    const date = iso(value);
    return { record: { iso: typeof value === "string" ? value : date.toISOString() }, date, jd: NaN, tt: false, pin: undefined };
  }
  if (typeof value === "number") throw new RangeError(`${label} must be an ISO string, a Date or { jd, scale }.`);
  const time = fields(value, label, ["iso", "jd", "scale", "deltaT"]);
  const pin = time.deltaT === undefined ? undefined : within(time.deltaT, `${label}.deltaT`, -1e10, 1e10);
  const pinned = pin === undefined ? {} : { deltaT: pin };
  if ((time.iso === undefined) === (time.jd === undefined)) throw new RangeError(`${label} takes iso, or jd and scale.`);
  if (time.iso !== undefined) {
    if (typeof time.iso !== "string" || time.scale !== undefined) throw new RangeError(`${label}.iso must be an ISO string, without a scale.`);
    return { record: { iso: time.iso, ...pinned }, date: iso(time.iso), jd: NaN, tt: false, pin };
  }
  const jd = time.jd;
  if (typeof jd !== "number" || !Number.isFinite(jd)) throw new RangeError(`${label}.jd must be a finite Julian date.`);
  const scale = oneOf(time.scale, ["UT", "TT"] as const, `${label}.scale`);
  return { record: { jd, scale, ...pinned }, date: null, jd, tt: scale === "TT", pin };
}

function readPlace(value: unknown, label: string, withHeight = false): Required<CalcPlace> {
  const place = fields(value, label, withHeight ? ["latitude", "longitude", "height"] : ["latitude", "longitude"]);
  return {
    latitude: within(place.latitude, `${label}.latitude`, -90, 90),
    longitude: within(place.longitude, `${label}.longitude`, -180, 180),
    height: place.height === undefined ? 0 : within(place.height, `${label}.height`, -12_000, 100_000)
  };
}

function refuse(reason: "unsupported-combination" | "not-in-this-version", detail: string): CalcRefusal {
  return { status: "refused", reason, detail };
}

function sidereal(value: unknown): CalcRefusal | null {
  if (value === undefined || value === "tropical") return null;
  const name = oneOf(fields(value, "zodiac", ["sidereal"]).sidereal, CALC_AYANAMSAS, "zodiac.sidereal");
  return refuse("not-in-this-version", `The sidereal zodiac (${name}) is not in this version; it comes with the Vedic techniques.`);
}

/**
 * Run with astronomy-engine's one module-wide ΔT set to the engine's model, or
 * to a pin for this call only; null from `run` means the instant is out of range.
 */
function onClock<T>(pin: number | undefined, run: () => T | null): T | CalcRefusal {
  SetDeltaTFunction(pin === undefined ? deltaT : () => pin);
  try {
    return (
      run() ?? {
        status: "refused",
        reason: "out-of-range",
        detail: `The instant is outside ${CALC_SPAN.from} to ${CALC_SPAN.to}, where the engine's positions have been compared with an independent ephemeris.`,
        span: CALC_SPAN
      }
    );
  } finally {
    if (pin !== undefined) SetDeltaTFunction(deltaT);
  }
}

/** The instant on the installed clock, or null outside the span. */
function resolve(time: TimeInput): AstroTime | null {
  if (time.date === null) {
    // Checked before converting, so that no conversion runs far outside the span.
    const ut = time.jd - (time.tt ? (time.pin ?? 0) / 86_400 : 0);
    if (!(ut > SPAN_JD[0]! - 2 && ut < SPAN_JD[1]! + 2)) return null;
  }
  const at =
    time.date !== null
      ? MakeTime(time.date)
      : time.tt
        ? AstroTime.FromTerrestrialTime(time.jd - J2000_JD)
        : new AstroTime(time.jd - J2000_JD);
  return outsideReferenceSpan(at.date) ? null : at;
}

function instant(at: AstroTime, pin: number | undefined): CalcInstant {
  return {
    utc: at.date.toISOString(),
    jdUt: J2000_JD + at.ut,
    jdTt: J2000_JD + at.tt,
    deltaT:
      pin === undefined
        ? deltaTAt(at.ut)
        : { seconds: pin, sigma: null, model: "pinned", table: null, tableDigest: null, segment: "pinned" }
  };
}

function receipt<Request>(request: Request, instants: CalcInstant[], ids: string[], pin?: number): CalcReceipt<Request> {
  return {
    schema: CALC_RECEIPT_SCHEMA,
    request,
    instants,
    conventions: [
      ...ids,
      `ephemeris:astronomy-engine@${EPHEMERIS.version}`,
      pin === undefined ? "deltat:zodiacs-deltat/1" : "deltat:pinned",
      "time:ut1-read-as-utc"
    ],
    engine: { name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: { ...EPHEMERIS } }
  };
}

// ---------------------------------------------------------------- calc()

interface Row {
  readonly lon: number;
  readonly lat: number;
  readonly dist: number | null;
  readonly xyz: Vec3 | null;
  /** The longitude the engine differences for a speed. */
  readonly raw: number;
}

const isPoint = (body: CalcBody): body is Point => (POINTS as readonly string[]).includes(body);
const isTrueNode = (body: CalcBody): boolean => body === "North Node" || body === "South Node";

/** The Moon's true node: the ascending node of its instantaneous orbit, as ephemeris.ts computes it. */
function trueNode(at: AstroTime): number {
  const s = GeoMoonState(at);
  const [x, y] = apply(frameMatrix("ecliptic-true-of-date", at), [
    s.y * s.vz - s.z * s.vy,
    s.z * s.vx - s.x * s.vz,
    s.x * s.vy - s.y * s.vx
  ]);
  return normalizeLongitude(Math.atan2(x, -y) * RAD);
}

/** A point in the true ecliptic of date, rounded as positions() and chartPoints() round it. */
function pointAt(body: Point, at: AstroTime): Row {
  const row = (raw: number, lon: number, lat = 0): Row => ({ lon, lat, dist: null, xyz: null, raw });
  if (isTrueNode(body)) {
    const raw = trueNode(at);
    return row(raw, body === "North Node" ? raw : normalizeLongitude(raw + 180));
  }
  const centuries = at.tt / 36525;
  const nutation = e_tilt(at).dpsi / 3600;
  if (body === "Black Moon Lilith") {
    const apogee = meanApogee(centuries, nutation);
    return row(apogee.lon, normalizeLongitude(apogee.lon), apogee.lat);
  }
  const raw = meanNodeLongitude(centuries, nutation);
  return row(raw, normalizeLongitude(body === "Mean Node" ? raw : raw + 180));
}

function evaluator(body: CalcBody, frame: CalcFrame, center: Center, correction: CalcCorrection): (at: AstroTime) => Row {
  if (isPoint(body)) {
    return (at) => {
      const point = pointAt(body, at);
      if (frame === "ecliptic-true-of-date") return point;
      const eqj = apply(transpose(frameMatrix("ecliptic-true-of-date", at)), fromSpherical(point.lon, point.lat, 1));
      const { lon, lat } = toSpherical(apply(frameMatrix(frame, at), eqj));
      return { lon, lat, dist: null, xyz: null, raw: lon };
    };
  }
  const target = body as Body;
  const series =
    body === "Moon" && center.kind === "geocentric" && correction !== "astrometric" && frame === "ecliptic-true-of-date";
  return (at) => {
    if (series) {
      // The engine's own Moon: astronomy-engine's series in the true ecliptic of date.
      const moon = EclipticGeoMoon(at);
      const lon = normalizeLongitude(moon.lon);
      return { lon, lat: moon.lat, dist: moon.dist, xyz: fromSpherical(lon, moon.lat, moon.dist), raw: lon };
    }
    const { v, dist } = locate(target, center, correction, at);
    const turned = apply(frameMatrix(frame, at), v);
    const { lon, lat } = toSpherical(turned);
    const k = dist / length(turned);
    return { lon, lat, dist, xyz: [turned[0] * k, turned[1] * k, turned[2] * k], raw: lon };
  };
}

function bound(value: number | null | undefined, unit: CalcBound["unit"], estimated: string | null): CalcBound {
  return value === undefined || value === null
    ? { value: null, unit, label: "estimated", basis: "not compared with an independent ephemeris" }
    : { value, unit, label: estimated === null ? "measured" : "estimated", basis: estimated ?? MEASURED_BASIS };
}

/**
 * The position of `body` at `time` in `frame` from `center`, with the
 * correction and outputs `flags` asks for, or a typed refusal. With every
 * default it is the position positions() and natalChart() give, to the bit.
 */
export function calc(request: CalcRequest): CalcPosition | CalcRefusal {
  const asked = fields(request, "calc request", ["body", "time", "frame", "center", "zodiac", "flags"]);
  const body = oneOf(asked.body, CALC_BODIES, "body");
  const time = readTime(asked.time, "time");
  const frame = oneOf(asked.frame, CALC_FRAMES, "frame", "ecliptic-true-of-date");
  let center: Center;
  let centerRecord: CalcCenter;
  if (asked.center === undefined || typeof asked.center === "string") {
    const kind = oneOf(asked.center, ["geocentric", "heliocentric", "barycentric"] as const, "center", "geocentric");
    center = { kind };
    centerRecord = kind;
  } else {
    const site = readPlace(fields(asked.center, "center", ["topocentric"]).topocentric, "center.topocentric", true);
    center = { kind: "topocentric", observer: new Observer(site.latitude, site.longitude, site.height) };
    centerRecord = { topocentric: site };
  }
  const given = asked.flags === undefined ? {} : fields(asked.flags, "flags", ["correction", "speeds", "cartesian", "units", "deflection"]);
  const flags = {
    correction: oneOf(given.correction, ["apparent", "astrometric", "geometric"] as const, "flags.correction", "apparent"),
    speeds: yesNo(given.speeds, "flags.speeds", true),
    cartesian: yesNo(given.cartesian, "flags.cartesian", false),
    units: oneOf(given.units, ["degrees", "radians"] as const, "flags.units", "degrees"),
    deflection: yesNo(given.deflection, "flags.deflection", false)
  };
  const point = isPoint(body);
  const kind = center.kind;
  const refusal =
    sidereal(asked.zodiac) ??
    (flags.deflection
      ? refuse("not-in-this-version", "Gravitational light deflection is not modelled in this version.")
      : point && kind !== "geocentric"
        ? refuse("unsupported-combination", `${body} is a point of the Moon's geocentric orbit; only the geocentric center is offered.`)
        : point && flags.cartesian
          ? refuse("unsupported-combination", `${body} has no distance, so no cartesian position.`)
          : body === "Sun" && kind === "heliocentric"
            ? refuse("unsupported-combination", "The Sun is the heliocentric origin.")
            : body === "Earth" && (kind === "geocentric" || kind === "topocentric")
              ? refuse("unsupported-combination", "The Earth is offered heliocentric or barycentric only.")
              : null);
  if (refusal) return refusal;
  const correction = flags.correction;
  return onClock(time.pin, (): CalcPosition | null => {
    const at = resolve(time);
    if (at === null) return null;
    const evaluate = evaluator(body, frame, center, correction);
    const now = evaluate(at);
    const step = isTrueNode(body) ? NODE_STEP_DAYS : STEP_DAYS;
    const analytic = flags.speeds && correction === "geometric" && inertial(frame) && !point && body !== "Moon";
    let speeds: { lon: number; lat: number; dist: number | null } | null = null;
    let velocity: Vec3 | null = null;
    if (analytic) {
      const state = geometricState(body as Body, center, at)!;
      const turn = frameMatrix(frame, at);
      velocity = apply(turn, state.v);
      speeds = sphericalRates(apply(turn, state.r), velocity);
    } else if (flags.speeds) {
      // Built as positions() builds them, so that its speeds are reproduced to the bit.
      const shift = (days: number) =>
        evaluate(time.date !== null ? MakeTime(new Date(time.date.getTime() + days * DAY_MS)) : at.AddDays(days));
      const before = shift(-step);
      const after = shift(step);
      const rate = (a: number, b: number) => (a - b) / (2 * step);
      let turn = after.raw - before.raw;
      if (turn > 180) turn -= 360;
      if (turn < -180) turn += 360;
      speeds = {
        lon: turn / (2 * step),
        lat: rate(after.lat, before.lat),
        dist: now.dist === null ? null : rate(after.dist!, before.dist!)
      };
      const [a, b] = [after.xyz, before.xyz];
      if (a && b) velocity = [rate(a[0], b[0]), rate(a[1], b[1]), rate(a[2], b[2])];
    }
    const method = !flags.speeds ? null : analytic ? "analytic" : "central-difference";
    const k = flags.units === "radians" ? DEG : 1;

    // Bounds: measured for this center, correction and body where compared; a
    // topocentric body not compared takes its geocentric bound, as an estimate.
    let row = MEASURED[`${kind}/${point ? "apparent" : correction}/${body}`];
    let estimated: string | null = null;
    if (!row && kind === "topocentric") {
      row = MEASURED[`geocentric/${correction}/${body}`];
      estimated = "the geocentric bound; the topocentric reduction was compared for the Sun, the Moon and Mars";
    }

    const ids = ["zodiac:tropical", `frame:${frame}`, `center:${kind}`];
    if (point) {
      ids.push("correction:not-applicable", body.endsWith("Lilith") ? "lilith:mean" : body.startsWith("Mean") ? "node:mean" : "node:true-osculating");
    } else {
      ids.push(`correction:${correction}`);
      if (body === "Moon" && kind === "geocentric" && correction !== "astrometric") ids.push("moon:series-at-instant");
      else if (correction !== "geometric") {
        ids.push("light-time:newtonian", "deflection:none");
        if (correction === "apparent" && kind !== "barycentric") ids.push("aberration:backdated-observer");
      }
    }
    if (!inertial(frame)) ids.push("precession:iau2006");
    if (frame.includes("true")) ids.push("nutation:iau2000b");
    if (frame.startsWith("ecliptic")) ids.push("obliquity:iau2006");
    if (frame.endsWith("icrs")) ids.push("frame-bias:iau2000");
    if (kind === "barycentric") ids.push("barycentre:sun-and-giant-planets");
    if (kind === "topocentric") ids.push("observer:iers2003-ellipsoid;no-polar-motion");
    if (method) ids.push(method === "analytic" ? "speed:analytic" : `speed:central-difference-${step}d`);

    return {
      status: "ok",
      body,
      frame,
      lon: now.lon * k,
      lat: now.lat * k,
      dist: now.dist,
      speeds: speeds && { lon: speeds.lon * k, lat: speeds.lat * k, dist: speeds.dist },
      cartesian:
        flags.cartesian && now.xyz
          ? { x: now.xyz[0], y: now.xyz[1], z: now.xyz[2], vx: velocity?.[0] ?? null, vy: velocity?.[1] ?? null, vz: velocity?.[2] ?? null }
          : null,
      bounds: {
        position: bound(row?.[0], "arcsec", estimated),
        distance: point ? null : bound(row?.[1], "relative", estimated),
        speed: method && { ...bound(row?.[2], "arcsec/day", estimated), method, stepDays: analytic ? null : step }
      },
      receipt: receipt(
        { body, time: time.record, frame, center: centerRecord, zodiac: "tropical", flags },
        [instant(at, time.pin)],
        ids,
        time.pin
      )
    };
  });
}

// ---------------------------------------------------------------- houses()

export interface HousesRequest {
  readonly time: CalcTime;
  readonly place: CalcPlace;
  /** Default "whole", as in natalChart(). */
  readonly system?: HouseSystem;
  readonly zodiac?: CalcZodiac;
}

export interface HousesResult {
  readonly status: "ok";
  readonly requested: HouseSystem;
  /** The requested system, or whole sign where Placidus or Koch is undefined (flag "polar-fallback"). */
  readonly system: HouseSystem;
  /** Twelve cusps from the first house, degrees in the true ecliptic of date. */
  readonly cusps: readonly number[];
  readonly angles: Angles;
  readonly vertex: number;
  readonly eastPoint: number;
  /** Right ascension of the midheaven, degrees. */
  readonly armc: number;
  /** The true obliquity used, degrees. */
  readonly obliquity: number;
  readonly flags: readonly ChartFlag[];
  readonly bounds: { readonly angles: CalcBound; readonly cusps: CalcBound };
  readonly receipt: CalcReceipt<HousesRequest>;
}

/** The angles, the Vertex, the East Point and the cusps for an instant and a place, as natalChart() computes them. */
export function houses(request: HousesRequest): HousesResult | CalcRefusal {
  const asked = fields(request, "houses request", ["time", "place", "system", "zodiac"]);
  const time = readTime(asked.time, "time");
  const { latitude, longitude } = readPlace(asked.place, "place");
  const system = validateBirthSettings({ houseSystem: asked.system as HouseSystem }).houseSystem ?? "whole";
  const refusal = sidereal(asked.zodiac);
  if (refusal) return refusal;
  return onClock(time.pin, (): HousesResult | null => {
    const at = resolve(time);
    if (at === null) return null;
    const input = { gastHours: SiderealTime(at), latitude, longitude, obliquity: e_tilt(at).tobl };
    const angles = computeAngles(input);
    const { houses: computed, fellBack } = computeHouses(system, input, angles);
    // Conformance suite 0.1.0, level L2, for this engine: conformance/RESULTS.md.
    const basis = (what: string) =>
      `largest difference over the conformance suite's L2 ${what}, whose arbiter is ERFA with each system's definition`;
    return {
      status: "ok",
      requested: system,
      system: computed.system,
      cusps: computed.cusps,
      angles,
      // Normalized once more, as chartPoints() reports them.
      vertex: normalizeLongitude(vertexOf(input, angles)),
      eastPoint: normalizeLongitude(eastPointOf(input)),
      armc: ramcOf(input),
      obliquity: input.obliquity,
      flags: fellBack ? ["polar-fallback"] : [],
      bounds: {
        angles: { value: 0.29, unit: "arcsec", label: "measured", basis: basis("vectors of the ascendant, midheaven, Vertex and East Point") },
        cusps: { value: 0.49, unit: "arcsec", label: "measured", basis: basis("cusp vectors, thirteen systems") }
      },
      receipt: receipt(
        { time: time.record, place: { latitude, longitude }, system, zodiac: "tropical" },
        [instant(at, time.pin)],
        [
          "zodiac:tropical",
          `house:${system}`,
          ...(fellBack ? ["polar-fallback:whole"] : []),
          "angles:gast-and-true-obliquity",
          "sidereal-time:gast-iau2006-era",
          "nutation:iau2000b",
          "obliquity:iau2006"
        ],
        time.pin
      )
    };
  });
}

// ---------------------------------------------------------------- events()

export interface EventsRequest {
  /** The one kind in this version: the instants a body sits on a longitude. */
  readonly kind: "longitude-crossing";
  readonly body: CalcBody;
  /** Apparent geocentric ecliptic longitude of date, degrees. */
  readonly longitude: number;
  /** The search covers (from, to]. */
  readonly from: CalcTime;
  readonly to: CalcTime;
  readonly zodiac?: CalcZodiac;
  /** Days between coarse samples, default 5. */
  readonly stepDays?: number;
  /** Most longitude evaluations allowed, refusing beyond; no limit by default. */
  readonly maxSamples?: number;
}

export interface CalcEvent {
  /** UT, ISO 8601, to the millisecond. */
  readonly at: string;
  readonly jdUt: number;
  readonly jdTt: number;
  /** True when the body moved backward through the longitude. */
  readonly retrograde: boolean;
}

export interface EventsResult {
  readonly status: "ok";
  readonly kind: "longitude-crossing";
  readonly events: readonly CalcEvent[];
  /** Longitude evaluations made. */
  readonly samples: number;
  readonly bounds: { readonly timing: CalcBound };
  readonly receipt: CalcReceipt<EventsRequest>;
}

/**
 * Every instant in (from, to] when `body` sits on `longitude`: the engine's
 * crossing search (searchLongitudeCrossings) on its apparent geocentric
 * longitudes, under an optional budget of evaluations.
 */
export function events(request: EventsRequest): EventsResult | CalcRefusal {
  const asked = fields(request, "events request", ["kind", "body", "longitude", "from", "to", "zodiac", "stepDays", "maxSamples"]);
  const kind = oneOf(asked.kind, ["longitude-crossing"] as const, "kind");
  const body = oneOf(asked.body, CALC_BODIES, "body");
  const longitude = within(asked.longitude, "longitude", -Number.MAX_VALUE, Number.MAX_VALUE);
  const from = readTime(asked.from, "from");
  const to = readTime(asked.to, "to");
  const stepDays = asked.stepDays === undefined ? 5 : (asked.stepDays as number);
  const budget = asked.maxSamples === Infinity ? undefined : (asked.maxSamples as number | undefined);
  const limit = budget === undefined ? {} : { maxSamples: budget };
  const refusal =
    sidereal(asked.zodiac) ??
    (!CHART_BODIES.includes(body)
      ? refuse("unsupported-combination", `Crossings are searched for the bodies positions() gives; ${body} is not one.`)
      : from.pin !== undefined || to.pin !== undefined
        ? refuse("unsupported-combination", "Crossing searches run on the engine's ΔT model; a pinned ΔT is not offered.")
        : null);
  if (refusal) return refusal;
  return onClock(undefined, (): EventsResult | CalcRefusal | null => {
    const start = resolve(from);
    const end = resolve(to);
    if (start === null || end === null) return null;
    const dated = (time: TimeInput, at: AstroTime) => time.date ?? new Date(Math.round(J2000_MS + at.ut * DAY_MS));
    const found = searchLongitudeCrossingsWith(
      bodyLongitude,
      body as BodyName,
      longitude,
      dated(from, start),
      dated(to, end),
      { stepDays, ...limit }
    );
    if (found.status === "refused") {
      const { samples, maxSamples } = found;
      return { status: "refused", reason: "sample-budget", detail: `The search needs more than ${maxSamples} evaluations.`, samples, maxSamples };
    }
    return {
      status: "ok",
      kind,
      events: found.crossings.map(({ at, retrograde }) => {
        const ut = (at.getTime() - J2000_MS) / DAY_MS;
        return { at: at.toISOString(), jdUt: J2000_JD + ut, jdTt: J2000_JD + ut + deltaT(ut) / 86_400, retrograde };
      }),
      samples: found.samples,
      bounds: {
        timing: {
          value: (stepDays * 86_400) / 2 ** 24,
          unit: "s",
          label: "estimated",
          basis: "the bisection bracket, step / 2^24, on the engine's own longitudes; the ephemeris's error over the body's speed adds to it"
        }
      },
      receipt: receipt(
        { kind, body, longitude, from: from.record, to: to.record, zodiac: "tropical", stepDays, ...limit },
        [instant(start, undefined), instant(end, undefined)],
        ["zodiac:tropical", "frame:ecliptic-true-of-date", "center:geocentric", "correction:apparent", "moon:series-at-instant", "search:scan-and-bisect"]
      )
    };
  });
}

// ---------------------------------------------------------------- chart()

export interface ChartRequest {
  readonly time: CalcTime;
  /** Without a place there are no angles or houses. */
  readonly place?: CalcPlace;
  /** Default "whole". */
  readonly houseSystem?: HouseSystem;
  /** False: `time` is a reference instant, with no angles or houses. Default true. */
  readonly timeKnown?: boolean;
  /** Time-resolution assertions, as BirthInput.flags takes them. */
  readonly timeFlags?: readonly ChartFlag[];
  readonly zodiac?: CalcZodiac;
}

export interface ChartResult {
  readonly status: "ok";
  /** The chart natalChart() gives for the same instant (to the millisecond), place, settings and ΔT. */
  readonly chart: Chart;
  readonly receipt: CalcReceipt<ChartRequest>;
}

/** A natal chart from the calc vocabulary: natalChart()'s chart, with a receipt. */
export function chart(request: ChartRequest): ChartResult | CalcRefusal {
  const asked = fields(request, "chart request", ["time", "place", "houseSystem", "timeKnown", "timeFlags", "zodiac"]);
  const time = readTime(asked.time, "time");
  const site = asked.place === undefined ? null : readPlace(asked.place, "place");
  const place = site === null ? null : { latitude: site.latitude, longitude: site.longitude };
  const settings = validateBirthSettings({ houseSystem: asked.houseSystem as HouseSystem, timeKnown: asked.timeKnown as boolean });
  const supplied = asked.timeFlags === undefined ? undefined : snapshotFlags(asked.timeFlags).values;
  const refusal = sidereal(asked.zodiac);
  if (refusal) return refusal;
  return onClock(time.pin, (): ChartResult | null => {
    const at = resolve(time);
    if (at === null) return null;
    const utc = time.date ?? new Date(Math.round(J2000_MS + at.ut * DAY_MS));
    const houseSystem = settings.houseSystem ?? "whole";
    const timeKnown = settings.timeKnown ?? true;
    // natalChart()'s checks: a derived flag may be echoed only where the calculation can produce it.
    const possible: ChartFlag[] = !timeKnown
      ? ["no-time"]
      : settings.houseSystem && isPolarUndefinedHouseSystem(houseSystem) && place
        ? ["polar-fallback"]
        : [];
    assertDerivedFlags(supplied ?? [], possible);
    const input: ChartInput = {
      utc,
      houseSystem,
      timeKnown,
      ...place,
      ...(supplied && { flags: timeFlags(supplied) }),
      ...(time.pin === undefined ? {} : { deltaT: time.pin })
    };
    // computeChart sets its own clock and leaves the engine's model behind, so record the instant first.
    const used = instant(MakeTime(utc), time.pin);
    const computed = computeChart(input);
    assertDerivedFlags(supplied ?? [], computed.flags);
    return {
      status: "ok",
      chart: computed,
      receipt: receipt(
        {
          time: time.record,
          ...(place && { place }),
          houseSystem,
          timeKnown,
          ...(supplied && { timeFlags: supplied }),
          zodiac: "tropical"
        },
        [used],
        [
          "zodiac:tropical",
          "frame:ecliptic-true-of-date",
          "center:geocentric",
          "correction:apparent",
          "moon:series-at-instant",
          "node:true-osculating",
          `house:${houseSystem}`,
          "angles:gast-and-true-obliquity",
          "aspects:major",
          `speed:central-difference-${STEP_DAYS}d`
        ],
        time.pin
      )
    };
  });
}
