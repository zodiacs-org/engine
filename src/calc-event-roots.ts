/** Scalar searches on the integer TT millisecond grid. */
import { sampleCrossings } from "./search-samples.js";

const DAY_MS = 86_400_000;
export const HOUR_MS = DAY_MS / 24;

/** The principal angle in [-180, 180), in degrees. */
export function principal(degrees: number): number {
  return degrees - 360 * Math.floor((degrees + 180) / 360);
}

interface Root {
  ttMs: number;
  rising: boolean;
  /** Change in the scalar per TT day at the root. */
  slope: number;
}

type Scan =
  | { status: "ok"; samples: number; roots: Root[] }
  | { status: "refused"; reason: "sample-budget"; samples: number; maxSamples: number; detail: string };

/**
 * One sign transition per daily cell. Phase grows through the requested angle,
 * and jumps down across the opposite meridian. Only its rising transition counts.
 * The returned millisecond is the upper end of the final one-millisecond bracket.
 */
export function scanEventRoots(
  from: number, to: number, phase: boolean, valueAt: (ttMs: number) => number, maxSamples: number
): Scan {
  if (from > to) throw new RangeError("The search window must have from <= to.");
  const count = from === to ? 0 : 1 + Math.ceil((to - from) / DAY_MS);
  const scan = sampleCrossings(count, maxSamples, valueAt, "Non-finite event search sample.", (sample) => {
    const roots: Root[] = [];
    let left = from;
    let before = sample(from);
    while (left < to) {
      const right = Math.min(to, left + DAY_MS);
      const after = sample(right);
      const rising = before < 0 && after >= 0;
      if (rising || (!phase && before > 0 && after <= 0)) {
        let lo = left;
        let hi = right;
        while (hi - lo > 1) {
          const mid = Math.floor((lo + hi) / 2);
          const value = sample(mid);
          if (rising ? value >= 0 : value <= 0) hi = mid;
          else lo = mid;
        }
        // Confirm the direction on both sides, including a zero at a cell end.
        // A touch or a flat segment without reversal is not a station.
        const minus = sample(hi - HOUR_MS);
        const plus = sample(hi + HOUR_MS);
        if (rising ? minus < 0 && plus > 0 : minus > 0 && plus < 0) {
          const slope = (phase ? principal(plus - minus) : plus - minus) * 12;
          roots.push({ ttMs: hi, rising, slope });
        }
      }
      left = right;
      before = after;
    }
    return roots;
  });
  if (scan.status === "refused") {
    return { status: "refused", reason: scan.reason, samples: scan.samples, maxSamples, detail: "The search exceeds maxSamples." };
  }
  return { status: "ok", samples: scan.samples, roots: scan.crossings };
}
