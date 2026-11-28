import { chartPoints, natalChart } from "../../src/api.js";
import { createNatalEnvelope } from "../../src/receipt.js";
import type { NatalEnvelope, NatalEnvelopeContext } from "../../src/receipt.js";
import type { BirthInput, ChartFlag } from "../../src/types.js";
import { harmonicChart, harmonicLimit } from "./harmonic-chart.js";
import type { HarmonicChart, HarmonicOptions, HarmonicPoint, LongitudePoint } from "./types.js";

export type { BirthInput, NatalEnvelopeContext };

/** Source longitude and, only when the engine supplies it, degrees/day speed. */
export interface EngineLongitudePoint extends LongitudePoint {
  readonly speed?: number;
}

export interface CastChartOptions {
  /** Append Ascendant, Midheaven, Descendant and Imum Coeli when available. */
  readonly includeAngles?: boolean;
  /** Append the engine's chartPoints result. Extra points are outside the natal receipt. */
  readonly includeChartPoints?: boolean;
  /** Passed unchanged to the engine's natal receipt creator. */
  readonly receiptContext?: NatalEnvelopeContext;
}

export interface CastHarmonicOptions extends CastChartOptions, HarmonicOptions {}

export interface CastChartResult {
  readonly points: readonly EngineLongitudePoint[];
  readonly flags: readonly ChartFlag[];
  /** Original natal envelope, describing the source chart only. */
  readonly envelope: NatalEnvelope;
}

export interface EngineHarmonicPoint extends HarmonicPoint {
  /** Engine source speed in degrees/day, absent when unknown. */
  readonly sourceSpeed?: number;
  /** N times the source speed, in harmonic degrees/day, absent when unknown. */
  readonly speed?: number;
}

export interface EngineHarmonicChart extends HarmonicChart {
  readonly points: readonly EngineHarmonicPoint[];
}

export interface CastHarmonicChartResult {
  readonly source: CastChartResult;
  readonly harmonicChart: EngineHarmonicChart;
}

function castOptions(options: CastChartOptions): CastChartOptions {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new RangeError("Casting options must be an object.");
  }
  const { includeAngles, includeChartPoints, receiptContext } = options;
  for (const flag of [includeAngles, includeChartPoints]) {
    if (flag !== undefined && typeof flag !== "boolean") {
      throw new RangeError("includeAngles and includeChartPoints must be booleans.");
    }
  }
  return {
    includeAngles: includeAngles ?? false,
    includeChartPoints: includeChartPoints ?? false,
    ...(receiptContext === undefined ? {} : { receiptContext })
  };
}

/**
 * Cast once through the engine and capture its natal envelope before deriving
 * extra points. No astronomical calculations or receipt conventions are replaced.
 */
export function castChart(birth: BirthInput, options: CastChartOptions = {}): CastChartResult {
  const settings = castOptions(options);
  const chart = natalChart(birth);
  const envelope = createNatalEnvelope(chart, settings.receiptContext);
  const points: EngineLongitudePoint[] = chart.bodies.map(({ body, lon, speed }) => ({ body, lon, speed }));
  if (settings.includeAngles && chart.angles !== null) {
    const { asc, mc, dsc, ic } = chart.angles;
    points.push(
      { body: "Ascendant", lon: asc },
      { body: "Midheaven", lon: mc },
      { body: "Descendant", lon: dsc },
      { body: "Imum Coeli", lon: ic }
    );
  }
  if (settings.includeChartPoints) {
    for (const { point, lon, speed } of chartPoints(chart).points) {
      points.push({ body: point, lon, ...(speed === null ? {} : { speed }) });
    }
  }
  return Object.freeze({
    points: Object.freeze(points.map((point) => Object.freeze(point))),
    flags: Object.freeze([...chart.flags]),
    envelope
  });
}

/** Preserve natal provenance alongside longitude and known-speed transforms. */
export function castHarmonicChart(
  birth: BirthInput,
  harmonic: number,
  options: CastHarmonicOptions = {}
): CastHarmonicChartResult {
  const maxHarmonic = harmonicLimit(harmonic, options);
  const source = castChart(birth, options);
  const transformed = harmonicChart(source.points, harmonic, { maxHarmonic });
  const points = transformed.points.map((point, index): EngineHarmonicPoint => {
    const sourceSpeed = source.points[index]!.speed;
    return Object.freeze({
      ...point,
      ...(sourceSpeed === undefined ? {} : { sourceSpeed, speed: sourceSpeed * harmonic })
    });
  });
  return Object.freeze({
    source,
    harmonicChart: Object.freeze({ ...transformed, points: Object.freeze(points) })
  });
}
