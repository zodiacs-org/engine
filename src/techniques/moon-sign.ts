/*
 * The Moon signs possible over a civil date when the birth time is unknown.
 * The apparent Moon never moves backwards, so the signs it occupies over a
 * span are those from its sign at the start, forward, to its sign at the end.
 * Ported from the Zodiacs.org site (src/lib/moon-certainty.ts,
 * src/lib/chart-date-certainty.ts, and untimedMoonSign in
 * src/lib/share-card.ts); see docs/techniques.md.
 */
import { dateFrom } from "../date-input.js";
import { bodyLongitude } from "../ephemeris.js";
import { resolveLocalToUtc } from "../geo/timezone.js";
import { SIGN_SLUGS, signIndexForLongitude } from "../signs.js";
import type { DateInput, ZodiacSign } from "../types.js";
import { DAY_MS, readOptions, techniqueFlags } from "./shared.js";
import type { TechniqueFlag } from "./shared.js";

const HOUR_MS = 3_600_000;

/**
 * A date in every time zone runs from 00:00 at UTC+14 to 24:00 at UTC−12. In
 * tzdata 2025c every offset lies within these bounds, but in Alaska before
 * 1867-10-19 and in the Philippines and Micronesia before 1845.
 */
export const EVERY_ZONE_OFFSETS = /*#__PURE__*/ Object.freeze({ earliestHours: 14, latestHours: -12 } as const);

/** The longest span `moonSignsBetween` accepts, days. A minor release may accept a longer one. */
export const MOON_SIGN_MAX_SPAN_DAYS: number = 20;

export interface MoonSignCandidates {
  /** YYYY-MM-DD, Gregorian. */
  readonly date: string;
  /** Null for every time zone. */
  readonly timeZone: string | null;
  /** The date's first instant, and its last: 1 ms before the next date. */
  readonly from: Date;
  readonly to: Date;
  /** Every sign the Moon is in during [from, to], in order. */
  readonly signs: readonly ZodiacSign[];
  /** The sign when there is one; otherwise null. */
  readonly sign: ZodiacSign | null;
  readonly flags: readonly TechniqueFlag[];
}

export interface MoonSignOptions {
  /** The IANA zone the date is read in; without it, every time zone. */
  timeZone?: string | undefined;
  /** The birthplace, degrees east, for its own mean time (as `resolveLocalToUtc`). */
  longitude?: number | undefined;
}

function signsOver(fromT: number, toT: number): ZodiacSign[] {
  const first = signIndexForLongitude(bodyLongitude("Moon", new Date(fromT)));
  const last = signIndexForLongitude(bodyLongitude("Moon", new Date(toT)));
  const count = (last - first + 12) % 12;
  return Array.from({ length: count + 1 }, (_, step) => SIGN_SLUGS[(first + step) % 12]!);
}

/** Every sign the apparent Moon is in during [from, to], at most 20 days, in order. */
export function moonSignsBetween(from: DateInput, to: DateInput): readonly ZodiacSign[] {
  const fromT = dateFrom(from, "from").getTime();
  const toT = dateFrom(to, "to").getTime();
  if (fromT > toT) throw new RangeError("from must not be after to.");
  if (toT - fromT > MOON_SIGN_MAX_SPAN_DAYS * DAY_MS) throw new RangeError(`The span must not exceed ${MOON_SIGN_MAX_SPAN_DAYS} days.`);
  return Object.freeze(signsOver(fromT, toT));
}

function civilDate(value: unknown): { year: number; month: number; day: number } {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value) : null;
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const check = new Date(0);
    check.setUTCFullYear(year, month - 1, day);
    if (check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day) return { year, month, day };
  }
  throw new RangeError("date must be a Gregorian calendar date, YYYY-MM-DD.");
}

function isoDate(year: number, month: number, day: number): string {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The Moon signs possible over a civil date with an unknown birth time. With
 * `timeZone`, from local midnight to local midnight, read as
 * `resolveLocalToUtc` (`@zodiacs/engine/geo`) reads them; before 1970, await
 * its `prepareLocalTime` first, or it throws geo's ZoneHistoryNotLoadedError,
 * an Error and not a RangeError. Without, in every time zone: `sign` is set
 * only when the Moon held it the whole date everywhere.
 */
export function moonSignCandidates(date: string, options?: MoonSignOptions): MoonSignCandidates {
  const read = readOptions(options, ["timeZone", "longitude"], "moonSignCandidates options");
  const { year, month, day } = civilDate(date);
  const timeZone = read.timeZone;
  if (timeZone !== undefined && typeof timeZone !== "string") throw new RangeError("timeZone must be a string.");
  if (read.longitude !== undefined && timeZone === undefined) throw new RangeError("longitude needs a timeZone.");
  let fromT: number;
  let toT: number;
  if (timeZone === undefined) {
    const noon = new Date(0);
    noon.setUTCFullYear(year, month - 1, day);
    const noonT = noon.setUTCHours(12, 0, 0, 0);
    fromT = noonT - (12 + EVERY_ZONE_OFFSETS.earliestHours) * HOUR_MS;
    toT = noonT + (12 - EVERY_ZONE_OFFSETS.latestHours) * HOUR_MS - 1;
  } else {
    const local = read.longitude === undefined ? undefined : { longitude: read.longitude as number };
    fromT = resolveLocalToUtc(isoDate(year, month, day), "00:00", timeZone, local).utc.getTime();
    toT = resolveLocalToUtc(isoDate(year, month, day + 1), "00:00", timeZone, local).utc.getTime() - 1;
    if (toT < fromT) throw new RangeError("The date did not occur in that time zone.");
  }
  const signs = signsOver(fromT, toT);
  return Object.freeze({
    date: isoDate(year, month, day),
    timeZone: timeZone ?? null,
    from: new Date(fromT),
    to: new Date(toT),
    signs: Object.freeze(signs),
    sign: signs.length === 1 ? signs[0]! : null,
    flags: techniqueFlags([fromT, toT])
  });
}
