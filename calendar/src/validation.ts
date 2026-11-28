import { escapeText, utcDateTime } from "./content-line.js";
import type { ScheduleReceipt } from "./types.js";

export const EVENT_TYPES = new Set([
  "natal-transit", "ingress", "station", "eclipse", "void-of-course", "synastry-exact"
]);
const SCHEMA = "zodiacs-calendar-receipt/1";

export function label(value: string, field: string): void {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new RangeError(`Invalid ${field}.`);
  }
  escapeText(value);
}

function angular(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 180;
}

export function validateReceipt(receipt: ScheduleReceipt): void {
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

