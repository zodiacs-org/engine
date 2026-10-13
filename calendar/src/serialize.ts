import { label, validateReceipt } from "./validation.js";
import { canonicalJson as json } from "./canonical-json.js";
import { createEventIdentity, validateEventIdentity } from "./identity.js";
import { escapeText, foldContentLine, utcDateTime } from "./content-line.js";
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

/** Serialize supplied calculation records. Search and UID generation are separate. */
export function serializeCalendar(events: Iterable<ScheduleEvent>, options: CalendarOptions): string {
  const stamp = utcDateTime(options.dtstamp);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Zodiacs//Calendar Workbench//EN", "CALSCALE:GREGORIAN"];
  const uids = new Set<string>();
  for (const event of events) {
    label(event.uid, "UID");
    if (uids.has(event.uid)) throw new RangeError("Duplicate event UID.");
    uids.add(event.uid);
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
    lines.push("BEGIN:VEVENT", `UID:${escapeText(event.uid)}`, `DTSTAMP:${stamp}`, `DTSTART:${start}`);
    if (end !== undefined) lines.push(`DTEND:${end}`);
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
  }
  if (uids.size === 0) throw new RangeError("A calendar requires at least one event.");
  lines.push("END:VCALENDAR");
  return lines.map(foldContentLine).join("\r\n") + "\r\n";
}
