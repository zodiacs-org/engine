import type { CalcInstant, CalcReceipt, CalcRefusal, CalcRequest, CalcTime } from "@zodiacs/engine/calc";
import { sampleDistance } from "./sample.js";
import type { DistanceSample } from "./sample.js";
import { searchDistanceExtremaWith } from "./solver.js";
import type { DistancePoint, DistanceSolverRefusalReason } from "./solver.js";

const DAY_SECONDS = 86_400;

/** Fixed numerical policy, independent of the requested window and its edges. */
export const LUNAR_SEARCH_POLICY = Object.freeze({
  originJdTt: 2_451_545,
  stepSeconds: 43_200,
  paddingSteps: 2,
  toleranceSeconds: 1,
  defaultMaxEvaluations: 100_000
} as const);

export interface LunarSearchOptions {
  readonly from: CalcTime;
  readonly to: CalcTime;
  /** All sampleDistance calls, including endpoint resolution and refinement. */
  readonly maxEvaluations?: number;
}

export interface TtDistancePoint {
  readonly jdTt: number;
  readonly distanceKm: number;
}

export interface LunarApsis extends Omit<DistanceSample, "status"> {
  readonly body: "Moon";
  readonly kind: "perigee" | "apogee";
  /** Numerical witnesses, not an interval bounding the physical ephemeris error. */
  readonly refinement: {
    readonly bracket: readonly [TtDistancePoint, TtDistancePoint, TtDistancePoint];
    readonly lower: TtDistancePoint;
    readonly upper: TtDistancePoint;
  };
}

export interface LunarSearchWindow {
  readonly from: CalcInstant;
  readonly to: CalcInstant;
  readonly boundary: "(from,to]";
  readonly endpointReceipts: {
    readonly from: CalcReceipt<CalcRequest>;
    readonly to: CalcReceipt<CalcRequest>;
  };
}

export interface LunarSearchDiagnostics {
  readonly evaluations: number;
  readonly maxEvaluations: number;
  readonly policy: typeof LUNAR_SEARCH_POLICY;
  readonly grid: { readonly fromJdTt: number; readonly toJdTt: number; readonly samples: number } | null;
  /** Completed finite sampling is not proof that every physical turn was found. */
  readonly completeness: "sampled-not-proven";
}

export type LunarSearchRefusalReason = DistanceSolverRefusalReason
  | "engine-refusal" | "edge-coverage" | "overlapping-extrema";

export type LunarSearchResult =
  | {
      readonly status: "complete";
      readonly window: LunarSearchWindow;
      readonly events: readonly LunarApsis[];
      readonly diagnostics: LunarSearchDiagnostics;
    }
  | {
      readonly status: "refused";
      readonly reason: LunarSearchRefusalReason;
      readonly detail: string;
      readonly engineRefusal: CalcRefusal | null;
      readonly window: LunarSearchWindow | null;
      readonly events: readonly [];
      readonly diagnostics: LunarSearchDiagnostics;
    };

class SearchRefusal {
  constructor(
    readonly reason: LunarSearchRefusalReason,
    readonly detail: string,
    readonly engineRefusal: CalcRefusal | null = null
  ) {}
}

function readOptions(options: LunarSearchOptions): Required<LunarSearchOptions> {
  const prototype: unknown = options !== null && typeof options === "object"
    ? Object.getPrototypeOf(options) : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RangeError("Lunar search options must be a plain object.");
  }
  for (const key of Reflect.ownKeys(options)) {
    const slot = Object.getOwnPropertyDescriptor(options, key);
    if (typeof key !== "string" || !["from", "to", "maxEvaluations"].includes(key) ||
      !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError("Lunar search options must contain only the named data properties.");
    }
  }
  if (!Object.hasOwn(options, "from") || !Object.hasOwn(options, "to")) {
    throw new RangeError("Lunar search requires from and to.");
  }
  const maxEvaluations = Object.hasOwn(options, "maxEvaluations")
    ? options.maxEvaluations : LUNAR_SEARCH_POLICY.defaultMaxEvaluations;
  if (typeof maxEvaluations !== "number" || !Number.isSafeInteger(maxEvaluations) || maxEvaluations < 1) {
    throw new RangeError("maxEvaluations must be a positive safe integer.");
  }
  return { from: options.from, to: options.to, maxEvaluations };
}

const toJd = (seconds: number): number => LUNAR_SEARCH_POLICY.originJdTt + seconds / DAY_SECONDS;
const toSeconds = (jd: number): number => (jd - LUNAR_SEARCH_POLICY.originJdTt) * DAY_SECONDS;

/**
 * Search geocentric geometric lunar distance on TT, returning events in (from,to].
 * Endpoint times use the engine's CalcTime validation and conversion. A pinned
 * endpoint deltaT resolves that endpoint only; internal TT samples and event
 * civil labels use the engine's normal time basis. No I/O or ephemeris reimplementation.
 *
 * The fixed grid and refinement make event identity independent of window edges.
 * Boundary ownership uses the reported instant.jdTt, without an epsilon. The
 * physical extremum may lie elsewhere inside the numerical interval or beyond
 * it due to ephemeris error. All refusals discard the entire event list.
 */
export function searchLunarApsides(options: LunarSearchOptions): LunarSearchResult {
  const { from, to, maxEvaluations } = readOptions(options);
  let evaluations = 0;
  let window: LunarSearchWindow | null = null;
  let grid: LunarSearchDiagnostics["grid"] = null;
  const diagnostics = (): LunarSearchDiagnostics => ({
    evaluations, maxEvaluations, policy: LUNAR_SEARCH_POLICY, grid, completeness: "sampled-not-proven"
  });
  const evaluate = (time: CalcTime, edge = false): DistanceSample => {
    if (evaluations >= maxEvaluations) {
      throw new SearchRefusal("evaluation-budget", "The lunar search exhausted its engine evaluation budget.");
    }
    evaluations += 1;
    const result = sampleDistance("Moon", time);
    if (result.status === "refused") {
      throw new SearchRefusal(edge ? "edge-coverage" : "engine-refusal",
        edge ? "The engine cannot sample the full padded lunar grid." : "The engine refused a required lunar sample.",
        result);
    }
    return result;
  };

  try {
    const start = evaluate(from);
    const end = evaluate(to);
    const fromJdTt = start.instant.jdTt;
    const toJdTt = end.instant.jdTt;
    if (fromJdTt > toJdTt) throw new RangeError("from must not be after to on TT.");
    window = {
      from: start.instant, to: end.instant, boundary: "(from,to]",
      endpointReceipts: { from: start.receipt, to: end.receipt }
    };
    if (fromJdTt === toJdTt) return { status: "complete", window, events: [], diagnostics: diagnostics() };

    const { stepSeconds, paddingSteps, toleranceSeconds } = LUNAR_SEARCH_POLICY;
    const first = Math.floor(toSeconds(fromJdTt) / stepSeconds) - paddingSteps;
    const last = Math.ceil(toSeconds(toJdTt) / stepSeconds) + paddingSteps;
    const size = last - first + 1;
    grid = { fromJdTt: toJd(first * stepSeconds), toJdTt: toJd(last * stepSeconds), samples: size };
    // Endpoint resolution uses its original scale. Never reuse such a sample as
    // a TT sample: finite-difference speeds and receipt labels can differ.
    if (size > maxEvaluations - evaluations) {
      throw new SearchRefusal("evaluation-budget", "The padded lunar grid exceeds the remaining evaluation budget.");
    }
    const cache = new Map<number, DistanceSample>();
    const at = (seconds: number): DistanceSample => {
      const jd = toJd(seconds);
      const found = cache.get(jd);
      if (found) return found;
      const sample = evaluate({ jd, scale: "tt" }, jd < fromJdTt || jd > toJdTt);
      cache.set(jd, sample);
      return sample;
    };
    // Check both padded edges before spending work scanning the interior.
    at(first * stepSeconds);
    at(last * stepSeconds);
    const times = Array.from({ length: size }, (_, index) => (first + index) * stepSeconds);
    const solved = searchDistanceExtremaWith((seconds) => at(seconds).distanceKm, {
      sampleTimesSeconds: times, toleranceSeconds,
      // The shared evaluator enforces the actual engine-call budget. The scalar
      // solver can call back twice for seconds that round to the same TT JD.
      maxEvaluations: Number.MAX_SAFE_INTEGER
    });
    if (solved.status === "refused") {
      throw new SearchRefusal(solved.reason,
        `Lunar distance refinement refused on TT seconds ${solved.interval.fromSeconds} to ${solved.interval.toSeconds} from J2000.`);
    }

    const point = (value: DistancePoint): TtDistancePoint => ({
      jdTt: at(value.timeSeconds).instant.jdTt, distanceKm: value.distanceKm
    });
    const candidates: LunarApsis[] = [];
    const identities = new Set<string>();
    for (const extremum of solved.extrema) {
      const { status: _status, ...sample } = at(extremum.sample.timeSeconds);
      const kind = extremum.kind === "minimum" ? "perigee" : "apogee";
      const bracket = extremum.bracket.map(point) as [TtDistancePoint, TtDistancePoint, TtDistancePoint];
      const lower = point(extremum.lower);
      const upper = point(extremum.upper);
      if (!(lower.jdTt < sample.instant.jdTt && sample.instant.jdTt < upper.jdTt) ||
        (upper.jdTt - lower.jdTt) * DAY_SECONDS > toleranceSeconds) {
        throw new SearchRefusal("time-resolution", "The engine TT coordinates cannot represent the required refinement interval.");
      }
      const identity = `${kind}:${bracket.map(({ jdTt }) => jdTt).join(":")}`;
      if (identities.has(identity)) continue;
      identities.add(identity);
      const previous = candidates[candidates.length - 1];
      if (previous && previous.refinement.upper.jdTt >= lower.jdTt) {
        // Do not merge close but distinct extrema using a distance/time epsilon.
        throw new SearchRefusal("overlapping-extrema", "Distinct lunar detections have overlapping refinement intervals.");
      }
      candidates.push({ ...sample, body: "Moon", kind, refinement: { bracket, lower, upper } });
    }
    const events = candidates.filter(({ instant }) => instant.jdTt > fromJdTt && instant.jdTt <= toJdTt);
    return { status: "complete", window, events, diagnostics: diagnostics() };
  } catch (error) {
    if (!(error instanceof SearchRefusal)) throw error;
    return {
      status: "refused", reason: error.reason, detail: error.detail,
      engineRefusal: error.engineRefusal, window, events: [], diagnostics: diagnostics()
    };
  }
}
