/**
 * Zodiacs.org site compatibility primitives.
 *
 * This entry point is intentionally not part of the public API promise. It
 * exists so the site and the published package execute the same ephemeris
 * implementation without making scanner-oriented primitives permanent API.
 * Third-party integrations should import from `@zodiacs/engine` instead.
 *
 * @internal
 */
import { bodyLongitude, ephemerisOver, fallbacksAt, longitudeSpeed } from "./ephemeris.js";
import type { BodyName, DetailedResult } from "./types.js";

export { bodyLongitude, computeBodies, computeChart, longitudeSpeed } from "./ephemeris.js";
export type { DetailedResult, EphemerisFallback } from "./types.js";

/**
 * `bodyLongitude`'s longitude as `value`, with the ephemeris it came from and
 * the flag that says why that is astronomy-engine where the shipped DE440
 * pack was the default (`DetailedResult`).
 */
export function bodyLongitudeDetailed(body: BodyName, date: Date): DetailedResult<number> {
  return detailedAt(bodyLongitude(body, date), date);
}

/**
 * `longitudeSpeed`'s speed as `value`, labelled as `bodyLongitudeDetailed`'s
 * is: both samples are read on the source chosen at `date`.
 */
export function longitudeSpeedDetailed(body: BodyName, date: Date): DetailedResult<number> {
  return detailedAt(longitudeSpeed(body, date), date);
}

function detailedAt(value: number, date: Date): DetailedResult<number> {
  const at = [date.getTime()];
  return Object.freeze({ value, ephemeris: Object.freeze(ephemerisOver(at)), flags: Object.freeze(fallbacksAt(at)) });
}

