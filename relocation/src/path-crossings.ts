import { AngularBudgetError, checkedBodies, MAX_ANGLE_EVALUATIONS, sampleAdditionalAngles,
  sampleAngles } from "./angles.js";
import type { AngularBody, AngularLine, AngularSamplingResult, ObserverBodySample } from "./angles.js";
import { ANGULAR_DIRECTION_TOLERANCE } from "./angular-geometry.js";
import type { GeographicPoint, RelocationSource } from "./chart.js";
import { greatCircleArc, MAX_PATH_SAMPLES, pathPolylines, planGreatCircle } from "./great-circle.js";
import type { GreatCirclePlan } from "./great-circle.js";
import type { PolylineVertex } from "./geography.js";

export const RELOCATION_PATH_CROSSINGS_SCHEMA = "zodiacs.relocation-path-crossings.v1";
export const MAX_PATH_REFINEMENTS = 52;

export interface PathCrossingOptions {
  readonly from: GeographicPoint;
  readonly to: GeographicPoint;
  readonly stepDegrees: number;
  readonly bodies?: readonly AngularBody[];
  readonly lines?: readonly AngularLine[];
  readonly maxEvaluations: number;
  /** Bisection probes per body, kind and interval, including cached probes. */
  readonly maxRefinements: number;
  /** Bracket width along the spherical arc, in degrees. */
  readonly coordinateTolerance: number;
  /** Sampled altitude or requested meridian residual, in degrees. */
  readonly residualTolerance: number;
}

export interface PathCrossingPlan {
  readonly path: GreatCirclePlan;
  readonly bodies: readonly AngularBody[];
  readonly lines: readonly AngularLine[];
  readonly requiredEvaluations: number;
  readonly maxEvaluations: number;
  readonly maxRefinements: number;
  readonly coordinateTolerance: number;
  readonly residualTolerance: number;
}

export interface PathBracketEnd {
  readonly observerIndex: number;
  readonly distanceDegrees: number;
  readonly residual: number | null;
  /** Continuous plane projection used for bisection, not an angle or engine output. */
  readonly projection: number | null;
}

export interface PathBracket {
  readonly from: PathBracketEnd;
  readonly to: PathBracketEnd;
  readonly width: number;
}

export type PathIntervalIssue = "geographic-pole" | "undefined-direction" | "coincident-path"
  | "unbracketed-interval" | "refinement-budget" | "refinement-limit" | "coordinate-precision";

export interface PathIntervalResult {
  readonly intervalIndex: number;
  readonly body: AngularBody;
  readonly kind: AngularLine;
  readonly positionIndex: number;
  readonly status: "crossing" | "no-crossing" | "unresolved";
  readonly reason: PathIntervalIssue | null;
  readonly initialBracket: PathBracket;
  readonly bracket: PathBracket;
  readonly crossingIndex: number | null;
  readonly refinements: number;
}

export interface PathCrossing {
  readonly index: number;
  readonly body: AngularBody;
  readonly kind: AngularLine;
  readonly positionIndex: number;
  readonly observerIndex: number;
  readonly distanceDegrees: number;
  readonly fraction: number;
  readonly point: GeographicPoint;
  readonly residual: number;
  readonly horizonMotion: ObserverBodySample["horizonMotion"];
  /** Tangent means stationary with respect to Earth rotation, not path motion. */
  readonly status: "crossing" | "tangent";
}

interface PathCrossingBase {
  readonly schema: typeof RELOCATION_PATH_CROSSINGS_SCHEMA;
  readonly verification: "bounded-great-circle-brackets;sampled-engine-residuals";
  readonly plan: PathCrossingPlan;
}

export type PathCrossingsResult = PathCrossingBase & ({
  readonly status: "ok";
  readonly sampling: Extract<AngularSamplingResult, { status: "ok" }>;
  /** Arc distances indexed by global sampling observer index, including refinements. */
  readonly observerDistances: readonly number[];
  readonly intervalResults: readonly PathIntervalResult[];
  readonly unresolvedIntervals: readonly PathIntervalResult[];
  readonly crossings: readonly PathCrossing[];
  /** Path geometry, not planetary line geometry; global observer provenance. */
  readonly polylines: readonly (readonly PolylineVertex[])[];
} | {
  readonly status: "refused";
  readonly reason: "unknown-time" | "engine-refusal";
  readonly sampling: Extract<AngularSamplingResult, { status: "refused" }>;
  readonly observerDistances: readonly [];
  readonly intervalResults: readonly [];
  readonly unresolvedIntervals: readonly [];
  readonly crossings: readonly [];
  readonly polylines: readonly [];
});

function checkedLines(value: readonly AngularLine[] | undefined): AngularLine[] {
  if (value === undefined) return ["ASC", "DSC", "MC", "IC"];
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    throw new RangeError("Path lines require a nonempty angular-line selection.");
  }
  const lines: AngularLine[] = [];
  for (let index = 0; index < value.length; index++) {
    const slot = Object.getOwnPropertyDescriptor(value, String(index));
    if (!slot || !("value" in slot) || !["ASC", "DSC", "MC", "IC"].includes(slot.value)
      || lines.includes(slot.value)) throw new RangeError("Path lines require unique supported ordinary data entries.");
    lines.push(slot.value as AngularLine);
  }
  return lines;
}

/** Conservative coarse work reservation, including undefined pole samples. */
export function planPathCrossings(options: PathCrossingOptions): PathCrossingPlan {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new RangeError("Path crossings require endpoints, step, budgets and tolerances.");
  }
  const bodies = checkedBodies(options.bodies);
  const lines = checkedLines(options.lines);
  const { maxEvaluations, maxRefinements, coordinateTolerance, residualTolerance } = options;
  if (!Number.isSafeInteger(maxEvaluations) || maxEvaluations < 1 || maxEvaluations > MAX_ANGLE_EVALUATIONS) {
    throw new RangeError(`Path maxEvaluations must be an integer between 1 and ${MAX_ANGLE_EVALUATIONS}.`);
  }
  if (!Number.isSafeInteger(maxRefinements) || maxRefinements < 0 || maxRefinements > MAX_PATH_REFINEMENTS) {
    throw new RangeError(`Path maxRefinements must be an integer between 0 and ${MAX_PATH_REFINEMENTS}.`);
  }
  for (const value of [coordinateTolerance, residualTolerance]) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 180) {
      throw new RangeError("Path crossing tolerances must be finite, positive degrees at most 180.");
    }
  }
  const path = planGreatCircle({ from: options.from, to: options.to, stepDegrees: options.stepDegrees,
    maxSamples: MAX_PATH_SAMPLES });
  const requiredEvaluations = bodies.length + path.sampleCount;
  if (requiredEvaluations > maxEvaluations) throw new AngularBudgetError(requiredEvaluations, maxEvaluations);
  return { path, bodies, lines, requiredEvaluations, maxEvaluations, maxRefinements,
    coordinateTolerance, residualTolerance };
}

const bracket = (from: PathBracketEnd, to: PathBracketEnd): PathBracket =>
  ({ from, to, width: to.distanceDegrees - from.distanceDegrees });
const DEG = Math.PI / 180;

/** Sample a shortest spherical arc and refine angular intersections through engine observers. */
export function pathCrossings(source: RelocationSource, options: PathCrossingOptions): PathCrossingsResult {
  const plan = planPathCrossings(options);
  const base: PathCrossingBase = { schema: RELOCATION_PATH_CROSSINGS_SCHEMA,
    verification: "bounded-great-circle-brackets;sampled-engine-residuals", plan };
  const sampling = sampleAngles(source, plan.path.samples.map((sample) => sample.point),
    { bodies: plan.bodies, maxEvaluations: plan.maxEvaluations });
  const refused = (value: Extract<AngularSamplingResult, { status: "refused" }>): PathCrossingsResult =>
    ({ ...base, status: "refused", reason: value.reason, sampling: value, observerDistances: [],
      intervalResults: [], unresolvedIntervals: [], crossings: [], polylines: [] });
  if (sampling.status === "refused") return refused(sampling);
  let prepared = sampling;
  const arc = greatCircleArc(plan.path.from, plan.path.to);
  const observerDistances = plan.path.samples.map((sample) => sample.distanceDegrees);
  const observerByDistance = new Map(observerDistances.map((distance, index) => [distance, index]));
  const crossings: PathCrossing[] = [];
  const intervalResults: PathIntervalResult[] = [];
  const crossingByObserver = new Map<string, number>();
  const firstObserver = prepared.samples.find((sample) => sample.status === "ok");

  for (const [positionIndex, position] of prepared.positions.entries()) {
    for (const kind of plan.lines) {
      const meridian = kind === "MC" || kind === "IC";
      const at = (observerIndex: number, distanceDegrees: number): PathBracketEnd => {
        const sample = prepared.samples[observerIndex]!;
        if (sample.status !== "ok") return { observerIndex, distanceDegrees, residual: null, projection: null };
        const body = sample.bodies[positionIndex]!;
        return { observerIndex, distanceDegrees, residual: body.residuals[kind], projection: meridian
          ? body.hourAngle === null ? null : Math.cos(sample.point.latitude * DEG) * Math.sin(body.hourAngle * DEG)
          : body.up };
      };
      // Plane projections along a great circle are A*cos(s)+B*sin(s).
      // A near-zero amplitude means the path lies numerically in that plane.
      // This is only a topology screen; no receipt-bearing root is synthesized.
      let coincident = false;
      if (firstObserver?.status === "ok" && (!meridian || position.rightAscension !== null)) {
        const gamma = ((position.rightAscension ?? 0) - (firstObserver.engine.armc - firstObserver.point.longitude)) * DEG;
        const dec = position.declination * DEG;
        const normal = meridian ? [-Math.sin(gamma), Math.cos(gamma), 0]
          : position.rightAscension === null ? [0, 0, Math.sin(dec)]
            : [Math.cos(dec) * Math.cos(gamma), Math.cos(dec) * Math.sin(gamma), Math.sin(dec)];
        const a = normal.reduce((sum, n, i) => sum + n * arc.start[i]!, 0);
        const b = normal.reduce((sum, n, i) => sum + n * arc.tangent[i]!, 0);
        coincident = Math.hypot(a, b) <= ANGULAR_DIRECTION_TOLERANCE;
      }
      for (let intervalIndex = 0; intervalIndex + 1 < plan.path.sampleCount; intervalIndex++) {
        const from = plan.path.samples[intervalIndex]!;
        const to = plan.path.samples[intervalIndex + 1]!;
        let left = at(from.index, from.distanceDegrees);
        let right = at(to.index, to.distanceDegrees);
        const initialBracket = bracket(left, right);
        let refinements = 0;
        const finish = (status: PathIntervalResult["status"], reason: PathIntervalIssue | null, crossingIndex: number | null) =>
          intervalResults.push({ intervalIndex, body: position.body, kind, positionIndex, status, reason,
            initialBracket, bracket: bracket(left, right), refinements, crossingIndex });
        if (prepared.samples[left.observerIndex]!.status === "undefined"
          || prepared.samples[right.observerIndex]!.status === "undefined") {
          finish("unresolved", "geographic-pole", null); continue;
        }
        if (left.projection === null || right.projection === null) {
          finish("unresolved", "undefined-direction", null); continue;
        }
        if (coincident || left.projection === 0 && right.projection === 0) {
          finish("unresolved", "coincident-path", null); continue;
        }
        // Prefer an exact angular endpoint, even if its Cartesian projection
        // retains trig roundoff. Shared endpoints deduplicate by observer index.
        let candidate = left.residual === 0 ? left : right.residual === 0 ? right
          : Math.abs(left.projection) <= Math.abs(right.projection) ? left : right;
        if (candidate.residual === 0 || candidate.projection === 0) left = right = candidate;
        else if (left.projection !== 0 && right.projection !== 0
          && (left.projection < 0) === (right.projection < 0)) {
          const near = Math.min(Math.abs(left.projection), Math.abs(right.projection)) <= ANGULAR_DIRECTION_TOLERANCE;
          finish(near ? "unresolved" : "no-crossing", near ? "unbracketed-interval" : null, null); continue;
        }
        const needsRefinement = () => right.distanceDegrees - left.distanceDegrees > plan.coordinateTolerance
          || Math.abs(candidate.projection!) > Math.sin(Math.min(plan.residualTolerance, 90) * DEG)
          || ((!meridian || Math.abs(candidate.residual!) <= 90) && Math.abs(candidate.residual!) > plan.residualTolerance);
        let issue: PathIntervalIssue | null = null;
        while (needsRefinement()) {
          if (refinements >= plan.maxRefinements) { issue = "refinement-limit"; break; }
          const distance = left.distanceDegrees + (right.distanceDegrees - left.distanceDegrees) / 2;
          if (distance <= left.distanceDegrees || distance >= right.distanceDegrees) { issue = "coordinate-precision"; break; }
          const point = arc.at(distance);
          // Arc parameters can still advance after geographic coordinates have
          // rounded to a bracket endpoint. Repeating that engine observer adds
          // no information and must not manufacture a narrower spatial claim.
          const repeatsEndpoint = [left, right].some((end) => {
            const previous = prepared.samples[end.observerIndex]!.point;
            return point.latitude === previous.latitude && (point.longitude === previous.longitude
              || Math.abs(point.longitude - previous.longitude) === 360);
          });
          if (repeatsEndpoint) { issue = "coordinate-precision"; break; }
          let observerIndex = observerByDistance.get(distance);
          if (observerIndex === undefined) {
            if (prepared.evaluations.positions + prepared.evaluations.houses >= plan.maxEvaluations
              || prepared.samples.length >= MAX_PATH_SAMPLES) { issue = "refinement-budget"; break; }
            const next = sampleAdditionalAngles(prepared, [point]);
            if (next.status === "refused") return refused(next);
            prepared = next;
            observerIndex = prepared.samples.length - 1;
            observerByDistance.set(distance, observerIndex);
            observerDistances.push(distance);
          }
          refinements++;
          const middle = at(observerIndex, distance);
          if (middle.projection === null) {
            issue = prepared.samples[observerIndex]!.status === "undefined" ? "geographic-pole" : "undefined-direction";
            break;
          }
          if (middle.residual === 0 || middle.projection === 0) left = right = middle;
          else if ((left.projection! < 0) === (middle.projection < 0)) left = middle;
          else right = middle;
          candidate = Math.abs(left.projection!) <= Math.abs(right.projection!) ? left : right;
        }
        if (issue !== null) { finish("unresolved", issue, null); continue; }
        const observer = prepared.samples[candidate.observerIndex]!;
        if (observer.status !== "ok") throw new Error("A path crossing requires a defined observer.");
        const direction = observer.bodies[positionIndex]!;
        if (meridian && Math.abs(candidate.residual!) > 90 || !meridian && direction.horizonMotion !== "stationary"
          && direction.horizonMotion !== (kind === "ASC" ? "rising" : "setting")) {
          finish("no-crossing", null, null); continue;
        }
        if (Math.abs(candidate.residual!) > plan.residualTolerance) {
          finish("unresolved", "coordinate-precision", null); continue;
        }
        const key = `${positionIndex}:${kind}:${candidate.observerIndex}`;
        let crossingIndex = crossingByObserver.get(key);
        if (crossingIndex === undefined) {
          crossingIndex = crossings.length;
          crossingByObserver.set(key, crossingIndex);
          crossings.push({ index: crossingIndex, body: position.body, kind, positionIndex,
            observerIndex: candidate.observerIndex, distanceDegrees: candidate.distanceDegrees,
            fraction: candidate.distanceDegrees / plan.path.lengthDegrees, point: { ...observer.point },
            residual: candidate.residual!, horizonMotion: direction.horizonMotion,
            status: !meridian && direction.horizonMotion === "stationary" ? "tangent" : "crossing" });
        }
        finish("crossing", null, crossingIndex);
      }
    }
  }
  // Geometry follows arc order; refinement storage order remains receipt provenance.
  const ordered = prepared.samples.map((sample) => ({ index: sample.index, point: sample.point }))
    .sort((a, b) => observerDistances[a.index]! - observerDistances[b.index]!);
  return { ...base, status: "ok", sampling: prepared, observerDistances, intervalResults,
    unresolvedIntervals: intervalResults.filter((interval) => interval.status === "unresolved"),
    crossings, polylines: pathPolylines(ordered) };
}
