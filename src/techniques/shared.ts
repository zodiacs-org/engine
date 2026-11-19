/*
 * Internal helpers of the techniques entry point: options, names, places,
 * flags and dates. Only the types below are re-exported, from
 * src/techniques.ts. The names, the options reader and the readers of
 * degrees are in names.ts, and re-exported here.
 */
import { ephemerisOver, fallbacksAt } from "../ephemeris.js";
import { outsideReferenceSpan } from "../reference-span.js";
import type { Chart, DetailedResult, EphemerisFallback } from "../types.js";

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

/** The ephemeris a result names: `{ name: "jpl-de440", version }` on the shipped pack, astronomy-engine's otherwise. */
export interface TechniqueEphemeris {
  readonly name: string;
  readonly version: string;
}

/**
 * The label of a result whose positions were all read between the first and
 * the last of `instants`: the ephemeris they came from and its flags. The
 * pack is the default over one interval of time and the reference span is
 * one interval, so the two ends decide both.
 */
export function labelOver(instants: readonly number[]): { ephemeris: TechniqueEphemeris; flags: readonly TechniqueFlag[] } {
  return { ephemeris: Object.freeze(ephemerisOver(instants)), flags: techniqueFlags(instants) };
}

/** A bare value with its label (`DetailedResult`). */
export function detailed<T>(value: T, instants: readonly number[]): DetailedResult<T, TechniqueFlag> {
  return Object.freeze({ value, ...labelOver(instants) });
}

const CHART_FLAGS: readonly TechniqueFlag[] = ["outside-reference-span", "de440-unavailable", "outside-de440-span"];

/**
 * The label of a result built from charts' own bodies (computed for a birth,
 * or supplied): each chart's ephemeris, or null where the charts do not name
 * one and the same (a chart from an earlier release names none), and the
 * flags among `TechniqueFlag` that any of them carries, in that order.
 */
export function labelOfCharts(charts: readonly Chart[]): { ephemeris: TechniqueEphemeris | null; flags: readonly TechniqueFlag[] } {
  const named = charts.map((chart) => chart.ephemeris ?? null);
  const first = named[0] ?? null;
  const same = first !== null && named.every((one) => one !== null && one.name === first.name && one.version === first.version);
  return {
    ephemeris: same ? Object.freeze({ name: first.name, version: first.version }) : null,
    flags: Object.freeze(CHART_FLAGS.filter((flag) => charts.some((chart) => (chart.flags as readonly string[]).includes(flag))))
  };
}
