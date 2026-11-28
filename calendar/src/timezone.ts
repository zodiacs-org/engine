import { createHash } from "node:crypto";
import { Instant, ZoneId, ZoneRulesProvider } from "@js-joda/core";
import "@js-joda/timezone";
import { escapeText, utcDateTime } from "./content-line.js";
import type { CalendarTimeZone } from "./types.js";

const DAY = 86_400_000;
// Leave room for padding/local dates. Some clients remap years 00-99 to 1900-99.
// The pinned full timezone bundle has explicit future transitions through 2499.
const FIRST = "0100-01-04T00:00:00.000Z";
const LAST = "2499-12-29T23:59:59.999Z";
const MAX_TRANSITIONS = 2048;
// SHA-256 of JSON.stringify(getTzdbData()) from the pinned full 3.1.0 bundle.
// Reduced bundles share its version label but cannot answer the same dates.
const TZDB_DIGEST = "0eb88046ca77dc8cfa4bd1bfa2ab4694e28b8a138821e5fff38e9b950370ceed";

interface OffsetChange {
  readonly at: number;
  readonly before: number;
  readonly after: number;
  readonly daylight: boolean;
}

interface Snapshot {
  readonly start: number;
  readonly end: number;
  readonly initial: OffsetChange;
  readonly changes: readonly OffsetChange[];
  readonly subMinute: boolean;
  readonly offsetOutsideClientRange: boolean;
}

const snapshots = new WeakMap<CalendarTimeZone, Snapshot>();

/** Capture timezone rules once; no host-ICU sampling or event search is involved. */
export function createCalendarTimeZone(tzid: string, startUtc: string, endUtc: string): CalendarTimeZone {
  utcDateTime(startUtc);
  utcDateTime(endUtc);
  if (startUtc > endUtc || startUtc < FIRST || endUtc > LAST) {
    throw new RangeError(`Timezone coverage must be ordered and within ${FIRST} to ${LAST}.`);
  }
  // Use database names only. This also makes TZID safe as an unquoted parameter.
  if (typeof tzid !== "string" || !/^[A-Za-z0-9_+/-]+$/u.test(tzid) ||
      !ZoneRulesProvider.getAvailableZoneIds().includes(tzid)) {
    throw new RangeError("Expected an IANA timezone identifier in the bundled database.");
  }
  const provider = ZoneRulesProvider as typeof ZoneRulesProvider & {
    getTzdbData(): { version: string };
  };
  const data = provider.getTzdbData();
  const tzdbVersion = data.version;
  if (tzdbVersion !== "2026e" || createHash("sha256").update(JSON.stringify(data)).digest("hex") !== TZDB_DIGEST) {
    throw new RangeError("Calendar timezone data must be the pinned full 2026e bundle.");
  }
  const rules = ZoneId.of(tzid).rules();
  const start = Date.parse(startUtc);
  const end = Date.parse(endUtc);
  const paddedStart = Math.floor(start / 1000) * 1000 - 2 * DAY;
  const paddedEnd = Math.floor(end / 1000) * 1000 + 2 * DAY;
  let cursor = Instant.ofEpochMilli(paddedStart);
  const initialOffset = rules.offsetOfInstant(cursor).totalSeconds();
  const initial = {
    at: paddedStart, before: initialOffset, after: initialOffset,
    daylight: rules.isDaylightSavings(cursor)
  };
  const changes: OffsetChange[] = [];
  while (true) {
    const next = rules.nextTransition(cursor);
    if (next === null || next.instant().toEpochMilli() > paddedEnd) break;
    const at = next.instant().toEpochMilli();
    if (at <= cursor.toEpochMilli() || changes.length >= MAX_TRANSITIONS) {
      throw new RangeError("Timezone transition budget exceeded or provider failed to advance.");
    }
    changes.push({
      at,
      before: next.offsetBefore().totalSeconds(),
      after: next.offsetAfter().totalSeconds(),
      daylight: rules.isDaylightSavings(next.instant())
    });
    cursor = next.instant();
  }
  const snapshot: Snapshot = {
    start, end, initial, changes,
    subMinute: [initial, ...changes].some(({ before, after }) => before % 60 !== 0 || after % 60 !== 0),
    offsetOutsideClientRange: [initial, ...changes].some(({ before, after }) =>
      [before, after].some((offset) => offset < -12 * 3600 || offset > 14 * 3600))
  };
  const result: CalendarTimeZone = Object.freeze({ tzid, startUtc, endUtc, tzdbVersion, dataForm: "rearguard" });
  snapshots.set(result, snapshot);
  return result;
}

function snapshotOf(zone: CalendarTimeZone): Snapshot {
  const snapshot = snapshots.get(zone);
  if (!snapshot) throw new RangeError("Use a timezone returned by createCalendarTimeZone.");
  return snapshot;
}

function localDateTime(ms: number, offsetSeconds: number): string {
  return utcDateTime(new Date(ms + offsetSeconds * 1000).toISOString()).slice(0, -1);
}

function offsetText(seconds: number): string {
  const value = Math.abs(seconds);
  const two = (n: number) => String(n).padStart(2, "0");
  return (seconds < 0 ? "-" : "+") + two(Math.floor(value / 3600)) + two(value % 3600 / 60);
}

/** Logical content lines, to be folded along with the rest of the calendar. */
export function timeZoneLines(zone: CalendarTimeZone): readonly string[] {
  const snapshot = snapshotOf(zone);
  // Some clients truncate historical offset seconds. Preserve the instant in UTC.
  if (snapshot.subMinute || snapshot.offsetOutsideClientRange) return [];
  const lines = [
    "BEGIN:VTIMEZONE", `TZID:${escapeText(zone.tzid)}`,
    `X-ZODIACS-TZDB;VALUE=TEXT:${zone.tzdbVersion}`,
    "X-ZODIACS-TZDB-FORM;VALUE=TEXT:rearguard",
    `X-ZODIACS-COVERAGE-START-UTC;VALUE=TEXT:${zone.startUtc}`,
    `X-ZODIACS-COVERAGE-END-UTC;VALUE=TEXT:${zone.endUtc}`
  ];
  for (const change of [snapshot.initial, ...snapshot.changes]) {
    const kind = change.daylight ? "DAYLIGHT" : "STANDARD";
    lines.push(
      `BEGIN:${kind}`,
      // RFC 5545 3.6.5: the onset is on the clock BEFORE the transition.
      `DTSTART:${localDateTime(change.at, change.before)}`,
      `TZOFFSETFROM:${offsetText(change.before)}`,
      `TZOFFSETTO:${offsetText(change.after)}`,
      `END:${kind}`
    );
  }
  lines.push("END:VTIMEZONE");
  return lines;
}

function project(snapshot: Snapshot, utc: string): { value: string; ambiguous: boolean } {
  utcDateTime(utc);
  const ms = Date.parse(utc);
  if (ms < snapshot.start || ms > snapshot.end) {
    throw new RangeError("Event endpoint lies outside the timezone coverage.");
  }
  let lo = 0;
  let hi = snapshot.changes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (snapshot.changes[mid]!.at <= ms) lo = mid + 1;
    else hi = mid;
  }
  const offset = lo === 0 ? snapshot.initial.after : snapshot.changes[lo - 1]!.after;
  // Every backward change repeats [at - delta, at + delta) in UTC. Include both
  // occurrences because calendar clients differ in which one they select.
  const ambiguous = snapshot.changes.some(({ at, before, after }) => {
    const delta = (before - after) * 1000;
    return delta > 0 && ms >= at - delta && ms < at + delta;
  });
  return { value: localDateTime(ms, offset), ambiguous };
}

export function eventDateLines(zone: CalendarTimeZone, startUtc: string, endUtc?: string): readonly string[] {
  const snapshot = snapshotOf(zone);
  const start = project(snapshot, startUtc);
  const end = endUtc === undefined ? undefined : project(snapshot, endUtc);
  const fallback = snapshot.subMinute ? "sub-minute-offset" :
    snapshot.offsetOutsideClientRange ? "offset-outside-client-range" :
    start.ambiguous || end?.ambiguous ? "ambiguous-local-time" : undefined;
  const lines: string[] = [];
  if (fallback) {
    lines.push(`DTSTART:${utcDateTime(startUtc)}`);
    if (endUtc !== undefined) lines.push(`DTEND:${utcDateTime(endUtc)}`);
    lines.push(`X-ZODIACS-TIME-FALLBACK;VALUE=TEXT:${fallback}`);
  } else {
    lines.push(`DTSTART;TZID=${zone.tzid}:${start.value}`);
    if (end !== undefined) lines.push(`DTEND;TZID=${zone.tzid}:${end.value}`);
  }
  lines.push(
    `X-ZODIACS-TZID;VALUE=TEXT:${escapeText(zone.tzid)}`,
    `X-ZODIACS-TZDB;VALUE=TEXT:${zone.tzdbVersion}`,
    "X-ZODIACS-TZDB-FORM;VALUE=TEXT:rearguard"
  );
  return lines;
}
