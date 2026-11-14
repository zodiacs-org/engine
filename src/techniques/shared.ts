/*
 * Internal helpers of the techniques entry point: options, names, places,
 * flags and dates. Only the types below are re-exported, from
 * src/techniques.ts. The names, the options reader and the readers of
 * degrees are in names.ts, and re-exported here.
 */
import { fallbacksAt } from "../ephemeris.js";
import { outsideReferenceSpan } from "../reference-span.js";
import type { EphemerisFallback } from "../types.js";

/**
 * `"outside-reference-span"`: the ephemeris was read outside 1800 to 2200
 * (`REFERENCE_SPAN`). `"de440-unavailable"` and `"outside-de440-span"`: a
 * position was astronomy-engine's as a fallback from the shipped DE440 pack
 * (the root entry's `EphemerisFallback`).
 */
export type TechniqueFlag = "outside-reference-span" | EphemerisFallback;

/** Latitude in [−90, 90] and longitude east in [−180, 180], degrees. */
export interface GeoPlace {
  readonly latitude: number;
  readonly longitude: number;
}

export const DAY_MS = 86_400_000;
const MAX_DATE_MS = 8_640_000_000_000_000;

export { BODY_NAMES, bodyName, finiteDegrees, oneOf, readOptions } from "./names.js";

/** A valid place, copied and frozen. */
export function placeOf(value: unknown, label: string): GeoPlace {
  const { latitude, longitude } = (value ?? {}) as Record<string, unknown>;
  if (
    typeof latitude !== "number" || !(Math.abs(latitude) <= 90) ||
    typeof longitude !== "number" || !(Math.abs(longitude) <= 180)
  ) {
    throw new RangeError(`${label} needs a latitude from -90 to 90 and a longitude from -180 to 180 degrees.`);
  }
  return Object.freeze({ latitude, longitude });
}

/** A Date for an epoch-millisecond value inside the Date range. */
export function dateAt(milliseconds: number, label: string): Date {
  if (!(Math.abs(milliseconds) <= MAX_DATE_MS)) throw new RangeError(`${label} falls outside the range of a JavaScript Date.`);
  return new Date(milliseconds);
}

/** A result's flags, from the instants the ephemeris was read at. */
export function techniqueFlags(instants: readonly number[]): readonly TechniqueFlag[] {
  const flags: TechniqueFlag[] = instants.some((milliseconds) => outsideReferenceSpan(new Date(milliseconds))) ? ["outside-reference-span"] : [];
  return Object.freeze([...flags, ...fallbacksAt(instants)]);
}
