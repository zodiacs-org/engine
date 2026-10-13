import { RA_POLE_TOLERANCE } from "@zodiacs/engine";
import { calc, houses } from "@zodiacs/engine/calc";
import type { CalcPosition, CalcRefusal, CalcTime, HousesResult } from "@zodiacs/engine/calc";
import { natalReplayInput } from "@zodiacs/engine/receipt";
import type { NatalEnvelope } from "@zodiacs/engine/receipt";
import { sourceEnvelope } from "./chart.js";
import type { GeographicPoint, RelocationSource } from "./chart.js";
import { horizonCoincides, observerAngles } from "./angular-geometry.js";
import type { ObserverAngles } from "./angular-geometry.js";

export const RELOCATION_ANGLES_SCHEMA = "zodiacs.relocation-angles.v1";
export const MAX_ANGLE_EVALUATIONS = 4_096;
export const ANGULAR_BODIES = Object.freeze([
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"
] as const);
export type AngularBody = typeof ANGULAR_BODIES[number];
export type AngularLine = "ASC" | "DSC" | "MC" | "IC";

/** Versioned library geometry; engine receipts below describe engine work only. */
export const ANGULAR_CONVENTIONS = Object.freeze({
  id: "zodiacs.relocation-angular-conventions.v1",
  frame: "equatorial-true-of-date",
  center: "geocentric",
  correction: "apparent;engine-moon-series-at-instant;no-deflection",
  horizon: "geodetic-tangent-plane;body-center;no-refraction;no-parallax;no-limb",
  MC: "upper-meridian;hour-angle-zero",
  IC: "lower-meridian;hour-angle-half-turn",
  ASC: "zero-altitude;eastern-branch;fixed-direction-rising",
  DSC: "zero-altitude;western-branch;fixed-direction-setting",
  azimuth: "north-through-east",
  units: "degrees",
  singularity: "unit-vector-projection-at-or-below-engine-RA_POLE_TOLERANCE",
  receiptScope: "engine-positions-and-houses;library-horizon-rotation-is-derived"
} as const);

export interface AngularSamplingOptions {
  /** Defaults to Sun, Moon and the planets. Unique, nonempty, case-sensitive. */
  readonly bodies?: readonly AngularBody[];
  /** Position calls plus one houses call per nonpolar point; source capture is additional. */
  readonly maxEvaluations: number;
}

export interface EquatorialSample {
  readonly body: AngularBody;
  readonly rightAscension: number | null;
  readonly declination: number;
  readonly raUndefined: "celestial-pole" | null;
  /** Full fresh engine result, including bounds and the unmodified calc receipt. */
  readonly engine: CalcPosition;
}

export interface ObserverBodySample extends ObserverAngles {
  readonly body: AngularBody;
  /** Index in result.positions, the result with this direction's engine receipt. */
  readonly positionIndex: number;
}

export type AngularObserverSample = {
  readonly index: number;
  readonly point: GeographicPoint;
} & ({
  readonly status: "ok";
  /** Engine result with ARMC, cusps, requested/actual houses and receipt. */
  readonly engine: HousesResult;
  /** Engine ecliptic axes, masked where the horizon intersection is not unique. */
  readonly eclipticAngles: { readonly asc: number | null; readonly dsc: number | null;
    readonly mc: number; readonly ic: number };
  readonly ascendantUndefined: "ecliptic-horizon-coincidence" | null;
  readonly bodies: readonly ObserverBodySample[];
} | {
  readonly status: "undefined";
  readonly reason: "geographic-pole";
  readonly engine: null;
  readonly bodies: readonly [];
});

interface AngularResultBase {
  readonly schema: typeof RELOCATION_ANGLES_SCHEMA;
  readonly conventions: typeof ANGULAR_CONVENTIONS;
  readonly natal: NatalEnvelope;
  /** Actual calc request time, including any scale conversion to Julian date. */
  readonly time: CalcTime;
  readonly evaluations: { readonly positions: number; readonly houses: number };
}

export type AngularSamplingResult = AngularResultBase & ({
  readonly status: "ok";
  readonly positions: readonly EquatorialSample[];
  readonly samples: readonly AngularObserverSample[];
} | {
  readonly status: "refused";
  readonly reason: "unknown-time" | "engine-refusal";
  readonly engineRefusal: CalcRefusal | null;
  /** No partial geometry on refusal. */
  readonly positions: readonly [];
  readonly samples: readonly [];
});

export class AngularBudgetError extends RangeError {
  readonly requiredEvaluations: number;
  readonly maxEvaluations: number;
  constructor(requiredEvaluations: number, maxEvaluations: number) {
    super(`Angular sampling requires ${requiredEvaluations} evaluations; budget is ${maxEvaluations}.`);
    this.name = "AngularBudgetError";
    this.requiredEvaluations = requiredEvaluations;
    this.maxEvaluations = maxEvaluations;
  }
}

function checkedBodies(value: readonly AngularBody[] | undefined): AngularBody[] {
  if (value === undefined) return [...ANGULAR_BODIES];
  if (!Array.isArray(value) || value.length < 1 || value.length > ANGULAR_BODIES.length) {
    throw new RangeError("Angular bodies require a nonempty array of Sun, Moon or planet names.");
  }
  const result: AngularBody[] = [];
  for (let index = 0; index < value.length; index++) {
    const slot = Object.getOwnPropertyDescriptor(value, String(index));
    if (!slot || !("value" in slot) || !ANGULAR_BODIES.includes(slot.value) || result.includes(slot.value)) {
      throw new RangeError("Angular body names must be supported, unique ordinary data entries.");
    }
    result.push(slot.value as AngularBody);
  }
  return result;
}

function checkedPoints(points: readonly GeographicPoint[]): GeographicPoint[] {
  if (!Array.isArray(points) || points.length < 1 || points.length > MAX_ANGLE_EVALUATIONS) {
    throw new RangeError("Angular sampling requires a nonempty, bounded array of points.");
  }
  const result: GeographicPoint[] = [];
  for (let index = 0; index < points.length; index++) {
    const slot = Object.getOwnPropertyDescriptor(points, String(index));
    if (!slot || !("value" in slot) || slot.value === null || typeof slot.value !== "object") {
      throw new RangeError("Angular points require ordinary latitude and longitude data entries.");
    }
    const lat = Object.getOwnPropertyDescriptor(slot.value, "latitude");
    const lon = Object.getOwnPropertyDescriptor(slot.value, "longitude");
    if (!lat || !("value" in lat) || !lon || !("value" in lon)
      || typeof lat.value !== "number" || !Number.isFinite(lat.value) || Math.abs(lat.value) > 90
      || typeof lon.value !== "number" || !Number.isFinite(lon.value) || Math.abs(lon.value) > 180) {
      throw new RangeError("Angular coordinates must be finite in-range geographic degrees.");
    }
    result.push({ latitude: lat.value, longitude: lon.value });
  }
  return result;
}

/** Same named clock and pin as replay. Only non-UTC clocks need a Julian date. */
function samplingTime(natal: NatalEnvelope): CalcTime {
  const input = natalReplayInput(natal);
  const pin = input.deltaT === undefined ? {} : { deltaT: input.deltaT };
  const instant = natal.receipt.instant;
  return input.timeScale === undefined || input.timeScale === "utc"
    ? { iso: instant, ...pin }
    : { jd: 2_451_545 + (Date.parse(instant) - 946_728_000_000) / 86_400_000,
      scale: input.timeScale, ...pin };
}

/**
 * Sample engine directions once, and engine observer axes at bounded points.
 * Positions are recomputed from the source request, never taken as authentic
 * from an imported chart. Geographic poles are explicit undefined samples.
 * ASC/DSC refer to the full planetary direction, not a cusp conjunction.
 */
export function sampleAngles(source: RelocationSource, points: readonly GeographicPoint[],
  options: AngularSamplingOptions): AngularSamplingResult {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new RangeError("Angular options require an evaluation budget.");
  }
  const maxEvaluations = options.maxEvaluations;
  if (!Number.isSafeInteger(maxEvaluations) || maxEvaluations < 1 || maxEvaluations > MAX_ANGLE_EVALUATIONS) {
    throw new RangeError(`Angular maxEvaluations must be an integer between 1 and ${MAX_ANGLE_EVALUATIONS}.`);
  }
  const bodies = checkedBodies(options.bodies);
  // Bound the caller's array before copying any of its coordinates.
  if (!Array.isArray(points) || points.length < 1 || points.length > MAX_ANGLE_EVALUATIONS) {
    throw new RangeError("Angular sampling requires a nonempty, bounded array of points.");
  }
  const places = checkedPoints(points);
  const requiredEvaluations = bodies.length + places.filter((point) => Math.abs(point.latitude) !== 90).length;
  if (requiredEvaluations > maxEvaluations) throw new AngularBudgetError(requiredEvaluations, maxEvaluations);
  const natal = sourceEnvelope(source);
  const time = samplingTime(natal);
  const evaluations = { positions: 0, houses: 0 };
  const base: AngularResultBase = { schema: RELOCATION_ANGLES_SCHEMA, conventions: ANGULAR_CONVENTIONS, natal, time, evaluations };
  if (!natal.receipt.timeKnown) {
    return { ...base, status: "refused", reason: "unknown-time", engineRefusal: null, positions: [], samples: [] };
  }
  const positions: EquatorialSample[] = [];
  for (const body of bodies) {
    evaluations.positions++;
    const engine = calc({ body, time, frame: "equatorial-true-of-date", center: "geocentric",
      zodiac: "tropical", flags: { correction: "apparent", speeds: false, units: "degrees" } });
    if (engine.status === "refused") {
      return { ...base, status: "refused", reason: "engine-refusal", engineRefusal: engine, positions: [], samples: [] };
    }
    const raDefined = Math.abs(Math.cos(engine.lat * Math.PI / 180)) > RA_POLE_TOLERANCE;
    positions.push({ body, rightAscension: raDefined ? engine.lon : null, declination: engine.lat,
      raUndefined: raDefined ? null : "celestial-pole", engine });
  }
  const samples: AngularObserverSample[] = [];
  for (const [index, point] of places.entries()) {
    if (Math.abs(point.latitude) === 90) {
      samples.push({ index, point, status: "undefined", reason: "geographic-pole", engine: null, bodies: [] });
      continue;
    }
    evaluations.houses++;
    const engine = houses({ time, place: point, houseSystem: natal.receipt.houses.requested });
    if (engine.status === "refused") {
      return { ...base, status: "refused", reason: "engine-refusal", engineRefusal: engine, positions: [], samples: [] };
    }
    const coincidence = horizonCoincides(point.latitude, engine.armc, engine.obliquity);
    samples.push({ index, point, status: "ok", engine,
      eclipticAngles: { ...engine.angles, asc: coincidence ? null : engine.angles.asc,
        dsc: coincidence ? null : engine.angles.dsc },
      ascendantUndefined: coincidence ? "ecliptic-horizon-coincidence" : null,
      bodies: positions.map((position, positionIndex) => ({ body: position.body, positionIndex,
        ...observerAngles(position.rightAscension, position.declination, engine.armc, point.latitude) })) });
  }
  return { ...base, status: "ok", positions, samples };
}
