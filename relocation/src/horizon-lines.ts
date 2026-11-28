import { AngularBudgetError, checkedBodies, MAX_ANGLE_EVALUATIONS, sampleAdditionalAngles,
  sampleAngles } from "./angles.js";
import type { AngularBody, AngularSamplingResult } from "./angles.js";
import type { GeographicPoint, RelocationSource } from "./chart.js";
import { containsPoint, geographicBounds, splitAntimeridian, wrapLongitude } from "./geography.js";
import type { CheckedBounds, GeographicBounds, PolylineVertex } from "./geography.js";

export const RELOCATION_HORIZONS_SCHEMA = "zodiacs.relocation-horizons.v1";
export type HorizonKind = "ASC" | "DSC";

export interface HorizonLineOptions {
  readonly bounds: GeographicBounds;
  readonly latitudeStep: number;
  readonly bodies?: readonly AngularBody[];
  readonly lines?: readonly HorizonKind[];
  /** Worst-case positions and observers, including extra tangent endpoints. */
  readonly maxEvaluations: number;
}

export interface HorizonLinePlan {
  readonly bounds: CheckedBounds;
  readonly latitudeStep: number;
  readonly latitudes: readonly number[];
  readonly bodies: readonly AngularBody[];
  readonly lines: readonly HorizonKind[];
  readonly maxEvaluations: number;
  readonly requiredEvaluations: number;
  readonly maximumObserverSamples: number;
}

export interface HorizonLineSample {
  readonly latitude: number;
  readonly origin: "latitude-row" | "tangent-limit";
  readonly status: "ok" | "tangent" | "gap" | "outside-bounds" | "undefined";
  readonly reason: "always-above" | "always-below" | "geographic-pole" | null;
  readonly point: GeographicPoint | null;
  /** Index into sampling.samples; null for gaps, poles and clipped rows. */
  readonly observerIndex: number | null;
  /** Degrees, measured from the fresh engine observer at the emitted point. */
  readonly residual: number | null;
}

export interface HorizonPolyline {
  readonly body: AngularBody;
  readonly kind: HorizonKind;
  readonly positionIndex: number;
  readonly status: "sampled" | "outside-bounds" | "undefined";
  readonly reason: "celestial-pole" | null;
  readonly samples: readonly HorizonLineSample[];
  /** Sample and interpolated seam references use global observer indices. */
  readonly polylines: readonly (readonly PolylineVertex[])[];
}

interface HorizonResultBase {
  readonly schema: typeof RELOCATION_HORIZONS_SCHEMA;
  readonly plan: HorizonLinePlan;
}
export type HorizonLinesResult = HorizonResultBase & ({
  readonly status: "ok";
  readonly referenceObserverIndex: 0;
  readonly sampling: Extract<AngularSamplingResult, { status: "ok" }>;
  readonly lines: readonly HorizonPolyline[];
} | {
  readonly status: "refused";
  readonly reason: "unknown-time" | "engine-refusal";
  readonly referenceObserverIndex: null;
  readonly sampling: Extract<AngularSamplingResult, { status: "refused" }>;
  readonly lines: readonly [];
});

function checkedLines(value: readonly HorizonKind[] | undefined): HorizonKind[] {
  if (value === undefined) return ["ASC", "DSC"];
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new RangeError("Horizon lines require a nonempty array of ASC or DSC.");
  }
  const result: HorizonKind[] = [];
  for (let index = 0; index < value.length; index++) {
    const slot = Object.getOwnPropertyDescriptor(value, String(index));
    if (!slot || !("value" in slot) || !["ASC", "DSC"].includes(slot.value) || result.includes(slot.value)) {
      throw new RangeError("Horizon names must be supported, unique ordinary data entries.");
    }
    result.push(slot.value as HorizonKind);
  }
  return result;
}

/** Source-independent reservation, including two possible tangent rows per branch. */
export function planHorizonLines(options: HorizonLineOptions): HorizonLinePlan {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new RangeError("Horizon options require bounds, latitude step and an evaluation budget.");
  }
  const bounds = geographicBounds(options.bounds);
  const latitudeStep = options.latitudeStep;
  if (typeof latitudeStep !== "number" || !Number.isFinite(latitudeStep) || latitudeStep <= 0 || latitudeStep > 180) {
    throw new RangeError("Horizon latitudeStep must be positive and at most 180 degrees.");
  }
  const bodies = checkedBodies(options.bodies);
  const lines = checkedLines(options.lines);
  const maxEvaluations = options.maxEvaluations;
  if (!Number.isSafeInteger(maxEvaluations) || maxEvaluations < 1 || maxEvaluations > MAX_ANGLE_EVALUATIONS) {
    throw new RangeError(`Horizon maxEvaluations must be an integer between 1 and ${MAX_ANGLE_EVALUATIONS}.`);
  }
  const span = bounds.north - bounds.south;
  const rows = span === 0 ? 1 : Math.max(1, Math.ceil(span / latitudeStep)) + 1;
  const maximumObserverSamples = 1 + bodies.length * lines.length * (rows + 2);
  const requiredEvaluations = bodies.length + maximumObserverSamples;
  if (!Number.isSafeInteger(requiredEvaluations) || requiredEvaluations > maxEvaluations) {
    throw new AngularBudgetError(requiredEvaluations, maxEvaluations);
  }
  const latitudes: number[] = [];
  for (let index = 0; index < rows; index++) {
    const latitude = index === rows - 1 ? bounds.north : bounds.south + index * latitudeStep;
    if (index > 0 && (latitude <= latitudes[index - 1]! || latitude > bounds.north)) {
      throw new RangeError("Horizon step does not produce distinct, ordered latitudes at floating-point precision.");
    }
    latitudes.push(latitude);
  }
  return { bounds, latitudeStep, latitudes, bodies, lines, maxEvaluations, requiredEvaluations, maximumObserverSamples };
}

/** Keep a shortest longitude link only when its entire arc stays in the bounds. */
function linkInside(bounds: CheckedBounds, from: GeographicPoint, to: GeographicPoint, halfTurnDirection: "east" | "west"): boolean {
  if (bounds.longitudeSpan === 360) return true;
  let delta = to.longitude - from.longitude;
  if (delta > 180) delta = -((from.longitude + 180) + (180 - to.longitude));
  if (delta < -180) delta = (180 - from.longitude) + (to.longitude + 180);
  if (Math.abs(delta) === 180) delta = halfTurnDirection === "east" ? 180 : -180;
  let offset = from.longitude >= bounds.west ? from.longitude - bounds.west
    : (180 - bounds.west) + (from.longitude + 180);
  if (offset === 360) offset = 0;
  const end = offset + delta;
  return end >= 0 && end <= bounds.longitudeSpan;
}

function segments(samples: readonly HorizonLineSample[], bounds: CheckedBounds, halfTurnDirection: "east" | "west"): PolylineVertex[][] {
  const polylines: PolylineVertex[][] = [];
  let run: HorizonLineSample[] = [];
  const flush = () => {
    for (const segment of splitAntimeridian(run.map((sample) => sample.point!), halfTurnDirection)) {
      polylines.push(segment.map((vertex): PolylineVertex => ({ point: vertex.point,
        source: vertex.source.kind === "sample"
          ? { kind: "sample", index: run[vertex.source.index]!.observerIndex! }
          : { ...vertex.source, fromIndex: run[vertex.source.fromIndex]!.observerIndex!,
            toIndex: run[vertex.source.toIndex]!.observerIndex! } })));
    }
    run = [];
  };
  for (const sample of samples) {
    if (sample.observerIndex === null) { flush(); continue; }
    if (run.length && !linkInside(bounds, run.at(-1)!.point!, sample.point!, halfTurnDirection)) flush();
    run.push(sample);
  }
  flush();
  return polylines;
}

/** Unrefracted geocentric horizon curves, derived only from fresh engine directions and axes. */
export function horizonLines(source: RelocationSource, options: HorizonLineOptions): HorizonLinesResult {
  const plan = planHorizonLines(options);
  const base: HorizonResultBase = { schema: RELOCATION_HORIZONS_SCHEMA, plan };
  const seed = sampleAngles(source, [{ latitude: 0, longitude: 0 }], {
    bodies: plan.bodies, maxEvaluations: plan.maxEvaluations
  });
  if (seed.status === "refused") {
    return { ...base, status: "refused", reason: seed.reason, referenceObserverIndex: null, sampling: seed, lines: [] };
  }
  const reference = seed.samples[0]!;
  if (reference.status !== "ok") throw new Error("Horizon reference observer must be nonpolar.");
  const points: GeographicPoint[] = [];
  const lines: HorizonPolyline[] = [];
  for (const [positionIndex, position] of seed.positions.entries()) {
    // The boundary of the circumpolar region is analytic for a fixed direction.
    const limit = 90 - Math.abs(position.declination);
    const latitudes = [...plan.latitudes];
    if (position.rightAscension !== null) {
      for (const latitude of [-limit, limit]) {
        if (Math.abs(latitude) !== 90 && latitude >= plan.bounds.south && latitude <= plan.bounds.north
          && !latitudes.includes(latitude)) latitudes.push(latitude);
      }
    }
    latitudes.sort((a, b) => a - b);
    for (const kind of plan.lines) {
      const samples: HorizonLineSample[] = [];
      if (position.rightAscension !== null) {
        for (const latitude of latitudes) {
          const tangent = Math.abs(latitude) === limit;
          const origin = tangent && Math.abs(latitude) !== 90 ? "tangent-limit" : "latitude-row";
          const row = { latitude, origin, point: null, observerIndex: null, residual: null } as const;
          if (Math.abs(latitude) === 90) {
            samples.push({ ...row, status: "undefined", reason: "geographic-pole" });
            continue;
          }
          if (Math.abs(latitude) > limit) {
            samples.push({ ...row, status: "gap", reason: latitude * position.declination > 0 ? "always-above" : "always-below" });
            continue;
          }
          const cosH = tangent ? (latitude * position.declination > 0 ? -1 : 1)
            : -Math.tan(latitude * Math.PI / 180) * Math.tan(position.declination * Math.PI / 180);
          // Clamp roundoff only inside the analytically admitted latitude range.
          const h = Math.acos(Math.max(-1, Math.min(1, cosH))) * 180 / Math.PI;
          const point = { latitude, longitude: wrapLongitude(position.rightAscension - reference.engine.armc
            + (kind === "ASC" ? -h : h)) };
          if (!containsPoint(plan.bounds, point)) {
            samples.push({ ...row, point, status: "outside-bounds", reason: null });
            continue;
          }
          const observerIndex = points.length + 1;
          points.push(point);
          samples.push({ ...row, point, observerIndex, status: tangent || h === 0 || h === 180 ? "tangent" : "ok", reason: null });
        }
      }
      const admitted = samples.some((sample) => sample.observerIndex !== null);
      lines.push({ body: position.body, kind, positionIndex,
        status: position.rightAscension === null ? "undefined" : !admitted && samples.some((s) => s.status === "outside-bounds")
          ? "outside-bounds" : "sampled", reason: position.rightAscension === null ? "celestial-pole" : null,
        samples, polylines: [] });
    }
  }
  const sampling = sampleAdditionalAngles(seed, points);
  if (sampling.status === "refused") {
    return { ...base, status: "refused", reason: sampling.reason, referenceObserverIndex: null, sampling, lines: [] };
  }
  const measured = lines.map((line): HorizonPolyline => {
    const samples = line.samples.map((sample): HorizonLineSample => {
      if (sample.observerIndex === null) return sample;
      const observer = sampling.samples[sample.observerIndex]!;
      if (observer.status !== "ok") throw new Error("Horizon vertex must be nonpolar.");
      return { ...sample, residual: observer.bodies[line.positionIndex]!.residuals[line.kind] };
    });
    const dec = sampling.positions[line.positionIndex]!.declination;
    const halfTurnDirection = (line.kind === "DSC" ? dec : -dec) >= 0 ? "east" : "west";
    return { ...line, samples, polylines: segments(samples, plan.bounds, halfTurnDirection) };
  });
  return { ...base, status: "ok", referenceObserverIndex: 0, sampling, lines: measured };
}
