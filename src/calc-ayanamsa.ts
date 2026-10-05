/**
 * The bounds the calc entry adds for the ayanamsa it subtracts in the sidereal
 * zodiac: the largest difference of the engine's mean ayanamsa from ERFA's
 * construction of the same definition, in arcseconds, and of its rate, in
 * arcseconds a day, each rounded up to two significant figures. The rate is a
 * central difference over plus and minus 0.001 day of TT, the step of calc's
 * speeds.
 *
 * Measured against src/fixtures/ayanamsa-rates.json, which
 * docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py writes from
 * ERFA; src/calc-sidereal.test.ts holds the engine to these values. A star
 * definition's bound grows within a degree of the Sun, where the star's light
 * is deflected most and the star is near or behind the Sun's disc.
 */
import type { AyanamsaDefinition } from "./vedic/ayanamsa.js";

/** The star's angle from the Sun, degrees, within which a star definition takes its larger bound. */
export const NEAR_SUN_DEGREES = 1;

export const AYANAMSA_BOUNDS = {
  /** Epoch and linear definitions, built-in and the caller's: 72 and 24 comparisons from 1800 to 2200. */
  epochOrLinear: { position: 4.4e-7, rate: 6.4e-9 },
  /** Star definitions, the star a degree or more from the Sun: 741 comparisons. */
  star: { position: 0.0011, rate: 0.00039 },
  /** Star definitions, the star within a degree of the Sun: 123 comparisons. */
  starNearSun: { position: 0.022, rate: 0.4 }
} as const;

export const AYANAMSA_BASIS =
  "largest difference of the mean ayanamsa from ERFA's construction of the same definition; docs/evidence/calc-sidereal-2026-10-05";

/** The bound for a definition at an instant, given the star's angle from the Sun (null for epoch and linear definitions). */
export function ayanamsaBound(
  definition: AyanamsaDefinition,
  elongation: number | null
): { readonly position: number; readonly rate: number } {
  if (definition.kind !== "star") return AYANAMSA_BOUNDS.epochOrLinear;
  return elongation !== null && elongation >= NEAR_SUN_DEGREES ? AYANAMSA_BOUNDS.star : AYANAMSA_BOUNDS.starNearSun;
}

/**
 * a + b, in whole nanoarcseconds (or their per-day rates) rounded up, so that a
 * sum of two bounds is never below either and prints without binary noise.
 */
export function addBounds(a: number, b: number): number {
  return Math.ceil((a + b) * 1e9 - 1e-6) / 1e9;
}
