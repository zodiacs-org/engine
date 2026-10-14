import type { NatalEnvelope } from "@zodiacs/engine/receipt";
import { relocatedEnvelope, sourceEnvelope } from "./chart.js";
import type { GeographicPoint, RelocationSource } from "./chart.js";
import { geographicBounds, wrapLongitude } from "./geography.js";
import type { CheckedBounds, GeographicBounds } from "./geography.js";

export const MAX_GRID_SAMPLES = 4_096;
export const RELOCATION_GRID_SCHEMA = "zodiacs.relocation-grid.v1";

export interface GridOptions {
  readonly bounds: GeographicBounds;
  readonly latitudeStep: number;
  readonly longitudeStep: number;
  /** Destination chart evaluations; source capture may calculate one natal chart. */
  readonly maxSamples: number;
}

export interface GridPlan {
  readonly bounds: CheckedBounds;
  readonly latitudeStep: number;
  readonly longitudeStep: number;
  readonly maxSamples: number;
  readonly latitudes: readonly number[];
  readonly longitudes: readonly number[];
  readonly unwrappedLongitudes: readonly number[];
  readonly rows: number;
  readonly columns: number;
  readonly sampleCount: number;
}

export interface GridChartSample {
  readonly row: number;
  readonly column: number;
  readonly point: GeographicPoint;
  readonly unwrappedLongitude: number;
  readonly envelope: NatalEnvelope;
}

export interface RelocationGridResult {
  readonly schema: typeof RELOCATION_GRID_SCHEMA;
  readonly natal: NatalEnvelope;
  readonly plan: GridPlan;
  /** Row-major order, south to north and eastward from west. */
  readonly samples: readonly GridChartSample[];
}

export class GridBudgetError extends RangeError {
  readonly requiredSamples: number;
  readonly maxSamples: number;

  constructor(requiredSamples: number, maxSamples: number) {
    super(`Grid requires ${requiredSamples} samples; budget is ${maxSamples}.`);
    this.name = "GridBudgetError";
    this.requiredSamples = requiredSamples;
    this.maxSamples = maxSamples;
  }
}

function step(value: number, limit: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > limit) {
    throw new RangeError(`${name} must be finite, positive and at most ${limit} degrees.`);
  }
  return value;
}

function axis(start: number, end: number, stepSize: number, count: number): number[] {
  const values: number[] = [];
  for (let index = 0; index < count; index++) {
    const value = index === count - 1 ? end : start + index * stepSize;
    if (index > 0 && (value <= values[index - 1]! || value > end)) {
      throw new RangeError("Grid step does not produce distinct, ordered coordinates at floating-point precision.");
    }
    values.push(value);
  }
  return values;
}

function intervals(span: number, stepSize: number): number {
  // A positive subnormal span divided by a large step can underflow to zero.
  // Nonzero bounds still require both endpoints.
  return span === 0 ? 0 : Math.max(1, Math.ceil(span / stepSize));
}

/** Plan all coordinates and reject excess work before allocations or engine calls. */
export function planGrid(options: GridOptions): GridPlan {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new RangeError("Grid options require bounds, steps and a sample budget.");
  }
  const bounds = geographicBounds(options.bounds);
  if (bounds.south === -90 || bounds.north === 90) {
    throw new RangeError("Chart grids exclude exact geographic poles, where rising direction is undefined.");
  }
  const latitudeStep = step(options.latitudeStep, 180, "Latitude step");
  const longitudeStep = step(options.longitudeStep, 360, "Longitude step");
  const maxSamples = options.maxSamples;
  if (typeof maxSamples !== "number" || !Number.isSafeInteger(maxSamples)
    || maxSamples < 1 || maxSamples > MAX_GRID_SAMPLES) {
    throw new RangeError(`Grid maxSamples must be an integer between 1 and ${MAX_GRID_SAMPLES}.`);
  }
  const rows = intervals(bounds.north - bounds.south, latitudeStep) + 1;
  const columns = intervals(bounds.longitudeSpan, longitudeStep) + 1;
  const sampleCount = rows * columns;
  if (!Number.isSafeInteger(sampleCount) || sampleCount > maxSamples) {
    throw new GridBudgetError(sampleCount, maxSamples);
  }
  const latitudes = axis(bounds.south, bounds.north, latitudeStep, rows);
  const unwrappedLongitudes = axis(bounds.west, bounds.eastUnwrapped, longitudeStep, columns);
  const longitudes = unwrappedLongitudes.map((longitude, index) => {
    // Preserve both supplied endpoint spellings, even for full-world grids.
    if (index === 0) return bounds.west;
    if (index === columns - 1) return bounds.east;
    return wrapLongitude(longitude);
  });
  return { bounds, latitudeStep, longitudeStep, maxSamples, latitudes, longitudes,
    unwrappedLongitudes, rows, columns, sampleCount };
}

/** Compute a fresh engine natal envelope at every planned destination. */
export function sampleGrid(source: RelocationSource, options: GridOptions): RelocationGridResult {
  // Preflight runs first, even when a caller supplies an invalid source.
  const plan = planGrid(options);
  const natal = sourceEnvelope(source);
  const samples: GridChartSample[] = [];
  for (let row = 0; row < plan.rows; row++) {
    for (let column = 0; column < plan.columns; column++) {
      const point = { latitude: plan.latitudes[row]!, longitude: plan.longitudes[column]! };
      samples.push({ row, column, point, unwrappedLongitude: plan.unwrappedLongitudes[column]!,
        envelope: relocatedEnvelope(natal, point) });
    }
  }
  return { schema: RELOCATION_GRID_SCHEMA, natal, plan, samples };
}
