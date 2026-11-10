import { civilDateOf, format, julianDayNumber, parseCalendarDate } from "../../src/civil-calendar.js";
import type { CivilDate } from "../../src/civil-calendar.js";
import { prepareLocalTime, resolveLocalToUtc } from "../../src/geo/timezone.js";
import type { LocalTimeResolution } from "../../src/geo/timezone.js";
import type { Observer } from "../../src/sky/riseset.js";

export type PanchangObserver = Readonly<Observer>;

export interface CivilDayInput {
  readonly date: string;
  readonly timeZone: string;
  readonly observer: PanchangObserver;
}

export interface CivilBoundary {
  /** Actual civil boundary, which can precede the engine's shifted midnight. */
  readonly utc: string;
  readonly kind: "midnight" | "earlier-midnight" | "gap-transition";
  /** Original engine resolution of the requested midnight, without edits. */
  readonly resolution: LocalTimeResolution;
}

interface CivilDayContext {
  readonly date: string;
  readonly nextDate: string;
  readonly timeZone: string;
  readonly observer: Readonly<Required<Observer>>;
  readonly calendar: "gregorian";
}

export interface CivilDayWindow extends CivilDayContext {
  readonly status: "ok";
  /** Half-open interval [start, end) for a civil date, not a sunrise day. */
  readonly start: CivilBoundary;
  readonly end: CivilBoundary;
}

export interface CivilDayRefusal extends CivilDayContext {
  readonly status: "refused";
  readonly reason: "skipped-date" | "date-boundary-fold";
  readonly resolutions: readonly [LocalTimeResolution, LocalTimeResolution];
}

export type CivilDayResult = CivilDayWindow | CivilDayRefusal;

function objectWithKeys(value: unknown, keys: readonly string[], name: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Reflect.ownKeys(value).some((key) => typeof key !== "string" || !keys.includes(key))) {
    throw new RangeError(`${name} must be an object with only the documented fields.`);
  }
}

/** Strict proleptic Gregorian YYYY-MM-DD; does not imply ephemeris coverage. */
export function validateCivilDate(date: string): Readonly<CivilDate> {
  const parsed = parseCalendarDate(date, "gregorian");
  if (!parsed) throw new RangeError("date must be a valid Gregorian YYYY-MM-DD.");
  return Object.freeze(parsed);
}

/** Calendar successor, independent of the zone and elapsed UTC duration. */
export function nextCivilDate(date: string): string {
  const parsed = validateCivilDate(date);
  const next = format(civilDateOf(julianDayNumber(parsed, "gregorian") + 1, "gregorian"));
  if (next === null) throw new RangeError("The next civil date leaves the four-digit year range.");
  return next;
}

/** Explicit host-supported IANA zone, including UTC and database aliases. */
export function validateTimeZone(timeZone: string): string {
  if (typeof timeZone !== "string" || timeZone.length === 0 || timeZone.trim() !== timeZone ||
      /^[+-]/u.test(timeZone)) {
    throw new RangeError("timeZone must be an explicit IANA timezone identifier.");
  }
  // Intl performs identifier validation; preserve the requested alias spelling
  // so that preparation and engine resolution use the same history key.
  new Intl.DateTimeFormat("en-US", { timeZone });
  return timeZone;
}

/** Geodetic degrees, east-positive longitude, WGS84 height in metres. */
export function validateObserver(observer: PanchangObserver): Readonly<Required<Observer>> {
  objectWithKeys(observer, ["latitude", "longitude", "height"], "observer");
  const { latitude, longitude, height = 0 } = observer;
  for (const [name, value, minimum, maximum] of [
    ["latitude", latitude, -90, 90],
    ["longitude", longitude, -180, 180],
    ["height", height, -10_000, 100_000]
  ] as const) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
      throw new RangeError(`observer.${name} must be finite and between ${minimum} and ${maximum}.`);
    }
  }
  return Object.freeze({ latitude, longitude, height });
}

function contextOf(input: CivilDayInput): CivilDayContext {
  objectWithKeys(input, ["date", "timeZone", "observer"], "civil day input");
  const { date, timeZone, observer } = input;
  const nextDate = nextCivilDate(date);
  return Object.freeze({ date, nextDate, timeZone: validateTimeZone(timeZone),
    observer: validateObserver(observer), calendar: "gregorian" });
}

/** Explicit asynchronous history preparation; subsequent resolution is synchronous. */
export async function prepareCivilDay(input: CivilDayInput): Promise<void> {
  const context = contextOf(input);
  await Promise.all([context.date, context.nextDate].map((date) => prepareLocalTime(date, context.timeZone)));
}

function boundaryOf(resolution: LocalTimeResolution): CivilBoundary {
  const kind = resolution.jump?.kind;
  return Object.freeze({
    utc: kind === "gap" ? resolution.transition!.at : resolution.utc.toISOString(),
    kind: kind === "gap" ? "gap-transition" : kind === "fold" ? "earlier-midnight" : "midnight",
    resolution
  });
}

function wallDate(at: number, offsetMinutes: number): string {
  return new Date(at + Math.round(offsetMinutes * 60_000)).toISOString().slice(0, 10);
}

function unsupportedFold(resolution: LocalTimeResolution): boolean {
  if (resolution.jump?.kind !== "fold") return false;
  const transition = resolution.transition!;
  const at = Date.parse(transition.at);
  // A date-line fold repeats a date. A smaller fold can leave one date and
  // reenter it, giving disjoint pieces that a single civil window cannot hold.
  return resolution.jump.cause === "date-line" ||
    wallDate(at - 1, transition.offsetBeforeMinutes) !== wallDate(at, transition.offsetAfterMinutes);
}

/**
 * Resolve the civil-date search interval through the engine's timezone reader.
 * Await prepareCivilDay first when history is needed. Engine load errors propagate.
 * Skipped dates and date-crossing midnight folds yield no usable partial window.
 */
export function resolveCivilDay(input: CivilDayInput): CivilDayResult {
  const context = contextOf(input);
  const options = { longitude: context.observer.longitude, calendar: context.calendar };
  const resolutions = [
    resolveLocalToUtc(context.date, "00:00", context.timeZone, options),
    resolveLocalToUtc(context.nextDate, "00:00", context.timeZone, options)
  ] as const;
  if (resolutions.some(unsupportedFold)) {
    return Object.freeze({ ...context, status: "refused", reason: "date-boundary-fold", resolutions });
  }
  const start = boundaryOf(resolutions[0]);
  const end = boundaryOf(resolutions[1]);
  if (Date.parse(start.utc) >= Date.parse(end.utc) ||
      wallDate(Date.parse(start.utc), resolutions[0].offsetMinutes) !== context.date) {
    return Object.freeze({ ...context, status: "refused", reason: "skipped-date", resolutions });
  }
  return Object.freeze({ ...context, status: "ok", start, end });
}
