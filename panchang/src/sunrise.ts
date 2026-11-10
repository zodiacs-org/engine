import { budgetOf, optionsOf, skyEvents } from "../../src/sky/riseset.js";
import type { SkyEvent, SkyEvents } from "../../src/sky/riseset.js";
import { nextCivilDate, prepareCivilDay, resolveCivilDay, validateCivilDate } from "./civil.js";
import type { CivilDayInput, CivilDayResult, CivilDayWindow } from "./civil.js";
import { luminarySnapshot, PANCHANG_AYANAMSAS } from "./engine.js";
import type { LuminarySnapshot, PanchangAyanamsa, SnapshotOptions, SnapshotRefusal } from "./engine.js";

export const VARA_NAMES = Object.freeze([
  "Ravivara", "Somavara", "Mangalavara", "Budhavara", "Guruvara", "Shukravara", "Shanivara"
] as const);
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export interface Vara {
  /** Sunday = 0, Saturday = 6, on the local date containing the sunrise. */
  readonly index: number;
  readonly name: typeof VARA_NAMES[number];
  readonly weekday: typeof WEEKDAYS[number];
}

export interface SunriseOptions extends SnapshotOptions {
  /** Shared budget for both sky searches, excluding luminary snapshots. */
  readonly maxSamples?: number;
}

export const SUNRISE_CONVENTIONS = Object.freeze({
  limb: "upper", refraction: "standard", refractionArcmin: 34,
  observerEllipsoid: "WGS84", horizon: "level-plane-perpendicular-to-local-vertical",
  horizonDip: "none", solarRadius: "engine-distance-dependent",
  timeScale: "utc", boundary: "[start,end)", eventResolution: "first-whole-millisecond-of-engine-crossing"
} as const);

export interface SunriseBoundary {
  readonly utc: string;
  readonly civilDate: string;
  readonly event: SkyEvent;
  /** Geocentric luminary positions and ayanamsa with complete calc receipts. */
  readonly snapshot: LuminarySnapshot;
}

interface SunriseContext extends CivilDayInput {
  readonly ayanamsa: PanchangAyanamsa;
  readonly conventions: typeof SUNRISE_CONVENTIONS;
  readonly maxSamples: number;
  readonly samples: number;
  readonly civilDays: readonly CivilDayResult[];
  /** Original engine searches, retained as diagnostics even for refusals. */
  readonly searches: readonly SkyEvents[];
}

export interface SunriseDayWindow extends SunriseContext {
  readonly status: "ok";
  readonly civilDays: readonly [CivilDayWindow, CivilDayWindow];
  readonly searches: readonly [SkyEvents, SkyEvents];
  readonly start: SunriseBoundary;
  readonly end: SunriseBoundary;
  readonly vara: Vara;
}

export interface SunriseDayRefusal extends SunriseContext {
  readonly status: "refused";
  readonly reason: "civil-day-refused" | "sample-budget" | "missing-sunrise" | "multiple-sunrises" | "engine-refused";
  readonly endpoint: "start" | "end";
  readonly engine?: SnapshotRefusal;
}

export type SunriseDayResult = SunriseDayWindow | SunriseDayRefusal;

/** Gregorian weekday arithmetic only; sunrise assignment is done by resolveSunriseDay. */
export function varaOfCivilDate(date: string): Vara {
  validateCivilDate(date);
  const index = new Date(`${date}T00:00:00Z`).getUTCDay();
  return Object.freeze({ index, name: VARA_NAMES[index]!, weekday: WEEKDAYS[index]! });
}

function settingsOf(options: SunriseOptions): { ayanamsa: PanchangAyanamsa; maxSamples: number } {
  const input = optionsOf(options, ["ayanamsa", "maxSamples"], "sunrise options");
  const ayanamsa = input.ayanamsa === undefined ? "lahiri" : input.ayanamsa;
  if (!PANCHANG_AYANAMSAS.includes(ayanamsa as PanchangAyanamsa)) {
    throw new RangeError("ayanamsa must be an engine built-in name.");
  }
  return { ayanamsa: ayanamsa as PanchangAyanamsa,
    maxSamples: budgetOf(input.maxSamples === undefined ? 20_000 : input.maxSamples) };
}

/** Prepare the midnight histories needed for both local-date sunrise searches. */
export async function prepareSunriseDay(input: CivilDayInput): Promise<void> {
  // Validate the original input before constructing its successor.
  await prepareCivilDay(input);
  await prepareCivilDay({ ...input, date: nextCivilDate(input.date) });
}

/**
 * Pure synchronous sunrise-to-following-local-date-sunrise resolver.
 * Await prepareSunriseDay first for historical zone data. Engine input/load
 * errors propagate. Refusals expose diagnostics but no partial day window.
 */
export function resolveSunriseDay(input: CivilDayInput, options: SunriseOptions = {}): SunriseDayResult {
  return resolveSunriseDayWith(input, options, { resolveCivilDay, luminarySnapshot, skyEvents });
}

/** Internal dependencies scoped to a single range; no process-wide caches. */
export interface SunriseCalculations {
  readonly resolveCivilDay: typeof resolveCivilDay;
  readonly luminarySnapshot: typeof luminarySnapshot;
  readonly skyEvents: typeof skyEvents;
}

export function resolveSunriseDayWith(input: CivilDayInput, options: SunriseOptions,
  calculations: SunriseCalculations): SunriseDayResult {
  const { resolveCivilDay, luminarySnapshot, skyEvents } = calculations;
  const settings = settingsOf(options);
  const firstCivil = resolveCivilDay(input);
  const civilDays: CivilDayResult[] = [firstCivil];
  const searches: SkyEvents[] = [];
  let samples = 0;
  const context = (): SunriseContext => ({ date: firstCivil.date, timeZone: firstCivil.timeZone,
    observer: firstCivil.observer, ...settings, conventions: SUNRISE_CONVENTIONS, samples,
    civilDays: Object.freeze([...civilDays]), searches: Object.freeze([...searches]) });
  const refuse = (reason: SunriseDayRefusal["reason"], endpoint: SunriseDayRefusal["endpoint"], engine?: SnapshotRefusal): SunriseDayRefusal =>
    Object.freeze({ ...context(), status: "refused", reason, endpoint, ...(engine ? { engine } : {}) });
  if (firstCivil.status !== "ok") return refuse("civil-day-refused", "start");
  const secondCivil = resolveCivilDay({ date: firstCivil.nextDate, timeZone: firstCivil.timeZone, observer: firstCivil.observer });
  civilDays.push(secondCivil);
  if (secondCivil.status !== "ok") return refuse("civil-day-refused", "end");

  const boundaries: SunriseBoundary[] = [];
  for (const [civil, endpoint] of [[firstCivil, "start"], [secondCivil, "end"]] as const) {
    // calc refuses outside its reference span before a potentially unsupported
    // sky ephemeris call. Retain that refusal, without inventing a sunrise.
    const coverage = luminarySnapshot(civil.start.utc, { ayanamsa: settings.ayanamsa });
    if (coverage.status !== "ok") return refuse("engine-refused", endpoint, coverage);
    const remaining = settings.maxSamples - samples;
    if (remaining < 1) return refuse("sample-budget", endpoint);
    const search = skyEvents("Sun", civil.observer, civil.start.utc, civil.end.utc,
      { limb: "upper", refraction: "standard", maxSamples: remaining });
    searches.push(search);
    samples += search.samples;
    if (search.status !== "complete") return refuse("sample-budget", endpoint);
    const rises = search.events.filter((event) => event.kind === "rise");
    if (rises.length === 0) return refuse("missing-sunrise", endpoint);
    if (rises.length !== 1) return refuse("multiple-sunrises", endpoint);
    const event = rises[0]!;
    const snapshot = luminarySnapshot(event.at, { ayanamsa: settings.ayanamsa });
    if (snapshot.status !== "ok") return refuse("engine-refused", endpoint, snapshot);
    boundaries.push(Object.freeze({ utc: event.at.toISOString(), civilDate: civil.date, event, snapshot }));
  }
  return Object.freeze({ ...context(), status: "ok", civilDays: Object.freeze([firstCivil, secondCivil] as const),
    searches: Object.freeze([searches[0]!, searches[1]!] as const), start: boundaries[0]!, end: boundaries[1]!,
    vara: varaOfCivilDate(firstCivil.date) });
}
