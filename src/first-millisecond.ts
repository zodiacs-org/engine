/*
 * A crossing as a whole millisecond: the first millisecond at which a
 * quantity has reached its target, found by bisection on whole milliseconds
 * around the crossing solver's estimate. The solver's own estimate depends on
 * the window it scanned; this one does not, so the same event found from two
 * windows is the same instant, and a window [from, to) either holds it or not.
 */

/**
 * The first millisecond t with `reached(t)`, where `reached` is false just
 * before the crossing and true from it on, near `estimate`.
 */
export function firstMillisecond(reached: (ms: number) => boolean, estimate: number): number {
  const start = Math.round(estimate);
  let lo = start - 4;
  let hi = start + 4;
  for (let widen = 4; reached(lo); widen *= 2) {
    if (widen > 1 << 24) throw new RangeError("A crossing could not be bracketed.");
    hi = lo;
    lo -= widen;
  }
  for (let widen = 4; !reached(hi); widen *= 2) {
    if (widen > 1 << 24) throw new RangeError("A crossing could not be bracketed.");
    lo = hi;
    hi += widen;
  }
  while (hi - lo > 1) {
    const middle = Math.floor((lo + hi) / 2);
    if (reached(middle)) hi = middle;
    else lo = middle;
  }
  return hi;
}
