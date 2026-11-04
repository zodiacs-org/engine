/*
 * Internal helpers of the techniques entry point that load no other module
 * of it: the body names, the readers of a name, of one of a list of names and
 * of degrees, and the shared options reader. Moved from shared.ts, which
 * re-exports them, so that composite.ts and dignities.ts do not reach
 * shared.ts's import of the reference span.
 */
import type { BodyName } from "../types.js";

export const BODY_NAMES: readonly BodyName[] = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "South Node"
];

/** A body name, or a RangeError. */
export function bodyName(value: unknown, label: string): BodyName {
  if (typeof value === "string" && (BODY_NAMES as readonly string[]).includes(value)) return value as BodyName;
  throw new RangeError(`${label} must be a body name.`);
}

export { readOptions } from "../read-options.js";

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
