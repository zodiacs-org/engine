import type { BirthInput, HouseSystem } from "../types.js";
import type { NatalLocalResolution } from "../receipt.js";
import { validateBirthSettings } from "../birth-input.js";
import { civilDateOf, julianDayNumber, parseCalendarDate } from "../civil-calendar.js";
import type { CalendarName } from "../civil-calendar.js";
import { calendarNote } from "./calendar.js";
import type { CalendarNote } from "./calendar.js";
import { TZDB, laterCause, loadHistory, loadedHistory, transitionAt, typeIndexAt } from "./zone-history.js";
import type { TransitionCause, ZoneHistory } from "./zone-history.js";

export type { TransitionCause };

/** How to read a wall time (docs/time.md). Unknown keys and values throw RangeError. */
export interface LocalTimeOptions {
  /** The birthplace, degrees east: its own mean time replaces the zone's local mean time. */
  longitude?: number | undefined;
  /** The calendar `date` is written in; "gregorian" by default. */
  calendar?: CalendarName | undefined;
  /** ISO 3166-1 alpha-2 code, or the country's name in tzdata's iso3166.tab, for `calendarNote`. */
  country?: string | undefined;
}

/** A change of the clock that read the wall time. */
export interface ZoneTransition {
  /** UTC, ISO 8601. */
  at: string;
  offsetBeforeMinutes: number;
  offsetAfterMinutes: number;
  cause: TransitionCause;
}

/** A wall time resolved; docs/time.md describes every field. */
export interface LocalTimeResolution {
  utc: Date;
  /** Minutes east at the resolved instant; may be fractional. */
  offsetMinutes: number;
  /** A gap or fold of any cause ("dst-" names kept for compatibility; see `jump`), and a local mean time clock. */
  flags: ("dst-gap" | "dst-fold" | "lmt")[];
  /** The proleptic Gregorian date resolved. */
  date: string;
  writtenDate: string;
  calendar: CalendarName;
  jump: { kind: "gap" | "fold"; cause: TransitionCause } | null;
  /** The transition behind the offset, where known. */
  transition: ZoneTransition | null;
  /** Set where the birthplace's own mean time read the wall time. */
  localMeanTime: { longitude: number; zoneOffsetMinutes: number } | null;
  zone: {
    source: "tzdb" | "intl";
    tzdbVersion: string | null;
    dataForm: "main+backzone" | "main" | "host";
    abbreviation: string | null;
    dst: boolean | null;
  };
  /** The host's offset where the shipped history answered, as a cross-check. */
  intlOffsetMinutes: number | null;
  calendarNote: CalendarNote | null;
  /** For `createNatalEnvelope`'s `localResolution`. */
  localResolution: NatalLocalResolution;
}

export interface LocalBirthInput {
  /** YYYY-MM-DD, in `calendar`. */
  date: string;
  /** Local 24-hour wall time. Defaults to noon when `timeKnown` is false. */
  time?: string;
  timeZone: string;
  latitude?: number;
  /** Also the birthplace's longitude for local mean time. */
  longitude?: number;
  houseSystem?: HouseSystem;
  timeKnown?: boolean;
  calendar?: CalendarName;
  country?: string;
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function validateTimeZone(timeZone: string): void {
  if (typeof timeZone !== "string" || timeZone.trim().length === 0) {
    throw new RangeError("timeZone must be an explicit nonempty timezone string.");
  }
}

function offsetFormatter(timeZone: string): Intl.DateTimeFormat {
  validateTimeZone(timeZone);
  let formatter = offsetFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      timeZoneName: "longOffset"
    });
    offsetFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function validateInstant(utcMilliseconds: number): void {
  if (typeof utcMilliseconds !== "number" || !Number.isFinite(utcMilliseconds)) {
    throw new RangeError("utcMilliseconds must be a finite epoch-millisecond timestamp.");
  }
}

/** UTC offset for an IANA timezone at a UTC instant, from the host's Intl. */
export function offsetAt(timeZone: string, utcMilliseconds: number): number {
  validateInstant(utcMilliseconds);
  const name = offsetFormatter(timeZone)
    .formatToParts(utcMilliseconds)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = (name ?? "GMT").match(/^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?)?$/u);
  if (!match) {
    throw new RangeError(`Could not read UTC offset for timezone: ${timeZone}`);
  }
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) + Number(match[4] ?? 0) / 60);
}

const DAY = 86_400_000;
/** Offsets are sampled this far either side of a wall time. */
const PROBE = 36 * 3_600_000;
/** A longitude this far from the zone's own mean time belongs to another zone (Gar under Shanghai is 165 min). */
const MAX_DEPARTURE_SECONDS = 180 * 60;
/** Names with one offset for all time need no history. */
const FIXED_ZONE = /^(?:etc\/)?(?:utc|uct|gmt|gmt0|gmt[+-]0|greenwich|universal|zulu)$|^etc\/gmt[+-]\d{1,2}$/iu;

/** The host's tzdb version where the runtime exposes it (Node does). */
function hostTzdbVersion(): string | null {
  const tz = (globalThis as { process?: { versions?: { tz?: unknown } } }).process?.versions?.tz;
  return typeof tz === "string" && /^\d{4}[a-z]$/u.test(tz) ? tz : null;
}

/** Seconds east at a UTC instant, ms. */
type Clock = (ms: number) => number;
interface Reading {
  utcMs: number;
  offset: number;
}

/** The first instant in (lo, hi] whose offset differs from lo's. */
function firstChange(clockAt: Clock, lo: number, hi: number): number {
  const from = clockAt(lo);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (clockAt(mid) === from) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * Reads a wall time on a clock: its readings are enumerated, a repeated one
 * takes the earlier instant, and a skipped one moves forward by the offset
 * the clock showed just before it jumped, at `at`.
 */
function readClock(wallMs: number, clockAt: Clock, samples: readonly number[]) {
  const readings: Reading[] = [];
  for (const offset of new Set(samples.map(clockAt))) {
    const utcMs = wallMs - offset * 1000;
    if (clockAt(utcMs) === offset && !readings.some((reading) => reading.utcMs === utcMs)) {
      readings.push({ utcMs, offset });
    }
  }
  const [first, second] = readings.sort((a, b) => a.utcMs - b.utcMs);
  if (first) {
    return second
      ? { chosen: first, kind: "fold" as const, at: firstChange(clockAt, first.utcMs, second.utcMs) }
      : { chosen: first, kind: null, at: null };
  }
  let lo = wallMs - PROBE - DAY;
  let hi = wallMs + PROBE + DAY;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (mid + clockAt(mid) * 1000 > wallMs) hi = mid;
    else lo = mid;
  }
  const utcMs = wallMs - clockAt(lo) * 1000;
  return { chosen: { utcMs, offset: clockAt(utcMs) }, kind: "gap" as const, at: hi };
}

/** The zone's own clock: the shipped history before 1970 where it has a local time, Intl otherwise. */
function zoneClock(timeZone: string, history: ZoneHistory | null): Clock {
  return (ms) => {
    const offset = history && ms < 0 ? history.offsets[history.types[typeIndexAt(history, ms)]!] : null;
    return offset ?? Math.round(offsetAt(timeZone, ms) * 60);
  };
}

/**
 * The birthplace's clock where it differs from the zone's: before the zone's
 * local mean time era ended, the birthplace's own mean time, on the side of
 * the date line the zone kept then; after it, the zone's legal clock. Null
 * well after the era, or for a longitude hours from the zone's own mean time
 * (a birthplace in another zone).
 */
function birthplaceClock(history: ZoneHistory, wallMs: number, longitude: number, zoneAt: Clock) {
  const era = history.era;
  if (!era) return null;
  const endMs = era[era.length - 1]![0];
  if (wallMs - PROBE > endMs) return null;
  const meanSeconds = Math.round(longitude * 240);
  const eraOffset = (ms: number): number => (era.find(([until]) => ms < until) ?? era[era.length - 1]!)[1];
  const place = (ms: number): number => meanSeconds + Math.round((eraOffset(ms) - meanSeconds) / 86_400) * 86_400;
  const sample = Math.min(wallMs, endMs - 1);
  if (Math.abs(place(sample) - eraOffset(sample)) > MAX_DEPARTURE_SECONDS) return null;
  // The host's history can record the change out of the era later than
  // backzone does, with another city's offset in between: then the
  // birthplace went straight to the later offset.
  const legalFrom =
    history.hostLegal && zoneAt(endMs + PROBE) !== zoneAt(endMs) ? firstChange(zoneAt, endMs, endMs + PROBE) : endMs;
  return {
    clockAt: (ms: number) => (ms < endMs ? place(ms) : zoneAt(Math.max(ms, legalFrom))),
    endMs,
    legalFrom,
    /** The era's own line ends before endMs: moves across the date line. */
    lineEnds: era.slice(0, -1).map(([until]) => until)
  };
}

function readOptions(options: unknown): LocalTimeOptions & { calendar: CalendarName } {
  if (options === undefined) return { calendar: "gregorian" };
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new RangeError("options must be an object.");
  }
  for (const key of Object.getOwnPropertyNames(options)) {
    if (!["longitude", "calendar", "country"].includes(key)) throw new RangeError(`Unknown local time option "${key}".`);
  }
  const { longitude, calendar = "gregorian", country } = options as Record<string, unknown>;
  if (longitude !== undefined && !(typeof longitude === "number" && Math.abs(longitude) <= 180)) {
    throw new RangeError("longitude must be between -180 and 180 degrees.");
  }
  if (calendar !== "gregorian" && calendar !== "julian") throw new RangeError('calendar must be "gregorian" or "julian".');
  if (country !== undefined && (typeof country !== "string" || !country.trim())) {
    throw new RangeError("country must be a nonempty string.");
  }
  return { longitude: longitude as number | undefined, calendar, country: country as string | undefined };
}

const pad = (value: number, width = 2): string => String(value).padStart(width, "0");

/**
 * Resolve a local wall time in an IANA zone to UTC: a repeated one takes the
 * earlier instant, a skipped one moves forward by the jump. Before 1970 the
 * shipped tzdb 2025c history answers, loaded by `prepareLocalTime` (a wall
 * time before 1970-01-02 throws otherwise); from 1970, and in the fixed Etc
 * zones, the host's Intl.
 */
export function resolveLocalToUtc(
  date: string,
  time: string,
  timeZone: string,
  options?: LocalTimeOptions
): LocalTimeResolution {
  offsetFormatter(timeZone);
  const { longitude, calendar, country } = readOptions(options);
  const written = parseCalendarDate(date, calendar);
  const hhmm = typeof time === "string" ? /^([01]\d|2[0-3]):([0-5]\d)$/u.exec(time) : null;
  if (!written || !hhmm) {
    throw new RangeError(`Local date/time must be a ${calendar === "julian" ? "Julian" : "Gregorian"} date YYYY-MM-DD and a time HH:MM.`);
  }
  const civil = calendar === "julian" ? civilDateOf(julianDayNumber(written, "julian"), "gregorian") : written;
  if (civil.year < 0) throw new RangeError("The Julian date falls before the Gregorian year 0000.");
  const gregorianDate = `${pad(civil.year, 4)}-${pad(civil.month)}-${pad(civil.day)}`;
  // setUTCFullYear keeps years 0000–0099, which Date.UTC would move to the 1900s.
  const wall = new Date(0);
  wall.setUTCFullYear(civil.year, civil.month - 1, civil.day);
  const wallMs = wall.setUTCHours(Number(hhmm[1]), Number(hhmm[2]));

  const loaded = FIXED_ZONE.test(timeZone) ? null : loadedHistory(timeZone);
  // From 1970-01-02 on a wall time never reads before 1970.
  if (loaded === undefined && wallMs < DAY) throw notLoaded();
  const history = loaded ?? null;
  const zoneAt = zoneClock(timeZone, history);
  const place = longitude !== undefined && history ? birthplaceClock(history, wallMs, longitude, zoneAt) : null;
  const samples = [wallMs - PROBE, wallMs, wallMs + PROBE, ...(place ? [place.endMs - 1, place.endMs, place.legalFrom] : [])];
  const clockAt = place ? place.clockAt : zoneAt;
  const zoneReading = readClock(wallMs, zoneAt, samples);
  const reading = place ? readClock(wallMs, clockAt, samples) : zoneReading;
  const { chosen, kind } = reading;

  // The shipped history answered where the instant is in the birthplace's era, or before 1970 with a local time there.
  const inEra = !!place && chosen.utcMs < place.endMs;
  const count = history && chosen.utcMs < 0 ? typeIndexAt(history, chosen.utcMs) : -1;
  const type = count < 0 ? -1 : history!.types[count]!;
  const shipped = inEra || (type >= 0 && history!.offsets[type] !== null);

  // The transition behind the offset: the jump's, or the last change recorded before the instant.
  let applied = reading.at;
  if (applied === null && shipped) {
    const recorded = count > 0 ? history!.times[count - 1]! : null;
    const marks = place ? [...place.lineEnds, place.endMs, place.legalFrom].filter((at) => at <= chosen.utcMs) : [];
    if (recorded !== null && (!place || recorded >= place.legalFrom)) marks.push(recorded);
    applied = marks.length ? Math.max(...marks) : null;
  }
  let transition: ZoneTransition | null = null;
  if (applied !== null) {
    const at = applied;
    const before = clockAt(at - 1);
    const after = clockAt(at);
    const recorded = history && at < 0 ? transitionAt(history, at) : -1;
    transition = {
      at: new Date(at).toISOString(),
      offsetBeforeMinutes: before / 60,
      offsetAfterMinutes: after / 60,
      cause:
        Math.abs(after - before) >= 43_200
          ? "date-line"
          : place && (at === place.endMs || at === place.legalFrom)
            ? "legal-change"
            : recorded >= 0
              ? history!.causes[recorded]!
              : laterCause(timeZone, at)
    };
  }

  const lmt = inEra || (!place && history?.zoneEraEnd != null && chosen.utcMs < history.zoneEraEnd);
  const flags: LocalTimeResolution["flags"] = kind ? [kind === "gap" ? "dst-gap" : "dst-fold"] : [];
  if (lmt) flags.push("lmt");
  const localMeanTime =
    longitude !== undefined && place && (inEra || (kind === "gap" && reading.at === place.endMs))
      ? { longitude, zoneOffsetMinutes: zoneReading.chosen.offset / 60 }
      : null;
  const zone: LocalTimeResolution["zone"] = shipped
    ? {
        source: "tzdb",
        tzdbVersion: TZDB.version,
        dataForm: history!.hostLegal ? "main" : "main+backzone",
        abbreviation: inEra ? null : history!.abbreviations[type]!,
        dst: !inEra && history!.dst[type]!
      }
    : { source: "intl", tzdbVersion: hostTzdbVersion(), dataForm: "host", abbreviation: null, dst: null };
  const offsetMinutes = chosen.offset / 60;
  return {
    utc: new Date(chosen.utcMs),
    offsetMinutes,
    flags,
    date: gregorianDate,
    writtenDate: date,
    calendar,
    jump: kind && transition ? { kind, cause: transition.cause } : null,
    transition,
    localMeanTime,
    zone,
    intlOffsetMinutes: shipped ? offsetAt(timeZone, chosen.utcMs) : null,
    calendarNote: country === undefined ? null : calendarNote(gregorianDate, calendar, country),
    localResolution: {
      date: gregorianDate,
      time,
      timeZone,
      offsetMinutes,
      gapShiftMinutes: kind === "gap" && transition ? transition.offsetAfterMinutes - transition.offsetBeforeMinutes : 0,
      policy: { fold: "earlier", gap: "shift-forward" },
      calendar,
      writtenDate: date,
      tzdbVersion: zone.tzdbVersion,
      dataForm: zone.dataForm,
      clock: lmt ? "local-mean-time" : "legal",
      transition,
      localMeanTime
    }
  };
}

/**
 * Load what a wall time on `date` (YYYY-MM-DD) in `timeZone` needs: up to
 * 1970, the zone's shipped history (one of 16 buckets). A failed load rejects
 * and is not remembered.
 */
export function prepareLocalTime(date: string, timeZone: string): Promise<void> {
  try {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new RangeError("date must be YYYY-MM-DD.");
    offsetFormatter(timeZone);
  } catch (error) {
    return Promise.reject(error);
  }
  return Number(date.slice(0, 4)) > 1970 || FIXED_ZONE.test(timeZone) ? Promise.resolve() : loadHistory(timeZone);
}

/**
 * The zone's own offset at a UTC instant, minutes east: before 1970 the
 * shipped history, which `prepareLocalTime` must have loaded, as for
 * `resolveLocalToUtc` (an instant before 1970 throws until it has); from 1970,
 * and in the fixed zones, Intl.
 */
export function zoneOffsetAt(timeZone: string, utcMilliseconds: number): number {
  validateInstant(utcMilliseconds);
  offsetFormatter(timeZone);
  const loaded = FIXED_ZONE.test(timeZone) ? null : loadedHistory(timeZone);
  if (loaded === undefined && utcMilliseconds < 0) throw notLoaded();
  return zoneClock(timeZone, loaded ?? null)(utcMilliseconds) / 60;
}

/** The shipped history answers before 1970 only once `prepareLocalTime` has loaded it. */
function notLoaded(): Error {
  return new Error("The zone's history before 1970 is not loaded: await prepareLocalTime(date, timeZone) first.");
}

const LOCAL_BIRTH_KEYS = [
  "date",
  "time",
  "timeZone",
  "latitude",
  "longitude",
  "houseSystem",
  "timeKnown",
  "calendar",
  "country"
] as const;

/** A local birth resolved, with how its wall time was read and the receipt's `reference`. */
export interface LocalBirthResolution {
  birth: BirthInput;
  resolution: LocalTimeResolution;
  reference: "supplied-instant" | "local-noon";
}

/** Convert a local birth form into the core input, keeping how its wall time was read. */
export function resolveLocalBirth(input: LocalBirthInput): LocalBirthResolution {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RangeError("birth must be an object containing a local date and timezone.");
  }
  for (const key of Object.getOwnPropertyNames(input)) {
    if (!(LOCAL_BIRTH_KEYS as readonly string[]).includes(key)) throw new RangeError(`Unknown local birth field "${key}".`);
  }
  // One read of each field.
  const fields = Object.fromEntries(LOCAL_BIRTH_KEYS.map((key) => [key, input[key]])) as unknown as LocalBirthInput;
  const settings = validateBirthSettings(fields);
  const time = fields.time;
  const timeKnown = settings.timeKnown ?? time !== undefined;
  if (timeKnown && time === undefined) {
    throw new RangeError("time is required when timeKnown is true.");
  }
  const resolution = resolveLocalToUtc(fields.date, time === undefined ? "12:00" : time, fields.timeZone, {
    longitude: settings.longitude,
    calendar: fields.calendar,
    country: fields.country
  });
  return {
    birth: {
      utc: resolution.utc,
      timeKnown,
      houseSystem: settings.houseSystem ?? "whole",
      flags: resolution.flags,
      ...(settings.latitude === undefined ? {} : { latitude: settings.latitude, longitude: settings.longitude })
    },
    resolution,
    reference: time === undefined ? "local-noon" : "supplied-instant"
  };
}

/** Convert a local birth form into the explicit UTC input accepted by the core. */
export function resolveBirth(input: LocalBirthInput): BirthInput {
  return resolveLocalBirth(input).birth;
}
