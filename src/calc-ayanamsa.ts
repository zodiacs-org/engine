/**
 * The bounds the calc entry adds for the ayanamsa it subtracts in the sidereal
 * zodiac: the largest difference of the engine's mean ayanamsa from ERFA's
 * construction of the same definition, in arcseconds, and of its rate, in
 * arcseconds a day, each rounded up to two significant figures. The rate is a
 * central difference over plus and minus 0.001 day of TT, the step of calc's
 * speeds.
 *
 * Measured against src/fixtures/ayanamsa-rates.json and
 * src/fixtures/ayanamsa-rates-dense.json, which the tools in
 * docs/evidence/calc-sidereal-2026-10-05/tools/ write from ERFA;
 * src/calc-sidereal.test.ts holds the engine to these values. A star
 * definition's bound grows as its star nears the Sun, where the deflection of
 * the star's light, and its rate, change fastest.
 */
import type { AyanamsaDefinition } from "./vedic/ayanamsa.js";

/** The star's angle from the Sun, degrees, within which a star definition takes its near-Sun bound. */
export const NEAR_SUN_DEGREES = 2;

/** The star's angle from the Sun, degrees, within which it takes the bound for the Sun's disc and its edge. */
export const AT_SUN_DEGREES = 0.3;

export const AYANAMSA_BOUNDS = {
  /** Epoch and linear definitions, built-in and callers', every value, epoch and rate calc accepts: 906 comparisons. */
  epochOrLinear: { position: 4.5e-7, rate: 1.1e-7 },
  /** Star definitions, the star 2° or more from the Sun: 4,510 comparisons. */
  star: { position: 0.0011, rate: 0.00034 },
  /** Star definitions, the star 0.3° to 2° from the Sun: 3,120 comparisons. */
  starNearSun: { position: 0.0034, rate: 0.022 },
  /** Star definitions, the star within 0.3° of the Sun, on or near its disc: 7,580 comparisons. */
  starAtSun: { position: 0.036, rate: 18 }
} as const;

export type AyanamsaBand = keyof typeof AYANAMSA_BOUNDS;

export const AYANAMSA_BASIS =
  "largest difference of the mean ayanamsa from ERFA's construction of the same definition; docs/evidence/calc-sidereal-2026-10-05";

/** A definition's band at an instant, given the star's angle from the Sun (null for epoch and linear definitions). */
export function ayanamsaBand(definition: AyanamsaDefinition, elongation: number | null): AyanamsaBand {
  if (definition.kind !== "star") return "epochOrLinear";
  if (elongation === null || elongation < AT_SUN_DEGREES) return "starAtSun";
  return elongation < NEAR_SUN_DEGREES ? "starNearSun" : "star";
}

/** The bound for a definition at an instant, given the star's angle from the Sun (null for epoch and linear definitions). */
export function ayanamsaBound(
  definition: AyanamsaDefinition,
  elongation: number | null
): { readonly position: number; readonly rate: number } {
  return AYANAMSA_BOUNDS[ayanamsaBand(definition, elongation)];
}

/**
 * a + b, in whole nanoarcseconds (or their per-day rates) rounded up, so that a
 * sum of two bounds is never below either and prints without binary noise. The
 * scaled sum is read to 15 significant figures first, so that a rounding error
 * in it never adds a whole nanoarcsecond.
 */
export function addBounds(a: number, b: number): number {
  return Math.ceil(Number(((a + b) * 1e9).toPrecision(15))) / 1e9;
}
