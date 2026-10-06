/*
 * Solar and lunar returns: the instant the transiting Sun or Moon comes back
 * to its natal longitude, and the chart cast for that instant.
 *
 * Definition: al-Bīrūnī, Book of Instruction §522 (tr. Wright): "each year
 * the ascendant is ascertained when the sun comes round to the same minute of
 * the ecliptic in which it stood at the birth". The lunar
 * return takes the Moon's natal longitude in the same way. Ported from the
 * Zodiacs.org site (src/lib/engine/solar-return.ts, lunar-return.ts), whose
 * windows, steps and refusals it keeps, except that it does not clip its
 * scans to 1800–2200; see docs/techniques.md.
 */
import { natalChart, resolvedChart, utcOf } from "../api.js";
import type { NatalSource } from "../api.js";
import { findLongitudeCrossingsWith } from "../crossings.js";
import { dateFrom } from "../date-input.js";
import { bodyLongitude } from "../ephemeris.js";
import { HOUSE_SYSTEMS } from "../houses.js";
import type { Chart, DateInput, HouseSystem } from "../types.js";
import { DAY_MS, dateAt, finiteDegrees, oneOf, placeOf, readOptions, techniqueFlags } from "./shared.js";
import type { GeoPlace, TechniqueFlag } from "./shared.js";

// The searches' parameters. A minor release may tune them, within what each
// search promises to find, so they are typed as numbers.
/** Half-width of the solar return search around its date, days. */
export const SOLAR_RETURN_WINDOW_DAYS: number = 200;
/** How far back `mostRecentSolarReturnInstant` searches, days. */
export const SOLAR_RETURN_LOOKBACK_DAYS: number = 370;
/** Coarse step of the solar return search, days. */
export const SOLAR_RETURN_STEP_DAYS: number = 1;
/** How far the lunar return search runs, days. */
export const LUNAR_RETURN_HORIZON_DAYS: number = 40;
/** Coarse step of the lunar return search, days. */
export const LUNAR_RETURN_STEP_DAYS: number = 0.25;

/** The solar return nearest the date, or the latest at or before it. */
export type SolarReturnSelection = "nearest" | "most-recent";

export interface ReturnOptions {
  /** Where the chart is cast: the natal place by default; null for no angles or houses. */
  location?: GeoPlace | null | undefined;
  /** The natal chart's by default. */
  houseSystem?: HouseSystem | undefined;
}

export interface SolarReturnOptions extends ReturnOptions {
  /** `"nearest"` by default. */
  selection?: SolarReturnSelection | undefined;
}

/** A solar or lunar return: the instant the body is back on its natal longitude, and the chart then. */
export interface ReturnChart {
  readonly body: "Sun" | "Moon";
  /** The body's longitude in the natal chart, degrees. */
  readonly natalLongitude: number;
  /** When the transiting body is back on it, UTC on the engine's time basis. */
  readonly instant: Date;
  /** The chart at `instant`, with a known time, at `location`. */
  readonly chart: Chart;
  readonly location: GeoPlace | null;
  /** From the natal instant and the ends of the searched window. */
  readonly flags: readonly TechniqueFlag[];
}

/**
 * A solar or lunar return, under its first name.
 *
 * @deprecated Use ReturnChart, the same type: @zodiacs/engine/timing's PlanetaryReturn is another one.
 */
export type PlanetaryReturn = ReturnChart;

export interface SolarReturn extends ReturnChart {
  readonly body: "Sun";
  readonly selection: SolarReturnSelection;
}

export interface LunarReturn extends ReturnChart {
  readonly body: "Moon";
}

const SELECTIONS: readonly SolarReturnSelection[] = ["nearest", "most-recent"];

/**
 * When the apparent Sun is at `natalSunLongitude`, nearest `near`: the
 * crossing solver at 1-day steps over ±200 days; a tie goes to the earlier.
 */
export function solarReturnInstant(natalSunLongitude: number, near: DateInput): Date {
  const target = finiteDegrees(natalSunLongitude, "natalSunLongitude");
  const center = dateFrom(near, "near").getTime();
  const crossings = findLongitudeCrossingsWith(
    bodyLongitude,
    "Sun",
    target,
    dateAt(center - SOLAR_RETURN_WINDOW_DAYS * DAY_MS, "The solar return window"),
    dateAt(center + SOLAR_RETURN_WINDOW_DAYS * DAY_MS, "The solar return window"),
    SOLAR_RETURN_STEP_DAYS
  );
  const first = crossings[0];
  if (first === undefined) throw new RangeError("No solar return found in the scan window.");
  const closest = crossings.reduce((best, crossing) =>
    Math.abs(crossing.at.getTime() - center) < Math.abs(best.at.getTime() - center) ? crossing : best, first);
  return new Date(closest.at.getTime());
}

/** The latest instant at or before `at` when the apparent Sun is at `natalSunLongitude`, within 370 days. */
export function mostRecentSolarReturnInstant(natalSunLongitude: number, at: DateInput): Date {
  const target = finiteDegrees(natalSunLongitude, "natalSunLongitude");
  const end = dateFrom(at, "at").getTime();
  const crossings = findLongitudeCrossingsWith(
    bodyLongitude,
    "Sun",
    target,
    dateAt(end - SOLAR_RETURN_LOOKBACK_DAYS * DAY_MS, "The solar return window"),
    new Date(end),
    SOLAR_RETURN_STEP_DAYS
  ).filter((crossing) => crossing.at.getTime() <= end);
  const last = crossings[crossings.length - 1];
  if (last === undefined) throw new RangeError("No previous solar return found in the scan window.");
  return new Date(last.at.getTime());
}

function moonLongitude(date: Date): number {
  const longitude = bodyLongitude("Moon", date);
  if (!(longitude >= 0 && longitude < 360)) throw new RangeError("The Moon position could not be calculated.");
  return longitude;
}

/**
 * The first instant in (after, after + 40 days] when the apparent Moon is at
 * `natalMoonLongitude`: the crossing solver at 6-hour steps.
 */
export function lunarReturnInstant(natalMoonLongitude: number, after: DateInput): Date {
  const longitude = finiteDegrees(natalMoonLongitude, "natalMoonLongitude");
  const start = dateFrom(after, "after").getTime();
  const upper = start + LUNAR_RETURN_HORIZON_DAYS * DAY_MS;
  // A normalized longitude is used bit for bit: adding 360 can round it.
  const target = longitude >= 0 && longitude < 360 ? longitude : ((longitude % 360) + 360) % 360;
  const crossings = findLongitudeCrossingsWith(
    (_body, date) => moonLongitude(date),
    "Moon",
    target,
    new Date(start),
    dateAt(upper, "The lunar return window"),
    LUNAR_RETURN_STEP_DAYS
  );
  // The Moon never moves backwards: a retrograde crossing is an ephemeris fault.
  if (crossings.some((crossing) => !Number.isFinite(crossing.at.getTime()) || crossing.retrograde)) {
    throw new RangeError("The Moon crossing could not be calculated.");
  }
  const instants = [...new Set(crossings.map((crossing) => crossing.at.getTime()))]
    .filter((instant) => instant > start && instant <= upper)
    .sort((a, b) => a - b);
  const first = instants[0];
  if (first === undefined) throw new RangeError("No lunar return was found in the 40-day scan.");
  return new Date(first);
}

function setup(natal: NatalSource, body: "Sun" | "Moon", options: Readonly<Record<string, unknown>>) {
  const houseSystem = options.houseSystem === undefined ? undefined : oneOf(options.houseSystem, HOUSE_SYSTEMS, "whole", "houseSystem");
  const requested: GeoPlace | null | undefined =
    options.location === undefined ? undefined : options.location === null ? null : placeOf(options.location, "location");
  const { chart } = resolvedChart(natal);
  const natalLongitude = chart.bodies.find((row) => row.body === body)?.lon;
  if (natalLongitude === undefined) throw new RangeError(`The natal chart has no ${body}.`);
  const { latitude, longitude } = chart.input;
  const location: GeoPlace | null =
    requested !== undefined ? requested : latitude === undefined || longitude === undefined ? null : Object.freeze({ latitude, longitude });
  const cast = (instant: Date): Chart =>
    natalChart({ utc: instant, houseSystem: houseSystem ?? chart.input.houseSystem, timeKnown: true, ...(location ?? {}) });
  return { chart, natalLongitude, birth: utcOf(chart.input).getTime(), location, cast };
}

/**
 * The solar return of a natal chart or birth nearest `date` (or the latest at
 * or before it), and its chart. The natal Sun is the chart's own.
 */
export function solarReturn(natal: NatalSource, date: DateInput, options?: SolarReturnOptions): SolarReturn {
  const read = readOptions(options, ["location", "houseSystem", "selection"], "solarReturn options");
  const selection = oneOf(read.selection, SELECTIONS, "nearest", "selection");
  const at = dateFrom(date, "date").getTime();
  const { natalLongitude, birth, location, cast } = setup(natal, "Sun", read);
  const recent = selection === "most-recent";
  const instant = recent ? mostRecentSolarReturnInstant(natalLongitude, at) : solarReturnInstant(natalLongitude, at);
  const reach = (recent ? SOLAR_RETURN_LOOKBACK_DAYS : SOLAR_RETURN_WINDOW_DAYS) * DAY_MS;
  return Object.freeze({
    body: "Sun",
    selection,
    natalLongitude,
    instant,
    chart: cast(instant),
    location,
    flags: techniqueFlags([birth, at - reach, recent ? at : at + reach])
  });
}

/**
 * The first lunar return after `after` (within 40 days) of a natal chart or
 * birth, and its chart. Needs a known birth time not flagged `dst-gap` or
 * `dst-fold`, and `after` no earlier than the birth.
 */
export function lunarReturn(natal: NatalSource, after: DateInput, options?: ReturnOptions): LunarReturn {
  const read = readOptions(options, ["location", "houseSystem"], "lunarReturn options");
  const start = dateFrom(after, "after").getTime();
  const { chart, natalLongitude, birth, location, cast } = setup(natal, "Moon", read);
  if (chart.input.timeKnown !== true || chart.input.flags?.some((flag) => flag === "dst-gap" || flag === "dst-fold")) {
    throw new RangeError("A known, unambiguous birth time is required for a lunar return.");
  }
  if (birth > start) throw new RangeError("after must not precede the birth instant.");
  const instant = lunarReturnInstant(natalLongitude, start);
  return Object.freeze({
    body: "Moon",
    natalLongitude,
    instant,
    chart: cast(instant),
    location,
    flags: techniqueFlags([birth, start, start + LUNAR_RETURN_HORIZON_DAYS * DAY_MS])
  });
}
