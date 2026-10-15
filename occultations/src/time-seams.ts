import { DELTA_T_TABLE } from "../../src/deltat.js";
import { UT1_TO_MS } from "../../src/time-scale-data.js";
import { elapsedDays, LEAP_SECOND_LIST, LEAP_SECONDS_FROM, timeBasis } from "../../src/time-scale.js";

export interface TimeSeam {
  readonly at: string;
  readonly kind: "delta-t-model" | "iers-start" | "leap-second" | "iers-end";
}

const DAY_MS = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const UNIX_EPOCH_MJD = 40_587;

interface Candidate {
  readonly ms: number;
  readonly kind: TimeSeam["kind"];
}

// Derive the boundary candidates from the same data used by timeBasis. The
// model's year is Julian, not a Gregorian January 1. The IERS table includes
// its last millisecond: fallback begins one millisecond after UT1_TO_MS.
const candidates: readonly Candidate[] = ([
  { ms: J2000_MS + (DELTA_T_TABLE.from - 2000) * 365.25 * DAY_MS, kind: "delta-t-model" },
  { ms: LEAP_SECONDS_FROM, kind: "iers-start" },
  ...LEAP_SECOND_LIST.changes.slice(1).map(([mjd]): Candidate => ({
    ms: (mjd - UNIX_EPOCH_MJD) * DAY_MS,
    kind: "leap-second"
  })),
  { ms: UT1_TO_MS + 1, kind: "iers-end" }
] satisfies Candidate[]).sort((a, b) => a.ms - b.ms);

function validMillisecond(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(new Date(value).getTime());
}

/** UTC-input clock discontinuities in (fromMs, toMs], verified by the engine. */
export function timeSeamsIn(fromMs: number, toMs: number): readonly TimeSeam[] {
  if (!validMillisecond(fromMs) || !validMillisecond(toMs) || fromMs > toMs) {
    throw new RangeError("time seam window must contain ordered, valid integer epoch milliseconds.");
  }
  const seams: TimeSeam[] = [];
  for (const candidate of candidates) {
    if (candidate.ms <= fromMs || candidate.ms > toMs) continue;
    // NaN is preserved only within one engine clock piece. Verify each
    // declared boundary at adjacent instants instead of inferring the number
    // of boundaries from the possibly distant search endpoints.
    const elapsed = elapsedDays(timeBasis(candidate.ms - 1), timeBasis(candidate.ms), Number.NaN);
    if (Number.isNaN(elapsed)) continue;
    seams.push(Object.freeze({ at: new Date(candidate.ms).toISOString(), kind: candidate.kind }));
  }
  return Object.freeze(seams);
}
