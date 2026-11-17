// The local clock: how a wall time is read on the shipped history before 1970 and on the host's Intl from
// 1970, without the host check. src/geo/timezone.ts adds the check and re-exports these names; the
// techniques entry's moonSignCandidates reads its instants here (readLocalTime), so that the check's probe
// table stays out of that entry's import graph.
import type { HouseSystem } from "../types.js";
import type { NatalLocalResolution } from "../receipt.js";
import { civilDateOf, julianDayNumber, parseCalendarDate } from "../civil-calendar.js";
import type { CalendarName } from "../civil-calendar.js";
import { GREGORIAN_ADOPTION, checkCalendarCountry, gregorianAdoption, noteFor, zoneAdoption } from "./calendar.js";
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
  /**
   * ISO 3166-1 alpha-2 code, or the country's name in tzdata's iso3166.tab, for `calendarNote`. Without a country
   * the table dates, a date that one of the adoption table's changeovers skipped, and the zone does not rule out,
   * is flagged "calendar-unknown" (docs/time.md).
   */
  country?: string | undefined;
  /**
   * Which instant a wall time the clock showed twice takes: "earlier" (the
   * default), its first pass, or "later", its second. It changes nothing for
   * any other wall time; a skipped one moves forward either way.
   */
  fold?: FoldChoice | undefined;
}

/** The pass of a repeated wall time to take: the first ("earlier") or the second ("later"). */
export type FoldChoice = "earlier" | "later";

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
  /**
   * A gap or fold of any cause ("dst-" names kept for compatibility; see `jump`), a local mean time clock, and
   * "calendar-unknown": no `country` the table dates, and a date that one of the adoption table's changeovers
   * skipped and the zone does not rule out, so whether it was in civil use where it was written is not known
   * (docs/time.md). "host-zone-data-differs": the host's Intl answered, and at an instant within 36 hours of a
   * span in which the time zone database changed between tzdata 2021a and the release `zone.hostCheck` names, it
   * gave another offset than that release does; the instant returned is still the host's (docs/time.md).
   */
  flags: ("dst-gap" | "dst-fold" | "lmt" | "calendar-unknown" | "host-zone-data-differs")[];
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
    /** Set where the host's Intl answered: whether its offset matches the pinned tzdb release (docs/time.md). */
    hostCheck?: HostZoneCheck;
  };
  /** The host's offset where the shipped history answered, as a cross-check. */
  intlOffsetMinutes: number | null;
  calendarNote: CalendarNote | null;
  /** For `createNatalEnvelope`'s `localResolution`. */
  localResolution: NatalLocalResolution;
}

/**
 * How the host's time zone data compares with the pinned tzdb release near a wall time the host's Intl read.
 * "unchecked": no span in which tzdata 2021a and the pinned release differ lies within 36 hours of the
 * instant (or the instant is before 1970, or the zone is a fixed one). Otherwise the host was asked for its
 * offset at `probe`, an instant inside each such span: "current" when it gave the pinned release's offset at
 * every probe, "differs" when it did not at one (the chart is flagged "host-zone-data-differs"), and "newer"
 * when it did not but the runtime names a tzdb release later than the pinned one (Node does; browsers do not),
 * which may know a rule the pinned release does not, so nothing is flagged.
 */
export type HostZoneCheck =
  | { status: "unchecked" }
  | {
      status: "current" | "differs" | "newer";
      /** UTC, ISO 8601: the instant the host was asked about (the first that disagreed, else the first asked). */
      probe: string;
      /** The host's offset at `probe`, minutes east. */
      hostOffsetMinutes: number;
      /** The pinned release's offset at `probe`, minutes east. */
      tzdbOffsetMinutes: number;
      /** The pinned release, such as "2026f". */
      tzdbVersion: string;
    };

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
  /** Which pass of a repeated wall time the birth was in; "earlier" by default (as `LocalTimeOptions`). */
  fold?: FoldChoice;
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

/**
 * UTC offset for an IANA timezone at a UTC instant, minutes east, from the
 * host's Intl: a cross-check on the host's time-zone data. zoneOffsetAt is the
 * engine's own answer, the one its wall times use; the two agree from 1970
 * where the host has tzdata 2025c, and before 1970 they can differ, because
 * Intl does not carry the history this package ships.
 */
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

export const DAY = 86_400_000;
/** Offsets are sampled this far either side of a wall time. */
export const PROBE = 36 * 3_600_000;
/** A longitude this far from the zone's own mean time belongs to another zone (Gar under Shanghai is 165 min). */
const MAX_DEPARTURE_SECONDS = 180 * 60;
/** Names with one offset for all time need no history. */
export const FIXED_ZONE = /^(?:etc\/)?(?:utc|uct|gmt|gmt0|gmt[+-]0|greenwich|universal|zulu)$|^etc\/gmt[+-]\d{1,2}$/iu;

/** The host's tzdb version where the runtime exposes it (Node does). */
function hostTzdbVersion(): string | null {
  const tz = (globalThis as { process?: { versions?: { tz?: unknown } } }).process?.versions?.tz;
  return typeof tz === "string" && /^\d{4}[a-z]$/u.test(tz) ? tz : null;
}

/** The host as the geo entry reads it: the real Intl and version, or a test's stand-in (setHostForTests). @internal */
export interface Host {
  offsetAt: (timeZone: string, utcMilliseconds: number) => number;
  tzdbVersion: () => string | null;
}
const REAL_HOST: Host = { offsetAt, tzdbVersion: hostTzdbVersion };
let host: Host = REAL_HOST;

/**
 * Tests only, not exported by any entry point: replace the host's Intl offset and tzdb version for every
 * reading of the geo entry; null restores the real host. A new host starts with no remembered probe answers.
 * @internal
 */
export function setHostForTests(replacement: Partial<Host> | null): void {
  host = replacement ? { ...REAL_HOST, ...replacement } : REAL_HOST;
}

/** The host in use (src/geo/host-check.ts asks it). @internal */
export function currentHost(): Host {
  return host;
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
 * takes the earlier instant or, with `fold` "later", the later one, and a
 * skipped one moves forward by the offset the clock showed just before it
 * jumped, at `at`, whatever `fold` says.
 */
function readClock(wallMs: number, clockAt: Clock, samples: readonly number[], fold: FoldChoice) {
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
      ? { chosen: fold === "later" ? second : first, kind: "fold" as const, at: firstChange(clockAt, first.utcMs, second.utcMs) }
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
    return offset ?? Math.round(host.offsetAt(timeZone, ms) * 60);
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

function readOptions(options: unknown = {}): LocalTimeOptions & { calendar: CalendarName; fold: FoldChoice } {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new RangeError("options must be an object.");
  }
  for (const key of Object.getOwnPropertyNames(options)) {
    if (!["longitude", "calendar", "country", "fold"].includes(key)) throw new RangeError(`Unknown local time option "${key}".`);
  }
  const { longitude, calendar = "gregorian", country, fold = "earlier" } = options as Record<string, unknown>;
  if (longitude !== undefined && !(typeof longitude === "number" && Math.abs(longitude) <= 180)) {
    throw new RangeError("longitude must be between -180 and 180 degrees.");
  }
  // An absent country is allowed; the checks are calendarNote's, shared to keep the entry's size.
  checkCalendarCountry(calendar, country === undefined ? "-" : country);
  if (fold !== "earlier" && fold !== "later") throw new RangeError('fold must be "earlier" or "later".');
  return { longitude: longitude as number | undefined, calendar: calendar as CalendarName, country: country as string | undefined, fold };
}

const pad = (value: number, width = 2): string => String(value).padStart(width, "0");

/**
 * `resolveLocalToUtc` without the host check: no `zone.hostCheck`, never the flag "host-zone-data-differs", and
 * no probe asked. For callers inside the package that keep only the instant (the techniques entry's
 * `moonSignCandidates`), so that the probe table stays out of their import graph.
 * @internal
 */
export function readLocalTime(
  date: string,
  time: string,
  timeZone: string,
  options?: LocalTimeOptions
): LocalTimeResolution {
  offsetFormatter(timeZone);
  const { longitude, calendar, country, fold } = readOptions(options);
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
  if (loaded === undefined && wallMs < DAY) throw new ZoneHistoryNotLoadedError();
  const history = loaded ?? null;
  const zoneAt = zoneClock(timeZone, history);
  const place = longitude !== undefined && history ? birthplaceClock(history, wallMs, longitude, zoneAt) : null;
  const samples = [wallMs - PROBE, wallMs, wallMs + PROBE, ...(place ? [place.endMs - 1, place.endMs, place.legalFrom] : [])];
  const clockAt = place ? place.clockAt : zoneAt;
  const zoneReading = readClock(wallMs, zoneAt, samples, fold);
  const reading = place ? readClock(wallMs, clockAt, samples, fold) : zoneReading;
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
  const flags: LocalTimeResolution["flags"] = kind ? [`dst-${kind}`] : [];
  if (lmt) flags.push("lmt");
  // A date written in the days a changeover of the adoption table skipped, after its last Old Style day and
  // before its first New Style day, in either calendar, was not in civil use in that country and may have been
  // elsewhere. With a country the table dates, calendarNote says which. Without one (no country, or one the table
  // does not date), the zone narrows the changeovers that can apply: the capital zone of 12 of the tabled
  // countries follows that country's alone (zoneAdoption, which says why not the other six), and a changeover
  // after 1800 (Russia's, 1918) applies only in a zone under Europe/ or Asia/, or one that names no place
  // (docs/time.md).
  if (!(country && gregorianAdoption(country))) {
    const own = zoneAdoption(timeZone);
    const near = /^(europe|asia|etc)\/|^[^/]+$/i.test(timeZone);
    if ((own ? [own] : GREGORIAN_ADOPTION).some((r) => date > r.lastJulian && date < r.firstGregorian && (near || r.firstGregorian < "1800")))
      flags.push("calendar-unknown");
  }
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
    : { source: "intl", tzdbVersion: host.tzdbVersion(), dataForm: "host", abbreviation: null, dst: null };
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
    intlOffsetMinutes: shipped ? host.offsetAt(timeZone, chosen.utcMs) : null,
    calendarNote: country === undefined ? null : noteFor(gregorianDate, calendar, country),
    localResolution: {
      date: gregorianDate,
      time,
      timeZone,
      offsetMinutes,
      gapShiftMinutes: kind === "gap" && transition ? transition.offsetAfterMinutes - transition.offsetBeforeMinutes : 0,
      policy: { fold: kind === "fold" ? fold : "earlier", gap: "shift-forward" },
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
  if (loaded === undefined && utcMilliseconds < 0) throw new ZoneHistoryNotLoadedError();
  return zoneClock(timeZone, loaded ?? null)(utcMilliseconds) / 60;
}

/**
 * Thrown when an answer needs a zone's history before 1970 and
 * `prepareLocalTime` has not loaded it. An Error, not a RangeError: the input
 * is valid, and awaiting `prepareLocalTime(date, timeZone)` first answers it.
 */
export class ZoneHistoryNotLoadedError extends Error {
  override readonly name = "ZoneHistoryNotLoadedError";

  constructor() {
    super("The zone's history before 1970 is not loaded: await prepareLocalTime(date, timeZone) first.");
  }
}

