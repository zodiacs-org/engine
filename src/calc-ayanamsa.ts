/**
 * The bounds the calc entry adds for the ayanamsa it subtracts in the sidereal
 * zodiac: the largest difference of the engine's mean ayanamsa from ERFA's
 * construction of the same definition, in arcseconds, and of its rate, in
 * arcseconds a day, each rounded up to two significant figures. The rate is a
 * central difference over plus and minus 0.001 day of TT, the step of calc's
 * speeds.
 *
 * Measured over 2,333,979 comparisons, which the tools in
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
import { outsideSpanEpoch } from "./vedic/ayanamsa.js";
import type { AyanamsaDefinition } from "./vedic/ayanamsa.js";

/** The star's angle from the Sun, degrees, within which a star definition takes its near-Sun bound. */
export const NEAR_SUN_DEGREES = 2;

/** The star's angle from the Sun, degrees, within which it takes the bound for the Sun's disc and its edge. */
export const AT_SUN_DEGREES = 0.3;

export const AYANAMSA_BOUNDS = {
  /**
   * Epoch and linear definitions, built-in and callers': values from −359.9° to 359.9°, an epoch definition's
   * epoch anywhere in the span, a linear one's anywhere a Date reaches, rates to ±3,600″ a year; 134,833 comparisons.
   * A linear one's rate rounds by up to 1.5 units of 2⁻⁴⁴° in 0.002 day; calc's speeds add their own (docs/calc.md).
   */
  epochOrLinear: { position: 4.6e-7, rate: 1.6e-7 },
  /**
   * Callers' epoch definitions on the engine's precession (IAU 2006) whose epoch is outside the span but inside
   * EPHEMERIS_SPAN, beyond which calc refuses them: the engine's precession and ERFA's part the further the
   * epoch is from J2000.0, most at the span's ends; 21,658 comparisons (docs/evidence/calc-epochs-2026-10-06).
   */
  epochOutsideSpan: { position: 0.0037, rate: 1.3e-7 },
  /**
   * The same on Newcomb's or IAU 1976's precession, whose zodiac is held where that model puts it at J2000.0, so
   * that most of the precession's difference from ERFA's cancels; 43,316 comparisons.
   */
  olderEpochOutsideSpan: { position: 1.8e-5, rate: 1.2e-7 },
  /** Star definitions, the star 2° or more from the Sun: 306,850 comparisons. */
  star: { position: 0.0013, rate: 0.00039 },
  /** Star definitions, the star 0.3° to 2° from the Sun: 238,364 comparisons. */
  starNearSun: { position: 0.0048, rate: 0.026 },
  /** Star definitions, the star within 0.3° of the Sun, on or near its disc: 1,653,932 comparisons. */
  starAtSun: { position: 0.058, rate: 27 }
} as const;

export type AyanamsaBand = keyof typeof AYANAMSA_BOUNDS;

export const AYANAMSA_BASIS =
  "largest difference of the mean ayanamsa from ERFA's construction of the same definition; docs/evidence/calc-sidereal-2026-10-05";

/** The basis of the band for epochs outside the span. */
export const AYANAMSA_EPOCH_BASIS =
  "largest difference of the mean ayanamsa from ERFA's construction of the same definition, for epochs from 0001 to 3998 outside 1800 to 2200; docs/evidence/calc-epochs-2026-10-06";

/** A definition's band at an instant, given the star's angle from the Sun (null for epoch and linear definitions). */
export function ayanamsaBand(definition: AyanamsaDefinition, elongation: number | null): AyanamsaBand {
  if (definition.kind === "epoch" && outsideSpanEpoch(definition)) {
    return definition.model === "engine" ? "epochOutsideSpan" : "olderEpochOutsideSpan";
  }
  if (definition.kind !== "star") return "epochOrLinear";
  if (elongation === null || elongation < AT_SUN_DEGREES) return "starAtSun";
  return elongation < NEAR_SUN_DEGREES ? "starNearSun" : "star";
}

/** The bound for a definition at an instant, given the star's angle from the Sun (null for epoch and linear definitions), and its basis. */
export function ayanamsaBound(
  definition: AyanamsaDefinition,
  elongation: number | null
): { readonly position: number; readonly rate: number; readonly basis: string } {
  const band = ayanamsaBand(definition, elongation);
  const outside = band === "epochOutsideSpan" || band === "olderEpochOutsideSpan";
  return { ...AYANAMSA_BOUNDS[band], basis: outside ? AYANAMSA_EPOCH_BASIS : AYANAMSA_BASIS };
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
