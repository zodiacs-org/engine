import { optionsOf } from "../../src/sky/riseset.js";
import type { DateInput } from "./inputs.js";
import { yallopBestTime } from "./yallop.js";

/** Odeh's fixed empirical criterion, not caller-tunable weather parameters. */
export const ODEH_MODEL = Object.freeze({
  id: "odeh-2006/1",
  source: "https://astronomycenter.net/pdf/2006_cri.pdf",
  doi: "10.1007/s10686-005-9002-5",
  arcOfVisionPolynomialDeg: Object.freeze([7.1651, -6.3226, 0.7319, -0.1018] as const),
  categoryLowerInclusiveV: Object.freeze({ A: 5.65, B: 2, C: -0.96 }),
  bestTimeLagFraction: Object.freeze({ numerator: 4, denominator: 9 }),
  atmosphericAdjustment: "none;empirical-calibration"
} as const);

const CATEGORY_MEANINGS = Object.freeze({
  A: "unaided-eye",
  B: "optical-aid;unaided-eye-possible",
  C: "optical-aid-only",
  D: "below-optical-detection"
} as const);

export type OdehCategory = keyof typeof CATEGORY_MEANINGS;

export interface OdehGeometry {
  /** Airless topocentric Moon centre altitude at the best time, in degrees. */
  readonly moonAltitudeTopocentricDeg: number;
  /** Airless topocentric Sun centre altitude at the same time, in degrees. */
  readonly sunAltitudeTopocentricDeg: number;
  /** Topocentric width W in arcminutes, not the arcseconds of Table VI. */
  readonly crescentWidthTopocentricArcmin: number;
}

const CONVENTIONS = Object.freeze({
  epoch: "caller-supplied-best-time;not-verified",
  arcOfVision: "topocentric-moon-minus-sun-centre-altitude;airless;degrees",
  width: "caller-supplied-topocentric-crescent-width;arcminutes;no-geocentric-substitution",
  classification: "V-only;exact-boundary-in-more-visible-category;no-epsilon",
  scope: "criterion-calculation;not-observation-or-sighting-probability"
} as const);

export interface OdehCriterion {
  readonly model: typeof ODEH_MODEL.id;
  readonly parameters: typeof ODEH_MODEL;
  readonly sample: Readonly<OdehGeometry>;
  readonly arcOfVisionDeg: number;
  readonly crescentWidthArcmin: number;
  /** The published cubic at W, before adding a category threshold. */
  readonly referenceArcOfVisionDeg: number;
  /** Degree-valued residual V in equation (2), not Yallop's scaled q. */
  readonly v: number;
  readonly category: OdehCategory;
  readonly categoryMeaning: (typeof CATEGORY_MEANINGS)[OdehCategory];
  readonly conventions: typeof CONVENTIONS;
  readonly receiptScope: "none;caller-supplied-geometry";
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number.`);
  }
  return value === 0 ? 0 : value;
}

function altitude(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number < -90 || number > 90) throw new RangeError(`${label} must be in [-90, 90].`);
  return number;
}

/** Section 5, printed p. 61: equality is included in the more-visible zone. */
export function odehCategory(v: number): OdehCategory {
  const value = finite(v, "v");
  const limits = ODEH_MODEL.categoryLowerInclusiveV;
  if (value >= limits.A) return "A";
  if (value >= limits.B) return "B";
  if (value >= limits.C) return "C";
  return "D";
}

/**
 * Pure implementation of Odeh, Experimental Astronomy 18, 39-64 (2006),
 * section 5, equation (2), printed p. 61. See SOURCES.md for bibliographic
 * dating. Supply airless TOPOCENTRIC altitudes and width at the same best
 * time. Width is an input: no Yallop geocentric width, semidiameter or
 * parallax approximation is silently substituted. No engine or observation
 * eligibility check is performed. Numeric domains are not calibration bounds.
 */
export function evaluateOdeh(sample: OdehGeometry): Readonly<OdehCriterion> {
  const input = optionsOf(sample, [
    "moonAltitudeTopocentricDeg", "sunAltitudeTopocentricDeg", "crescentWidthTopocentricArcmin"
  ], "Odeh geometry");
  const moonAltitudeTopocentricDeg = altitude(input.moonAltitudeTopocentricDeg, "moonAltitudeTopocentricDeg");
  const sunAltitudeTopocentricDeg = altitude(input.sunAltitudeTopocentricDeg, "sunAltitudeTopocentricDeg");
  const crescentWidthTopocentricArcmin = finite(input.crescentWidthTopocentricArcmin, "crescentWidthTopocentricArcmin");
  // A disk's width for an exterior observer is smaller than a straight angle.
  // This only bounds numerical arithmetic; it is not an empirical Moon range.
  if (crescentWidthTopocentricArcmin < 0 || crescentWidthTopocentricArcmin >= 180 * 60) {
    throw new RangeError("crescentWidthTopocentricArcmin must be nonnegative and less than 10800 arcminutes.");
  }
  const normalized = Object.freeze({
    moonAltitudeTopocentricDeg, sunAltitudeTopocentricDeg, crescentWidthTopocentricArcmin
  });
  const arcOfVisionDeg = moonAltitudeTopocentricDeg - sunAltitudeTopocentricDeg;
  const crescentWidthArcmin = crescentWidthTopocentricArcmin;
  const [a, b, c, d] = ODEH_MODEL.arcOfVisionPolynomialDeg;
  const referenceArcOfVisionDeg = a + crescentWidthArcmin * (b + crescentWidthArcmin * (c + crescentWidthArcmin * d));
  const v = arcOfVisionDeg - referenceArcOfVisionDeg;
  const category = odehCategory(v);
  return Object.freeze({
    model: ODEH_MODEL.id, parameters: ODEH_MODEL, sample: normalized,
    arcOfVisionDeg, crescentWidthArcmin, referenceArcOfVisionDeg, v, category,
    categoryMeaning: CATEGORY_MEANINGS[category], conventions: CONVENTIONS,
    receiptScope: "none;caller-supplied-geometry"
  });
}

const TIME_CONVENTIONS = Object.freeze({
  rule: "Odeh-eq1;sunset-plus-four-ninths-positive-moonset-lag",
  pairing: "caller-supplied-evening-setting-pair;not-verified",
  arithmetic: "elapsed-epoch-milliseconds;nearest-millisecond-offset",
  scope: "evening-only;no-morning-symmetry-extension"
} as const);

export interface OdehBestTime {
  readonly model: typeof ODEH_MODEL.id;
  readonly sunset: string;
  readonly moonset: string;
  readonly at: string;
  readonly lagMilliseconds: number;
  readonly offsetMilliseconds: number;
  readonly conventions: typeof TIME_CONVENTIONS;
  readonly receiptScope: "none;caller-supplied-setting-times";
}

/**
 * Odeh equation (1), printed p. 43, explicitly adopts Yallop's evening rule.
 * Reuse its strict instant validation and exact rational rounding. The caller
 * must establish the same-evening setting pair and horizon conventions.
 * This is no authentication of events or justification of a morning rule.
 */
export function odehBestTime(sunset: DateInput, moonset: DateInput): Readonly<OdehBestTime> {
  const time = yallopBestTime(sunset, moonset);
  return Object.freeze({ ...time, model: ODEH_MODEL.id, conventions: TIME_CONVENTIONS });
}
