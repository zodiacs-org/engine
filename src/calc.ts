/**
 * `@zodiacs/engine/calc`: one calculation API over the engine's positions,
 * houses, longitude crossings and charts, in the tropical or the sidereal
 * zodiac. The four functions share one vocabulary for instants, places,
 * frames, centers and the zodiac; each result carries a receipt that names its
 * conventions by id; positions carry bounds; and what this version does not
 * compute comes back as a typed refusal.
 * Malformed input throws RangeError, as everywhere in the engine. The
 * repository's docs/calc.md is the reference.
 */
import { AstroTime, Body, GeoMoonState } from "astronomy-engine";

// Imported first so that the build keeps the root entry's shared chunks byte for byte.
import { bodyLongitude, computeChart, gastHours, onChartClock } from "./ephemeris.js";
import { assertDerivedFlags, snapshotFlags, timeFlags, validateBirthSettings } from "./birth-input.js";
import { MEASURED, MEASURED_BASIS } from "./calc-bounds.js";
import {
  CALC_FRAMES as FRAMES,
  apply,
  frameMatrix,
  fromSpherical,
  inertial,
  sphericalRates,
  toSpherical,
  transpose
} from "./calc-frames.js";
import type { CalcCorrection, CalcFrame, Vec3 } from "./calc-frames.js";
import { BARYCENTRE_ERROR, geometricState, length, locate } from "./calc-reduce.js";
import type { Center } from "./calc-reduce.js";
import { searchLongitudeCrossingsWith } from "./crossings.js";
import type { BodyLongitudeAt } from "./crossings.js";
import { dateFrom } from "./date-input.js";
import type { DeltaT } from "./deltat.js";
import { eclipticFrame, eclipticOfDate, meanEcliptic } from "./frame.js";
import { computeAngles, computeHouses, eastPointOf, isPolarUndefinedHouseSystem, ramcOf, vertexOf } from "./houses.js";
import { tilt } from "./nutation.js";
import { meanApogee, meanNodeLongitude } from "./points.js";
import { EPHEMERIS_SPAN, REFERENCE_SPAN } from "./reference-span.js";
import { normalizeLongitude } from "./signs.js";
import { TIME_SCALE_NAMES, elapsedDays, timeBasis } from "./time-scale.js";
import type { TimeBasis, TimeScale, TimeScaleName } from "./time-scale.js";
import { ENGINE_VERSION, EPHEMERIS } from "./types.js";
import type { Angles, BodyName, Chart, ChartFlag, ChartInput, HouseSystem } from "./types.js";
import { addBounds, ayanamsaBound } from "./calc-ayanamsa.js";
import { AYANAMSAS, ayanamsaAt, isUserAyanamsaName, userAyanamsa } from "./vedic/ayanamsa.js";
import type { AyanamsaDefinition, AyanamsaName, AyanamsaPrecessionModel } from "./vedic/ayanamsa.js";
import { siderealChartOf, wholeSignCusps, wrap360 } from "./vedic/sidereal.js";

export type { Angles, CalcCorrection, CalcFrame, Chart, ChartFlag, DeltaT, HouseSystem, TimeScale };

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
export const CALC_BODIES = Object.freeze([...PLANETS, ...POINTS]) as readonly CalcBody[];
/** positions() gives these; events() searches them. */
const CHART_BODIES = CALC_BODIES.filter((body) => body !== "Earth" && !/^Mean|Lilith/.test(body));

/** The time scale of a Julian date: "utc", "ut1" or "tt", the root entry's TimeScaleName. */
export type CalcScale = TimeScaleName;

/** The frames calc() gives a position in. */
export const CALC_FRAMES: readonly CalcFrame[] = Object.freeze([...FRAMES]);

/**
 * An instant: an ISO 8601 string or a Date, read as UTC on the engine's time
 * basis, as positions() and natalChart() read one; or a Julian date on a
 * named time scale. `deltaT` fixes ΔT = TT − UT1, seconds, in place of the
 * time basis's: UT1 still comes from the instant (UTC plus IERS UT1 − UTC
 * from 1972), and TT = UT1 + ΔT.
 */
export type CalcTime =
  | string
  | Date
  | { readonly iso: string; readonly deltaT?: number }
  | { readonly jd: number; readonly scale: CalcScale; readonly deltaT?: number };

/**
 * Geodetic latitude and east longitude, degrees; `height` in metres above the
 * IERS 2003 ellipsoid, from −12,000 to 100,000, 0 by default (topocentric
 * only). @zodiacs/engine/sky's Observer has the same fields on WGS84, with
 * heights from −10,000 m.
 */
export interface CalcPlace {
  readonly latitude: number;
  readonly longitude: number;
  readonly height?: number;
}

export type CalcCenter = "geocentric" | "heliocentric" | "barycentric" | { readonly topocentric: CalcPlace };

/** The built-in ayanamsas, by name: @zodiacs/engine/vedic's AyanamsaName, whose guide (docs/vedic.md) defines each. */
export type CalcAyanamsa = AyanamsaName;

/** The built-in ayanamsas' names, in the order of @zodiacs/engine/vedic's AYANAMSAS, from which they are taken. */
export const CALC_AYANAMSAS = Object.freeze(Object.keys(AYANAMSAS)) as readonly CalcAyanamsa[];

/** The precession model a caller's ayanamsa was computed with: the engine's IAU 2006, Newcomb's (Kinoshita 1975) or IAU 1976; @zodiacs/engine/vedic's AyanamsaPrecessionModel. */
export type CalcAyanamsaModel = AyanamsaPrecessionModel;

/**
 * A caller's ayanamsa, the counterpart of Swiss Ephemeris's SE_SIDM_USER: the
 * mean ayanamsa `value` at `epoch`, carried from there by precession in
 * `model`, or by a fixed `rate`. It defines what @zodiacs/engine/vedic's
 * userAyanamsa defines, with its epoch given as any instant in a request is.
 */
export interface CalcUserAyanamsa {
  /** A lowercase identifier of at most 64 characters that is not a built-in name; default "user". */
  readonly name?: string;
  /**
   * When `value` holds, read as `time` is: `{ jd, scale: "tt" }` is
   * SE_SIDM_USER's TT epoch, and `{ jd, scale: "ut1" }` its UT epoch
   * (SE_SIDBIT_USER_UT), whose TT comes from the time basis.
   */
  readonly epoch: CalcTime;
  /** The mean ayanamsa at `epoch`, degrees, from −360 to 360. */
  readonly value: number;
  /** Arcseconds per Julian year, from −3600 to 3600: an ayanamsa that grows by this rate, with no precession model. */
  readonly rate?: number;
  /** Without `rate`: the model `value` was computed with, default "engine". An older model's zodiac is held where that model puts it at J2000.0. */
  readonly model?: CalcAyanamsaModel;
}

/**
 * "tropical" (default), or `{ sidereal }` with a built-in ayanamsa's name or a
 * caller's ayanamsa. A sidereal longitude is the longitude in the ecliptic of
 * date less the ayanamsa: the true ayanamsa (the mean plus the nutation in
 * longitude) in the true ecliptic of date, the mean ayanamsa in the mean one.
 */
export type CalcZodiac = "tropical" | { readonly sidereal: CalcAyanamsa | CalcUserAyanamsa };

/**
 * The ayanamsa of a sidereal result, at its instant and on its clock, in the
 * result's angular unit; calc(), houses() and chart() give the same shape.
 */
export interface CalcAyanamsaValue {
  /** The definition's name. */
  readonly name: string;
  /** The mean ayanamsa, counted along the mean ecliptic of date. */
  readonly mean: number;
  /** The engine's nutation in longitude (IAU 2000B). */
  readonly nutation: number;
  /** The mean ayanamsa plus the nutation in longitude, counted along the true ecliptic of date, in (−180°, 180°]. */
  readonly true: number;
  /** The one subtracted: "true" in the true ecliptic of date, "mean" in the mean ecliptic of date. */
  readonly subtracted: "true" | "mean";
  /**
   * The mean ayanamsa's difference from ERFA's construction of the same
   * definition, the bound a sidereal result's own bounds add. The nutation
   * cancels from a sidereal longitude; `true`, read on its own, also differs
   * from IAU 2000A's by the nutation model's difference (docs/calc.md).
   */
  readonly bound: CalcBound;
}

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

/** An instant as the engine used it: its UTC, UT1 and TT, and how the time basis gave them. */
export interface CalcInstant {
  /** UTC, ISO 8601, to the millisecond; before 1972 and after the IERS table, the civil time read as UT1. */
  readonly utc: string;
  readonly jdUt1: number;
  readonly jdTt: number;
  readonly deltaT: DeltaT;
  /** The scale the instant was given on and the basis that gave UT1 and TT, as a chart records it. */
  readonly timeScale: TimeScale;
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
  /** au: the light path for apparent and astrometric positions (the geocentric apparent Moon, its series, is geometric); null for the nodes and Lilith. */
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
  /** In the sidereal zodiac, the ayanamsa and which value of it `lon` has subtracted; null in the tropical zodiac. */
  readonly ayanamsa: CalcAyanamsaValue | null;
  /** In the sidereal zodiac, each includes the ayanamsa's own bound. */
  readonly bounds: CalcBounds;
  readonly receipt: CalcReceipt<CalcRequest>;
}

/**
 * Why a request was not computed. A refused search in @zodiacs/engine/crossings
 * and @zodiacs/engine/sky carries the same `status: "refused"`, and for a
 * spent budget the same `reason: "sample-budget"`.
 */
export type CalcRefusal = {
  readonly status: "refused";
  readonly detail: string;
} & (
  | { readonly reason: "unsupported-combination" | "not-in-this-version" }
  | { readonly reason: "out-of-range"; readonly span: CalcSpan }
  | { readonly reason: "epoch-out-of-range"; readonly epochSpan: typeof EPHEMERIS_SPAN }
  | { readonly reason: "sample-budget"; readonly samples: number; readonly maxSamples: number }
);

/** From an instant up to, not including, another: ISO 8601 UTC to the millisecond, as Date.prototype.toISOString gives them. */
export interface CalcSpan {
  readonly from: string;
  readonly to: string;
}

/** calc() and the other functions compute an instant only if its UT1 and its TT are in this span; positions() and natalChart() compute outside it, with a flag. */
export const CALC_SPAN: CalcSpan = REFERENCE_SPAN;

// ---------------------------------------------------------------- shared

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const DAY_MS = 86_400_000;
const J2000_JD = 2_451_545;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
/** CALC_SPAN in days from J2000.0, the unit of a time basis's UT1 and TT. */
const SPAN_DAYS = [CALC_SPAN.from, CALC_SPAN.to].map((iso) => (Date.parse(iso) - J2000_MS) / DAY_MS);
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
  /** Milliseconds since 1970 on `scale`; a Julian date's may have a fraction. */
  readonly ms: number;
  readonly scale: TimeScaleName;
  readonly pin: number | undefined;
  /** Whether it came as an ISO string or a Date (always UTC) rather than a Julian date. */
  readonly civil: boolean;
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
    const record = { iso: typeof value === "string" ? value : date.toISOString() };
    return { record, ms: date.getTime(), scale: "utc", pin: undefined, civil: true };
  }
  if (typeof value === "number") throw new RangeError(`${label} must be an ISO string, a Date or { jd, scale }.`);
  const time = fields(value, label, ["iso", "jd", "scale", "deltaT"]);
  const pin = time.deltaT === undefined ? undefined : within(time.deltaT, `${label}.deltaT`, -1e10, 1e10);
  const pinned = pin === undefined ? {} : { deltaT: pin };
  if ((time.iso === undefined) === (time.jd === undefined)) throw new RangeError(`${label} takes iso, or jd and scale.`);
  if (time.iso !== undefined) {
    if (typeof time.iso !== "string" || time.scale !== undefined) throw new RangeError(`${label}.iso must be an ISO string, without a scale.`);
    return { record: { iso: time.iso, ...pinned }, ms: iso(time.iso).getTime(), scale: "utc", pin, civil: true };
  }
  const jd = time.jd;
  if (typeof jd !== "number" || !Number.isFinite(jd)) throw new RangeError(`${label}.jd must be a finite Julian date.`);
  if (typeof time.scale === "string" && (TIME_SCALE_NAMES as readonly string[]).includes(time.scale.toLowerCase()) && !(TIME_SCALE_NAMES as readonly string[]).includes(time.scale)) {
    throw new RangeError(`${label}.scale must be one of ${TIME_SCALE_NAMES.join(", ")}: lowercase since 1.0.0.`);
  }
  const scale = oneOf(time.scale, TIME_SCALE_NAMES, `${label}.scale`);
  return { record: { jd, scale, ...pinned }, ms: J2000_MS + (jd - J2000_JD) * DAY_MS, scale, pin, civil: false };
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

const outOfRange = (): CalcRefusal => ({
  status: "refused",
  reason: "out-of-range",
  detail: `The instant's UT1 or TT is outside ${CALC_SPAN.from} to ${CALC_SPAN.to}, where the engine's positions have been compared with an independent ephemeris.`,
  span: CALC_SPAN
});

// ---------------------------------------------------------------- the zodiac

/** A request's zodiac as read. */
interface Zodiac {
  /** As the receipt records it, every default filled in. */
  readonly record: CalcZodiac;
  /** The ayanamsa; null in the tropical zodiac. */
  readonly definition: AyanamsaDefinition | null;
  /** Its convention ids. */
  readonly ids: readonly string[];
}

const TROPICAL: Zodiac = { record: "tropical", definition: null, ids: ["zodiac:tropical"] };

/** The Julian date of 1970-01-01T00:00Z, the middle of a Date's range of 10⁸ days either way. */
const UNIX_JD = 2_440_587.5;

/** The TT Julian date of a caller's ayanamsa's epoch, read as an instant is read. */
function epochTT(epoch: TimeInput, label: string): number {
  const record = epoch.record;
  const message = `${label} must be an instant in the range of a Date.`;
  let jd: number;
  if ("jd" in record && record.scale === "tt") {
    jd = record.jd;
  } else {
    // The time basis reads any instant a Date holds.
    if (!(Math.abs(epoch.ms) <= 8.64e15)) throw new RangeError(message);
    jd = J2000_JD + timeBasis(epoch.ms, epoch.scale, epoch.pin).ttDays;
  }
  // The range of a Date on TT, as userAyanamsa takes an epoch: an instant on UTC or UT1 near either end can
  // fall outside it on TT, where ΔT is days.
  if (!(Math.abs(jd - UNIX_JD) <= 1e8)) throw new RangeError(message);
  return jd;
}

function readZodiac(value: unknown): Zodiac {
  if (value === undefined || value === "tropical") return TROPICAL;
  const sidereal = fields(value, "zodiac", ["sidereal"]).sidereal;
  if (sidereal === undefined || typeof sidereal === "string") {
    const name = oneOf(sidereal, CALC_AYANAMSAS, "zodiac.sidereal");
    return { record: { sidereal: name }, definition: AYANAMSAS[name], ids: ["zodiac:sidereal", `ayanamsa:${name}`] };
  }
  const label = "zodiac.sidereal";
  const given = fields(sidereal, label, ["name", "epoch", "value", "rate", "model"]);
  // userAyanamsa's rule for a name, checked here so that the message names the field.
  if (given.name !== undefined && !isUserAyanamsaName(given.name)) {
    throw new RangeError(`${label}.name must be a lowercase identifier of at most 64 characters that is not a built-in name.`);
  }
  const epoch = readTime(given.epoch, `${label}.epoch`);
  const value_ = within(given.value, `${label}.value`, -360, 360);
  if (given.rate !== undefined && given.model !== undefined) throw new RangeError(`${label} takes a rate or a model, not both.`);
  const rate = given.rate === undefined ? undefined : within(given.rate, `${label}.rate`, -3600, 3600);
  const model = given.model === undefined ? undefined : oneOf(given.model, ["engine", "newcomb", "iau1976"] as const, `${label}.model`);
  // Every field is checked above, as userAyanamsa would check it.
  const definition = userAyanamsa({
    ...(given.name === undefined ? {} : { name: given.name }),
    epoch: { julianDateTT: epochTT(epoch, `${label}.epoch`) },
    value: value_,
    ...(rate === undefined ? {} : { rate }),
    ...(model === undefined ? {} : { model })
  });
  const user: CalcUserAyanamsa =
    rate === undefined
      ? { name: definition.name, epoch: epoch.record, value: value_, model: model ?? "engine" }
      : { name: definition.name, epoch: epoch.record, value: value_, rate };
  return { record: { sidereal: user }, definition, ids: ["zodiac:sidereal", `ayanamsa:user-${definition.kind}`] };
}

/** TT days from J2000.0 of an epoch definition's epoch inside EPHEMERIS_SPAN, the ends included. */
const insideEphemerisSpan = (definition: AyanamsaDefinition): boolean =>
  definition.kind !== "epoch" ||
  (definition.epochTT - J2000_JD >= EPHEMERIS_SPAN.daysFromJ2000.from && definition.epochTT - J2000_JD <= EPHEMERIS_SPAN.daysFromJ2000.to);

/**
 * Refused for an epoch definition whose epoch is outside EPHEMERIS_SPAN, the
 * years the engine's precession has been compared with ERFA's for it. From
 * 1800 to 2200 its bound is the span's; outside, the wider one the epoch's
 * band gives (calc-ayanamsa.ts).
 */
function epochRefusal(zodiac: Zodiac): CalcRefusal | null {
  return zodiac.definition && !insideEphemerisSpan(zodiac.definition)
    ? {
        status: "refused",
        reason: "epoch-out-of-range",
        detail: `The ayanamsa's epoch is outside ${EPHEMERIS_SPAN.fromTT} to ${EPHEMERIS_SPAN.toTT} TT (EPHEMERIS_SPAN), where the precession that carries it has been compared with ERFA's.`,
        epochSpan: EPHEMERIS_SPAN
      }
    : null;
}

/** A sidereal frame: the ecliptics of date, from whose equinox the ayanamsa is counted. */
const siderealFrame = (frame: CalcFrame): boolean => frame === "ecliptic-true-of-date" || frame === "ecliptic-mean-of-date";

function frameRefusal(zodiac: Zodiac, frame: CalcFrame): CalcRefusal | null {
  return zodiac.definition && !siderealFrame(frame)
    ? refuse(
        "unsupported-combination",
        `The sidereal zodiac is counted along the ecliptic of date; frame ${frame} is not offered with it, only ecliptic-true-of-date and ecliptic-mean-of-date.`
      )
    : null;
}

/** A definition's ayanamsa at an instant, degrees, with a star definition's star's angle from the Sun. */
type AyanamsaAt = ReturnType<typeof ayanamsaAt>;

/** The ayanamsa at an instant as a result reports it, in units of `k` per degree, with its bound. */
function ayanamsaValue(definition: AyanamsaDefinition, value: AyanamsaAt, subtracted: "true" | "mean", k: number): CalcAyanamsaValue {
  return {
    name: definition.name,
    mean: value.mean * k,
    nutation: value.nutation * k,
    true: value.true * k,
    subtracted,
    bound: { value: ayanamsaBound(definition, value.elongation).position, unit: "arcsec", label: "measured", basis: ayanamsaBound(definition, value.elongation).basis }
  };
}

/** A bound with the ayanamsa's added, or the bound itself in the tropical zodiac. */
function withAyanamsa(b: CalcBound, add: { readonly value: number; readonly basis: string } | null): CalcBound {
  if (add === null || b.value === null) return b;
  return { ...b, value: addBounds(b.value, add.value), basis: `${b.basis}; plus the ayanamsa's, ${add.value} ${b.unit}: ${add.basis}` };
}

/**
 * The instant's time basis, as positions() and natalChart() build one
 * (src/time-scale.ts): UTC through the leap seconds and IERS UT1 − UTC from
 * 1972 to the end of the IERS table, and read as UT1 with the ΔT model
 * outside it; or a pinned ΔT. Null unless its UT1 and its TT both lie in the
 * span.
 */
function resolve(time: TimeInput): TimeBasis | null {
  const inside = (days: number, margin = 0) => days >= SPAN_DAYS[0]! - margin && days < SPAN_DAYS[1]! + margin;
  const days = (time.ms - J2000_MS) / DAY_MS;
  const shift = (time.pin ?? 0) / 86_400;
  // Checked roughly before converting, so that no conversion runs far outside the span.
  if (!(inside(days, 2) && inside(days + (time.scale === "tt" ? -shift : shift), 2))) return null;
  const basis = timeBasis(time.ms, time.scale, time.pin);
  return inside(basis.ut1Days) && inside(basis.ttDays) ? basis : null;
}

/** `run` on the instant's time basis, or the out-of-range refusal. */
function inSpan<T>(time: TimeInput, run: (basis: TimeBasis) => T): T | CalcRefusal {
  const basis = resolve(time);
  return basis === null ? outOfRange() : run(basis);
}

/**
 * `evaluate` on astronomy-engine's time for `ms` on the input's scale, as the
 * engine's ephemeris reads a chart's instant (onChartClock in src/ephemeris.ts):
 * the basis's UT1 with its ΔT installed for the call.
 */
function onInput<T>(time: TimeInput, ms: number, evaluate: (at: AstroTime, basis: TimeBasis) => T): T {
  return onChartClock(ms, time.scale, time.pin, evaluate);
}

function instant(basis: TimeBasis): CalcInstant {
  return {
    utc: new Date(Math.round(basis.utcMs)).toISOString(),
    jdUt1: J2000_JD + basis.ut1Days,
    jdTt: J2000_JD + basis.ttDays,
    deltaT: basis.deltaT,
    timeScale: basis.timeScale
  };
}

/** The time basis, as the natal receipt's time-basis set names it (src/receipt.ts). */
const TIME_BASIS_ID = "time:tt-from-leap-seconds-and-ut1-from-iers-1972-to-table-end;delta-t-model-otherwise";

function receipt<Request>(request: Request, instants: CalcInstant[], ids: string[], pin?: number): CalcReceipt<Request> {
  return {
    schema: CALC_RECEIPT_SCHEMA,
    request,
    instants,
    conventions: [
      ...ids,
      `ephemeris:astronomy-engine@${EPHEMERIS.version}`,
      pin === undefined ? "deltat:time-basis" : "deltat:pinned",
      TIME_BASIS_ID
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

/**
 * The Moon's true node: the ascending node of its instantaneous orbit, as
 * ephemeris.ts computes it, on the mean ecliptic of date plus Δψ.
 */
function trueNode(at: AstroTime): number {
  const s = GeoMoonState(at);
  const frame = eclipticFrame(at.tt);
  const [x, y] = meanEcliptic(
    frame,
    s.y * s.vz - s.z * s.vy,
    s.z * s.vx - s.x * s.vz,
    s.x * s.vy - s.y * s.vx
  );
  return normalizeLongitude(Math.atan2(x, -y) * RAD + frame.tilt.dpsi / 3600);
}

/** A point in the true ecliptic of date, rounded as positions() and chartPoints() round it. */
function pointAt(body: Point, at: AstroTime): Row {
  const row = (raw: number, lon: number, lat = 0): Row => ({ lon, lat, dist: null, xyz: null, raw });
  if (isTrueNode(body)) {
    const raw = trueNode(at);
    return row(raw, body === "North Node" ? raw : normalizeLongitude(raw + 180));
  }
  const centuries = at.tt / 36525;
  const nutation = tilt(at.tt).dpsi / 3600;
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
  return (at) => {
    const { v, dist } = locate(target, center, correction, at);
    const turned = apply(frameMatrix(frame, at), v);
    // In the true ecliptic of date, the longitude and latitude as positions()
    // turns a vector (src/frame.ts): the longitude on the mean ecliptic of
    // date plus Δψ, to the bit.
    const { lon, lat } = frame === "ecliptic-true-of-date" ? eclipticOfDate(v[0], v[1], v[2], at.tt) : toSpherical(turned);
    const k = dist / length(turned);
    return { lon, lat, dist, xyz: [turned[0] * k, turned[1] * k, turned[2] * k], raw: lon };
  };
}

/** A vector turned about the pole of its ecliptic so that its longitude falls by `angle` degrees. */
function turnedBack([x, y, z]: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle * DEG);
  const s = Math.sin(angle * DEG);
  return [x * c + y * s, y * c - x * s, z];
}

interface SiderealRow extends Row {
  /** The ayanamsa at the instant, degrees, and a star definition's star's angle from the Sun. */
  readonly ayanamsa: AyanamsaAt;
}

/**
 * `evaluate` in the sidereal zodiac: the longitude less the true ayanamsa in
 * the true ecliptic of date, or the mean one in the mean ecliptic of date,
 * subtracted as @zodiacs/engine/vedic's siderealLongitude subtracts it; the
 * vector turned with it. The longitude a speed differences is turned too, so
 * a speed is the sidereal longitude's.
 */
function siderealOf(evaluate: (at: AstroTime) => Row, definition: AyanamsaDefinition, frame: CalcFrame): (at: AstroTime) => SiderealRow {
  const trueOfDate = frame === "ecliptic-true-of-date";
  return (at) => {
    const row = evaluate(at);
    const value = ayanamsaAt(definition, at);
    const subtracted = trueOfDate ? value.true : value.mean;
    return {
      lon: wrap360(wrap360(row.lon) - subtracted),
      lat: row.lat,
      dist: row.dist,
      xyz: row.xyz && turnedBack(row.xyz, subtracted),
      raw: row.raw - subtracted,
      ayanamsa: value
    };
  };
}

/** The convention ids of a position; calc(), events() and chart() share them. */
function positionIds(body: CalcBody, frame: CalcFrame, kind: Center["kind"], correction: CalcCorrection, zodiac: Zodiac): string[] {
  const ids = [...zodiac.ids, `frame:${frame}`, `center:${kind}`];
  if (isPoint(body)) {
    ids.push("correction:not-applicable", body.endsWith("Lilith") ? "lilith:mean" : body.startsWith("Mean") ? "node:mean" : "node:true-osculating");
  } else {
    ids.push(`correction:${correction}`);
    if (body === "Moon" && kind === "geocentric" && correction !== "astrometric") ids.push("moon:series-at-instant");
    else if (correction !== "geometric") {
      ids.push("light-time:newtonian", "deflection:none");
      if (correction === "apparent" && kind !== "barycentric") ids.push("aberration:backdated-observer");
    }
  }
  // A node or Lilith is found in the ecliptic of date and turned from there into every other frame.
  if (isPoint(body) || !inertial(frame)) ids.push("precession:iau2006");
  if (frame.includes("true")) ids.push("nutation:iau2000b");
  if (isPoint(body) || frame.startsWith("ecliptic")) ids.push("obliquity:iau2006");
  if (frame.endsWith("icrs")) ids.push("frame-bias:iau2000");
  if (kind === "barycentric") ids.push("barycentre:sun-and-giant-planets");
  if (kind === "topocentric") ids.push("observer:iers2003-ellipsoid;no-polar-motion");
  return ids;
}

function bound(value: number | null | undefined, unit: CalcBound["unit"], estimated: string | null): CalcBound {
  return value === undefined || value === null
    ? { value: null, unit, label: "estimated", basis: "not compared with an independent ephemeris" }
    : { value, unit, label: estimated === null ? "measured" : "estimated", basis: estimated ?? MEASURED_BASIS };
}

/** Rounded up to two significant figures. */
function up2(x: number): number {
  const unit = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Number((Math.ceil(x / unit) * unit).toPrecision(2));
}

/**
 * The barycentric Sun is 1e-4 to 0.01 au from the barycentre, so the
 * barycentre's own error bounds it: the widest angle, relative distance and
 * rate of direction that an error of e au and ev au/day allows at distance r
 * and speed v (the true distance is at least r - e).
 */
function barycentricSun(r: number, v: number | null): [number, number, number | null] {
  const { au: e, auPerDay: ev } = BARYCENTRE_ERROR;
  const rate = v === null ? null : ev / r + (v + ev) * e * (1 / r ** 2 + 1 / (r * (r - e)));
  return [up2(Math.asin(e / r) * RAD * 3600), up2(e / (r - e)), rate === null ? null : up2(rate * RAD * 3600)];
}

/**
 * The position of `body` at `time` in `frame` from `center`, with the
 * correction and outputs `flags` asks for, or a typed refusal. With every
 * default it is the position positions() and natalChart() give, to the bit
 * after the same earlier calls (docs/calc.md).
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
    center = { kind: "topocentric", site };
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
  const zodiac = readZodiac(asked.zodiac);
  const point = isPoint(body);
  const kind = center.kind;
  const refusal =
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
              : frameRefusal(zodiac, frame)) ?? epochRefusal(zodiac);
  if (refusal) return refusal;
  const correction = flags.correction;
  const definition = zodiac.definition;
  return inSpan(time, (basis): CalcPosition => {
    const tropical = evaluator(body, frame, center, correction);
    const evaluate = definition === null ? tropical : siderealOf(tropical, definition, frame);
    const now = onInput(time, time.ms, evaluate);
    const step = isTrueNode(body) ? NODE_STEP_DAYS : STEP_DAYS;
    const analytic = flags.speeds && correction === "geometric" && inertial(frame) && !point && body !== "Moon";
    let speeds: { lon: number; lat: number; dist: number | null } | null = null;
    let velocity: Vec3 | null = null;
    if (analytic) {
      const { state, turn } = onInput(time, time.ms, (at) => ({
        state: geometricState(body as Body, center, at)!,
        turn: frameMatrix(frame, at)
      }));
      velocity = apply(turn, state.v);
      speeds = sphericalRates(apply(turn, state.r), velocity);
    } else if (flags.speeds) {
      // Built as positions() builds them, so that its speeds are reproduced to the
      // bit: samples `step` days either side on the input's scale, and the time
      // between them the TT they span where the time basis steps between them
      // (elapsedDays in src/time-scale.ts).
      const shift = (days: number) => {
        const ms = time.ms + days * DAY_MS;
        return onInput(time, ms, (at, sampled) => ({ row: evaluate(at), basis: sampled }));
      };
      const before = shift(-step);
      const after = shift(step);
      const elapsed = elapsedDays(before.basis, after.basis, 2 * step);
      const rate = (a: number, b: number) => (a - b) / elapsed;
      let turn = after.row.raw - before.row.raw;
      if (turn > 180) turn -= 360;
      if (turn < -180) turn += 360;
      speeds = {
        lon: turn / elapsed,
        lat: rate(after.row.lat, before.row.lat),
        dist: now.dist === null ? null : rate(after.row.dist!, before.row.dist!)
      };
      const [a, b] = [after.row.xyz, before.row.xyz];
      if (a && b) velocity = [rate(a[0], b[0]), rate(a[1], b[1]), rate(a[2], b[2])];
    }
    const method = !flags.speeds ? null : analytic ? "analytic" : "central-difference";
    const k = flags.units === "radians" ? DEG : 1;

    // Bounds: measured for this center, correction and body where compared; a
    // topocentric body not compared takes its geocentric bound, as an estimate;
    // the barycentric Sun's come from the barycentre's error.
    let row = MEASURED[`${kind}/${point ? "apparent" : correction}`]?.[body];
    let estimated: string | null = null;
    if (!row && kind === "topocentric") {
      row = MEASURED[`geocentric/${correction}`]?.[body];
      estimated = "the geocentric bound for this correction; topocentric positions were compared only for the Sun, the Moon and Mars";
    } else if (kind === "barycentric" && body === "Sun") {
      row = barycentricSun(now.dist!, velocity && length(velocity));
      estimated = `the largest angle, relative distance and rate of direction that the error of astronomy-engine's barycentre, ${BARYCENTRE_ERROR.au.toExponential()} au and ${BARYCENTRE_ERROR.auPerDay.toExponential()} au/day from 1800 to 2200, allows at this distance and speed; docs/evidence/calc-api`;
    }

    const ids = positionIds(body, frame, kind, correction, zodiac);
    if (method) ids.push(method === "analytic" ? "speed:analytic" : `speed:central-difference-${step}d`);

    // In the sidereal zodiac, the ayanamsa subtracted and its own bounds, at this instant.
    const sidereal = definition === null ? null : (now as SiderealRow).ayanamsa;
    const added = sidereal && ayanamsaBound(definition!, sidereal.elongation);

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
      ayanamsa: sidereal && ayanamsaValue(definition!, sidereal, frame === "ecliptic-true-of-date" ? "true" : "mean", k),
      bounds: {
        position: withAyanamsa(bound(row?.[0], "arcsec", estimated), added && { value: added.position, basis: added.basis }),
        distance: point ? null : bound(row?.[1], "relative", estimated),
        speed: method && {
          ...withAyanamsa(bound(row?.[2], "arcsec/day", estimated), added && { value: added.rate, basis: added.basis }),
          method,
          stepDays: analytic ? null : step
        }
      },
      receipt: receipt(
        { body, time: time.record, frame, center: centerRecord, zodiac: zodiac.record, flags },
        [instant(basis)],
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
  /** Default "whole", as in natalChart() and chart(). */
  readonly houseSystem?: HouseSystem;
  readonly zodiac?: CalcZodiac;
}

export interface HousesResult {
  readonly status: "ok";
  readonly requested: HouseSystem;
  /** The requested system, or whole sign where Placidus or Koch is undefined (flag "polar-fallback"). */
  readonly system: HouseSystem;
  /**
   * Twelve cusps from the first house, degrees in the true ecliptic of date,
   * in the zodiac asked for; in the sidereal zodiac, whole-sign cusps start at
   * the sidereal ascendant's sign.
   */
  readonly cusps: readonly number[];
  /** In the zodiac asked for, as the Vertex and the East Point are. */
  readonly angles: Angles;
  readonly vertex: number;
  readonly eastPoint: number;
  /** Right ascension of the midheaven, degrees. */
  readonly armc: number;
  /** The true obliquity used, degrees. */
  readonly obliquity: number;
  readonly flags: readonly ChartFlag[];
  /** In the sidereal zodiac, the ayanamsa, degrees, whose true value is subtracted; null in the tropical zodiac. */
  readonly ayanamsa: CalcAyanamsaValue | null;
  /** In the sidereal zodiac, each includes the ayanamsa's own bound. */
  readonly bounds: { readonly angles: CalcBound; readonly cusps: CalcBound };
  readonly receipt: CalcReceipt<HousesRequest>;
}

/** The angles, the Vertex, the East Point and the cusps for an instant and a place, as natalChart() computes them. */
export function houses(request: HousesRequest): HousesResult | CalcRefusal {
  const asked = fields(request, "houses request", ["time", "place", "houseSystem", "zodiac"]);
  const time = readTime(asked.time, "time");
  const { latitude, longitude } = readPlace(asked.place, "place");
  const system = validateBirthSettings({ houseSystem: asked.houseSystem as HouseSystem }).houseSystem ?? "whole";
  const zodiac = readZodiac(asked.zodiac);
  const refusal = epochRefusal(zodiac);
  if (refusal) return refusal;
  const definition = zodiac.definition;
  return inSpan(time, (used): HousesResult => {
    // As natalChart(): the Earth's rotation from UT1, the true obliquity on TT.
    const { input, value } = onInput(time, time.ms, (at) => ({
      input: { gastHours: gastHours(at), latitude, longitude, obliquity: tilt(at.tt).tobl },
      value: definition && ayanamsaAt(definition, at)
    }));
    const tropical = computeAngles(input);
    const { houses: computed, fellBack } = computeHouses(system, input, tropical);
    // In the sidereal zodiac, every longitude less the true ayanamsa, as siderealChart() takes it.
    const zodiacal = value === null ? (lon: number) => lon : (lon: number) => wrap360(wrap360(lon) - value.true);
    const angles: Angles =
      value === null
        ? tropical
        : { asc: zodiacal(tropical.asc), mc: zodiacal(tropical.mc), dsc: zodiacal(tropical.dsc), ic: zodiacal(tropical.ic) };
    const cusps = value === null ? computed.cusps : computed.system === "whole" ? wholeSignCusps(angles.asc) : computed.cusps.map(zodiacal);
    const bounded = definition && value && ayanamsaBound(definition, value.elongation);
    const added = bounded && { value: bounded.position, basis: bounded.basis };
    // Conformance suite 0.1.0, level L2, for this engine: conformance/RESULTS.md.
    const basis = (what: string) =>
      `largest difference over the conformance suite's L2 ${what}, whose arbiter is ERFA with each system's definition`;
    return {
      status: "ok",
      requested: system,
      system: computed.system,
      cusps,
      angles,
      // Normalized once more, as chartPoints() reports them.
      vertex: zodiacal(normalizeLongitude(vertexOf(input, tropical))),
      eastPoint: zodiacal(normalizeLongitude(eastPointOf(input))),
      armc: ramcOf(input),
      obliquity: input.obliquity,
      flags: fellBack ? ["polar-fallback"] : [],
      ayanamsa: value && ayanamsaValue(definition!, value, "true", 1),
      bounds: {
        angles: withAyanamsa(
          { value: 0.02, unit: "arcsec", label: "measured", basis: basis("vectors of the ascendant, midheaven, Vertex and East Point") },
          added
        ),
        cusps: withAyanamsa({ value: 0.08, unit: "arcsec", label: "measured", basis: basis("cusp vectors, thirteen systems") }, added)
      },
      receipt: receipt(
        { time: time.record, place: { latitude, longitude }, houseSystem: system, zodiac: zodiac.record },
        [instant(used)],
        [
          ...zodiac.ids,
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
  /** Apparent geocentric ecliptic longitude of date, degrees, in the zodiac asked for. */
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
  /** UTC, ISO 8601, to the millisecond, as the crossing search gives it. */
  readonly at: string;
  readonly jdUt1: number;
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
  const zodiac = readZodiac(asked.zodiac);
  const refusal =
    (!CHART_BODIES.includes(body)
      ? refuse("unsupported-combination", `Crossings are searched for the bodies positions() gives; ${body} is not one.`)
      : from.pin !== undefined || to.pin !== undefined
        ? refuse("unsupported-combination", "Crossing searches run on the engine's ΔT model; a pinned ΔT is not offered.")
        : null) ?? epochRefusal(zodiac);
  if (refusal) return refusal;
  const definition = zodiac.definition;
  // In the sidereal zodiac, each longitude less the true ayanamsa at its own instant and clock.
  const longitudeAt: BodyLongitudeAt =
    definition === null
      ? bodyLongitude
      : (b, date) => {
          const tropical = bodyLongitude(b, date);
          return wrap360(wrap360(tropical) - onChartClock(date.getTime(), "utc", undefined, (at) => ayanamsaAt(definition, at).true));
        };
  const start = resolve(from);
  const end = resolve(to);
  if (start === null || end === null) return outOfRange();
  {
    // The search runs on UTC instants, as searchLongitudeCrossings does.
    const dated = (basis: TimeBasis) => new Date(Math.round(basis.utcMs));
    const found = searchLongitudeCrossingsWith(
      longitudeAt,
      body as BodyName,
      longitude,
      dated(start),
      dated(end),
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
        const { ut1Days, ttDays } = timeBasis(at.getTime(), "utc");
        return { at: at.toISOString(), jdUt1: J2000_JD + ut1Days, jdTt: J2000_JD + ttDays, retrograde };
      }),
      samples: found.samples,
      bounds: {
        timing: {
          value: (stepDays * 86_400) / 2 ** 24,
          unit: "s",
          label: "estimated",
          basis:
            "the bisection bracket, step / 2^24, on the engine's own longitudes; the ephemeris's error over the body's speed adds to it" +
            (definition === null ? "" : ", and in the sidereal zodiac the ayanamsa's")
        }
      },
      receipt: receipt(
        { kind, body, longitude, from: from.record, to: to.record, zodiac: zodiac.record, stepDays, ...limit },
        [instant(start), instant(end)],
        [...positionIds(body, "ecliptic-true-of-date", "geocentric", "apparent", zodiac), "search:scan-and-bisect"]
      )
    };
  }
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
  /** The chart natalChart() gives for the same instant (to the millisecond), place, settings and ΔT: tropical. */
  readonly chart: Chart;
  /** In the sidereal zodiac, the chart's longitudes as @zodiacs/engine/vedic's siderealChart() gives them; null in the tropical zodiac. */
  readonly sidereal: CalcSiderealChart | null;
  readonly receipt: CalcReceipt<ChartRequest>;
}

/** A chart's sidereal longitudes, degrees in [0, 360), as siderealChart() gives them. */
export interface CalcSiderealChart {
  /** The ayanamsa at the chart's instant and on its clock, degrees, whose true value is subtracted. */
  readonly ayanamsa: CalcAyanamsaValue;
  /** The chart's bodies, in its order. */
  readonly bodies: readonly { readonly body: BodyName; readonly lon: number }[];
  /** Null when the chart has no angles. */
  readonly ascendant: number | null;
  readonly midheaven: number | null;
  /** The house system as computed, after any polar fallback; null without houses. */
  readonly houseSystem: HouseSystem | null;
  /** First house first; whole-sign cusps start at the sidereal ascendant's sign. Null without houses. */
  readonly cusps: readonly number[] | null;
}

/** siderealChart()'s longitudes of a computed chart, as plain numbers. */
function siderealOfChart(computed: Chart, definition: AyanamsaDefinition): CalcSiderealChart {
  const sidereal = siderealChartOf(computed, definition);
  const value = sidereal.ayanamsaValue;
  // The star's angle from the Sun, for the bound, at the TT instant the ayanamsa was taken at.
  const { elongation } = ayanamsaAt(definition, AstroTime.FromTerrestrialTime(value.julianDateTT - J2000_JD));
  return {
    ayanamsa: ayanamsaValue(definition, { mean: value.mean, nutation: value.nutation, true: value.true, elongation }, "true", 1),
    bodies: sidereal.bodies.map(({ body, lon }) => ({ body, lon })),
    ascendant: sidereal.ascendant === null ? null : sidereal.ascendant.lon,
    midheaven: sidereal.midheaven === null ? null : sidereal.midheaven.lon,
    houseSystem: sidereal.houseSystem,
    cusps: sidereal.cusps === null ? null : sidereal.cusps.map((cusp) => cusp.lon)
  };
}

/** A natal chart from the calc vocabulary: natalChart()'s chart, with a receipt. */
export function chart(request: ChartRequest): ChartResult | CalcRefusal {
  const asked = fields(request, "chart request", ["time", "place", "houseSystem", "timeKnown", "timeFlags", "zodiac"]);
  const time = readTime(asked.time, "time");
  const site = asked.place === undefined ? null : readPlace(asked.place, "place");
  const place = site === null ? null : { latitude: site.latitude, longitude: site.longitude };
  const settings = validateBirthSettings({ houseSystem: asked.houseSystem as HouseSystem, timeKnown: asked.timeKnown as boolean });
  const supplied = asked.timeFlags === undefined ? undefined : snapshotFlags(asked.timeFlags).values;
  const zodiac = readZodiac(asked.zodiac);
  const refusal = epochRefusal(zodiac);
  if (refusal) return refusal;
  // natalChart() takes a Date, so a Julian date is read to the nearest millisecond on its scale.
  const whole: TimeInput = { ...time, ms: Math.round(time.ms) };
  return inSpan(whole, (basis): ChartResult => {
    const utc = new Date(whole.ms);
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
      ...(whole.pin === undefined ? {} : { deltaT: whole.pin }),
      ...(whole.scale === "utc" ? {} : { timeScale: whole.scale })
    };
    const used = instant(basis);
    const computed = computeChart(input);
    assertDerivedFlags(supplied ?? [], computed.flags);
    return {
      status: "ok",
      chart: computed,
      sidereal: zodiac.definition && siderealOfChart(computed, zodiac.definition),
      receipt: receipt(
        {
          time: time.record,
          ...(place && { place }),
          houseSystem,
          timeKnown,
          ...(supplied && { timeFlags: supplied }),
          zodiac: zodiac.record
        },
        [used],
        [
          ...zodiac.ids,
          "frame:ecliptic-true-of-date",
          "center:geocentric",
          "correction:apparent",
          "light-time:newtonian",
          "deflection:none",
          "aberration:backdated-observer",
          "moon:series-at-instant",
          "node:true-osculating",
          "precession:iau2006",
          "nutation:iau2000b",
          "obliquity:iau2006",
          ...(computed.houses === null
            ? []
            : [
                `house:${houseSystem}`,
                ...(computed.houses.system === houseSystem ? [] : ["polar-fallback:whole"]),
                "angles:gast-and-true-obliquity",
                "sidereal-time:gast-iau2006-era"
              ]),
          "aspects:major",
          `speed:central-difference-${STEP_DAYS}d`,
          `speed:central-difference-${NODE_STEP_DAYS}d`
        ],
        time.pin
      )
    };
  });
}
