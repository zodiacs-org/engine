import { AngularBudgetError, checkedBodies, MAX_ANGLE_EVALUATIONS, sampleAdditionalAngles,
  sampleAngles } from "./angles.js";
import type { AngularBody, AngularLine, AngularSamplingResult, ObserverBodySample } from "./angles.js";
import type { GeographicPoint, RelocationSource } from "./chart.js";
import { observerAngles } from "./angular-geometry.js";
import { splitAntimeridian, wrapLongitude } from "./geography.js";
import type { PolylineVertex } from "./geography.js";
import { MAX_GRID_SAMPLES, planGrid } from "./grid.js";
import type { GeographicBounds } from "./geography.js";
import type { GridPlan } from "./grid.js";

export const RELOCATION_GRID_CROSSINGS_SCHEMA = "zodiacs.relocation-grid-crossings.v1";
export const MAX_GRID_REFINEMENTS = 52;

export interface GridCrossingOptions {
  readonly bounds: GeographicBounds;
  readonly latitudeStep: number;
  readonly longitudeStep: number;
  readonly bodies?: readonly AngularBody[];
  readonly lines?: readonly AngularLine[];
  /** Shared position and houses call cap, including coarse samples and refinement. */
  readonly maxEvaluations: number;
  /** Bisection calls per candidate edge, including unsuccessful refinements. */
  readonly maxRefinements: number;
  /** Required final bracket width in geographic degrees. */
  readonly coordinateTolerance: number;
  /** Required sampled residual magnitude in angular degrees. */
  readonly residualTolerance: number;
}

export interface GridCrossingPlan {
  readonly grid: GridPlan;
  readonly bodies: readonly AngularBody[];
  readonly lines: readonly AngularLine[];
  readonly maxEvaluations: number;
  readonly requiredEvaluations: number;
  readonly maxRefinements: number;
  readonly coordinateTolerance: number;
  readonly residualTolerance: number;
}

export interface GridEdge {
  readonly index: number;
  readonly axis: "latitude" | "longitude";
  /** Coarse observer indices, in increasing unwrapped coordinate order. */
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly start: number;
  readonly end: number;
}

export interface CrossingBracketEnd {
  readonly observerIndex: number;
  /** Latitude or unwrapped longitude according to the edge axis. */
  readonly coordinate: number;
  readonly residual: number;
}

export interface CrossingBracket {
  readonly from: CrossingBracketEnd;
  readonly to: CrossingBracketEnd;
  readonly width: number;
}

export interface GridCrossing {
  readonly index: number;
  readonly body: AngularBody;
  readonly kind: AngularLine;
  readonly positionIndex: number;
  /** Receipt-bearing observer, never an interpolated root. */
  readonly observerIndex: number;
  readonly point: GeographicPoint;
  readonly residual: number;
  readonly horizonMotion: ObserverBodySample["horizonMotion"];
  readonly status: "crossing" | "tangent";
}

export type GridEdgeIssue = "undefined-direction" | "wide-edge" | "coincident-edge"
  | "unbracketed-edge" | "refinement-budget" | "refinement-limit" | "coordinate-precision";

export interface GridEdgeResult {
  readonly edgeIndex: number;
  readonly body: AngularBody;
  readonly kind: AngularLine;
  readonly positionIndex: number;
  readonly status: "crossing" | "no-crossing" | "unresolved";
  readonly reason: GridEdgeIssue | null;
  readonly crossingIndex: number | null;
  /** Null only when the engine direction is undefined. */
  readonly initialBracket: CrossingBracket | null;
  readonly bracket: CrossingBracket | null;
  readonly refinements: number;
}

export interface GridCrossingCell {
  readonly row: number;
  readonly column: number;
  readonly body: AngularBody;
  readonly kind: AngularLine;
  readonly positionIndex: number;
  /** South, east, north, west edge result indices. */
  readonly edgeResultIndices: readonly number[];
  readonly crossingIndices: readonly number[];
  readonly status: "sampled" | "empty" | "unresolved";
  readonly reason: GridEdgeIssue | "ambiguous-cell" | "unbracketed-cell" | null;
  /** Global observer indices; seam interpolation has no additional receipt. */
  readonly polylines: readonly (readonly PolylineVertex[])[];
}

interface GridCrossingBase {
  readonly schema: typeof RELOCATION_GRID_CROSSINGS_SCHEMA;
  readonly verification: "bounded-edge-brackets;sampled-cell-connections";
  readonly plan: GridCrossingPlan;
}

export type GridCrossingsResult = GridCrossingBase & ({
  readonly status: "ok";
  readonly sampling: Extract<AngularSamplingResult, { status: "ok" }>;
  readonly edges: readonly GridEdge[];
  readonly edgeResults: readonly GridEdgeResult[];
  readonly crossings: readonly GridCrossing[];
  readonly cells: readonly GridCrossingCell[];
  readonly unresolvedCells: readonly GridCrossingCell[];
} | {
  readonly status: "refused";
  readonly reason: "unknown-time" | "engine-refusal";
  readonly sampling: Extract<AngularSamplingResult, { status: "refused" }>;
  readonly edges: readonly [];
  readonly edgeResults: readonly [];
  readonly crossings: readonly [];
  readonly cells: readonly [];
  readonly unresolvedCells: readonly [];
});

function checkedLines(value: readonly AngularLine[] | undefined): AngularLine[] {
  if (value === undefined) return ["ASC", "DSC", "MC", "IC"];
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    throw new RangeError("Grid crossing lines require a nonempty angular-line selection.");
  }
  const result: AngularLine[] = [];
  for (let index = 0; index < value.length; index++) {
    const slot = Object.getOwnPropertyDescriptor(value, String(index));
    if (!slot || !("value" in slot) || !["ASC", "DSC", "MC", "IC"].includes(slot.value)
      || result.includes(slot.value)) throw new RangeError("Grid crossing lines require unique supported data entries.");
    result.push(slot.value as AngularLine);
  }
  return result;
}

/** Reserve coarse engine work before touching a source. Refinement spends the remaining shared budget. */
export function planGridCrossings(options: GridCrossingOptions): GridCrossingPlan {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new RangeError("Grid crossing options require bounds, steps, limits and tolerances.");
  }
  const bodies = checkedBodies(options.bodies);
  const lines = checkedLines(options.lines);
  const { maxEvaluations, maxRefinements, coordinateTolerance, residualTolerance } = options;
  if (!Number.isSafeInteger(maxEvaluations) || maxEvaluations < 1 || maxEvaluations > MAX_ANGLE_EVALUATIONS) {
    throw new RangeError(`Grid crossing maxEvaluations must be an integer between 1 and ${MAX_ANGLE_EVALUATIONS}.`);
  }
  if (!Number.isSafeInteger(maxRefinements) || maxRefinements < 0 || maxRefinements > MAX_GRID_REFINEMENTS) {
    throw new RangeError(`Grid maxRefinements must be an integer between 0 and ${MAX_GRID_REFINEMENTS}.`);
  }
  for (const tolerance of [coordinateTolerance, residualTolerance]) {
    if (typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 180) {
      throw new RangeError("Grid crossing tolerances must be finite, positive degrees at most 180.");
    }
  }
  // planGrid bounds allocations independently of the refinement budget.
  const grid = planGrid({ bounds: options.bounds, latitudeStep: options.latitudeStep,
    longitudeStep: options.longitudeStep, maxSamples: MAX_GRID_SAMPLES });
  const requiredEvaluations = bodies.length + grid.sampleCount;
  if (requiredEvaluations > maxEvaluations) throw new AngularBudgetError(requiredEvaluations, maxEvaluations);
  return { grid, bodies, lines, maxEvaluations, requiredEvaluations, maxRefinements,
    coordinateTolerance, residualTolerance };
}

function bracket(from: CrossingBracketEnd, to: CrossingBracketEnd): CrossingBracket {
  return { from, to, width: to.coordinate - from.coordinate };
}

function onBranch(kind: AngularLine, sample: ObserverBodySample): boolean {
  return kind === "MC" || kind === "IC" || sample.horizonMotion === "stationary"
    || sample.horizonMotion === (kind === "ASC" ? "rising" : "setting");
}

/**
 * Find angular roots on unique grid edges and join unambiguous cell pairs.
 * Bisection locations always receive fresh engine observer receipts. Tangencies
 * without sign changes and unresolved topology are not silently joined.
 */
export function gridCrossings(source: RelocationSource, options: GridCrossingOptions): GridCrossingsResult {
  const plan = planGridCrossings(options);
  const grid = plan.grid;
  const base: GridCrossingBase = { schema: RELOCATION_GRID_CROSSINGS_SCHEMA,
    verification: "bounded-edge-brackets;sampled-cell-connections", plan };
  const points: GeographicPoint[] = grid.latitudes.flatMap((latitude) =>
    grid.longitudes.map((longitude) => ({ latitude, longitude })));
  const sampling = sampleAngles(source, points, { bodies: plan.bodies, maxEvaluations: plan.maxEvaluations });
  const refused = (value: Extract<AngularSamplingResult, { status: "refused" }>): GridCrossingsResult =>
    ({ ...base, status: "refused", reason: value.reason, sampling: value,
      edges: [], edgeResults: [], crossings: [], cells: [], unresolvedCells: [] });
  if (sampling.status === "refused") return refused(sampling);
  let prepared = sampling;
  const edges: GridEdge[] = [];
  const edgeByPair = new Map<string, number>();
  const addEdge = (axis: GridEdge["axis"], fromIndex: number, toIndex: number, start: number, end: number) => {
    const index = edges.length;
    edges.push({ index, axis, fromIndex, toIndex, start, end });
    edgeByPair.set(`${fromIndex}:${toIndex}`, index);
  };
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const from = row * grid.columns + column;
      if (column + 1 < grid.columns) addEdge("longitude", from, from + 1,
        grid.unwrappedLongitudes[column]!, grid.unwrappedLongitudes[column + 1]!);
      if (row + 1 < grid.rows) addEdge("latitude", from, from + grid.columns,
        grid.latitudes[row]!, grid.latitudes[row + 1]!);
    }
  }
  const bodyAt = (observerIndex: number, positionIndex: number): ObserverBodySample => {
    const observer = prepared.samples[observerIndex]!;
    if (observer.status !== "ok") throw new Error("Chart grids require nonpolar observers.");
    return observer.bodies[positionIndex]!;
  };
  const edgeResults: GridEdgeResult[] = [];
  const crossings: GridCrossing[] = [];
  const crossingBySample = new Map<string, number>();
  for (const [positionIndex, position] of prepared.positions.entries()) {
    for (const kind of plan.lines) {
      for (const edge of edges) {
        const initialLeft = bodyAt(edge.fromIndex, positionIndex).residuals[kind];
        const initialRight = bodyAt(edge.toIndex, positionIndex).residuals[kind];
        const common = { edgeIndex: edge.index, body: position.body, kind, positionIndex };
        if (initialLeft === null || initialRight === null) {
          edgeResults.push({ ...common, status: "unresolved", reason: "undefined-direction",
            crossingIndex: null, initialBracket: null, bracket: null, refinements: 0 });
          continue;
        }
        let left: CrossingBracketEnd = { observerIndex: edge.fromIndex, coordinate: edge.start, residual: initialLeft };
        let right: CrossingBracketEnd = { observerIndex: edge.toIndex, coordinate: edge.end, residual: initialRight };
        const initialBracket = bracket(left, right);
        let refinements = 0;
        const finish = (status: GridEdgeResult["status"], reason: GridEdgeIssue | null, crossingIndex: number | null) => {
          edgeResults.push({ ...common, status, reason, crossingIndex, initialBracket,
            bracket: bracket(left, right), refinements });
        };
        if (edge.end - edge.start >= 180) { finish("unresolved", "wide-edge", null); continue; }
        if (left.residual === 0 && right.residual === 0) { finish("unresolved", "coincident-edge", null); continue; }
        const meridian = kind === "MC" || kind === "IC";
        // A wrapped offset's jump on the opposite meridian is not a root.
        const sameSign = left.residual !== 0 && right.residual !== 0
          && (left.residual < 0) === (right.residual < 0);
        if (!meridian && (sameSign || left.residual === 0 || right.residual === 0) && edge.axis === "longitude") {
          const direction = bodyAt(edge.fromIndex, positionIndex);
          if (direction.hourAngle !== null) {
            const h = direction.hourAngle;
            const span = edge.end - edge.start;
            // A constant-latitude horizon edge can hide a pair of roots around
            // its interior upper/lower culmination. Screen that extremum using
            // captured engine directions. This is derived geometry, not a new
            // sampled observer or a fabricated receipt.
            const turn = Math.ceil(h / 180) * 180;
            if (turn > h && turn < h + span) {
              const altitude = observerAngles(position.rightAscension, position.declination,
                position.rightAscension! + turn, points[edge.fromIndex]!.latitude).altitude;
              const endpointSign = (left.residual === 0 ? right.residual : left.residual) < 0;
              if (Math.abs(altitude) <= plan.residualTolerance || (altitude < 0) !== endpointSign) {
                finish("unresolved", "unbracketed-edge", null); continue;
              }
            }
          }
        }
        if (sameSign || (meridian && Math.abs(left.residual - right.residual) >= 180)) {
          finish("no-crossing", null, null); continue;
        }
        let candidate = Math.abs(left.residual) <= Math.abs(right.residual) ? left : right;
        let issue: GridEdgeIssue | null = null;
        // An exact endpoint is already a receipt-bearing root, with a zero-width bracket.
        if (candidate.residual === 0) left = right = candidate;
        while (right.coordinate - left.coordinate > plan.coordinateTolerance
          || Math.abs(candidate.residual) > plan.residualTolerance) {
          if (refinements >= plan.maxRefinements) { issue = "refinement-limit"; break; }
          if (prepared.evaluations.positions + prepared.evaluations.houses >= plan.maxEvaluations) {
            issue = "refinement-budget"; break;
          }
          const coordinate = left.coordinate + (right.coordinate - left.coordinate) / 2;
          if (coordinate <= left.coordinate || coordinate >= right.coordinate) { issue = "coordinate-precision"; break; }
          const origin = points[edge.fromIndex]!;
          const point = edge.axis === "latitude" ? { latitude: coordinate, longitude: origin.longitude }
            : { latitude: origin.latitude, longitude: wrapLongitude(coordinate) };
          const next = sampleAdditionalAngles(prepared, [point]);
          if (next.status === "refused") return refused(next);
          prepared = next;
          refinements++;
          const observerIndex = prepared.samples.length - 1;
          const residual = bodyAt(observerIndex, positionIndex).residuals[kind];
          if (residual === null) { issue = "undefined-direction"; break; }
          const middle = { observerIndex, coordinate, residual };
          if (residual === 0) left = right = middle;
          else if ((left.residual < 0) === (residual < 0)) left = middle;
          else right = middle;
          candidate = Math.abs(left.residual) <= Math.abs(right.residual) ? left : right;
        }
        if (issue !== null) { finish("unresolved", issue, null); continue; }
        const direction = bodyAt(candidate.observerIndex, positionIndex);
        if (!onBranch(kind, direction)) { finish("no-crossing", null, null); continue; }
        const key = `${positionIndex}:${kind}:${candidate.observerIndex}`;
        let crossingIndex = crossingBySample.get(key);
        if (crossingIndex === undefined) {
          crossingIndex = crossings.length;
          crossingBySample.set(key, crossingIndex);
          crossings.push({ index: crossingIndex, body: position.body, kind, positionIndex,
            observerIndex: candidate.observerIndex, point: { ...prepared.samples[candidate.observerIndex]!.point },
            residual: candidate.residual, horizonMotion: direction.horizonMotion,
            status: !meridian && direction.horizonMotion === "stationary" ? "tangent" : "crossing" });
        }
        finish("crossing", null, crossingIndex);
      }
    }
  }
  const cells: GridCrossingCell[] = [];
  for (const [positionIndex, position] of prepared.positions.entries()) {
    for (const [lineIndex, kind] of plan.lines.entries()) {
      const offset = (positionIndex * plan.lines.length + lineIndex) * edges.length;
      for (let row = 0; row + 1 < grid.rows; row++) {
        for (let column = 0; column + 1 < grid.columns; column++) {
          const sw = row * grid.columns + column;
          const se = sw + 1;
          const nw = sw + grid.columns;
          const ne = nw + 1;
          const edgeResultIndices = [[sw, se], [se, ne], [nw, ne], [sw, nw]].map(([from, to]) =>
            offset + edgeByPair.get(`${from}:${to}`)!);
          const results = edgeResultIndices.map((index) => edgeResults[index]!);
          const crossingIndices = [...new Set(results.flatMap((result) =>
            result.crossingIndex === null ? [] : [result.crossingIndex]))];
          const edgeIssue = results.find((result) => result.status === "unresolved")?.reason;
          const tangent = crossingIndices.some((index) => crossings[index]!.status === "tangent");
          // A conservative angular-distance exclusion for fixed geocentric directions.
          // Horizon altitude changes no faster than observer angular displacement;
          // meridian residuals depend only on longitude. This is geometry, not an
          // astronomical error bound. Small corner margins leave the cell unresolved.
          const width = grid.unwrappedLongitudes[column + 1]! - grid.unwrappedLongitudes[column]!;
          const reach = kind === "MC" || kind === "IC" ? width : width + grid.latitudes[row + 1]! - grid.latitudes[row]!;
          const corners = [sw, se, nw, ne].map((index) => bodyAt(index, positionIndex).residuals[kind]);
          const excluded = corners.every((residual) => residual !== null && Math.abs(residual) > reach);
          const reason = edgeIssue ?? (tangent || crossingIndices.length > 2 || crossingIndices.length === 1
            ? "ambiguous-cell" : crossingIndices.length === 0 && !excluded ? "unbracketed-cell" : null);
          const status = reason !== null ? "unresolved" : crossingIndices.length === 2 ? "sampled" : "empty";
          const polylines = status === "sampled" ? splitAntimeridian(crossingIndices.map((index) => crossings[index]!.point))
            .map((segment) => segment.map((vertex): PolylineVertex => ({ point: vertex.point,
              source: vertex.source.kind === "sample"
                ? { kind: "sample", index: crossings[crossingIndices[vertex.source.index]!]!.observerIndex }
                : { ...vertex.source, fromIndex: crossings[crossingIndices[vertex.source.fromIndex]!]!.observerIndex,
                  toIndex: crossings[crossingIndices[vertex.source.toIndex]!]!.observerIndex } }))) : [];
          cells.push({ row, column, body: position.body, kind, positionIndex, edgeResultIndices,
            crossingIndices, status, reason, polylines });
        }
      }
    }
  }
  return { ...base, status: "ok", sampling: prepared, edges, edgeResults, crossings, cells,
    unresolvedCells: cells.filter((cell) => cell.status === "unresolved") };
}
