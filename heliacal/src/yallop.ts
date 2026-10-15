import { optionsOf } from "../../src/sky/riseset.js";
import { instant } from "./inputs.js";
import type { DateInput } from "./inputs.js";

/** Fixed published coefficients, not caller-tunable weather parameters. */
export const YALLOP_MODEL = Object.freeze({
  id: "yallop-1997/1",
  source: "https://webspace.science.uu.nl/~gent0113/islam/downloads/naotn_69.pdf",
  sourceRevision: "1998-04",
  semidiameterParallaxRatio: 0.27245,
  arcOfVisionPolynomialDeg: Object.freeze([11.8371, -6.3226, 0.7319, -0.1018] as const),
  qDivisorDeg: 10,
  categoryLowerExclusiveQ: Object.freeze({ A: 0.216, B: -0.014, C: -0.160, D: -0.232, E: -0.293 }),
  bestTimeLagFraction: Object.freeze({ numerator: 4, denominator: 9 }),
  atmosphericAdjustment: "none;empirical-calibration"
} as const);

const CATEGORY_MEANINGS = Object.freeze({
  A: "unaided-eye-easy",
  B: "unaided-eye-under-ideal-conditions",
  C: "optical-location-may-be-needed-before-unaided-sighting",
  D: "optical-aid-required",
  E: "below-usual-telescopic-detection",
  F: "below-model-danjon-limit"
} as const);

export type YallopCategory = keyof typeof CATEGORY_MEANINGS;

export interface YallopGeometry {
  /** Airless geocentric Moon centre altitude along the site's local axes. */
  readonly moonAltitudeGeocentricDeg: number;
  /** Airless geocentric Sun centre altitude along the same local axes. */
  readonly sunAltitudeGeocentricDeg: number;
  /** Actual geocentric Sun/Moon centre separation, not longitude difference. */
  readonly elongationGeocentricDeg: number;
  /** Equatorial horizontal parallax of the Moon, in arcminutes. */
  readonly moonHorizontalParallaxArcmin: number;
}

const CONVENTIONS = Object.freeze({
  epoch: "caller-supplied-best-time;not-verified",
  arcOfVision: "geocentric-moon-minus-sun-centre-altitude;airless;degrees",
  width: "Yallop-eq3.8-3.10;parallax-adjusted-semidiameter;geocentric-elongation;arcminutes",
  classification: "q-only;exact-boundary-in-less-visible-category;no-epsilon",
  scope: "criterion-calculation;not-observation-or-sighting-probability"
} as const);

export interface YallopCriterion {
  readonly model: typeof YALLOP_MODEL.id;
  readonly parameters: typeof YALLOP_MODEL;
  readonly sample: Readonly<YallopGeometry>;
  readonly arcOfVisionDeg: number;
  readonly geocentricSemidiameterArcmin: number;
  /** Yallop's first-order correction, not an exact topocentric angular radius. */
  readonly topocentricSemidiameterArcmin: number;
  /** W' as defined in the report, retaining geocentric ARCL. */
  readonly crescentWidthArcmin: number;
  /** Value of the published cubic at W', before the q offset. */
  readonly referenceArcOfVisionDeg: number;
  readonly q: number;
  readonly category: YallopCategory;
  readonly categoryMeaning: (typeof CATEGORY_MEANINGS)[YallopCategory];
  readonly conventions: typeof CONVENTIONS;
  /** No engine is called and no caller-supplied geometry is authenticated. */
  readonly receiptScope: "none;caller-supplied-geometry";
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number.`);
  }
  return value === 0 ? 0 : value;
}

function numberIn(value: unknown, low: number, high: number, label: string): number {
  const number = finite(value, label);
  if (number < low || number > high) throw new RangeError(`${label} must be in [${low}, ${high}].`);
  return number;
}

/** Table 5, printed p. 12: each equality belongs to the less-visible category. */
export function yallopCategory(q: number): YallopCategory {
  const value = finite(q, "q");
  const limits = YALLOP_MODEL.categoryLowerExclusiveQ;
  if (value > limits.A) return "A";
  if (value > limits.B) return "B";
  if (value > limits.C) return "C";
  if (value > limits.D) return "D";
  if (value > limits.E) return "E";
  return "F";
}

/**
 * Pure arithmetic for Yallop TN69 (1997, updated April 1998), equations
 * 3.8-3.10 and 6.1. The caller supplies all quantities at the same best time.
 * ARCV and ARCL stay GEOCENTRIC even though the report calls W' topocentric.
 * No ephemeris, horizon, weather, daylight or waxing/waning test is performed.
 * Numeric domains are not a calibrated validity range. See SOURCES.md.
 */
export function evaluateYallop(sample: YallopGeometry): Readonly<YallopCriterion> {
  const input = optionsOf(sample, [
    "moonAltitudeGeocentricDeg", "sunAltitudeGeocentricDeg", "elongationGeocentricDeg",
    "moonHorizontalParallaxArcmin"
  ], "Yallop geometry");
  const moonAltitudeGeocentricDeg = numberIn(input.moonAltitudeGeocentricDeg, -90, 90, "moonAltitudeGeocentricDeg");
  const sunAltitudeGeocentricDeg = numberIn(input.sunAltitudeGeocentricDeg, -90, 90, "sunAltitudeGeocentricDeg");
  const elongationGeocentricDeg = numberIn(input.elongationGeocentricDeg, 0, 180, "elongationGeocentricDeg");
  const moonHorizontalParallaxArcmin = finite(input.moonHorizontalParallaxArcmin, "moonHorizontalParallaxArcmin");
  // Horizontal parallax is a positive angle smaller than a right angle for
  // an external body. This is a geometric domain, not a fitted lunar range.
  if (moonHorizontalParallaxArcmin <= 0 || moonHorizontalParallaxArcmin >= 90 * 60) {
    throw new RangeError("moonHorizontalParallaxArcmin must be positive and less than 5400 arcminutes.");
  }
  const normalized = Object.freeze({
    moonAltitudeGeocentricDeg, sunAltitudeGeocentricDeg, elongationGeocentricDeg, moonHorizontalParallaxArcmin
  });
  const rad = Math.PI / 180;
  const arcOfVisionDeg = moonAltitudeGeocentricDeg - sunAltitudeGeocentricDeg;
  const geocentricSemidiameterArcmin = YALLOP_MODEL.semidiameterParallaxRatio * moonHorizontalParallaxArcmin;
  const topocentricSemidiameterArcmin = geocentricSemidiameterArcmin * (
    1 + Math.sin(moonAltitudeGeocentricDeg * rad) * Math.sin(moonHorizontalParallaxArcmin / 60 * rad)
  );
  // Equivalent to 1-cos(ARCL), retaining small positive widths near new Moon.
  const sineHalf = Math.sin(elongationGeocentricDeg * rad / 2);
  const crescentWidthArcmin = topocentricSemidiameterArcmin * (2 * sineHalf * sineHalf);
  const [a, b, c, d] = YALLOP_MODEL.arcOfVisionPolynomialDeg;
  const referenceArcOfVisionDeg = a + crescentWidthArcmin * (b + crescentWidthArcmin * (c + crescentWidthArcmin * d));
  const q = (arcOfVisionDeg - referenceArcOfVisionDeg) / YALLOP_MODEL.qDivisorDeg;
  const category = yallopCategory(q);
  return Object.freeze({
    model: YALLOP_MODEL.id, parameters: YALLOP_MODEL, sample: normalized,
    arcOfVisionDeg, geocentricSemidiameterArcmin, topocentricSemidiameterArcmin,
    crescentWidthArcmin, referenceArcOfVisionDeg, q, category,
    categoryMeaning: CATEGORY_MEANINGS[category], conventions: CONVENTIONS,
    receiptScope: "none;caller-supplied-geometry"
  });
}

const TIME_CONVENTIONS = Object.freeze({
  rule: "Yallop-eq4.1;sunset-plus-four-ninths-positive-moonset-lag",
  pairing: "caller-supplied-evening-setting-pair;not-verified",
  arithmetic: "elapsed-epoch-milliseconds;nearest-millisecond-offset",
  scope: "evening-only;no-morning-symmetry-extension"
} as const);

export interface YallopBestTime {
  readonly model: typeof YALLOP_MODEL.id;
  readonly sunset: string;
  readonly moonset: string;
  readonly at: string;
  readonly lagMilliseconds: number;
  readonly offsetMilliseconds: number;
  readonly conventions: typeof TIME_CONVENTIONS;
  readonly receiptScope: "none;caller-supplied-setting-times";
}

/**
 * Equation 4.1, printed p. 4. The caller supplies the sunset and following
 * moonset of the same evening opportunity. This helper does not find or
 * validate horizon events or their limb/refraction convention. Nonpositive
 * lag is rejected, never wrapped onto another date. No morning rule is inferred.
 */
export function yallopBestTime(sunset: DateInput, moonset: DateInput): Readonly<YallopBestTime> {
  const start = instant(sunset, "sunset");
  const end = instant(moonset, "moonset");
  const lagMilliseconds = end.getTime() - start.getTime();
  if (!Number.isSafeInteger(lagMilliseconds) || lagMilliseconds <= 0) {
    throw new RangeError("moonset must follow sunset by a positive safe-integer number of milliseconds.");
  }
  // Exact rational rounding avoids large-epoch and large-lag multiplication
  // errors. With denominator 9 an integer-millisecond lag cannot give a tie.
  const { numerator, denominator } = YALLOP_MODEL.bestTimeLagFraction;
  const offsetMilliseconds = Number(
    (BigInt(lagMilliseconds) * BigInt(numerator) + BigInt(Math.floor(denominator / 2))) / BigInt(denominator)
  );
  const at = new Date(start.getTime() + offsetMilliseconds).toISOString();
  return Object.freeze({
    model: YALLOP_MODEL.id, sunset: start.toISOString(), moonset: end.toISOString(),
    at, lagMilliseconds, offsetMilliseconds, conventions: TIME_CONVENTIONS,
    receiptScope: "none;caller-supplied-setting-times"
  });
}
