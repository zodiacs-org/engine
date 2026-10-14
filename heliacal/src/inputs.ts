import { dateFrom } from "../../src/date-input.js";
import { observerOf } from "../../src/sky/riseset.js";
import type { Observer } from "../../src/sky/riseset.js";
import type { DateInput } from "../../src/types.js";

/** Targets of visibility predictions. The Sun is an auxiliary observation body. */
export const VISIBILITY_BODIES = Object.freeze([
  "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"
] as const);

export type VisibilityBody = (typeof VISIBILITY_BODIES)[number];
export type ObservationBody = VisibilityBody | "Sun";
export type { DateInput, Observer };

export function visibilityBody(value: unknown): VisibilityBody {
  if (typeof value !== "string" || !VISIBILITY_BODIES.some((body) => body === value)) {
    throw new RangeError("body must be the Moon or a visible planet: Mercury, Venus, Mars, Jupiter, Saturn.");
  }
  return value as VisibilityBody;
}

export function observationBody(value: unknown): ObservationBody {
  return value === "Sun" ? "Sun" : visibilityBody(value);
}

/** Geodetic degrees, east-positive longitude, WGS84 height in metres. */
export function observer(value: unknown): Readonly<Required<Observer>> {
  return observerOf(value);
}

/** A fresh Date on the engine's UTC input basis; no host-local date parsing. */
export function instant(value: DateInput, label = "at"): Date {
  return dateFrom(value, label);
}

/** Nonempty half-open interval [from, to), on the engine's UTC input basis. */
export function dateRange(from: DateInput, to: DateInput): Readonly<{ from: Date; to: Date }> {
  const start = instant(from, "from");
  const end = instant(to, "to");
  if (end.getTime() <= start.getTime()) throw new RangeError("The window must end after it starts.");
  return Object.freeze({ from: start, to: end });
}
