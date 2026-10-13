import { escapeText, foldContentLine, utcDateTime } from "./content-line.js";
import type { CalendarOptions, JsonValue, ScheduleEvent, ScheduleReceipt } from "./types.js";

const EVENT_TYPES = new Set([
  "natal-transit", "ingress", "station", "eclipse", "void-of-course", "synastry-exact"
]);
const SCHEMA = "zodiacs-calendar-receipt/1";

function label(value: string, field: string): void {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new RangeError(`Invalid ${field}.`);
  }
  escapeText(value);
}

function angular(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 180;
}

function validateReceipt(receipt: ScheduleReceipt): void {
  if (receipt.schema !== SCHEMA || !EVENT_TYPES.has(receipt.eventType)) {
    throw new RangeError("Unsupported calendar receipt schema or event type.");
  }
  utcDateTime(receipt.utc);
  if (!Array.isArray(receipt.bodies) || receipt.bodies.length === 0) {
    throw new RangeError("A receipt requires participating bodies.");
  }
  // Use iteration rather than .every(), which skips sparse slots.
  for (const body of receipt.bodies) label(body, "body");
  if (receipt.aspect !== null) {
    label(receipt.aspect.name, "aspect name");
    if (!angular(receipt.aspect.angleDegrees)) throw new RangeError("Invalid aspect angle in degrees.");
  }
  if (receipt.orbDegrees !== null && !angular(receipt.orbDegrees)) {
    throw new RangeError("Invalid angular orb in degrees.");
  }
  if ((receipt.eventType === "natal-transit" || receipt.eventType === "synastry-exact") &&
      (receipt.aspect === null || receipt.orbDegrees === null || receipt.bodies.length !== 2)) {
    throw new RangeError("An aspect event requires an aspect, an orb and two bodies.");
  }
  if (receipt.engine.name !== "@zodiacs/engine" || receipt.engine.ephemeris.name !== "astronomy-engine") {
    throw new RangeError("Unsupported receipt engine.");
  }
  label(receipt.engine.version, "engine version");
  label(receipt.engine.ephemeris.version, "ephemeris version");
  if (receipt.source !== undefined &&
      (receipt.source === null || typeof receipt.source !== "object" || Array.isArray(receipt.source))) {
    throw new RangeError("Receipt source must be a JSON object.");
  }
}

/** Sort object fields without rounding numbers or silently dropping non-JSON data. */
function json(value: JsonValue, ancestors = new Set<object>()): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    escapeText(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== "object" || value === null || ancestors.has(value)) {
    throw new RangeError("Receipt source must contain finite, acyclic JSON data.");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${Array.from(value, (item) => json(item, ancestors)).join(",")}]`;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new RangeError("Receipt source must contain plain JSON objects.");
    }
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${json(key, ancestors)}:${json(item, ancestors)}`).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

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
    if (event.endUtc !== undefined) lines.push(`X-ZODIACS-END-UTC;VALUE=TEXT:${event.endUtc}`);
    lines.push("END:VEVENT");
  }
  if (uids.size === 0) throw new RangeError("A calendar requires at least one event.");
  lines.push("END:VCALENDAR");
  return lines.map(foldContentLine).join("\r\n") + "\r\n";
}
