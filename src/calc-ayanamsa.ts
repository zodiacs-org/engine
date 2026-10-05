/**
 * The bounds the calc entry adds for the ayanamsa it subtracts in the sidereal
 * zodiac: the largest difference of the engine's mean ayanamsa from ERFA's
 * construction of the same definition, in arcseconds, and of its rate, in
 * arcseconds a day, each rounded up to two significant figures. The rate is a
 * central difference over plus and minus 0.001 day of TT, the step of calc's
 * speeds.
 *
 * Measured over 1,856,820 comparisons, which the tools in
 * docs/evidence/calc-sidereal-2026-10-05/tools/ write from ERFA: every star
 * definition in every year from 1800 to 2199, densely near each pass by the
 * Sun, and callers' ayanamsas at the ends of what calc accepts
 * (results/every-year.json). src/fixtures/ayanamsa-rates.json and
 * src/fixtures/ayanamsa-rates-dense.json keep the rows of the years and
 * callers that hold each band's largest differences, and
 * src/calc-sidereal.test.ts holds the engine to these values on them. A star
 * definition's bound grows as its star nears the Sun, where the deflection of
 * the star's light, and its rate, change fastest.
 */
import type { AyanamsaDefinition } from "./vedic/ayanamsa.js";

/** The star's angle from the Sun, degrees, within which a star definition takes its near-Sun bound. */
export const NEAR_SUN_DEGREES = 2;

/** The star's angle from the Sun, degrees, within which it takes the bound for the Sun's disc and its edge. */
export const AT_SUN_DEGREES = 0.3;

export const AYANAMSA_BOUNDS = {
  /**
   * Epoch and linear definitions, built-in and callers': values from −359.9° to 359.9°, an epoch definition's
   * epoch anywhere in the span, a linear one's anywhere a Date reaches, rates to ±3,600″ a year; 134,833 comparisons.
   * The rate's is the floor of the engine's rounding, 1.5 units of 2⁻⁴⁴° in 0.002 day (docs/calc.md).
   */
  epochOrLinear: { position: 4.6e-7, rate: 1.6e-7 },
  /** Star definitions, the star 2° or more from the Sun: 306,850 comparisons. */
  star: { position: 0.0013, rate: 0.00039 },
  /** Star definitions, the star 0.3° to 2° from the Sun: 238,364 comparisons. */
  starNearSun: { position: 0.0048, rate: 0.026 },
  /** Star definitions, the star within 0.3° of the Sun, on or near its disc: 1,176,773 comparisons. */
  starAtSun: { position: 0.058, rate: 27 }
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
