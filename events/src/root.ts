/** Numerical enclosure of a zero of a continuous scalar function. */
export interface RootOptions {
  readonly toleranceMs?: number;
  readonly maxEvaluations?: number;
}

export type RootResult =
  | { readonly status: "converged"; readonly atMs: number; readonly value: number;
      readonly bracket: readonly [number, number]; readonly evaluations: number }
  | { readonly status: "refused"; readonly reason: "evaluation-budget";
      readonly bracket: readonly [number, number]; readonly evaluations: number };

function instant(value: number): void {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 8.64e15) {
    throw new RangeError("Root endpoints must be integer epoch milliseconds representable by Date.");
  }
}

/**
 * Refine an inclusive sign-changing bracket by bisection on integer milliseconds.
 * The caller supplies a continuous function and discovers the bracket separately.
 * Convergence describes numerical enclosure, not astronomical accuracy.
 */
export function refineRoot(
  valueAt: (atMs: number) => number,
  startMs: number,
  endMs: number,
  options: RootOptions = {}
): RootResult {
  instant(startMs);
  instant(endMs);
  const tolerance = options.toleranceMs ?? 1;
  const budget = options.maxEvaluations ?? 64;
  if (startMs > endMs || !Number.isSafeInteger(tolerance) || tolerance < 1 ||
      !Number.isSafeInteger(budget) || budget < 2) {
    throw new RangeError("Invalid root interval, tolerance or evaluation budget.");
  }
  if (typeof valueAt !== "function") throw new TypeError("A scalar function is required.");

  let evaluations = 0;
  const evaluate = (atMs: number): number => {
    evaluations++;
    const value = valueAt(atMs);
    if (!Number.isFinite(value)) throw new RangeError("Root function must return a finite number.");
    return value;
  };
  const converged = (atMs: number, value: number, lo: number, hi: number): RootResult =>
    ({ status: "converged", atMs, value, bracket: [lo, hi], evaluations });

  let lo = startMs;
  let hi = endMs;
  let left = evaluate(lo);
  if (left === 0) return converged(lo, left, lo, lo);
  if (lo === hi) throw new RangeError("A degenerate bracket must be an exact sampled zero.");
  let right = evaluate(hi);
  if (right === 0) return converged(hi, right, hi, hi);
  const sameSign = (a: number, b: number): boolean => (a < 0) === (b < 0);
  if (sameSign(left, right)) throw new RangeError("Root bracket must change sign.");

  while (hi - lo > tolerance) {
    if (evaluations === budget) {
      return { status: "refused", reason: "evaluation-budget", bracket: [lo, hi], evaluations };
    }
    const mid = lo + Math.floor((hi - lo) / 2);
    const value = evaluate(mid);
    if (value === 0) return converged(mid, value, mid, mid);
    if (sameSign(left, value)) {
      lo = mid;
      left = value;
    } else {
      hi = mid;
      right = value;
    }
  }
  return Math.abs(left) <= Math.abs(right)
    ? converged(lo, left, lo, hi)
    : converged(hi, right, lo, hi);
}
