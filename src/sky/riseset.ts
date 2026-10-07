/*
 * Rise, set and upper and lower transit for an observer on the WGS84
 * ellipsoid, from the engine's own positions (astronomy-engine's vectors, on
 * the engine's time basis, precession and nutation), found with the engine's
 * crossing solver. docs/sky.md is the guide.
 */
import { Body, GeoVector } from "astronomy-engine";

import { searchLongitudeCrossingsWith } from "../crossings.js";
import { dateFrom } from "../date-input.js";
import { gastHours, onChartClock } from "../ephemeris.js";
import { equatorRows, turn } from "../equator.js";
import { firstMillisecond } from "../first-millisecond.js";
import { outsideReferenceSpan } from "../reference-span.js";
import type { BodyName, DateInput } from "../types.js";

/** A body the sky functions accept: the Sun, the Moon and the planets. */
export type SkyBody = Exclude<BodyName, "North Node" | "South Node">;

/**
 * A place: geodetic latitude and longitude in degrees (east positive) and
 * height in metres above the WGS84 ellipsoid, on which the sky functions place
 * the observer. `@zodiacs/engine/calc`'s CalcPlace has the same three fields on
 * the IERS 2003 ellipsoid, which its topocentric reduction uses, and accepts
 * heights from −12,000 m: the two ellipsoids' equatorial radii differ by
 * 0.4 m, and a height from −12,000 to −10,000 m is refused here.
 */
export interface Observer {
  latitude: number;
  longitude: number;
  /** Metres above the WGS84 ellipsoid, from −10,000 to 100,000; 0 when absent. */
  height?: number;
}

/** The point of the disc that meets the horizon. Planets are always taken at their centre. */
export type Limb = "upper" | "centre" | "lower";
/** `"standard"`: 34′ of refraction at the horizon. `"none"`: the geometric horizon. */
export type Refraction = "standard" | "none";

export interface SkyOptions {
  /** `"upper"` for the Sun and Moon unless given; the planets accept only `"centre"`. */
  readonly limb?: Limb | undefined;
  /** `"standard"` unless given. */
  readonly refraction?: Refraction | undefined;
  /** Most position evaluations the searches may make: a positive integer or `Infinity` (default). */
  readonly maxSamples?: number | undefined;
}

export interface SkyDayOptions extends SkyOptions {
  /** The clock that defines the day, minutes east of UTC. Default: the observer's local mean time, longitude × 4. */
  readonly utcOffsetMinutes?: number | undefined;
}

export type SkyEventKind = "rise" | "set" | "upper-transit" | "lower-transit";

export interface SkyEvent {
  readonly kind: SkyEventKind;
  readonly at: Date;
  /** Geometric (unrefracted) topocentric altitude of the body's centre, degrees. */
  readonly altitude: number;
  /** Topocentric azimuth of the centre, degrees from north through east, in [0, 360). */
  readonly azimuth: number;
}

/**
 * `"never-rises"` and `"never-sets"`: the window holds no rise and no set, and
 * the body stayed below (polar night, for the Sun) or above (polar day) the
 * horizon of the conventions throughout. `"outside-reference-span"`: the
 * window reaches outside `REFERENCE_SPAN`.
 */
export type SkyFlag = "never-rises" | "never-sets" | "outside-reference-span";

export interface SkyConventions {
  readonly limb: Limb;
  readonly refraction: Refraction;
  /** The refraction at the horizon, arcminutes: 34 or 0. */
  readonly refractionArcmin: number;
}

interface SkyWindow {
  readonly body: SkyBody;
  readonly observer: Readonly<Required<Observer>>;
  readonly from: Date;
  readonly to: Date;
  readonly conventions: SkyConventions;
  readonly flags: readonly SkyFlag[];
  /** Position evaluations the searches made. */
  readonly samples: number;
}

/** A search either completes, with every event in the window, or is refused whole. */
export type SkyEvents =
  | (SkyWindow & { readonly status: "complete"; readonly events: readonly SkyEvent[] })
  | (SkyWindow & { readonly status: "refused"; readonly reason: "sample-budget"; readonly events: readonly [] });

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
/** Coarse step of every search: one hour. */
const STEP_DAYS = 1 / 24;
/** Refraction at the horizon, arcminutes (USNO, Rise, Set, and Twilight Definitions). */
export const STANDARD_REFRACTION_ARCMIN = 34;
/** Radii for the semi-diameter, km: the Sun's (959.64″ at 1 au), the Moon's IAU mean radius. */
export const SKY_RADII_KM = /*#__PURE__*/ Object.freeze({ Sun: 696_000, Moon: 1_737.4 });
const KM_PER_AU = 149_597_870.7;
/** WGS84: equatorial radius (km) and flattening. */
const WGS84_A = 6_378.137;
const WGS84_F = 1 / 298.257223563;
const E2 = WGS84_F * (2 - WGS84_F);

const BODIES: Readonly<Record<SkyBody, Body>> = {
  Sun: Body.Sun,
  Moon: Body.Moon,
  Mercury: Body.Mercury,
  Venus: Body.Venus,
  Mars: Body.Mars,
  Jupiter: Body.Jupiter,
  Saturn: Body.Saturn,
  Uranus: Body.Uranus,
  Neptune: Body.Neptune,
  Pluto: Body.Pluto
};

/** Copy an options object's own data properties, refusing unknown keys. */
export function optionsOf(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (value === undefined) return out;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RangeError(`${label} must be an options object.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key)) {
      throw new RangeError(`${label} has an unknown key: ${String(key)}.`);
    }
    const slot = Object.getOwnPropertyDescriptor(value, key);
    if (!slot || !("value" in slot)) throw new RangeError(`${label} must contain only data properties.`);
    if (slot.value !== undefined) out[key] = slot.value as unknown;
  }
  return out;
}

function numberIn(value: unknown, low: number, high: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) {
    throw new RangeError(`${label} must be a finite number from ${low} to ${high}.`);
  }
  return value;
}

export function observerOf(value: unknown): Readonly<Required<Observer>> {
  const input = optionsOf(value, ["latitude", "longitude", "height"], "observer");
  return Object.freeze({
    latitude: numberIn(input.latitude, -90, 90, "observer.latitude"),
    longitude: numberIn(input.longitude, -180, 180, "observer.longitude"),
    height: input.height === undefined ? 0 : numberIn(input.height, -10_000, 100_000, "observer.height")
  });
}

export function bodyOf(value: unknown): SkyBody {
  if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(BODIES, value)) {
    throw new RangeError(`Unknown body: ${String(value)}. Use the Sun, the Moon or a planet.`);
  }
  return value as SkyBody;
}

export function budgetOf(value: unknown): number {
  if (value === undefined || value === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new RangeError("maxSamples must be a positive integer or Infinity.");
  }
  return value;
}

export function conventionsOf(body: SkyBody, input: Record<string, unknown>): SkyConventions {
  const disc = body === "Sun" || body === "Moon";
  const limb = input.limb ?? (disc ? "upper" : "centre");
  if (limb !== "upper" && limb !== "centre" && limb !== "lower") {
    throw new RangeError('limb must be "upper", "centre" or "lower".');
  }
  if (!disc && limb !== "centre") throw new RangeError(`${body} is taken at its centre; only limb "centre" applies.`);
  const refraction = input.refraction ?? "standard";
  if (refraction !== "standard" && refraction !== "none") throw new RangeError('refraction must be "standard" or "none".');
  return Object.freeze({ limb, refraction, refractionArcmin: refraction === "standard" ? STANDARD_REFRACTION_ARCMIN : 0 });
}

/** The topocentric place of a body at an instant, and how far its centre is above the event's horizon. */
interface State {
  /** Altitude of the centre minus the altitude at which the chosen limb meets the horizon, degrees. */
  readonly above: number;
  readonly altitude: number;
  readonly azimuth: number;
  /** Local hour angle, degrees in [0, 360). */
  readonly hourAngle: number;
}

function stateAt(body: SkyBody, site: Readonly<Required<Observer>>, conventions: SkyConventions, ms: number): State {
  return onChartClock(ms, "utc", undefined, (time) => {
    // Geocentric apparent place (light time and aberration, as astronomy-engine
    // gives them) on the true equator and equinox of date, in au, by the
    // engine's precession and nutation (src/equator.ts).
    const g = GeoVector(BODIES[body], time, true);
    const [vx, vy, vz] = turn(equatorRows(time.tt, "true"), g.x, g.y, g.z);
    // The local apparent sidereal angle, from the engine's Greenwich apparent
    // sidereal time (src/ephemeris.ts), and the observer on the ellipsoid.
    const theta = (gastHours(time) * 15 + site.longitude) * RAD;
    const phi = site.latitude * RAD;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const n = WGS84_A / Math.sqrt(1 - E2 * sinPhi * sinPhi);
    const h = site.height / 1000;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const x = vx - ((n + h) * cosPhi * cosT) / KM_PER_AU;
    const y = vy - ((n + h) * cosPhi * sinT) / KM_PER_AU;
    const z = vz - ((n * (1 - E2) + h) * sinPhi) / KM_PER_AU;
    // East, north and up at the observer (up along the ellipsoid normal).
    const east = -x * sinT + y * cosT;
    const radial = x * cosT + y * sinT;
    const north = -radial * sinPhi + z * cosPhi;
    const up = radial * cosPhi + z * sinPhi;
    const altitude = Math.atan2(up, Math.hypot(east, north)) / RAD;
    const azimuth = ((Math.atan2(east, north) / RAD) % 360 + 360) % 360;
    const hourAngle = (((theta - Math.atan2(y, x)) / RAD) % 360 + 360) % 360;
    const radius = body === "Sun" || body === "Moon" ? SKY_RADII_KM[body] : 0;
    const semiDiameter = Math.asin(radius / (Math.hypot(x, y, z) * KM_PER_AU)) / RAD;
    const limb = conventions.limb === "upper" ? 1 : conventions.limb === "lower" ? -1 : 0;
    const horizon = -conventions.refractionArcmin / 60 - limb * semiDiameter;
    return { above: altitude - horizon, altitude, azimuth, hourAngle };
  });
}

interface Search {
  status: "complete" | "refused";
  samples: number;
  events: SkyEvent[];
  /** The body's state at the start of the window; absent when refused. */
  first: State | undefined;
}

/** Thrown inside a search when its budget runs out; never escapes it. */
class BudgetSpent {}

const HOUR_MS = 3_600_000;
/** Signed angle from `target` to `value`, degrees in [−180, 180). */
const offsetFrom = (target: number, value: number): number => ((((value - target + 540) % 360) + 360) % 360) - 180;

/**
 * Every event of the kinds asked for in [fromMs, toMs), by three crossing
 * searches sharing one budget and one cache of positions: the altitude against
 * the event horizon, and the hour angle against 0° and 180°. The solver scans
 * an hour beyond each end of the window; each crossing it finds is then taken
 * to the first whole millisecond at which it has happened (src/first-millisecond.ts).
 */
export function searchEvents(
  body: SkyBody,
  site: Readonly<Required<Observer>>,
  conventions: SkyConventions,
  fromMs: number,
  toMs: number,
  maxSamples: number,
  transits: boolean
): Search {
  const cache = new Map<number, State>();
  const state = (ms: number): State => {
    let known = cache.get(ms);
    if (!known) {
      known = stateAt(body, site, conventions, ms);
      cache.set(ms, known);
    }
    return known;
  };
  let budget = maxSamples;
  let samples = 0;
  const events: SkyEvent[] = [];
  const from = new Date(fromMs - HOUR_MS);
  const to = new Date(toMs + HOUR_MS);
  const add = (kind: SkyEventKind, value: (found: State) => number, estimate: number, rising: boolean) => {
    const at = firstMillisecond((ms) => {
      if (budget < 1) throw new BudgetSpent();
      budget -= 1;
      samples += 1;
      const v = value(state(ms));
      return rising ? v >= 0 : v <= 0;
    }, estimate);
    if (at < fromMs || at >= toMs) return;
    const found = state(at);
    events.push(Object.freeze({ kind, at: new Date(at), altitude: found.altitude, azimuth: found.azimuth }));
  };
  const run = (value: (found: State) => number, target: number) => {
    if (budget < 1) throw new BudgetSpent();
    const result = searchLongitudeCrossingsWith((_, date) => value(state(date.getTime())), body, target, from, to, {
      stepDays: STEP_DAYS,
      maxSamples: budget
    });
    samples += result.samples;
    budget -= result.samples;
    if (result.status !== "complete") throw new BudgetSpent();
    return result.crossings;
  };
  try {
    const above = (found: State) => found.above;
    for (const crossing of run(above, 0)) {
      add(crossing.retrograde ? "set" : "rise", above, crossing.at.getTime(), !crossing.retrograde);
    }
    if (transits) {
      for (const [target, kind] of [[0, "upper-transit"], [180, "lower-transit"]] as const) {
        const hour = (found: State) => offsetFrom(target, found.hourAngle);
        for (const crossing of run((found) => found.hourAngle, target)) add(kind, hour, crossing.at.getTime(), true);
      }
    }
  } catch (error) {
    if (error instanceof BudgetSpent) return { status: "refused", samples, events: [], first: undefined };
    throw error;
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  return { status: "complete", samples, events, first: state(fromMs) };
}

function windowFlags(events: readonly SkyEvent[], first: State, fromMs: number, toMs: number): SkyFlag[] {
  const flags: SkyFlag[] = [];
  if (!events.some((event) => event.kind === "rise" || event.kind === "set")) {
    flags.push(first.above > 0 ? "never-sets" : "never-rises");
  }
  if (outsideReferenceSpan(new Date(fromMs)) || outsideReferenceSpan(new Date(toMs - 1))) {
    flags.push("outside-reference-span");
  }
  return flags;
}

export function eventsIn(
  body: SkyBody,
  site: Readonly<Required<Observer>>,
  input: Record<string, unknown>,
  fromMs: number,
  toMs: number
): SkyEvents {
  const conventions = conventionsOf(body, input);
  const maxSamples = budgetOf(input.maxSamples);
  if (!(toMs > fromMs)) throw new RangeError("The window must end after it starts.");
  const search = searchEvents(body, site, conventions, fromMs, toMs, maxSamples, true);
  const base = {
    body,
    observer: site,
    from: new Date(fromMs),
    to: new Date(toMs),
    conventions,
    samples: search.samples
  };
  if (search.status === "refused") {
    const flags = outsideReferenceSpan(new Date(fromMs)) || outsideReferenceSpan(new Date(toMs - 1)) ? ["outside-reference-span" as const] : [];
    return Object.freeze({ ...base, flags: Object.freeze(flags), status: "refused", reason: "sample-budget", events: Object.freeze([]) as readonly [] });
  }
  return Object.freeze({
    ...base,
    flags: Object.freeze(windowFlags(search.events, search.first!, fromMs, toMs)),
    status: "complete",
    events: Object.freeze(search.events)
  });
}

/**
 * Every rise, set, upper transit and lower transit of `body` in [from, to),
 * for `observer`, in time order.
 *
 * A rise or set is the instant the geometric topocentric altitude of the
 * body's centre equals −(refraction) − (semi-diameter) for the upper limb
 * (+ for the lower, 0 for the centre). A transit is the instant the
 * topocentric hour angle is 0° (upper) or 180° (lower). Throws RangeError for
 * an unknown body, observer field or option, an invalid window, or an instant
 * outside `EPHEMERIS_SPAN`.
 */
export function skyEvents(body: SkyBody, observer: Observer, from: DateInput, to: DateInput, options?: SkyOptions): SkyEvents {
  const name = bodyOf(body);
  const site = observerOf(observer);
  const input = optionsOf(options, ["limb", "refraction", "maxSamples"], "options");
  return eventsIn(name, site, input, dateFrom(from, "from").getTime(), dateFrom(to, "to").getTime());
}

/** Parse a calendar date, YYYY-MM-DD in the proleptic Gregorian calendar, to its UTC midnight. */
export function calendarDateMs(value: unknown): number {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value) : null;
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
    const date = new Date(0);
    date.setUTCFullYear(year, month, day);
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) return date.getTime();
  }
  throw new RangeError("date must be a calendar date, YYYY-MM-DD.");
}

export function offsetOf(value: unknown, site: Readonly<Required<Observer>>): number {
  return value === undefined ? site.longitude * 4 : numberIn(value, -1080, 1080, "utcOffsetMinutes");
}

/**
 * The events of one calendar day on a clock `utcOffsetMinutes` east of UTC
 * (by default the observer's local mean time): `skyEvents` over that day.
 */
export function skyEventsOn(body: SkyBody, observer: Observer, date: string, options?: SkyDayOptions): SkyEvents {
  const name = bodyOf(body);
  const site = observerOf(observer);
  const input = optionsOf(options, ["limb", "refraction", "maxSamples", "utcOffsetMinutes"], "options");
  const fromMs = calendarDateMs(date) - offsetOf(input.utcOffsetMinutes, site) * 60_000;
  return eventsIn(name, site, input, fromMs, fromMs + DAY_MS);
}
