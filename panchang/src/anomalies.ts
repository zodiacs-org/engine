import { tithiOf } from "./limbs.js";
import type { TithiPosition } from "./limbs.js";
import type { PanchangAyanamsa } from "./engine.js";
import type { SunriseBoundary, SunriseDayWindow } from "./sunrise.js";
import type { LimbInterval, LimbTransitions } from "./transitions.js";

export const TITHI_ANOMALY_CONVENTIONS = Object.freeze({
  comparison: "starting-sunrise-to-following-local-date-sunrise",
  ownership: "[tithi-start,tithi-end)",
  kshaya: "complete-tithi-between-sunrises;end-at-next-sunrise-is-skipped",
  vriddhi: "same-complete-tithi-interval-contains-both-sunrises",
  attribution: "forward-comparison;vriddhi-identifies-first-of-the-pair",
  reference: "independent-interval-arithmetic;not-a-physical-error-bound"
} as const);

export interface SunriseTithiComparison {
  readonly from: string;
  readonly to: string;
  readonly ayanamsa: PanchangAyanamsa;
  readonly conventions: typeof TITHI_ANOMALY_CONVENTIONS;
  readonly kind: "ordinary" | "kshaya" | "vriddhi";
  readonly startTithi: TithiPosition;
  readonly endTithi: TithiPosition;
  /** Original sunrise snapshots/receipts and complete computed intervals. */
  readonly start: SunriseBoundary;
  readonly end: SunriseBoundary;
  readonly repeated: LimbInterval | null;
  readonly skipped: readonly LimbInterval[];
}

/**
 * Compare successful, matching sunrise and transition results with no new
 * ephemeris calls. Missing sunrises must already have refused the day. Invalid
 * or inconsistent combinations throw rather than infer a modular index jump.
 */
export function compareSunriseTithis(sunrise: SunriseDayWindow, timeline: LimbTransitions): SunriseTithiComparison {
  const fail = (): never => { throw new RangeError("Tithi comparison requires matching complete sunrise and transition results."); };
  if (sunrise.status !== "ok" || timeline.status !== "ok" ||
      sunrise.start.utc !== timeline.from || sunrise.end.utc !== timeline.to ||
      sunrise.ayanamsa !== timeline.ayanamsa || timeline.startState.utc !== timeline.from ||
      [sunrise.start, sunrise.end].some((boundary) => boundary.snapshot.utc !== boundary.utc ||
        boundary.snapshot.ayanamsa.name !== sunrise.ayanamsa)) fail();
  const lo = Date.parse(sunrise.start.utc);
  const hi = Date.parse(sunrise.end.utc);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) fail();
  const intervals = timeline.intervals.filter((row) => row.kind === "tithi");
  const first = intervals[0];
  const last = intervals.at(-1);
  if (!first || !last) return fail();
  if (Date.parse(first.start.at) > lo || Date.parse(first.end.at) <= lo ||
      Date.parse(last.start.at) >= hi || Date.parse(last.end.at) < hi) fail();
  for (const [i, row] of intervals.entries()) {
    if (!(Date.parse(row.end.at) > Date.parse(row.start.at)) ||
        row.index !== row.start.after.tithi.index || row.index !== row.end.before.tithi.index ||
        row.end.after.tithi.index !== (row.index + 1) % 30 ||
        (i > 0 && (row.start.at !== intervals[i - 1]!.end.at ||
          row.index !== (intervals[i - 1]!.index + 1) % 30))) fail();
  }
  const classify = (boundary: SunriseBoundary) =>
    tithiOf(boundary.snapshot.sun.tropical.lon, boundary.snapshot.moon.tropical.lon);
  const startTithi = classify(sunrise.start);
  const endTithi = classify(sunrise.end);
  const endAtBoundary = Date.parse(last.end.at) === hi;
  if (startTithi.index !== first.index || startTithi.index !== timeline.startState.tithi.index ||
      endTithi.index !== (endAtBoundary ? last.end.after.tithi.index : last.index)) fail();
  const skipped = Object.freeze(intervals.filter((row) => Date.parse(row.start.at) > lo && Date.parse(row.end.at) <= hi));
  const repeated = intervals.length === 1 && !endAtBoundary ? first : null;
  return Object.freeze({ from: sunrise.start.utc, to: sunrise.end.utc, ayanamsa: timeline.ayanamsa,
    conventions: TITHI_ANOMALY_CONVENTIONS, kind: repeated ? "vriddhi" : skipped.length ? "kshaya" : "ordinary",
    startTithi, endTithi, start: sunrise.start, end: sunrise.end, repeated, skipped });
}
