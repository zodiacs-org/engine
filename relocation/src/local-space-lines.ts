import { AngularBudgetError, checkedBodies, MAX_ANGLE_EVALUATIONS, sampleAdditionalAngles,
  sampleAngles } from "./angles.js";
import type { AngularBody, AngularSamplingResult } from "./angles.js";
import type { GeographicPoint, RelocationSource } from "./chart.js";
import type { PolylineVertex } from "./geography.js";
import { wrapLongitude } from "./geography.js";
import { MAX_PATH_SAMPLES, pathPolylines } from "./great-circle.js";
import { azimuthArc } from "./local-space-geometry.js";

export const RELOCATION_LOCAL_SPACE_SCHEMA = "zodiacs.relocation-local-space.v1";
export const LOCAL_SPACE_CONVENTIONS = Object.freeze({
  id: "zodiacs.relocation-local-space-conventions.v1",
  bearing: "origin-geocentric-unrefracted-azimuth;north-through-east",
  surface: "unit-sphere;geographic-latitude;not-ellipsoidal-geodesic",
  route: "directed-great-circle;fixed-origin-bearing;inclusive-endpoints",
  opposite: "origin-bearing-plus-half-turn",
  distance: "angular-degrees;at-most-half-turn;not-kilometers",
  residual: "sampled-body-azimuth-minus-forward-course;axis-folded-to-[-90,90)",
  poles: "undefined-origin-bearing;insert-meridional-pole;break-display-geometry",
  seams: "lat-lon-interpolation;no-engine-receipt",
  receiptScope: "engine-positions-and-observers;bearings-and-routes-are-derived"
} as const);

export type LocalSpaceDirection = "forward" | "opposite";

export interface LocalSpaceLineOptions {
  readonly origin: GeographicPoint;
  readonly lengthDegrees: number;
  readonly stepDegrees: number;
  readonly bodies?: readonly AngularBody[];
  /** Defaults to forward followed by opposite. */
  readonly directions?: readonly LocalSpaceDirection[];
  readonly maxEvaluations: number;
}

export interface LocalSpaceLinePlan {
  readonly origin: GeographicPoint;
  readonly lengthDegrees: number;
  readonly stepDegrees: number;
  readonly bodies: readonly AngularBody[];
  readonly directions: readonly LocalSpaceDirection[];
  readonly distances: readonly number[];
  readonly maxEvaluations: number;
  /** Conservative: reserves an additional interior pole for every nonzero ray. */
  readonly requiredEvaluations: number;
  readonly maximumObserverSamples: number;
}

export interface LocalSpaceLineSample {
  readonly observerIndex: number;
  readonly distanceDegrees: number;
  readonly fraction: number;
  readonly status: "ok" | "undefined";
  readonly reason: "geographic-pole" | null;
  /** Tangent direction along the geographic ray, not a constant compass heading. */
  readonly courseAzimuth: number | null;
  /** Engine-backed body azimuth at this sample, with its undefined reason. */
  readonly bodyAzimuth: number | null;
  readonly azimuthUndefined: "geographic-pole" | "zenith-or-nadir" | null;
  /** Axis alignment diagnostic in degrees, null when either bearing is undefined. */
  readonly residual: number | null;
}

export interface LocalSpacePolyline {
  readonly body: AngularBody;
  readonly direction: LocalSpaceDirection;
  readonly positionIndex: number;
  readonly originObserverIndex: 0;
  readonly status: "sampled" | "undefined";
  readonly reason: "geographic-pole" | "zenith-or-nadir" | null;
  readonly originAzimuth: number | null;
  readonly bearing: number | null;
  readonly samples: readonly LocalSpaceLineSample[];
  /** Vertex indices reference sampling.samples; seam vertices have no receipt. */
  readonly polylines: readonly (readonly PolylineVertex[])[];
}

interface LocalSpaceResultBase {
  readonly schema: typeof RELOCATION_LOCAL_SPACE_SCHEMA;
  readonly conventions: typeof LOCAL_SPACE_CONVENTIONS;
  readonly plan: LocalSpaceLinePlan;
}

export type LocalSpaceLinesResult = LocalSpaceResultBase & ({
  readonly status: "ok";
  readonly sampling: Extract<AngularSamplingResult, { status: "ok" }>;
  readonly lines: readonly LocalSpacePolyline[];
} | {
  readonly status: "refused";
  readonly reason: "unknown-time" | "engine-refusal";
  readonly sampling: Extract<AngularSamplingResult, { status: "refused" }>;
  readonly lines: readonly [];
});

function checkedOrigin(value: GeographicPoint): GeographicPoint {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RangeError("Local-space origin requires a geographic point.");
  }
  const lat = Object.getOwnPropertyDescriptor(value, "latitude");
  const lon = Object.getOwnPropertyDescriptor(value, "longitude");
  if (!lat || !("value" in lat) || !lon || !("value" in lon)
    || typeof lat.value !== "number" || !Number.isFinite(lat.value) || Math.abs(lat.value) > 90
    || typeof lon.value !== "number" || !Number.isFinite(lon.value) || Math.abs(lon.value) > 180) {
    throw new RangeError("Local-space origin requires finite in-range ordinary coordinate values.");
  }
  return { latitude: lat.value, longitude: lon.value };
}

function checkedDirections(value: readonly LocalSpaceDirection[] | undefined): LocalSpaceDirection[] {
  if (value === undefined) return ["forward", "opposite"];
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new RangeError("Local-space directions require a nonempty array of forward or opposite.");
  }
  const result: LocalSpaceDirection[] = [];
  for (let index = 0; index < value.length; index++) {
    const slot = Object.getOwnPropertyDescriptor(value, String(index));
    if (!slot || !("value" in slot) || !["forward", "opposite"].includes(slot.value) || result.includes(slot.value)) {
      throw new RangeError("Local-space directions require supported, unique ordinary entries.");
    }
    result.push(slot.value as LocalSpaceDirection);
  }
  return result;
}

/** Reserve origin, all ray vertices and possible pole insertions before source capture. */
export function planLocalSpaceLines(options: LocalSpaceLineOptions): LocalSpaceLinePlan {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new RangeError("Local-space options require origin, arc length, step and evaluation budget.");
  }
  const origin = checkedOrigin(options.origin);
  const { lengthDegrees, stepDegrees, maxEvaluations } = options;
  if (typeof lengthDegrees !== "number" || !Number.isFinite(lengthDegrees) || lengthDegrees < 0 || lengthDegrees > 180) {
    throw new RangeError("Local-space lengthDegrees must be finite degrees between 0 and 180.");
  }
  if (lengthDegrees > 0 && lengthDegrees * Math.PI / 180 === 0) {
    throw new RangeError("Local-space length cannot be resolved at floating-point precision.");
  }
  if (typeof stepDegrees !== "number" || !Number.isFinite(stepDegrees) || stepDegrees <= 0 || stepDegrees > 90) {
    throw new RangeError("Local-space stepDegrees must be positive finite degrees at most 90.");
  }
  if (!Number.isSafeInteger(maxEvaluations) || maxEvaluations < 1 || maxEvaluations > MAX_ANGLE_EVALUATIONS) {
    throw new RangeError(`Local-space maxEvaluations must be an integer between 1 and ${MAX_ANGLE_EVALUATIONS}.`);
  }
  const bodies = checkedBodies(options.bodies);
  const directions = checkedDirections(options.directions);
  const intervals = lengthDegrees === 0 ? 0 : Math.max(1, Math.ceil(lengthDegrees / stepDegrees));
  const maximumObserverSamples = Math.abs(origin.latitude) === 90 ? 1
    : 1 + bodies.length * directions.length * (intervals + Number(lengthDegrees > 0));
  const requiredEvaluations = bodies.length + (Math.abs(origin.latitude) === 90 ? 0 : maximumObserverSamples);
  if (!Number.isSafeInteger(requiredEvaluations) || requiredEvaluations > maxEvaluations) {
    throw new AngularBudgetError(requiredEvaluations, maxEvaluations);
  }
  if (maximumObserverSamples > MAX_PATH_SAMPLES) {
    throw new RangeError(`Local-space observer sample count must not exceed ${MAX_PATH_SAMPLES}.`);
  }
  // No route can be chosen at a geographic pole; avoid allocating irrelevant distances.
  const distances: number[] = [];
  if (Math.abs(origin.latitude) !== 90) {
    for (let index = 0; index <= intervals; index++) {
      const distance = index === intervals ? lengthDegrees : index * stepDegrees;
      if (index > 0 && (distance <= distances[index - 1]! || distance > lengthDegrees)) {
        throw new RangeError("Local-space step cannot produce distinct ordered distances at floating-point precision.");
      }
      distances.push(distance);
    }
  }
  return { origin, lengthDegrees, stepDegrees, bodies, directions, distances, maxEvaluations,
    requiredEvaluations, maximumObserverSamples };
}

/** Fresh engine directions define origin bearings; only spherical routes are constructed here. */
export function localSpaceLines(source: RelocationSource, options: LocalSpaceLineOptions): LocalSpaceLinesResult {
  const plan = planLocalSpaceLines(options);
  const base: LocalSpaceResultBase = { schema: RELOCATION_LOCAL_SPACE_SCHEMA, conventions: LOCAL_SPACE_CONVENTIONS, plan };
  const seed = sampleAngles(source, [plan.origin], { bodies: plan.bodies, maxEvaluations: plan.maxEvaluations });
  if (seed.status === "refused") return { ...base, status: "refused", reason: seed.reason, sampling: seed, lines: [] };
  const origin = seed.samples[0]!;
  const points: GeographicPoint[] = [];
  const lines: LocalSpacePolyline[] = [];
  for (const [positionIndex, position] of seed.positions.entries()) {
    const originAzimuth = origin.status === "ok" ? origin.bodies[positionIndex]!.azimuth : null;
    for (const direction of plan.directions) {
      const bearing = originAzimuth === null ? null
        : ((originAzimuth + (direction === "opposite" ? 180 : 0)) % 360);
      const reason = origin.status === "undefined" ? "geographic-pole" : bearing === null ? "zenith-or-nadir" : null;
      const samples: LocalSpaceLineSample[] = [];
      if (bearing !== null) {
        const arc = azimuthArc(plan.origin, bearing, plan.lengthDegrees);
        const distances = [...plan.distances];
        if (arc.interiorPole !== null && !distances.includes(arc.interiorPole)) distances.push(arc.interiorPole);
        distances.sort((a, b) => a - b);
        let previous: GeographicPoint | null = null;
        for (const distanceDegrees of distances) {
          const point = arc.at(distanceDegrees);
          if (previous !== null && point.latitude === previous.latitude
            && wrapLongitude(point.longitude - previous.longitude) === 0) {
            throw new RangeError("Local-space samples cannot be distinguished at floating-point precision.");
          }
          previous = point;
          const observerIndex = distanceDegrees === 0 ? 0 : points.length + 1;
          if (distanceDegrees !== 0) points.push(point);
          const polar = Math.abs(point.latitude) === 90;
          samples.push({ observerIndex, distanceDegrees, fraction: plan.lengthDegrees === 0 ? 0 : distanceDegrees / plan.lengthDegrees,
            status: polar ? "undefined" : "ok", reason: polar ? "geographic-pole" : null,
            courseAzimuth: arc.courseAt(distanceDegrees, point), bodyAzimuth: null,
            azimuthUndefined: polar ? "geographic-pole" : null, residual: null });
        }
      }
      lines.push({ body: position.body, direction, positionIndex, originObserverIndex: 0,
        status: bearing === null ? "undefined" : "sampled", reason, originAzimuth, bearing, samples, polylines: [] });
    }
  }
  const sampling = sampleAdditionalAngles(seed, points);
  if (sampling.status === "refused") return { ...base, status: "refused", reason: sampling.reason, sampling, lines: [] };
  const measured = lines.map((line): LocalSpacePolyline => {
    const samples = line.samples.map((sample): LocalSpaceLineSample => {
      const observer = sampling.samples[sample.observerIndex]!;
      if (observer.status === "undefined") return sample;
      const angles = observer.bodies[line.positionIndex]!;
      let residual = sample.courseAzimuth === null || angles.azimuth === null ? null
        : wrapLongitude(angles.azimuth - sample.courseAzimuth);
      if (residual !== null && residual >= 90) residual -= 180;
      if (residual !== null && residual < -90) residual += 180;
      return { ...sample, bodyAzimuth: angles.azimuth, azimuthUndefined: angles.azimuthUndefined, residual };
    });
    const polylines = pathPolylines(samples.map((sample) => ({ index: sample.observerIndex,
      point: sampling.samples[sample.observerIndex]!.point })), line.bearing !== null && line.bearing < 180 ? "east" : "west");
    return { ...line, samples, polylines };
  });
  return { ...base, status: "ok", sampling, lines: measured };
}
