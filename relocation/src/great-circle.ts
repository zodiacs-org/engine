import type { GeographicPoint } from "./chart.js";
import { splitAntimeridian, wrapLongitude } from "./geography.js";
import type { PolylineVertex } from "./geography.js";

export const MAX_PATH_SAMPLES = 4_096;
/** Numerical direction ambiguity, not a geographic accuracy bound. */
export const GREAT_CIRCLE_DIRECTION_TOLERANCE = 32 * Number.EPSILON;
export const GREAT_CIRCLE_CONVENTIONS = Object.freeze({
  id: "zodiacs.relocation-great-circle.v1",
  surface: "unit-sphere;geographic-latitude;not-ellipsoidal-geodesic",
  arc: "shortest;antipodal-direction-refused",
  coordinate: "angular-distance-from-start-in-degrees",
  poles: "insert-interior-meridional-pole;break-display-geometry",
  seams: "lat-lon-interpolation;no-engine-receipt"
} as const);

export interface GreatCircleOptions {
  readonly from: GeographicPoint;
  readonly to: GeographicPoint;
  readonly stepDegrees: number;
  readonly maxSamples: number;
}

export interface GreatCircleSample {
  readonly index: number;
  readonly distanceDegrees: number;
  readonly fraction: number;
  readonly point: GeographicPoint;
}

export interface GreatCirclePlan extends GreatCircleOptions {
  readonly conventions: typeof GREAT_CIRCLE_CONVENTIONS;
  readonly lengthDegrees: number;
  readonly sampleCount: number;
  readonly samples: readonly GreatCircleSample[];
  /** Sample indices, with explicit interpolation provenance at seams. */
  readonly polylines: readonly (readonly PolylineVertex[])[];
}

export class GreatCircleBudgetError extends RangeError {
  constructor(readonly requiredSamples: number, readonly maxSamples: number) {
    super(`Great circle requires ${requiredSamples} samples; budget is ${maxSamples}.`);
    this.name = "GreatCircleBudgetError";
  }
}

type Vector = readonly [number, number, number];
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector, b: Vector): Vector =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function checkedPoint(value: GeographicPoint): GeographicPoint {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RangeError("Great-circle endpoints require geographic points.");
  }
  const lat = Object.getOwnPropertyDescriptor(value, "latitude");
  const lon = Object.getOwnPropertyDescriptor(value, "longitude");
  if (!lat || !("value" in lat) || !lon || !("value" in lon)
    || typeof lat.value !== "number" || !Number.isFinite(lat.value) || Math.abs(lat.value) > 90
    || typeof lon.value !== "number" || !Number.isFinite(lon.value) || Math.abs(lon.value) > 180) {
    throw new RangeError("Great-circle coordinates require finite in-range ordinary data values.");
  }
  return { latitude: lat.value, longitude: lon.value };
}

function vector(point: GeographicPoint): Vector {
  if (Math.abs(point.latitude) === 90) return [0, 0, Math.sign(point.latitude)];
  const phi = point.latitude * DEG;
  const lambda = wrapLongitude(point.longitude) * DEG;
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
}

/** Internal arc frame reused by the planner and crossing screen. */
export function greatCircleArc(from: GeographicPoint, to: GeographicPoint) {
  const start = vector(from);
  const finish = vector(to);
  const delta = wrapLongitude(to.longitude - from.longitude);
  const same = from.latitude === to.latitude && (delta === 0 || Math.abs(from.latitude) === 90);
  const perpendicular = cross(start, finish);
  const sine = Math.hypot(...perpendicular);
  const cosine = dot(start, finish);
  if (!same && (from.latitude === -to.latitude && (Math.abs(delta) === 180 || Math.abs(from.latitude) === 90)
    || cosine < 0 && sine <= GREAT_CIRCLE_DIRECTION_TOLERANCE)) {
    throw new RangeError("Antipodal endpoints have no unique shortest great circle; supply separate legs through a waypoint.");
  }
  const lengthDegrees = same ? 0 : Math.atan2(sine, cosine) * RAD;
  if (!same && (lengthDegrees === 0 || sine === 0)) {
    throw new RangeError("Distinct endpoints cannot be resolved at floating-point precision.");
  }
  const normal: Vector = sine === 0 ? [0, 0, 0]
    : [perpendicular[0] / sine, perpendicular[1] / sine, perpendicular[2] / sine];
  const tangent = cross(normal, start);
  // Opposite longitudes on a non-antipodal meridional arc cross one pole.
  const poleLatitude = Math.abs(delta) === 180 && Math.abs(from.latitude) !== 90 && Math.abs(to.latitude) !== 90
    ? (from.latitude + to.latitude > 0 ? 90 : -90) : null;
  const poleDistance = poleLatitude === null ? null : Math.abs(poleLatitude - from.latitude);
  const at = (distanceDegrees: number): GeographicPoint => {
    if (distanceDegrees === 0) return { ...from };
    if (distanceDegrees === lengthDegrees) return { ...to };
    if (distanceDegrees === poleDistance) return { latitude: poleLatitude!, longitude: 0 };
    const s = distanceDegrees * DEG;
    const x = start[0] * Math.cos(s) + tangent[0] * Math.sin(s);
    const y = start[1] * Math.cos(s) + tangent[1] * Math.sin(s);
    const z = start[2] * Math.cos(s) + tangent[2] * Math.sin(s);
    return { latitude: Math.atan2(z, Math.hypot(x, y)) * RAD,
      longitude: wrapLongitude(Math.atan2(y, x) * RAD) };
  };
  return { start, tangent, lengthDegrees, poleDistance, at };
}

/** Internal display helper; exact poles break longitude continuity. */
export function pathPolylines(samples: readonly { point: GeographicPoint; index: number }[],
  halfTurnDirection?: "east" | "west"): PolylineVertex[][] {
  const result: PolylineVertex[][] = [];
  let run: { point: GeographicPoint; index: number }[] = [];
  const flush = () => {
    result.push(...splitAntimeridian(run.map((sample) => sample.point), halfTurnDirection).map((segment) =>
      segment.map((vertex): PolylineVertex => ({ point: vertex.point, source: vertex.source.kind === "sample"
        ? { kind: "sample", index: run[vertex.source.index]!.index }
        : { ...vertex.source, fromIndex: run[vertex.source.fromIndex]!.index, toIndex: run[vertex.source.toIndex]!.index } }))));
    run = [];
  };
  for (const sample of samples) {
    if (Math.abs(sample.point.latitude) === 90) flush();
    else run.push(sample);
  }
  flush();
  return result;
}

/** Pure spherical geometry, with allocation preflight and inclusive endpoints. */
export function planGreatCircle(options: GreatCircleOptions): GreatCirclePlan {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new RangeError("Great-circle options require endpoints, step and sample limit.");
  }
  const from = checkedPoint(options.from);
  const to = checkedPoint(options.to);
  const { stepDegrees, maxSamples } = options;
  if (typeof stepDegrees !== "number" || !Number.isFinite(stepDegrees) || stepDegrees <= 0 || stepDegrees > 180) {
    throw new RangeError("Great-circle step must be finite, positive degrees at most 180.");
  }
  if (!Number.isSafeInteger(maxSamples) || maxSamples < 1 || maxSamples > MAX_PATH_SAMPLES) {
    throw new RangeError(`Great-circle maxSamples must be an integer between 1 and ${MAX_PATH_SAMPLES}.`);
  }
  const arc = greatCircleArc(from, to);
  const { lengthDegrees, poleDistance } = arc;
  const intervals = lengthDegrees === 0 ? 0 : Math.max(1, Math.ceil(lengthDegrees / stepDegrees));
  const poleOnRow = poleDistance !== null && poleDistance / stepDegrees < intervals
    && Number.isInteger(poleDistance / stepDegrees) && (poleDistance / stepDegrees) * stepDegrees === poleDistance;
  const sampleCount = intervals + 1 + (poleDistance !== null && !poleOnRow ? 1 : 0);
  if (!Number.isSafeInteger(sampleCount) || sampleCount > maxSamples) {
    throw new GreatCircleBudgetError(sampleCount, maxSamples);
  }
  const distances: number[] = [];
  for (let index = 0; index <= intervals; index++) {
    const distance = index === intervals ? lengthDegrees : index * stepDegrees;
    if (index > 0 && (distance <= distances[index - 1]! || distance > lengthDegrees)) {
      throw new RangeError("Great-circle step cannot produce distinct ordered distances.");
    }
    distances.push(distance);
  }
  if (poleDistance !== null && !poleOnRow) distances.push(poleDistance);
  distances.sort((a, b) => a - b);
  const samples = distances.map((distanceDegrees, index) => ({ index, distanceDegrees,
    fraction: lengthDegrees === 0 ? 0 : distanceDegrees / lengthDegrees, point: arc.at(distanceDegrees) }));
  return { from, to, stepDegrees, maxSamples, conventions: GREAT_CIRCLE_CONVENTIONS, lengthDegrees,
    sampleCount, samples, polylines: pathPolylines(samples) };
}
