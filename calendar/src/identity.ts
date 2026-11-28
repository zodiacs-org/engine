import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json.js";
import { escapeText, utcDateTime } from "./content-line.js";
import { EVENT_TYPES, label, validateReceipt } from "./validation.js";
import type {
  EventIdentity, IdentityBatch, IdentityWindow, JsonValue, ScheduleEvent, ScheduleReceipt
} from "./types.js";

const SCHEMA = "zodiacs-calendar-event/1";
const DAY_MS = 86_400_000;

function object(value: unknown, keys?: readonly string[]): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RangeError("Expected an identity object.");
  }
  if (keys !== undefined &&
      (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))) {
    throw new RangeError("Unexpected or missing identity fields.");
  }
}

function labels(value: readonly string[]): void {
  if (!Array.isArray(value)) throw new RangeError("Expected identity labels.");
  for (const item of value) label(item, "identity label");
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

function dayWindow(startUtc: string): IdentityWindow {
  utcDateTime(startUtc);
  if (!startUtc.endsWith("T00:00:00.000Z")) throw new RangeError("Identity window must start at UTC midnight.");
  const endUtc = new Date(Date.parse(startUtc) + DAY_MS).toISOString();
  utcDateTime(endUtc);
  return Object.freeze({ startUtc, endUtc });
}

/** Canonical queries for a requested (startUtc, endUtc] range, independent of its size. */
export function* canonicalIdentityWindows(startUtc: string, endUtc: string): Generator<IdentityWindow> {
  utcDateTime(startUtc);
  utcDateTime(endUtc);
  if (startUtc > endUtc) throw new RangeError("Identity range is reversed.");
  if (startUtc === endUtc) return;
  let start = `${startUtc.slice(0, 10)}T00:00:00.000Z`;
  while (start < endUtc) {
    const window = dayWindow(start);
    yield window;
    start = window.endUtc;
  }
}

/** Validate and freeze a detached identity. No current clock or random value is used. */
export function createEventIdentity(input: EventIdentity): EventIdentity {
  // Reject lossy/non-JSON values before taking a detached snapshot.
  const identity = JSON.parse(canonicalJson(input as unknown as JsonValue)) as EventIdentity;
  object(identity, ["schema", "namespace", "eventType", "bodies", "chartIds", "aspectAngleDegrees", "definition", "occurrence"]);
  if (identity.schema !== SCHEMA || !EVENT_TYPES.has(identity.eventType)) {
    throw new RangeError("Unsupported event identity schema or event type.");
  }
  label(identity.namespace, "identity namespace");
  labels(identity.bodies);
  labels(identity.chartIds);
  if (identity.bodies.length === 0) throw new RangeError("Identity requires bodies.");
  const charts = identity.eventType === "natal-transit" ? 1 : identity.eventType === "synastry-exact" ? 2 : 0;
  if (identity.chartIds.length !== charts) throw new RangeError("Wrong chart identities for event type.");
  const angle = identity.aspectAngleDegrees;
  if (angle !== null && (typeof angle !== "number" || !Number.isFinite(angle) || angle < 0 || angle > 180)) {
    throw new RangeError("Invalid identity aspect angle.");
  }
  if (charts > 0 && (identity.bodies.length !== 2 || angle === null)) {
    throw new RangeError("Aspect identity requires two bodies and an angle.");
  }
  object(identity.definition, ["id", "parameters"]);
  label(identity.definition.id, "event definition");
  if (!/\/\d+$/u.test(identity.definition.id)) throw new RangeError("Event definition needs an explicit version suffix.");
  object(identity.definition.parameters);
  object(identity.occurrence);
  if (identity.occurrence.scheme === "source-key/1") {
    object(identity.occurrence, ["scheme", "key"]);
    label(identity.occurrence.key, "occurrence key");
  } else if (identity.occurrence.scheme === "utc-day-ordinal/1") {
    if (identity.eventType === "void-of-course") {
      throw new RangeError("Interval identity requires an explicit source occurrence key.");
    }
    object(identity.occurrence, ["scheme", "startUtc", "ordinal"]);
    dayWindow(identity.occurrence.startUtc);
    if (!Number.isSafeInteger(identity.occurrence.ordinal) || identity.occurrence.ordinal < 0) {
      throw new RangeError("Invalid occurrence ordinal.");
    }
  } else {
    throw new RangeError("Unsupported occurrence identity scheme.");
  }
  return freeze(identity);
}

/** Persistent RFC 5545 UID from the versioned identity, not the estimated instant. */
export function eventUid(input: EventIdentity): string {
  const identity = createEventIdentity(input);
  const digest = createHash("sha256").update(canonicalJson(identity as unknown as JsonValue), "utf8").digest("hex");
  return `zcal-v1-${digest}@calendar.zodiacs.org`;
}

/** Check that an identity describes the receipt without treating it as authentication. */
export function validateEventIdentity(identity: EventIdentity, uid: string, receipt: ScheduleReceipt): void {
  if (eventUid(identity) !== uid) throw new RangeError("UID does not match event identity.");
  if (identity.eventType !== receipt.eventType ||
      canonicalJson(identity.bodies) !== canonicalJson(receipt.bodies) ||
      identity.aspectAngleDegrees !== (receipt.aspect?.angleDegrees ?? null)) {
    throw new RangeError("Event identity does not match receipt participants or aspect.");
  }
  if (identity.occurrence.scheme === "utc-day-ordinal/1") {
    const window = dayWindow(identity.occurrence.startUtc);
    if (receipt.utc <= window.startUtc || receipt.utc > window.endUtc) {
      throw new RangeError("Event instant is outside its identity window.");
    }
  }
}

/**
 * Assign per-series ordinals in a complete canonical day before display filtering.
 * Adapters must supply all owned occurrences, using search halos where needed.
 * Incomplete results and tied instants within a series are refused, never guessed.
 */
export function identifyEventBatch(namespace: string, batch: IdentityBatch): readonly ScheduleEvent[] {
  label(namespace, "identity namespace");
  if (batch.status !== "complete") throw new RangeError("Identity assignment requires a complete result.");
  const window = dayWindow(batch.window.startUtc);
  if (window.endUtc !== batch.window.endUtc) throw new RangeError("Identity assignment requires a fixed UTC day.");
  if (!Array.isArray(batch.events)) throw new RangeError("Expected identity batch events.");
  const rows = Array.from(batch.events, (event) => {
    object(event);
    validateReceipt(event.receipt);
    if (event.receipt.utc <= window.startUtc || event.receipt.utc > window.endUtc) {
      throw new RangeError("Event instant is outside its identity window.");
    }
    // Intervals may have clipped starts. Their adapter must use a stable source key.
    if (event.endUtc !== undefined || event.receipt.eventType === "void-of-course") {
      throw new RangeError("Interval identity requires an explicit source occurrence key.");
    }
    const identity = createEventIdentity({
      schema: SCHEMA, namespace,
      eventType: event.receipt.eventType, bodies: event.receipt.bodies,
      aspectAngleDegrees: event.receipt.aspect?.angleDegrees ?? null,
      chartIds: event.chartIds, definition: event.definition,
      occurrence: { scheme: "utc-day-ordinal/1", startUtc: window.startUtc, ordinal: 0 }
    });
    return { event, identity, series: canonicalJson(identity as unknown as JsonValue) };
  });
  rows.sort((a, b) => a.event.receipt.utc < b.event.receipt.utc ? -1 :
    a.event.receipt.utc > b.event.receipt.utc ? 1 : a.series < b.series ? -1 : a.series > b.series ? 1 : 0);
  const previous = new Map<string, { utc: string; ordinal: number }>();
  return rows.map(({ event, identity, series }) => {
    const prior = previous.get(series);
    if (prior?.utc === event.receipt.utc) throw new RangeError("Ambiguous simultaneous occurrences in one identity series.");
    const ordinal = prior === undefined ? 0 : prior.ordinal + 1;
    previous.set(series, { utc: event.receipt.utc, ordinal });
    const assigned = createEventIdentity({ ...identity, occurrence: { scheme: "utc-day-ordinal/1", startUtc: window.startUtc, ordinal } });
    escapeText(event.summary);
    return { uid: eventUid(assigned), identity: assigned, summary: event.summary, receipt: event.receipt };
  });
}
