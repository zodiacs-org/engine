import { utcDateTime } from "./content-line.js";
import { streamSchedule } from "./stream.js";
import type { ScheduleStreamRequest } from "./stream.js";
import { createCalendarTimeZone } from "./timezone.js";
import type { CalendarOptions } from "./types.js";
import type { CliArguments } from "./cli-options.js";

export interface FeedConfiguration {
  readonly schema: "zodiacs-calendar-feed/1";
  readonly dtstamp: string;
  readonly schedule: Omit<ScheduleStreamRequest, "signal">;
  /** Must include full interval endpoints, which may extend beyond the range. */
  readonly timeZone?: { readonly tzid: string; readonly startUtc: string; readonly endUtc: string };
}

function object(value: unknown, allowed: readonly string[], field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) throw new TypeError(`Unexpected ${field} fields.`);
  return value as Record<string, unknown>;
}

/** Reuse adapter validation; no chart calculation or search runs here. */
export function configureFeed(value: unknown, args: CliArguments = {}): {
  request: Omit<ScheduleStreamRequest, "signal">; options: CalendarOptions;
} {
  const record = object(value, ["schema", "dtstamp", "schedule", "timeZone"], "feed configuration");
  if (record.schema !== "zodiacs-calendar-feed/1") throw new RangeError("Unsupported feed configuration schema.");
  const schedule = object(record.schedule,
    ["startUtc", "endUtc", "maxEvaluations", "windowDays", "maxBufferedEvents", "schedules"], "feed schedule");
  const request = { ...schedule, ...(args.startUtc === undefined ? {} : { startUtc: args.startUtc }),
    ...(args.endUtc === undefined ? {} : { endUtc: args.endUtc }) } as unknown as ScheduleStreamRequest;
  // Validate every configured selection, including those excluded by --select.
  streamSchedule(request);
  const dtstamp = args.dtstamp ?? record.dtstamp as string;
  utcDateTime(dtstamp);
  let timeZone: CalendarOptions["timeZone"];
  if (record.timeZone !== undefined) {
    const zone = object(record.timeZone, ["tzid", "startUtc", "endUtc"], "feed timezone");
    // Validate even with --utc, so malformed configuration is never hidden.
    timeZone = createCalendarTimeZone((args.tzid ?? zone.tzid) as string, zone.startUtc as string, zone.endUtc as string);
    if (timeZone.startUtc > request.startUtc || timeZone.endUtc < request.endUtc) {
      throw new RangeError("Timezone coverage must contain the requested search range and full interval endpoints.");
    }
  } else if (args.tzid !== undefined) {
    throw new RangeError("--tzid requires configured timezone endpoint coverage.");
  }
  const selected = args.select;
  if (selected !== undefined) {
    if (selected.some(kind => !request.schedules.some(item => item.kind === kind))) {
      throw new RangeError("--select names an event kind absent from the configuration.");
    }
    const filtered = request.schedules.filter(item => selected.includes(item.kind));
    return { request: { ...request, schedules: filtered }, options: { dtstamp,
      ...(!args.utc && timeZone !== undefined ? { timeZone } : {}) } };
  }
  return { request, options: { dtstamp, ...(!args.utc && timeZone !== undefined ? { timeZone } : {}) } };
}
