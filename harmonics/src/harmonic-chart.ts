import { normalizeLongitude } from "../../src/signs.js";
import type { HarmonicChart, HarmonicOptions, HarmonicPoint, LongitudePoint } from "./types.js";

export const DEFAULT_MAX_HARMONIC = 180;

/** @internal Shared with the casting adapter to reject invalid N before casting. */
export function harmonicLimit(harmonic: number, options: HarmonicOptions): number {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new RangeError("Harmonic options must be an object.");
  }
  const maxHarmonic = options.maxHarmonic ?? DEFAULT_MAX_HARMONIC;
  // Explicit null is not an omitted setting, even for callers outside TypeScript.
  if (options.maxHarmonic === null || !Number.isSafeInteger(maxHarmonic) || maxHarmonic < 1) {
    throw new RangeError("maxHarmonic must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(harmonic) || harmonic < 1 || harmonic > maxHarmonic) {
    throw new RangeError("harmonic must be a positive safe integer within maxHarmonic.");
  }
  return maxHarmonic;
}

/**
 * Multiply each normalized longitude by N and reduce it onto [0, 360).
 * Calls the engine's normalization helper; does not cast an astronomical chart.
 * Input order is retained and the newly allocated result is deeply frozen.
 */
export function harmonicChart(
  points: readonly LongitudePoint[],
  harmonic: number,
  options: HarmonicOptions = {}
): HarmonicChart {
  const maxHarmonic = harmonicLimit(harmonic, options);
  if (!Array.isArray(points) || !points.length) {
    throw new RangeError("points must be a nonempty array.");
  }
  const seen = new Set<string>();
  const transformed: HarmonicPoint[] = [];
  // for...of observes sparse array slots, which must be rejected.
  for (const point of points) {
    if (!point || typeof point !== "object") {
      throw new RangeError("Each point must have a body and a finite longitude.");
    }
    const { body, lon } = point;
    if (
      typeof body !== "string" || body.length < 1 || body.length > 80 ||
      body.trim() !== body || /[\u0000-\u001f\u007f]/u.test(body) || seen.has(body)
    ) {
      throw new RangeError("Point bodies must be valid, unique identifiers.");
    }
    if (typeof lon !== "number" || !Number.isFinite(lon)) {
      throw new RangeError("Point longitudes must be finite numbers in degrees.");
    }
    seen.add(body);
    const sourceLon = normalizeLongitude(lon);
    transformed.push(Object.freeze({
      body,
      sourceLon,
      lon: normalizeLongitude(sourceLon * harmonic)
    }));
  }
  return Object.freeze({ harmonic, maxHarmonic, points: Object.freeze(transformed) });
}
