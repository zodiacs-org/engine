/** Scalar distance searches. This module imports neither an ephemeris nor I/O. */

export interface DistancePoint {
  /** Seconds from a caller-chosen continuous time origin, normally TT. */
  readonly timeSeconds: number;
  readonly distanceKm: number;
}

export interface DistanceSolverOptions {
  /** An ordered grid including the outer witnesses, not requested-window edges. */
  readonly sampleTimesSeconds: readonly number[];
  /** Maximum final enclosing interval width, in seconds. */
  readonly toleranceSeconds: number;
  /** Finite cap on callback invocations, including probes and refinement. */
  readonly maxEvaluations: number;
}

export interface DistanceInterval {
  readonly fromSeconds: number;
  readonly toSeconds: number;
}

export interface DistanceExtremum {
  readonly kind: "minimum" | "maximum";
  /** An evaluated best point inside [lower, upper], not an exact root. */
  readonly sample: DistancePoint;
  /** Original strict turn, possibly using a probe between equal grid values. */
  readonly bracket: readonly [DistancePoint, DistancePoint, DistancePoint];
  /** Final witnesses, both strictly worse than sample for the requested kind. */
  readonly lower: DistancePoint;
  readonly upper: DistancePoint;
}

export type DistanceSolverRefusalReason =
  | "evaluation-budget"
  | "ambiguous-distance"
  | "non-unimodal"
  | "time-resolution";

export type DistanceSolverResult =
  | {
      /** Algorithm completion on the supplied grid, not proof of completeness. */
      readonly status: "complete";
      readonly extrema: readonly DistanceExtremum[];
      readonly evaluations: number;
      readonly maxEvaluations: number;
    }
  | {
      readonly status: "refused";
      readonly reason: DistanceSolverRefusalReason;
      readonly interval: DistanceInterval;
      readonly extrema: readonly [];
      readonly evaluations: number;
      readonly maxEvaluations: number;
    };

// Split the longer side of a strict bracket at the golden-section ratio.
const GOLDEN_COMPLEMENT = (3 - Math.sqrt(5)) / 2;

class SolverRefusal {
  constructor(
    readonly reason: DistanceSolverRefusalReason,
    readonly interval: DistanceInterval
  ) {}
}

function interval(fromSeconds: number, toSeconds: number): DistanceInterval {
  return { fromSeconds, toSeconds };
}

function validate(options: DistanceSolverOptions): DistanceSolverOptions {
  const prototype: unknown = options !== null && typeof options === "object"
    ? Object.getPrototypeOf(options) : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RangeError("Distance solver options must be a plain object.");
  }
  const keys = new Set(["sampleTimesSeconds", "toleranceSeconds", "maxEvaluations"]);
  for (const key of Reflect.ownKeys(options)) {
    const slot = Object.getOwnPropertyDescriptor(options, key);
    if (typeof key !== "string" || !keys.delete(key) || !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError("Distance solver options must contain only the named data properties.");
    }
  }
  if (keys.size !== 0) throw new RangeError("Distance solver options are required.");
  const { sampleTimesSeconds, toleranceSeconds, maxEvaluations } = options;
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds <= 0) {
    throw new RangeError("toleranceSeconds must be finite and positive.");
  }
  if (!Number.isSafeInteger(maxEvaluations) || maxEvaluations < 1) {
    throw new RangeError("maxEvaluations must be a positive safe integer.");
  }
  if (!Array.isArray(sampleTimesSeconds) || sampleTimesSeconds.length < 3) {
    throw new RangeError("sampleTimesSeconds must contain at least three ordered times.");
  }
  // Snapshot before invoking the callback so caller mutations cannot change the grid.
  const times: number[] = [];
  for (let index = 0; index < sampleTimesSeconds.length; index += 1) {
    const slot = Object.getOwnPropertyDescriptor(sampleTimesSeconds, index);
    const time: unknown = slot && "value" in slot ? slot.value : undefined;
    if (typeof time !== "number" || !Number.isFinite(time) || (index > 0 && time <= times[index - 1]!)) {
      throw new RangeError("sampleTimesSeconds must contain finite, strictly increasing data values.");
    }
    times.push(time);
  }
  if (!Number.isFinite(times[times.length - 1]! - times[0]!)) {
    throw new RangeError("The distance solver grid must have a finite span.");
  }
  return { sampleTimesSeconds: times, toleranceSeconds, maxEvaluations };
}

/**
 * Find strict distance turns witnessed by a supplied grid, then refine each
 * with a bounded golden-section search. Distances must be positive kilometres.
 * The callback must be deterministic and the curve continuous and unimodal
 * within each bracket. Those assumptions cannot be proved from finite samples.
 *
 * No sample is taken outside the grid endpoints; no endpoint is called an
 * extremum without witnesses on both sides. Callers supply edge padding and
 * window filtering. Ties wider than tolerance, observed contradictions and
 * exhausted budgets refuse the entire search with an empty extrema list.
 * Invalid inputs/results throw RangeError; callback exceptions propagate.
 */
export function searchDistanceExtremaWith(
  distanceAt: (timeSeconds: number) => number,
  options: DistanceSolverOptions
): DistanceSolverResult {
  if (typeof distanceAt !== "function") throw new RangeError("distanceAt must be a function.");
  const { sampleTimesSeconds: times, toleranceSeconds, maxEvaluations } = validate(options);
  const whole = interval(times[0]!, times[times.length - 1]!);
  let evaluations = 0;
  const refused = (reason: DistanceSolverRefusalReason, where: DistanceInterval): DistanceSolverResult => ({
    status: "refused", reason, interval: where, extrema: [], evaluations, maxEvaluations
  });
  if (times.length > maxEvaluations) return refused("evaluation-budget", whole);

  const cache = new Map<number, DistancePoint>();
  const sample = (timeSeconds: number, where: DistanceInterval): DistancePoint => {
    const cached = cache.get(timeSeconds);
    if (cached) return cached;
    if (evaluations === maxEvaluations) throw new SolverRefusal("evaluation-budget", where);
    evaluations += 1;
    const distanceKm = distanceAt(timeSeconds);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      throw new RangeError("distanceAt must return a finite, positive distance in kilometres.");
    }
    const point = { timeSeconds, distanceKm };
    cache.set(timeSeconds, point);
    return point;
  };

  const interior = (from: number, to: number, fraction: number): number => {
    const time = from + (to - from) * fraction;
    if (!(time > from && time < to)) throw new SolverRefusal("time-resolution", interval(from, to));
    return time;
  };

  const refine = (
    bracket: readonly [DistancePoint, DistancePoint, DistancePoint],
    kind: DistanceExtremum["kind"]
  ): DistanceExtremum => {
    let [lower, best, upper] = bracket;
    // Preserve the whole set of tied best samples. Never trim through a
    // numerical plateau merely because two distances are indistinguishable.
    let bestLeft = best;
    let bestRight = best;
    const better = (a: DistancePoint, b: DistancePoint): boolean => kind === "minimum"
      ? a.distanceKm < b.distanceKm : a.distanceKm > b.distanceKm;
    while (upper.timeSeconds - lower.timeSeconds > toleranceSeconds) {
      const where = interval(lower.timeSeconds, upper.timeSeconds);
      const useLeft = bestLeft.timeSeconds - lower.timeSeconds >= upper.timeSeconds - bestRight.timeSeconds;
      const time = useLeft
        ? interior(lower.timeSeconds, bestLeft.timeSeconds, 1 - GOLDEN_COMPLEMENT)
        : interior(bestRight.timeSeconds, upper.timeSeconds, GOLDEN_COMPLEMENT);
      const point = sample(time, where);
      if (better(point, best)) {
        if (useLeft) upper = bestLeft;
        else lower = bestRight;
        best = point;
        bestLeft = point;
        bestRight = point;
      } else if (better(best, point)) {
        if (useLeft) lower = point;
        else upper = point;
      } else {
        // A symmetric strict extremum can give equal values on either side.
        // A strictly better midpoint supplies a smaller, still strict bracket.
        const left = useLeft ? point : bestLeft;
        const right = useLeft ? bestRight : point;
        const middle = sample(interior(left.timeSeconds, right.timeSeconds, 0.5), where);
        if (better(middle, best)) {
          lower = left;
          upper = right;
          best = middle;
          bestLeft = middle;
          bestRight = middle;
        } else if (better(best, middle)) {
          throw new SolverRefusal("non-unimodal", interval(left.timeSeconds, right.timeSeconds));
        } else {
          if (right.timeSeconds - left.timeSeconds > toleranceSeconds) {
            throw new SolverRefusal("ambiguous-distance", interval(left.timeSeconds, right.timeSeconds));
          }
          bestLeft = left;
          bestRight = right;
          best = middle;
        }
      }
    }
    return { kind, sample: best, bracket, lower, upper };
  };

  try {
    const coarse = times.map((time) => sample(time, whole));
    const grid: DistancePoint[] = [coarse[0]!];
    for (let index = 1; index < coarse.length; index += 1) {
      const previous = coarse[index - 1]!;
      const current = coarse[index]!;
      if (previous.distanceKm === current.distanceKm) {
        const where = interval(previous.timeSeconds, current.timeSeconds);
        const middle = sample(interior(previous.timeSeconds, current.timeSeconds, 0.5), where);
        if (middle.distanceKm === previous.distanceKm) throw new SolverRefusal("ambiguous-distance", where);
        grid.push(middle);
      }
      grid.push(current);
    }

    const extrema: DistanceExtremum[] = [];
    for (let index = 1; index < grid.length - 1; index += 1) {
      const left = grid[index - 1]!;
      const middle = grid[index]!;
      const right = grid[index + 1]!;
      // Bracketing needs only order, without forming finite-difference slopes.
      const kind = middle.distanceKm < left.distanceKm && middle.distanceKm < right.distanceKm
        ? "minimum"
        : middle.distanceKm > left.distanceKm && middle.distanceKm > right.distanceKm
          ? "maximum" : undefined;
      if (kind) extrema.push(refine([left, middle, right], kind));
    }
    extrema.sort((a, b) => a.sample.timeSeconds - b.sample.timeSeconds);
    return { status: "complete", extrema, evaluations, maxEvaluations };
  } catch (error) {
    if (error instanceof SolverRefusal) return refused(error.reason, error.interval);
    throw error;
  }
}
