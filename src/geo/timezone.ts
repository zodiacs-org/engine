import type { BirthInput, ChartFlag, HouseSystem } from "../types.js";
import { validateBirthSettings } from "../birth-input.js";

export interface LocalTimeResolution {
  utc: Date;
  /** Minutes east of UTC; may be fractional for historical local mean time. */
  offsetMinutes: number;
  flags: Extract<ChartFlag, "dst-gap" | "dst-fold" | "lmt">[];
}

export interface LocalBirthInput {
  date: string;
  /** Local 24-hour wall time. Defaults to noon when `timeKnown` is false. */
  time?: string;
  timeZone: string;
  latitude?: number;
  longitude?: number;
  houseSystem?: HouseSystem;
  timeKnown?: boolean;
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();
const wallFormatters = new Map<string, Intl.DateTimeFormat>();

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

function wallFormatter(timeZone: string): Intl.DateTimeFormat {
  validateTimeZone(timeZone);
  let formatter = wallFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      era: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });
    wallFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** UTC offset for an IANA timezone at a UTC instant. */
export function offsetAt(timeZone: string, utcMilliseconds: number): number {
  if (typeof utcMilliseconds !== "number" || !Number.isFinite(utcMilliseconds)) {
    throw new RangeError("utcMilliseconds must be a finite epoch-millisecond timestamp.");
  }
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

function wallStringAt(timeZone: string, utcMilliseconds: number): string {
  const parts = wallFormatter(timeZone).formatToParts(utcMilliseconds);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  // Intl's Gregorian calendar numbers BCE years from 1, whereas ISO/Date use
  // astronomical years (1 BCE = year 0000). Numeric year parts are not padded.
  const era = part("era");
  if (era !== "AD" && era !== "BC") {
    throw new RangeError(`Could not read Gregorian era for timezone: ${timeZone}`);
  }
  const year = era === "BC" ? 1 - Number(part("year")) : Number(part("year"));
  const isoYear =
    year >= 0 && year <= 9999
      ? String(year).padStart(4, "0")
      : `${year < 0 ? "-" : "+"}${String(Math.abs(year)).padStart(6, "0")}`;
  return `${isoYear}-${part("month").padStart(2, "0")}-${part("day").padStart(2, "0")}T${part("hour").padStart(2, "0")}:${part("minute").padStart(2, "0")}`;
}

function wallMilliseconds(date: string, time: string): number {
  if (typeof date !== "string" || typeof time !== "string") {
    throw new RangeError("Local date/time must use YYYY-MM-DD and HH:MM strings.");
  }
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  const timeMatch = time.match(/^(\d{2}):(\d{2})$/u);
  if (!dateMatch || dateMatch[0] !== date || !timeMatch || timeMatch[0] !== time) {
    throw new RangeError("Local date/time must use YYYY-MM-DD and HH:MM.");
  }
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59) {
    throw new RangeError("Local date/time contains an out-of-range field.");
  }
  // Date.UTC treats years 0–99 as 1900–1999; setUTCFullYear preserves the
  // requested proleptic Gregorian year, including year 0000's leap day.
  const check = new Date(0);
  check.setUTCFullYear(year, month - 1, day);
  check.setUTCHours(hour, minute, 0, 0);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError("Local date is not a calendar date.");
  }
  return check.getTime();
}

/**
 * Resolve a local wall time against the host runtime's IANA timezone data.
 * Folds choose the earlier instant; gaps shift forward by the clock change.
 */
export function resolveLocalToUtc(
  date: string,
  time: string,
  timeZone: string
): LocalTimeResolution {
  const localMilliseconds = wallMilliseconds(date, time);
  const wall = `${date}T${time}`;
  const sampledOffsets = [
    offsetAt(timeZone, localMilliseconds - 36 * 3_600_000),
    offsetAt(timeZone, localMilliseconds),
    offsetAt(timeZone, localMilliseconds + 36 * 3_600_000)
  ];
  const candidates = [...new Set(sampledOffsets)];
  const matches: { utcMilliseconds: number; offset: number }[] = [];

  for (const offset of candidates) {
    const utcMilliseconds = localMilliseconds - offset * 60_000;
    if (wallStringAt(timeZone, utcMilliseconds) === wall) {
      matches.push({
        utcMilliseconds,
        offset: offsetAt(timeZone, utcMilliseconds)
      });
    }
  }

  const flags: LocalTimeResolution["flags"] = [];
  let chosen: { utcMilliseconds: number; offset: number };
  if (matches.length === 1) {
    const match = matches[0];
    if (!match) throw new Error("Timezone match disappeared.");
    chosen = match;
  } else if (matches.length > 1) {
    matches.sort((a, b) => a.utcMilliseconds - b.utcMilliseconds);
    const match = matches[0];
    if (!match) throw new Error("Timezone fold match disappeared.");
    chosen = match;
    flags.push("dst-fold");
  } else {
    const before = offsetAt(timeZone, localMilliseconds - 36 * 3_600_000);
    const utcMilliseconds = localMilliseconds - before * 60_000;
    chosen = {
      utcMilliseconds,
      offset: offsetAt(timeZone, utcMilliseconds)
    };
    flags.push("dst-gap");
  }

  if (Math.abs(chosen.offset % 1) > 1e-9) flags.push("lmt");
  return {
    utc: new Date(chosen.utcMilliseconds),
    offsetMinutes: chosen.offset,
    flags
  };
}

/** Convert a local birth form into the explicit UTC input accepted by the core. */
export function resolveBirth(input: LocalBirthInput): BirthInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RangeError("birth must be an object containing a local date and timezone.");
  }
  const settings = validateBirthSettings(input);
  const time = input.time;
  const timeKnown = settings.timeKnown ?? time !== undefined;
  if (timeKnown && time === undefined) {
    throw new RangeError("time is required when timeKnown is true.");
  }
  const resolution = resolveLocalToUtc(
    input.date,
    time === undefined ? "12:00" : time,
    input.timeZone
  );
  return {
    utc: resolution.utc,
    timeKnown,
    houseSystem: settings.houseSystem ?? "whole",
    flags: resolution.flags,
    ...(settings.latitude === undefined
      ? {}
      : { latitude: settings.latitude, longitude: settings.longitude })
  };
}
