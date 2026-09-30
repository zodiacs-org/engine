/*
 * Internal helpers of the techniques entry point: options, names, places,
 * flags and dates. Only the types below are re-exported, from
 * src/techniques.ts.
 */
import { outsideReferenceSpan } from "../reference-span.js";
import type { BodyName } from "../types.js";

/** `"outside-reference-span"`: the ephemeris was read outside 1800–2200 (`REFERENCE_SPAN`). */
export type TechniqueFlag = "outside-reference-span";

/** Latitude in [−90, 90] and longitude east in [−180, 180], degrees. */
export interface GeoPlace {
  readonly latitude: number;
  readonly longitude: number;
}

export const DAY_MS = 86_400_000;
const MAX_DATE_MS = 8_640_000_000_000_000;

export const BODY_NAMES: readonly BodyName[] = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "South Node"
];

/** A body name, or a RangeError. */
export function bodyName(value: unknown, label: string): BodyName {
  if (typeof value === "string" && (BODY_NAMES as readonly string[]).includes(value)) return value as BodyName;
  throw new RangeError(`${label} must be a body name.`);
}

/** Copy an options object's own data properties, refusing unknown keys; undefined counts as absent. */
export function readOptions(value: unknown, allowed: readonly string[], label: string): Readonly<Record<string, unknown>> {
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  if (value === undefined) return out;
  const prototype: unknown = value !== null && typeof value === "object" && !Array.isArray(value) ? Object.getPrototypeOf(value) : undefined;
  if (prototype !== Object.prototype && prototype !== null) throw new RangeError(`${label} must be a plain options object.`);
  for (const key of Reflect.ownKeys(value as object)) {
    const slot = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !allowed.includes(key)) throw new RangeError(`${label} has an unknown option: ${String(key)}.`);
    if (!slot || !("value" in slot) || !slot.enumerable) throw new RangeError(`${label} must contain only plain data properties.`);
    if (slot.value !== undefined) out[key] = slot.value as unknown;
  }
  return out;
}

/** One of a fixed list of names, or the default when absent. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T, label: string): T {
  if (value === undefined) return fallback;
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new RangeError(`${label} must be one of ${allowed.map((name) => `"${name}"`).join(", ")}.`);
}

/** A finite number of degrees. */
export function finiteDegrees(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`${label} must be a finite number of degrees.`);
  return value;
}

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
  return Object.freeze(instants.some((milliseconds) => outsideReferenceSpan(new Date(milliseconds))) ? ["outside-reference-span"] : []);
}
