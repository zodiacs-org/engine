import { CALC_SPAN } from "../../src/calc.js";
import { searchLongitudeCrossingsWith } from "../../src/crossings.js";
import { timeBasis } from "../../src/time-scale.js";
import type { TimeBasis } from "../../src/time-scale.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { chordDifference, separationDegrees } from "./appulse-geometry.js";
import { positionAt } from "./engine.js";
import type { PositionReceipt } from "./engine.js";
import { fields, normalizeWindow } from "./input.js";
import type { NormalizedWindow, TimeWindow } from "./input.js";
import { timeSeamsIn } from "./time-seams.js";

export const APPULSE_BODIES = Object.freeze([
  "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"
] as const);
export type AppulseBody = (typeof APPULSE_BODIES)[number];

export interface AppulseRequest {
  readonly first: AppulseBody;
  readonly second: AppulseBody;
  readonly window: TimeWindow;
  /** Inclusive limit on the reported separation, degrees. No implicit proximity cut. */
  readonly maximumSeparationDegrees: number;
  readonly stepDays?: number;
  /** Paired positions, including derivative samples outside the event window. */
  readonly maxSamples?: number;
}

export const APPULSE_LIMITS = Object.freeze({
  defaultStepDays: 0.25, maximumStepDays: 0.25, defaultMaxSamples: 10_000, maximumMaxSamples: 100_000,
  derivativeHalfWidthMilliseconds: 60_000
});

export interface AppulseSearchReceipt {
  readonly schema: "zodiacs.occultations.appulse-search-receipt.v1";
  readonly implementation: "geocentric-appulses/1";
  readonly request: {
    readonly first: AppulseBody;
    readonly second: AppulseBody;
    readonly window: NormalizedWindow;
    readonly maximumSeparationDegrees: number;
    readonly stepDays: number;
    readonly maxSamples: number;
  };
  readonly engine: PositionReceipt["engine"];
  readonly frame: "equatorial-true-of-date";
  /** Clocks at the expanded evaluation-window endpoints, null outside calc's range. */
  readonly boundaryTimeBasis: { readonly from: TimeBasis | null; readonly to: TimeBasis | null };
  readonly seams: ReturnType<typeof timeSeamsIn>;
  readonly search: {
    readonly solver: "@zodiacs/engine/crossings:searchLongitudeCrossingsWith";
    readonly windowOwnership: "(from,to]";
    readonly stepMilliseconds: number;
    readonly stencilHalfWidthMilliseconds: number;
    readonly evaluationWindow: { readonly from: string | null; readonly to: string | null };
    readonly rateUnit: "squared-unit-chord-per-day";
    readonly rateTransform: "atan(10000*rate)*90/pi";
    readonly samples: number;
    readonly sampleUnit: "paired-position-evaluation;includes-stencil-output-and-verification";
    readonly maxSamples: number;
    readonly completeness: "sampled;not-proven";
  };
  readonly conventions: readonly string[];
  readonly limitations: readonly string[];
}

export interface AppulseEvent {
  readonly kind: "appulse";
  /** Numerical centered-difference minimum on the engine UTC input clock. */
  readonly at: string;
  readonly first: AppulseBody;
  readonly second: AppulseBody;
  readonly separationDegrees: number;
  readonly receipt: {
    readonly schema: "zodiacs.occultations.appulse-event-receipt.v1";
    readonly search: AppulseSearchReceipt;
    readonly timeBasis: TimeBasis;
    readonly first: PositionReceipt;
    readonly second: PositionReceipt;
    readonly validation: "coarse-published-occurrence-only;no-general-timing-bound";
  };
}

export type AppulseRefusalReason = "sample-budget" | "time-discontinuity" | "out-of-range" |
  "position-refused" | "invalid-direction" | "unresolved-minimum";
export type AppulseResult = {
  readonly status: "complete";
  readonly events: readonly AppulseEvent[];
  readonly receipt: AppulseSearchReceipt;
} | {
  readonly status: "refused";
  readonly reason: AppulseRefusalReason;
  readonly events: readonly [];
  readonly receipt: AppulseSearchReceipt;
  readonly failure: {
    readonly at: string | null;
    readonly position: PositionReceipt | null;
    readonly positionReason: string | null;
  };
};

const DAY = 86_400_000;
const J2000 = Date.UTC(2000, 0, 1, 12);
const LOWER = Date.parse(CALC_SPAN.from), UPPER = Date.parse(CALC_SPAN.to);
const H = APPULSE_LIMITS.derivativeHalfWidthMilliseconds;
const FRAME = "equatorial-true-of-date";
const isBody = (value: unknown): value is AppulseBody =>
  typeof value === "string" && (APPULSE_BODIES as readonly string[]).includes(value);
const label = (ms: number): string | null => Number.isFinite(new Date(ms).getTime()) ? new Date(ms).toISOString() : null;

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function basisInside(ms: number): TimeBasis | null {
  if (ms < LOWER - DAY || ms > UPPER + DAY) return null;
  const basis = timeBasis(ms);
  return [basis.ut1Days, basis.ttDays].every((days) =>
    days >= (LOWER - J2000) / DAY && days < (UPPER - J2000) / DAY) ? basis : null;
}

class SearchStopped {
  constructor(readonly reason: AppulseRefusalReason, readonly at: string | null = null,
    readonly position: PositionReceipt | null = null, readonly positionReason: string | null = null) {}
}

/** Sampled geocentric closest approaches. No observer, disk contact or date ranking. */
export function searchAppulses(request: AppulseRequest): AppulseResult {
  const input = fields(request, "appulse request",
    ["first", "second", "window", "maximumSeparationDegrees", "stepDays", "maxSamples"]);
  if (!isBody(input.first) || !isBody(input.second) || input.first === input.second) {
    throw new RangeError("An appulse requires distinct targets from APPULSE_BODIES.");
  }
  const first = input.first, second = input.second;
  const window = normalizeWindow(input.window as TimeWindow);
  const maximumSeparationDegrees = input.maximumSeparationDegrees;
  if (typeof maximumSeparationDegrees !== "number" || !Number.isFinite(maximumSeparationDegrees) ||
    maximumSeparationDegrees < 0 || maximumSeparationDegrees > 180) {
    throw new RangeError("maximumSeparationDegrees must be a finite number from 0 to 180.");
  }
  const stepDays = input.stepDays === undefined ? APPULSE_LIMITS.defaultStepDays : input.stepDays;
  if (typeof stepDays !== "number" || !Number.isFinite(stepDays) || stepDays * DAY < 1 ||
    stepDays > APPULSE_LIMITS.maximumStepDays) {
    throw new RangeError("stepDays must represent at least a millisecond and at most a quarter day.");
  }
  const maxSamples = input.maxSamples === undefined ? APPULSE_LIMITS.defaultMaxSamples : input.maxSamples;
  if (typeof maxSamples !== "number" || !Number.isSafeInteger(maxSamples) || maxSamples < 1 ||
    maxSamples > APPULSE_LIMITS.maximumMaxSamples) {
    throw new RangeError("maxSamples must be a positive integer at most 100000.");
  }
  const from = Date.parse(window.from), to = Date.parse(window.to), step = Math.floor(stepDays * DAY);
  // The extra millisecond confirms raw derivative signs at a returned endpoint.
  const evaluationFrom = from - H - 1, evaluationTo = to + H + 1;
  const evaluationWindow = { from: label(evaluationFrom), to: label(evaluationTo) };
  const boundaryTimeBasis = { from: basisInside(evaluationFrom), to: basisInside(evaluationTo) };
  const seams = boundaryTimeBasis.from && boundaryTimeBasis.to ? timeSeamsIn(evaluationFrom, evaluationTo) : [];
  let samples = 0;
  const receipt = (): AppulseSearchReceipt => freeze({
    schema: "zodiacs.occultations.appulse-search-receipt.v1", implementation: "geocentric-appulses/1",
    request: { first, second, window, maximumSeparationDegrees, stepDays, maxSamples },
    engine: { name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: { ...EPHEMERIS } },
    frame: FRAME, boundaryTimeBasis, seams,
    search: { solver: "@zodiacs/engine/crossings:searchLongitudeCrossingsWith", windowOwnership: "(from,to]",
      stepMilliseconds: step, stencilHalfWidthMilliseconds: H, evaluationWindow,
      rateUnit: "squared-unit-chord-per-day", rateTransform: "atan(10000*rate)*90/pi",
      samples, sampleUnit: "paired-position-evaluation;includes-stencil-output-and-verification",
      maxSamples, completeness: "sampled;not-proven" },
    conventions: ["center:geocentric", `frame:${FRAME}`, "time:engine-utc-basis", "angles:degrees",
      "separation:atan2-unit-cross-dot", "stationarity:centered-factored-haversine-chord-difference",
      "minimum:raw-rate-negative-to-positive;isolated-exact-zero-allowed",
      "at:first-integer-millisecond-on-or-beyond-numerical-rate-zero",
      "limit:reported-separation-less-than-or-equal-to-caller-maximum",
      "seams:refuse-expanded-evaluation-window", "corrections:engine-adapter;no-additional-corrections"],
    limitations: ["appulse-is-not-coordinate-conjunction-or-occultation",
      "finite-difference-stationary-time-is-an-approximation;stencil-bias-unbounded",
      "smooth-motion-and-at-most-one-rate-station-in-two-steps-assumed",
      "sampling-is-not-a-completeness-proof", "subsecond-separated-roots-may-be-collapsed",
      "constant-separation-has-no-isolated-event;detected-zero-plateaus-refused",
      "shallow-minimum-and-floating-point-timing-error-unbounded", "no-physical-timing-bound"]
  });
  const refused = (error: SearchStopped): AppulseResult => freeze({
    status: "refused", reason: error.reason, events: [] as const, receipt: receipt(),
    failure: { at: error.at, position: error.position, positionReason: error.positionReason }
  });
  if (!boundaryTimeBasis.from || !boundaryTimeBasis.to) return refused(new SearchStopped("out-of-range"));
  if (seams.length) return refused(new SearchStopped("time-discontinuity", seams[0]!.at));
  if (2 * (Math.ceil((to - from) / step) + 1) > maxSamples) return refused(new SearchStopped("sample-budget"));

  const sample = (ms: number) => {
    const at = new Date(ms).toISOString();
    if (samples >= maxSamples) throw new SearchStopped("sample-budget", at);
    samples += 1;
    const a = positionAt({ body: first, time: at, frame: FRAME });
    if (a.status !== "ok") throw new SearchStopped("position-refused", at, a.receipt, a.reason);
    const b = positionAt({ body: second, time: at, frame: FRAME });
    if (b.status !== "ok") throw new SearchStopped("position-refused", at, b.receipt, b.reason);
    if (![a.lon, a.lat, b.lon, b.lat].every(Number.isFinite) || Math.abs(a.lat) > 90 || Math.abs(b.lat) > 90) {
      throw new SearchStopped("invalid-direction", at);
    }
    return { a, b };
  };
  const rateAt = (ms: number) => chordDifference(sample(ms - H), sample(ms + H)) * DAY / (2 * H);
  try {
    const found = searchLongitudeCrossingsWith((_pair, at) => Math.atan(10_000 * rateAt(at.getTime())) * 90 / Math.PI,
      "pair", 0, new Date(from), new Date(to), { stepDays: step / DAY, maxSamples });
    if (found.status === "refused") return refused(new SearchStopped("sample-budget"));
    const records: Array<{ ms: number; position: ReturnType<typeof sample>; separation: number }> = [];
    for (const crossing of found.crossings) {
      // Recheck the untransformed rate: circular normalization in the inherited
      // solver can round a tiny offset to zero. Do not publish that as a minimum.
      const raw = crossing.at.getTime(), radius = Math.ceil(step / 2 ** 24) + 2;
      let previous: number | undefined;
      let resolved = false;
      let minimum: number | null = null;
      for (let ms = Math.max(from - 1, raw - radius); ms <= Math.min(to, raw + radius); ms += 1) {
        const current = rateAt(ms);
        if (previous !== undefined && previous !== 0 && (current === 0 || Math.sign(current) !== Math.sign(previous))) {
          if (current === 0) {
            const after = rateAt(ms + 1);
            if (after === 0) throw new SearchStopped("unresolved-minimum", label(ms));
            if (previous < 0 && after > 0) minimum = ms;
          } else if (previous < 0 && current > 0) minimum = ms;
          resolved = true; // maxima and stationary touches are deliberately absent
          break;
        }
        previous = current;
      }
      if (!resolved) throw new SearchStopped("unresolved-minimum", label(raw));
      if (minimum === null || minimum <= from || minimum > to || records.some((record) => record.ms === minimum)) continue;
      const position = sample(minimum), separation = separationDegrees(position);
      if (separation <= maximumSeparationDegrees) records.push({ ms: minimum, position, separation });
    }
    const searchReceipt = receipt();
    const events: AppulseEvent[] = records.sort((a, b) => a.ms - b.ms).map(({ ms, position, separation }) => ({
      kind: "appulse", at: new Date(ms).toISOString(), first, second, separationDegrees: separation,
      receipt: { schema: "zodiacs.occultations.appulse-event-receipt.v1", search: searchReceipt,
        timeBasis: timeBasis(ms), first: position.a.receipt, second: position.b.receipt,
        validation: "coarse-published-occurrence-only;no-general-timing-bound" }
    }));
    return freeze({ status: "complete", events, receipt: searchReceipt });
  } catch (error) {
    if (error instanceof SearchStopped) return refused(error);
    throw error;
  }
}
