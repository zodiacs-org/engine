import type { CalcRefusal } from "../../src/calc.js";
import { optionsOf } from "../../src/sky/riseset.js";
import { sunBodyGeometry } from "./geometry.js";
import type { SunBodyGeometry } from "./geometry.js";
import { visibilityBody } from "./inputs.js";
import type { DateInput, Observer, VisibilityBody } from "./inputs.js";

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

const HORIZON_CONVENTIONS = Object.freeze({
  source: "Schoch1924:p731",
  epoch: "caller-supplied-airless-body-centre-horizon-crossing",
  solarAltitude: "airless-centre;geodetic-tangent-plane",
  threshold: "caller-supplied;no-body-calibration",
  comparison: "solar-depression-at-least-threshold;inclusive;no-epsilon"
} as const);

export interface HorizonArcusVisionis {
  readonly model: "horizon-arcus-visionis/1";
  /** By definition, not a measured altitude or a check of the epoch. */
  readonly bodyAltitudeDeg: 0;
  readonly sunAltitudeDeg: number;
  readonly solarDepressionDeg: number;
  readonly requiredSolarDepressionDeg: number;
  readonly marginDeg: number;
  readonly passesCriterion: boolean;
  readonly conventions: typeof HORIZON_CONVENTIONS;
}

/**
 * Schoch (1924), p. 731: airless solar depression at the body's airless
 * horizon crossing, compared with a caller-selected arcus threshold.
 * The caller must supply the Sun's altitude at that crossing. This pure
 * helper neither finds nor authenticates it. Thresholds are empirical and
 * appearance-specific; no universal planetary or lunar calibration is implied.
 * See SOURCES.md, Planetary visibility.
 */
export function horizonArcusVisionis(
  sunAltitudeDeg: number, requiredSolarDepressionDeg: number
): Readonly<HorizonArcusVisionis> {
  const sun = numberIn(sunAltitudeDeg, -90, 90, "sunAltitudeDeg");
  const required = numberIn(requiredSolarDepressionDeg, 0, 90, "requiredSolarDepressionDeg");
  const depression = sun === 0 ? 0 : -sun;
  return Object.freeze({
    model: "horizon-arcus-visionis/1", bodyAltitudeDeg: 0,
    sunAltitudeDeg: sun, solarDepressionDeg: depression, requiredSolarDepressionDeg: required,
    marginDeg: depression - required, passesCriterion: depression >= required,
    conventions: HORIZON_CONVENTIONS
  });
}

/**
 * Rozenberg's total relative air mass, as Schaefer (1993), eq. (2b), gives it.
 * The input is APPARENT (refracted) altitude, degrees in [0, 90]. This is not
 * the engine's airless altitude. The approximation is used as printed, so
 * its zenith value is slightly below one. No atmospheric components are fitted.
 */
export function rozenbergAirmass(apparentAltitudeDeg: number): number {
  const altitude = numberIn(apparentAltitudeDeg, 0, 90, "apparentAltitudeDeg");
  const sine = Math.sin(altitude * Math.PI / 180);
  return 1 / (sine + 0.025 * Math.exp(-11 * sine));
}

export interface ArcusPhotometry {
  /** Total visual magnitude before terrestrial atmospheric attenuation. */
  readonly magnitudeOutsideAtmosphere: number;
  /** Nonnegative scalar attenuation in visual magnitudes per air mass. */
  readonly extinctionMagPerAirmass: number;
  /** Faintest attenuated visual magnitude accepted at the target's direction. */
  readonly limitingMagnitude: number;
  /** Explicit upward correction from airless to apparent body altitude, degrees. */
  readonly refractionDeg: number;
}

export interface ArcusVisibilityParameters {
  /** A configurable extension, not Schoch's horizon calibration or Schaefer's vision model. */
  readonly model: "arcus-visionis-altitude/1";
  readonly minimumSolarDepressionDeg: number;
  readonly minimumBodyAltitudeDeg: number;
  /** Required explicit choice. null disables the point-source magnitude screen. */
  readonly photometry: Readonly<ArcusPhotometry> | null;
}

export interface ArcusSample {
  readonly body: VisibilityBody;
  /** Airless topocentric centre altitude above the geodetic tangent plane. */
  readonly sunAltitudeDeg: number;
  /** Airless topocentric centre altitude above the geodetic tangent plane. */
  readonly bodyAltitudeDeg: number;
}

export type ArcusPhotometryResult =
  | Readonly<{ status: "disabled" }>
  | Readonly<{
    status: "unavailable";
    reason: "apparent-altitude-out-of-domain";
    apparentAltitudeDeg: number;
  }>
  | Readonly<{
    status: "evaluated";
    apparentAltitudeDeg: number;
    airmass: number;
    extinctionMagnitude: number;
    magnitudeAtObserver: number;
    marginMagnitude: number;
    passesCriterion: boolean;
  }>;

export type ArcusFailedCriterion = "body-altitude" | "solar-depression" | "magnitude" | "photometry-unavailable";

const SCREEN_CONVENTIONS = Object.freeze({
  scope: "custom-threshold-screen;not-sighting-probability",
  altitudes: "topocentric;airless-centres;geodetic-tangent-plane;no-dip",
  comparison: "inclusive;no-epsilon",
  airmass: "rozenberg1966;Schaefer1993:eq2b;apparent-altitude",
  attenuation: "Schaefer1993:eq8a;kX-from-outside-atmosphere;scalar-approximation",
  magnitude: "visual;caller-supplied;fixed-limit-at-target;no-sky-brightness-model",
  refraction: "caller-supplied-body-correction-for-photometry-only",
  moon: "geometry-only;not-crescent-visibility"
} as const);

export interface ArcusVisibilityCriterion {
  readonly model: Readonly<ArcusVisibilityParameters>;
  readonly sample: Readonly<ArcusSample>;
  readonly solarDepressionDeg: number;
  readonly passesCriterion: boolean;
  /** Nonnegative margins pass; magnitude is null when disabled or unavailable. */
  readonly margins: Readonly<{ bodyAltitudeDeg: number; solarDepressionDeg: number; magnitude: number | null }>;
  readonly failedCriteria: readonly ArcusFailedCriterion[];
  readonly photometry: ArcusPhotometryResult;
  readonly conventions: typeof SCREEN_CONVENTIONS;
}

function parametersOf(value: ArcusVisibilityParameters): Readonly<ArcusVisibilityParameters> {
  const input = optionsOf(value, ["model", "minimumSolarDepressionDeg", "minimumBodyAltitudeDeg", "photometry"], "visibility model");
  if (input.model !== "arcus-visionis-altitude/1") {
    throw new RangeError('model must be "arcus-visionis-altitude/1".');
  }
  const minimumSolarDepressionDeg = numberIn(input.minimumSolarDepressionDeg, 0, 90, "minimumSolarDepressionDeg");
  const minimumBodyAltitudeDeg = numberIn(input.minimumBodyAltitudeDeg, 0, 90, "minimumBodyAltitudeDeg");
  let photometry: Readonly<ArcusPhotometry> | null = null;
  if (input.photometry !== null) {
    const photo = optionsOf(input.photometry,
      ["magnitudeOutsideAtmosphere", "extinctionMagPerAirmass", "limitingMagnitude", "refractionDeg"], "photometry");
    const extinction = finite(photo.extinctionMagPerAirmass, "extinctionMagPerAirmass");
    if (extinction < 0) throw new RangeError("extinctionMagPerAirmass must be nonnegative.");
    photometry = Object.freeze({
      magnitudeOutsideAtmosphere: finite(photo.magnitudeOutsideAtmosphere, "magnitudeOutsideAtmosphere"),
      extinctionMagPerAirmass: extinction,
      limitingMagnitude: finite(photo.limitingMagnitude, "limitingMagnitude"),
      refractionDeg: numberIn(photo.refractionDeg, 0, 90, "refractionDeg")
    });
  }
  return Object.freeze({ model: input.model, minimumSolarDepressionDeg, minimumBodyAltitudeDeg, photometry });
}

function checkBodyModel(body: VisibilityBody, model: Readonly<ArcusVisibilityParameters>): void {
  if (body === "Moon" && model.photometry !== null) {
    throw new RangeError("Lunar crescent visibility cannot use the point-source magnitude screen; use photometry: null.");
  }
}

function photometryAt(altitude: number, parameters: Readonly<ArcusPhotometry> | null): ArcusPhotometryResult {
  if (parameters === null) return Object.freeze({ status: "disabled" });
  const apparentAltitudeDeg = altitude + parameters.refractionDeg;
  if (apparentAltitudeDeg < 0 || apparentAltitudeDeg > 90) {
    return Object.freeze({ status: "unavailable", reason: "apparent-altitude-out-of-domain", apparentAltitudeDeg });
  }
  const airmass = rozenbergAirmass(apparentAltitudeDeg);
  const extinctionMagnitude = finite(parameters.extinctionMagPerAirmass * airmass, "derived extinctionMagnitude");
  const magnitudeAtObserver = finite(parameters.magnitudeOutsideAtmosphere + extinctionMagnitude, "derived magnitudeAtObserver");
  const marginMagnitude = finite(parameters.limitingMagnitude - magnitudeAtObserver, "derived marginMagnitude");
  return Object.freeze({
    status: "evaluated", apparentAltitudeDeg, airmass, extinctionMagnitude,
    magnitudeAtObserver, marginMagnitude, passesCriterion: magnitudeAtObserver <= parameters.limitingMagnitude
  });
}

function evaluate(sample: Readonly<ArcusSample>, model: Readonly<ArcusVisibilityParameters>): Readonly<ArcusVisibilityCriterion> {
  const solarDepressionDeg = sample.sunAltitudeDeg === 0 ? 0 : -sample.sunAltitudeDeg;
  const photometry = photometryAt(sample.bodyAltitudeDeg, model.photometry);
  const margins = Object.freeze({
    bodyAltitudeDeg: sample.bodyAltitudeDeg - model.minimumBodyAltitudeDeg,
    solarDepressionDeg: solarDepressionDeg - model.minimumSolarDepressionDeg,
    magnitude: photometry.status === "evaluated" ? photometry.marginMagnitude : null
  });
  const failedCriteria: ArcusFailedCriterion[] = [];
  if (sample.bodyAltitudeDeg < model.minimumBodyAltitudeDeg) failedCriteria.push("body-altitude");
  if (solarDepressionDeg < model.minimumSolarDepressionDeg) failedCriteria.push("solar-depression");
  if (photometry.status === "unavailable") failedCriteria.push("photometry-unavailable");
  if (photometry.status === "evaluated" && !photometry.passesCriterion) failedCriteria.push("magnitude");
  return Object.freeze({
    model, sample, solarDepressionDeg, passesCriterion: failedCriteria.length === 0,
    margins, failedCriteria: Object.freeze(failedCriteria), photometry, conventions: SCREEN_CONVENTIONS
  });
}

/**
 * Explicit custom extension of the arcus approach to an arbitrary instant.
 * Both airless altitude thresholds must pass, plus the optional magnitude
 * screen. This does not evaluate Schoch's horizon criterion away from its
 * reference epoch. No parameters or brightness values are inferred.
 * Scalar kX near the horizon is only a rough screen; Schaefer's component
 * extinction, sky brightness and observer vision models are not implemented.
 */
export function evaluateArcusVisibility(
  sample: ArcusSample, parameters: ArcusVisibilityParameters
): Readonly<ArcusVisibilityCriterion> {
  const input = optionsOf(sample, ["body", "sunAltitudeDeg", "bodyAltitudeDeg"], "visibility sample");
  const body = visibilityBody(input.body);
  const model = parametersOf(parameters);
  checkBodyModel(body, model);
  return evaluate(Object.freeze({
    body, sunAltitudeDeg: numberIn(input.sunAltitudeDeg, -90, 90, "sunAltitudeDeg"),
    bodyAltitudeDeg: numberIn(input.bodyAltitudeDeg, -90, 90, "bodyAltitudeDeg")
  }), model);
}

const UNITS = Object.freeze({ angles: "degrees", magnitudes: "visual-magnitudes", extinction: "magnitudes-per-airmass", airmass: "relative" } as const);

export interface ArcusVisibility {
  readonly status: "ok";
  readonly body: VisibilityBody;
  readonly at: string;
  readonly observer: Readonly<Required<Observer>>;
  readonly geometry: SunBodyGeometry;
  readonly criterion: Readonly<ArcusVisibilityCriterion>;
  /** The engine receipts cover positions only, not the derived visibility screen. */
  readonly receiptScope: "positions";
  readonly units: typeof UNITS;
  readonly conventions: typeof SCREEN_CONVENTIONS;
}

export type ArcusVisibilityResult = ArcusVisibility | CalcRefusal;

/** Custom screen using the engine's topocentric geometry, with intact position receipts. */
export function arcusVisibility(
  body: VisibilityBody, at: DateInput, site: Observer, parameters: ArcusVisibilityParameters
): ArcusVisibilityResult {
  const name = visibilityBody(body);
  const model = parametersOf(parameters);
  checkBodyModel(name, model);
  const geometry = sunBodyGeometry(name, at, site);
  if (geometry.status === "refused") return geometry;
  const criterion = evaluate(Object.freeze({
    body: name,
    sunAltitudeDeg: geometry.topocentric.sun.horizontal.altitudeDeg,
    bodyAltitudeDeg: geometry.topocentric.target.horizontal.altitudeDeg
  }), model);
  return Object.freeze({
    status: "ok", body: name, at: geometry.at, observer: geometry.observer,
    geometry, criterion, receiptScope: "positions", units: UNITS, conventions: SCREEN_CONVENTIONS
  });
}
