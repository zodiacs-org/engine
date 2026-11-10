import { AngularBudgetError, checkedBodies, MAX_ANGLE_EVALUATIONS, sampleAdditionalAngles,
  sampleAngles } from "./angles.js";
import type { AngularBody, AngularSamplingResult } from "./angles.js";
import type { GeographicPoint, RelocationSource } from "./chart.js";
import { containsPoint, geographicBounds, splitAntimeridian, wrapLongitude } from "./geography.js";
import type { CheckedBounds, GeographicBounds, PolylineVertex } from "./geography.js";

export const RELOCATION_MERIDIANS_SCHEMA = "zodiacs.relocation-meridians.v1";
export type MeridianKind = "MC" | "IC";

export interface MeridianLineOptions {
  readonly bounds: GeographicBounds;
  /** Positive degrees. Include both latitude boundaries, with a shorter final interval if needed. */
  readonly latitudeStep: number;
  readonly bodies?: readonly AngularBody[];
  /** Defaults to MC followed by IC. Unique, nonempty, case-sensitive. */
  readonly lines?: readonly MeridianKind[];
  /** Conservative position and houses call budget, before longitude clipping. */
  readonly maxEvaluations: number;
}

export interface MeridianLinePlan {
  readonly bounds: CheckedBounds;
  readonly latitudeStep: number;
  readonly latitudes: readonly number[];
  readonly bodies: readonly AngularBody[];
  readonly lines: readonly MeridianKind[];
  readonly maxEvaluations: number;
  /** One position per body, one reference observer, and every possible nonpolar line vertex. */
  readonly requiredEvaluations: number;
  /** Includes the reference observer and possible undefined pole samples. */
  readonly maximumObserverSamples: number;
}

export interface MeridianLineSample {
  /** Index into result.sampling.samples, containing the engine observer receipt. */
  readonly observerIndex: number;
  readonly status: "ok" | "undefined";
  readonly reason: "geographic-pole" | null;
  /** Measured from the engine ARMC at this point, degrees; null at an undefined pole. */
  readonly residual: number | null;
}

export interface MeridianPolyline {
  readonly body: AngularBody;
  readonly kind: MeridianKind;
  /** Index into result.sampling.positions, containing the fresh engine direction and receipt. */
  readonly positionIndex: number;
  readonly status: "sampled" | "outside-bounds" | "undefined";
  readonly reason: "celestial-pole" | null;
  readonly longitude: number | null;
  readonly samples: readonly MeridianLineSample[];
  /** Sample vertex indices refer to result.sampling.samples, not a line-local array. */
  readonly polylines: readonly (readonly PolylineVertex[])[];
}

interface MeridianResultBase {
  readonly schema: typeof RELOCATION_MERIDIANS_SCHEMA;
  readonly plan: MeridianLinePlan;
}

export type MeridianLinesResult = MeridianResultBase & ({
  readonly status: "ok";
  /** Observer zero at the equator and Greenwich defines the longitude construction. */
  readonly referenceObserverIndex: 0;
  readonly sampling: Extract<AngularSamplingResult, { status: "ok" }>;
  readonly lines: readonly MeridianPolyline[];
} | {
  readonly status: "refused";
  readonly reason: "unknown-time" | "engine-refusal";
  readonly referenceObserverIndex: null;
  readonly sampling: Extract<AngularSamplingResult, { status: "refused" }>;
  readonly lines: readonly [];
});

function checkedLines(value: readonly MeridianKind[] | undefined): MeridianKind[] {
  if (value === undefined) return ["MC", "IC"];
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new RangeError("Meridian lines require a nonempty array of MC or IC.");
  }
  const result: MeridianKind[] = [];
  for (let index = 0; index < value.length; index++) {
    const slot = Object.getOwnPropertyDescriptor(value, String(index));
    if (!slot || !("value" in slot) || !["MC", "IC"].includes(slot.value) || result.includes(slot.value)) {
      throw new RangeError("Meridian names must be supported, unique ordinary data entries.");
    }
    result.push(slot.value as MeridianKind);
  }
  return result;
}

/** Reserve worst-case work without evaluating or capturing the source. Exact poles remain explicit samples. */
export function planMeridianLines(options: MeridianLineOptions): MeridianLinePlan {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new RangeError("Meridian options require bounds, latitude step and an evaluation budget.");
  }
  const bounds = geographicBounds(options.bounds);
  const latitudeStep = options.latitudeStep;
  if (typeof latitudeStep !== "number" || !Number.isFinite(latitudeStep) || latitudeStep <= 0 || latitudeStep > 180) {
    throw new RangeError("Meridian latitudeStep must be positive and at most 180 degrees.");
  }
  const bodies = checkedBodies(options.bodies);
  const lines = checkedLines(options.lines);
  const maxEvaluations = options.maxEvaluations;
  if (!Number.isSafeInteger(maxEvaluations) || maxEvaluations < 1 || maxEvaluations > MAX_ANGLE_EVALUATIONS) {
    throw new RangeError(`Meridian maxEvaluations must be an integer between 1 and ${MAX_ANGLE_EVALUATIONS}.`);
  }
  const span = bounds.north - bounds.south;
  const rows = span === 0 ? 1 : Math.max(1, Math.ceil(span / latitudeStep)) + 1;
  // A zero-height bound at a pole has just one undefined row.
  const polarRows = Number(Math.abs(bounds.south) === 90)
    + (span === 0 ? 0 : Number(Math.abs(bounds.north) === 90));
  const requiredEvaluations = bodies.length + 1 + bodies.length * lines.length * (rows - polarRows);
  const maximumObserverSamples = 1 + bodies.length * lines.length * rows;
  if (!Number.isSafeInteger(requiredEvaluations) || requiredEvaluations > maxEvaluations) {
    throw new AngularBudgetError(requiredEvaluations, maxEvaluations);
  }
  if (!Number.isSafeInteger(maximumObserverSamples) || maximumObserverSamples > MAX_ANGLE_EVALUATIONS) {
    throw new RangeError(`Meridian observer sample count must not exceed ${MAX_ANGLE_EVALUATIONS}.`);
  }
  const latitudes: number[] = [];
  for (let index = 0; index < rows; index++) {
    const latitude = index === rows - 1 ? bounds.north : bounds.south + index * latitudeStep;
    if (index > 0 && (latitude <= latitudes[index - 1]! || latitude > bounds.north)) {
      throw new RangeError("Meridian step does not produce distinct, ordered latitudes at floating-point precision.");
    }
    latitudes.push(latitude);
  }
  return { bounds, latitudeStep, latitudes, bodies, lines, maxEvaluations, requiredEvaluations, maximumObserverSamples };
}

/**
 * Construct geocentric upper/lower meridians from fresh engine directions and
 * Greenwich ARMC, then sample each nonpolar vertex through engine houses().
 * Geometry is library-derived. Receipts describe the underlying engine work.
 */
export function meridianLines(source: RelocationSource, options: MeridianLineOptions): MeridianLinesResult {
  const plan = planMeridianLines(options);
  const base: MeridianResultBase = { schema: RELOCATION_MERIDIANS_SCHEMA, plan };
  const seed = sampleAngles(source, [{ latitude: 0, longitude: 0 }], {
    bodies: plan.bodies, maxEvaluations: plan.maxEvaluations
  });
  if (seed.status === "refused") {
    return { ...base, status: "refused", reason: seed.reason, referenceObserverIndex: null, sampling: seed, lines: [] };
  }
  const reference = seed.samples[0]!;
  if (reference.status !== "ok") throw new Error("Meridian reference observer must be nonpolar.");
  const points: GeographicPoint[] = [];
  const lines: MeridianPolyline[] = [];
  for (const [positionIndex, position] of seed.positions.entries()) {
    for (const kind of plan.lines) {
      const longitude = position.rightAscension === null ? null
        : wrapLongitude(position.rightAscension - reference.engine.armc + (kind === "IC" ? 180 : 0));
      const outside = longitude !== null && !containsPoint(plan.bounds, { latitude: plan.bounds.south, longitude });
      const samples: MeridianLineSample[] = [];
      if (longitude !== null && !outside) {
        for (const latitude of plan.latitudes) {
          const observerIndex = points.length + 1;
          points.push({ latitude, longitude });
          samples.push({ observerIndex, status: Math.abs(latitude) === 90 ? "undefined" : "ok",
            reason: Math.abs(latitude) === 90 ? "geographic-pole" : null, residual: null });
        }
      }
      lines.push({ body: position.body, kind, positionIndex,
        status: longitude === null ? "undefined" : outside ? "outside-bounds" : "sampled",
        reason: longitude === null ? "celestial-pole" : null, longitude, samples, polylines: [] });
    }
  }
  const sampling = sampleAdditionalAngles(seed, points);
  if (sampling.status === "refused") {
    return { ...base, status: "refused", reason: sampling.reason, referenceObserverIndex: null, sampling, lines: [] };
  }
  const measured = lines.map((line): MeridianPolyline => {
    const samples = line.samples.map((sample): MeridianLineSample => {
      const observer = sampling.samples[sample.observerIndex]!;
      return { ...sample, residual: observer.status === "ok"
        ? observer.bodies[line.positionIndex]!.residuals[line.kind] : null };
    });
    // Undefined pole endpoints are not geometric samples and never receive a
    // manufactured receipt. The intervening nonpolar meridian stays continuous.
    const defined = samples.filter((sample) => sample.status === "ok");
    const polylines = splitAntimeridian(defined.map((sample) => sampling.samples[sample.observerIndex]!.point))
      .map((segment) => segment.map((vertex): PolylineVertex => {
        if (vertex.source.kind !== "sample") throw new Error("A constant-longitude meridian cannot interpolate a seam.");
        return { point: vertex.point, source: { kind: "sample", index: defined[vertex.source.index]!.observerIndex } };
      }));
    return { ...line, samples, polylines };
  });
  return { ...base, status: "ok", referenceObserverIndex: 0, sampling, lines: measured };
}
