import { label, validateReceipt } from "./validation.js";
import { canonicalJson as json } from "./canonical-json.js";
import { createEventIdentity, validateEventIdentity } from "./identity.js";
import { escapeText, foldContentLine, utcDateTime } from "./content-line.js";
import { eventDateLines, timeZoneLines } from "./timezone.js";
import type { CalendarOptions, JsonValue, ScheduleEvent, ScheduleReceipt } from "./types.js";

const SCHEMA = "zodiacs-calendar-receipt/1";

function receiptJson(receipt: ScheduleReceipt): string {
  return json({
    schema: receipt.schema,
    utc: receipt.utc,
    eventType: receipt.eventType,
    bodies: receipt.bodies,
    aspect: aspectRecord(receipt),
    orbDegrees: receipt.orbDegrees,
    engine: {
      name: receipt.engine.name,
      version: receipt.engine.version,
      ephemeris: { name: receipt.engine.ephemeris.name, version: receipt.engine.ephemeris.version }
    },
    ...(receipt.source === undefined ? {} : { source: receipt.source })
  });
}

function aspectRecord(receipt: ScheduleReceipt): JsonValue {
  return receipt.aspect === null ? null : { name: receipt.aspect.name, angleDegrees: receipt.aspect.angleDegrees };
}

/** Internal wire helpers shared by collected and streaming exports. */
export function calendarHeader(options: CalendarOptions): string {
  utcDateTime(options.dtstamp);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Zodiacs//Calendar Workbench//EN", "CALSCALE:GREGORIAN"];
  if (options.timeZone !== undefined) lines.push(...timeZoneLines(options.timeZone));
  return wire(lines);
}

export function calendarEvent(event: ScheduleEvent, options: CalendarOptions): string {
  const stamp = utcDateTime(options.dtstamp);
  const lines: string[] = [];
  label(event.uid, "UID");
  validateReceipt(event.receipt);
  const identity = event.identity === undefined ? undefined : createEventIdentity(event.identity);
  if (identity !== undefined) validateEventIdentity(identity, event.uid, event.receipt);
  if (identity?.occurrence.scheme === "utc-day-ordinal/1" && event.endUtc !== undefined) {
    throw new RangeError("Interval identity requires an explicit source occurrence key.");
  }
  const start = utcDateTime(event.receipt.utc);
  const end = event.endUtc === undefined ? undefined : utcDateTime(event.endUtc);
  if (end !== undefined && end <= start) {
    throw new RangeError("DTEND must follow DTSTART at calendar second resolution.");
  }
  const receipt = event.receipt;
  lines.push("BEGIN:VEVENT", `UID:${escapeText(event.uid)}`, `DTSTAMP:${stamp}`);
  if (options.timeZone === undefined) {
    lines.push(`DTSTART:${start}`);
    if (end !== undefined) lines.push(`DTEND:${end}`);
  } else {
    lines.push(...eventDateLines(options.timeZone, event.receipt.utc, event.endUtc));
  }
  lines.push(
    `SUMMARY:${escapeText(event.summary)}`,
    "TRANSP:TRANSPARENT",
    `DESCRIPTION:${escapeText(receiptJson(receipt))}`,
    `X-ZODIACS-SCHEMA;VALUE=TEXT:${SCHEMA}`,
    `X-ZODIACS-UTC;VALUE=TEXT:${receipt.utc}`,
    `X-ZODIACS-EVENT-TYPE;VALUE=TEXT:${receipt.eventType}`,
    `X-ZODIACS-BODIES;VALUE=TEXT:${escapeText(json(receipt.bodies))}`,
    `X-ZODIACS-ASPECT;VALUE=TEXT:${escapeText(json(aspectRecord(receipt)))}`,
    `X-ZODIACS-ORB-DEGREES;VALUE=TEXT:${json(receipt.orbDegrees)}`,
    `X-ZODIACS-ENGINE;VALUE=TEXT:${escapeText(`${receipt.engine.name}@${receipt.engine.version}`)}`,
    `X-ZODIACS-EPHEMERIS;VALUE=TEXT:${escapeText(`${receipt.engine.ephemeris.name}@${receipt.engine.ephemeris.version}`)}`
  );
  if (identity !== undefined) {
    lines.push(`X-ZODIACS-IDENTITY;VALUE=TEXT:${escapeText(json(identity as unknown as JsonValue))}`);
  }
  if (event.endUtc !== undefined) lines.push(`X-ZODIACS-END-UTC;VALUE=TEXT:${event.endUtc}`);
  lines.push("END:VEVENT");
  return wire(lines);
}

function wire(lines: readonly string[]): string {
  return lines.map(foldContentLine).join("\r\n") + "\r\n";
}

/** Serialize supplied calculation records. Search and UID generation are separate. */
export function serializeCalendar(events: Iterable<ScheduleEvent>, options: CalendarOptions): string {
  let output = calendarHeader(options);
  const uids = new Set<string>();
  for (const event of events) {
    if (uids.has(event.uid)) throw new RangeError("Duplicate event UID.");
    uids.add(event.uid);
    output += calendarEvent(event, options);
  }
  if (uids.size === 0) throw new RangeError("A calendar requires at least one event.");
  return output + "END:VCALENDAR\r\n";
}
