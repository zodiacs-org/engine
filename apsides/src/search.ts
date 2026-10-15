import type { CalcInstant, CalcReceipt, CalcRefusal, CalcRequest, CalcTime } from "@zodiacs/engine/calc";
import { sampleDistance } from "./sample.js";
import type { DistanceSample } from "./sample.js";
import { searchDistanceExtremaWith } from "./solver.js";
import type { DistancePoint, DistanceSolverRefusalReason } from "./solver.js";
import type { ApsisBody } from "./targets.js";
import { searchAnalyticRateExtremaWith } from "./rate-solver.js";

const DAY_SECONDS = 86_400;

/** A canonical TT grid and an explicit finite work budget. */
export interface SearchPolicy {
  readonly originJdTt: number;
  readonly stepSeconds: number;
  readonly paddingSteps: number;
  readonly toleranceSeconds: number;
  readonly defaultMaxEvaluations: number;
  readonly method?: "golden-section-distance" | "bisected-analytic-rate";
}

export interface ApsisSearchOptions {
  readonly from: CalcTime;
  readonly to: CalcTime;
  /** All engine calls, including endpoint resolution, refinement and annotations. */
  readonly maxEvaluations?: number;
}

export interface TtDistancePoint {
  readonly jdTt: number;
  readonly distanceKm: number;
}

/** A sampled state using the event's body, center and reference point. */
export interface ApsisMotionSample extends Omit<DistanceSample, "status" | "target"> {
  /** Signed TT seconds from the event, computed from the returned Julian dates. */
  readonly offsetSeconds: number;
}

export interface ApsisMotion {
  /** Wider distance witnesses, not the narrow refinement bounds or fixed offsets. */
  readonly sampling: "canonical-distance-bracket";
  readonly before: ApsisMotionSample;
  /** The event sample itself; its reported radial rate is not forced to zero. */
  readonly at: ApsisMotionSample;
  readonly after: ApsisMotionSample;
}

export interface Apsis<B extends ApsisBody, K extends string> extends Omit<DistanceSample, "status"> {
  readonly body: B;
  readonly kind: K;
  /** Reported engine motion through the extremum, with a receipt per sample. */
  readonly motion: ApsisMotion;
  /** Numerical witnesses, not an interval bounding the physical ephemeris error. */
  readonly refinement: {
    readonly method: "golden-section-distance" | "bisected-analytic-rate";
    readonly bracket: readonly [TtDistancePoint, TtDistancePoint, TtDistancePoint];
    readonly lower: TtDistancePoint;
    readonly upper: TtDistancePoint;
    /** Only the analytic-rate method uses the narrow interval as a rate bracket. */
    readonly rateBracket?: {
      readonly lowerKmPerSecond: number;
      readonly upperKmPerSecond: number;
    };
  };
}

export interface ApsisSearchWindow {
  readonly from: CalcInstant;
  readonly to: CalcInstant;
  readonly boundary: "(from,to]";
  readonly endpointReceipts: {
    readonly from: CalcReceipt<CalcRequest>;
    readonly to: CalcReceipt<CalcRequest>;
  };
}

export interface ApsisSearchDiagnostics<P extends SearchPolicy = SearchPolicy> {
  readonly evaluations: number;
  readonly maxEvaluations: number;
  readonly policy: P;
  readonly grid: { readonly fromJdTt: number; readonly toJdTt: number; readonly samples: number } | null;
  /** Completed finite sampling is not proof that every physical turn was found. */
  readonly completeness: "sampled-not-proven";
}

export type ApsisSearchRefusalReason = DistanceSolverRefusalReason
  | "engine-refusal" | "edge-coverage" | "overlapping-extrema";

export type ApsisSearchResult<B extends ApsisBody, K extends string, P extends SearchPolicy = SearchPolicy> =
  | {
      readonly status: "complete";
      readonly window: ApsisSearchWindow;
      readonly events: readonly Apsis<B, K>[];
      readonly diagnostics: ApsisSearchDiagnostics<P>;
    }
  | {
      readonly status: "refused";
      readonly reason: ApsisSearchRefusalReason;
      readonly detail: string;
      readonly engineRefusal: CalcRefusal | null;
      readonly window: ApsisSearchWindow | null;
      readonly events: readonly [];
      readonly diagnostics: ApsisSearchDiagnostics<P>;
    };

class SearchRefusal {
  constructor(
    readonly reason: ApsisSearchRefusalReason,
    readonly detail: string,
    readonly engineRefusal: CalcRefusal | null = null
  ) {}
}

/** Internal option reader; wrappers may declare additional ordinary data fields. */
export function readSearchOptions(
  options: ApsisSearchOptions, policy: SearchPolicy, additionalKeys: readonly string[] = []
): Required<ApsisSearchOptions> {
  const prototype: unknown = options !== null && typeof options === "object"
    ? Object.getPrototypeOf(options) : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RangeError("Apsis search options must be a plain object.");
  }
  for (const key of Reflect.ownKeys(options)) {
    const slot = Object.getOwnPropertyDescriptor(options, key);
    if (typeof key !== "string" || !["from", "to", "maxEvaluations", ...additionalKeys].includes(key) ||
      !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError("Apsis search options must contain only the named data properties.");
    }
  }
  if (!Object.hasOwn(options, "from") || !Object.hasOwn(options, "to")) {
    throw new RangeError("Apsis search requires from and to.");
  }
  const maxEvaluations = Object.hasOwn(options, "maxEvaluations")
    ? options.maxEvaluations : policy.defaultMaxEvaluations;
  if (typeof maxEvaluations !== "number" || !Number.isSafeInteger(maxEvaluations) || maxEvaluations < 1) {
    throw new RangeError("maxEvaluations must be a positive safe integer.");
  }
  return { from: options.from, to: options.to, maxEvaluations };
}

/** Shared window mechanics; body wrappers supply fixed numerical policies. */
export function searchApsides<B extends ApsisBody, K extends string, P extends SearchPolicy>(
  body: B,
  kinds: readonly [K, K],
  policy: P,
  options: ApsisSearchOptions
): ApsisSearchResult<B, K, P> {
  const { from, to, maxEvaluations } = readSearchOptions(options, policy);
  const toJd = (seconds: number): number => policy.originJdTt + seconds / DAY_SECONDS;
  const toSeconds = (jd: number): number => (jd - policy.originJdTt) * DAY_SECONDS;
  let evaluations = 0;
  let window: ApsisSearchWindow | null = null;
  let grid: ApsisSearchDiagnostics<P>["grid"] = null;
  const diagnostics = (): ApsisSearchDiagnostics<P> => ({
    evaluations, maxEvaluations, policy, grid, completeness: "sampled-not-proven"
  });
  const evaluate = (time: CalcTime, edge = false): DistanceSample => {
    if (evaluations >= maxEvaluations) {
      throw new SearchRefusal("evaluation-budget", "The apsis search exhausted its engine evaluation budget.");
    }
    evaluations += 1;
    const result = sampleDistance(body, time);
    if (result.status === "refused") {
      throw new SearchRefusal(edge ? "edge-coverage" : "engine-refusal",
        edge ? "The engine cannot sample the full padded apsis grid." : "The engine refused a required apsis sample.",
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

    const { stepSeconds, paddingSteps, toleranceSeconds } = policy;
    const first = Math.floor(toSeconds(fromJdTt) / stepSeconds) - paddingSteps;
    const last = Math.ceil(toSeconds(toJdTt) / stepSeconds) + paddingSteps;
    const size = last - first + 1;
    grid = { fromJdTt: toJd(first * stepSeconds), toJdTt: toJd(last * stepSeconds), samples: size };
    // Endpoint resolution uses its original scale. Never reuse such a sample as
    // a TT sample: finite-difference speeds and receipt labels can differ.
    if (size > maxEvaluations - evaluations) {
      throw new SearchRefusal("evaluation-budget", "The padded apsis grid exceeds the remaining evaluation budget.");
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
    const method = policy.method ?? "golden-section-distance";
    const solved = method === "bisected-analytic-rate"
      ? searchAnalyticRateExtremaWith(at, times, toleranceSeconds)
      : searchDistanceExtremaWith((seconds) => at(seconds).distanceKm, {
      sampleTimesSeconds: times, toleranceSeconds,
      // The shared evaluator enforces the actual engine-call budget. The scalar
      // solver can call back twice for seconds that round to the same TT JD.
      maxEvaluations: Number.MAX_SAFE_INTEGER
    });
    if (solved.status === "refused") {
      throw new SearchRefusal(solved.reason,
        `Apsis distance refinement refused on TT seconds ${solved.interval.fromSeconds} to ${solved.interval.toSeconds} from J2000.`);
    }

    const point = (value: DistancePoint): TtDistancePoint => ({
      jdTt: at(value.timeSeconds).instant.jdTt, distanceKm: value.distanceKm
    });
    const candidates: Apsis<B, K>[] = [];
    const identities = new Set<string>();
    for (const extremum of solved.extrema) {
      const { status: _status, ...sample } = at(extremum.sample.timeSeconds);
      const kind = extremum.kind === "minimum" ? kinds[0] : kinds[1];
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
        throw new SearchRefusal("overlapping-extrema", "Distinct apsis detections have overlapping refinement intervals.");
      }
      const rateBracket = method === "bisected-analytic-rate" ? {
        lowerKmPerSecond: at(extremum.lower.timeSeconds).radialSpeedKmPerSecond,
        upperKmPerSecond: at(extremum.upper.timeSeconds).radialSpeedKmPerSecond
      } : undefined;
      const motionSample = (seconds: number): ApsisMotionSample => {
        const { status: _status, target: _target, ...measured } = at(seconds);
        return { ...measured, offsetSeconds: (measured.instant.jdTt - sample.instant.jdTt) * DAY_SECONDS };
      };
      // These wider witnesses were already evaluated by the solver. Reuse them
      // unchanged: no new evaluations, symmetric-offset assumption, or imposed
      // rate signs. In particular, Pluto's state rate need not vanish at a
      // scalar-distance extremum. The at sample is not a reference to the event.
      const motion: ApsisMotion = {
        sampling: "canonical-distance-bracket",
        before: motionSample(extremum.bracket[0].timeSeconds),
        at: motionSample(extremum.sample.timeSeconds),
        after: motionSample(extremum.bracket[2].timeSeconds)
      };
      candidates.push({ ...sample, body, kind, motion, refinement: {
        method, bracket, lower, upper, ...(rateBracket === undefined ? {} : { rateBracket })
      } });
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
