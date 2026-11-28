import type { DistanceExtremum, DistancePoint, DistanceSolverRefusalReason } from "./solver.js";

interface RatePoint extends DistancePoint {
  readonly rate: number;
}

type RateSearchResult =
  | { readonly status: "complete"; readonly extrema: readonly DistanceExtremum[] }
  | {
      readonly status: "refused";
      readonly reason: DistanceSolverRefusalReason;
      readonly interval: { readonly fromSeconds: number; readonly toSeconds: number };
      readonly extrema: readonly [];
    };

class RateRefusal {
  constructor(readonly reason: DistanceSolverRefusalReason, readonly from: number, readonly to: number) {}
}

/**
 * Internal analytic-distance-derivative solver. The window wrapper supplies a
 * canonical uniform grid, a positive tolerance, caching and an evaluation cap.
 * Only use when rate differentiates the same distance model (not Pluto).
 * Final lower/upper points bracket opposite rates; their distances can tie.
 * The bracket triple instead contains strict, wider distance witnesses.
 */
export function searchAnalyticRateExtremaWith(
  sampleAt: (seconds: number) => { distanceKm: number; radialSpeedKmPerSecond: number },
  times: readonly number[],
  toleranceSeconds: number
): RateSearchResult {
  if (times.length < 3 || !Number.isFinite(toleranceSeconds) || toleranceSeconds <= 0) {
    throw new RangeError("Rate search requires a grid and positive tolerance.");
  }
  const step = times[1]! - times[0]!;
  if (!Number.isFinite(step) || step <= 0 || times.some((t, i) => !Number.isFinite(t) ||
    (i > 0 && t - times[i - 1]! !== step))) {
    throw new RangeError("Rate search requires a finite uniform grid.");
  }
  const cache = new Map<number, RatePoint>();
  const at = (timeSeconds: number): RatePoint => {
    const cached = cache.get(timeSeconds);
    if (cached) return cached;
    const sample = sampleAt(timeSeconds);
    if (!Number.isFinite(sample.distanceKm) || sample.distanceKm <= 0 ||
      !Number.isFinite(sample.radialSpeedKmPerSecond)) {
      throw new RangeError("Rate samples must have positive finite distance and finite rate.");
    }
    const point = { timeSeconds, distanceKm: sample.distanceKm, rate: sample.radialSpeedKmPerSecond };
    cache.set(timeSeconds, point);
    return point;
  };
  const middle = (a: number, b: number): number => {
    const t = a + (b - a) / 2;
    if (!(a < t && t < b)) throw new RateRefusal("time-resolution", a, b);
    return t;
  };

  try {
    const grid = times.map(at);
    const extrema: DistanceExtremum[] = [];
    const refine = (left: RatePoint, right: RatePoint): DistanceExtremum => {
      const kind = left.rate < 0 ? "minimum" : "maximum";
      const direction = kind === "minimum" ? 1 : -1;
      let lower = left;
      let upper = right;
      while (upper.timeSeconds - lower.timeSeconds > toleranceSeconds) {
        const point = at(middle(lower.timeSeconds, upper.timeSeconds));
        if (point.rate === 0) {
          // Keep strict opposite-rate witnesses around an exactly sampled zero.
          // A plateau or another zero cannot certify an isolated extremum.
          const before = at(middle(lower.timeSeconds, point.timeSeconds));
          const after = at(middle(point.timeSeconds, upper.timeSeconds));
          if (direction * before.rate >= 0 || direction * after.rate <= 0) {
            throw new RateRefusal("ambiguous-distance", before.timeSeconds, after.timeSeconds);
          }
          lower = before;
          upper = after;
        } else if (direction * point.rate < 0) lower = point;
        else upper = point;
      }
      const sample = at(middle(lower.timeSeconds, upper.timeSeconds));
      // Canonical grid neighbors outside the original rate bracket supply wide
      // witnesses. This remains stable when the root is near a grid node.
      const before = at(left.timeSeconds - step);
      const after = at(right.timeSeconds + step);
      if (direction * before.rate >= 0 || direction * after.rate <= 0 ||
        direction * (before.distanceKm - sample.distanceKm) <= 0 ||
        direction * (after.distanceKm - sample.distanceKm) <= 0) {
        throw new RateRefusal("non-unimodal", before.timeSeconds, after.timeSeconds);
      }
      return { kind, sample, bracket: [before, sample, after], lower, upper };
    };

    // The outer grid nodes are distance witnesses, never candidate intervals.
    // Two nodes of wrapper padding preserve these witnesses across partitions.
    for (let index = 1; index < grid.length - 2; index += 1) {
      const left = grid[index]!;
      const right = grid[index + 1]!;
      if (left.rate === 0 && right.rate === 0) {
        throw new RateRefusal("ambiguous-distance", left.timeSeconds, right.timeSeconds);
      }
      if (Math.sign(left.rate) * Math.sign(right.rate) < 0) extrema.push(refine(left, right));
      else if (right.rate === 0 && index + 2 < grid.length - 1) {
        const next = grid[index + 2]!;
        if (next.rate === 0) throw new RateRefusal("ambiguous-distance", right.timeSeconds, next.timeSeconds);
        if (Math.sign(left.rate) * Math.sign(next.rate) < 0) extrema.push(refine(left, next));
        index += 1;
      }
    }
    return { status: "complete", extrema };
  } catch (error) {
    if (!(error instanceof RateRefusal)) throw error;
    return {
      status: "refused", reason: error.reason, extrema: [],
      interval: { fromSeconds: error.from, toSeconds: error.to }
    };
  }
}
