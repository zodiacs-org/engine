import { elapsedDays, timeBasis } from "../../src/time-scale.js";

// elapsedDays preserves its third argument exactly within a continuous piece
// and returns elapsed TT across a step. Use the engine's own distinction,
// including the first millisecond after the inclusive IERS table endpoint.
const onePiece = (from: number, to: number): boolean =>
  Number.isNaN(elapsedDays(timeBasis(from, "utc"), timeBasis(to, "utc"), NaN));

/** Internal UTC time-basis steps in (from,to], found without ephemeris calls. */
export function timeSeams(from: number, to: number): number[] {
  const seams: number[] = [];
  // Requests are bounded by the ingress reader. Within its allowed span,
  // the engine's piece identities never recur after a step: leap counts
  // increase, and the model and IERS handovers have distinct identities.
  let start = from;
  while (start < to && !onePiece(start, to)) {
    let low = start;
    let high = to;
    while (high - low > 1) {
      const middle = low + Math.floor((high - low) / 2);
      if (onePiece(start, middle)) low = middle;
      else high = middle;
    }
    seams.push(high);
    start = high;
  }
  return seams;
}
