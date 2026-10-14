import { searchLongitudeCrossingsWith } from "../../src/crossings.js";
import { bodyLongitude, onChartClock, NODE_SPEED_STEP_DAYS } from "../../src/ephemeris.js";
import { normalizeLongitude } from "../../src/signs.js";
import type { AngleRulerAnalysis } from "./angle-rulers.js";
import type { AngularityAnalysis } from "./angularity.js";
import { analyzeFactors } from "./factors.js";
import type { FactorList } from "./factors.js";
import { castEventChart } from "./chart.js";
import type { EventChart } from "./chart.js";
import { normalizeRequest } from "./inputs.js";
import type { MundaneRequest, NormalizedRequest } from "./inputs.js";

const DAY = 86_400_000;
const STEP_DAYS = 0.25;
const DEFAULT_MAX_SAMPLES = 10_000;

/** Directed Moon-minus-Sun ecliptic longitude, not angular separation. */
export const LUNATION_PHASES = Object.freeze([
  Object.freeze({ phase: "new", targetElongation: 0 }),
  Object.freeze({ phase: "full", targetElongation: 180 })
] as const);

export interface LunationSearchOptions {
  /** Elongation evaluations shared by both scans; each uses two body longitudes. */
  readonly maxSamples?: number;
}

export interface Lunation {
  readonly kind: "lunation";
  readonly phase: typeof LUNATION_PHASES[number]["phase"];
  readonly targetElongation: typeof LUNATION_PHASES[number]["targetElongation"];
  readonly at: string;
  /** Direction of Moon-minus-Sun longitude, not the Moon's own motion. */
  readonly retrograde: boolean;
  readonly chart: EventChart;
  readonly angularity: AngularityAnalysis;
  readonly angleRulers: AngleRulerAnalysis;
  readonly factors: FactorList;
}

interface SearchMetadata {
  readonly request: NormalizedRequest;
  readonly search: {
    readonly method: "engine-searchLongitudeCrossingsWith;Moon-minus-Sun";
    readonly window: "(from,to]";
    readonly stepDays: number;
    readonly maxSamples: number;
    readonly budgetUnit: "elongation-evaluations;chart-casting-excluded";
    readonly bodyLongitudesPerSample: 2;
    readonly completeness: "engine-sampled-search;not-proven";
  };
  readonly samples: number;
}

export type LunationSearchResult = SearchMetadata & (
  | { readonly status: "complete"; readonly lunations: readonly Lunation[] }
  | { readonly status: "refused"; readonly reason: "sample-budget"; readonly lunations: readonly [] }
);

function optionsBudget(options: LunationSearchOptions): number {
  const prototype: unknown = options !== null && typeof options === "object"
    ? Object.getPrototypeOf(options) : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RangeError("lunation options must be a plain object.");
  }
  for (const key of Reflect.ownKeys(options)) {
    const slot = Object.getOwnPropertyDescriptor(options, key);
    if (key !== "maxSamples" || !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError("lunation options accept only a plain maxSamples data property.");
    }
  }
  const budget = options.maxSamples === undefined ? DEFAULT_MAX_SAMPLES : options.maxSamples;
  if (!Number.isSafeInteger(budget) || budget < 1) {
    throw new RangeError("maxSamples must be a positive safe integer.");
  }
  return budget;
}

/**
 * Search geocentric New and Full Moons on the engine's UTC input clock.
 * The engine supplies both longitudes and the solver. Refusal discards all
 * partial results and casts no charts. No eclipse identity is inferred.
 */
export function searchLunations(
  input: MundaneRequest, options: LunationSearchOptions = {}
): LunationSearchResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new RangeError("lunation request must be an object.");
  }
  for (const key of Reflect.ownKeys(input)) {
    if (key !== "place" && key !== "houseSystem" && key !== "year" && key !== "from" && key !== "to") {
      throw new RangeError("lunation request accepts only place, houseSystem, year, from and to.");
    }
  }
  const request = normalizeRequest(input);
  const maxSamples = optionsBudget(options);
  const from = new Date(request.range.from);
  const to = new Date(request.range.to);
  // Match ingress searches: ensure returned charts can include node speeds.
  // Let the engine validate its TT coverage, even before a budget refusal.
  for (const end of [from.getTime(), to.getTime()]) {
    for (const offset of [-NODE_SPEED_STEP_DAYS, NODE_SPEED_STEP_DAYS]) {
      onChartClock(end + offset * DAY, "utc", undefined, () => undefined);
    }
  }
  const search: SearchMetadata["search"] = Object.freeze({
    method: "engine-searchLongitudeCrossingsWith;Moon-minus-Sun",
    window: "(from,to]",
    stepDays: STEP_DAYS,
    maxSamples,
    budgetUnit: "elongation-evaluations;chart-casting-excluded",
    bodyLongitudesPerSample: 2,
    completeness: "engine-sampled-search;not-proven"
  });
  let samples = 0;
  const refused = (): LunationSearchResult => Object.freeze({
    status: "refused", reason: "sample-budget", request, search, samples,
    lunations: Object.freeze([]) as readonly []
  });
  // Fixed integer-millisecond steps make this the exact coarse sample count.
  const coarsePerTarget = Math.ceil((to.getTime() - from.getTime()) / (STEP_DAYS * DAY)) + 1;
  if (coarsePerTarget * LUNATION_PHASES.length > maxSamples) return refused();

  const elongationAt = (_body: "Moon-minus-Sun", date: Date): number =>
    normalizeLongitude(bodyLongitude("Moon", date) - bodyLongitude("Sun", date));
  const events: Array<typeof LUNATION_PHASES[number] & { at: string; retrograde: boolean }> = [];
  for (const target of LUNATION_PHASES) {
    const remaining = maxSamples - samples;
    if (remaining === 0) return refused();
    const result = searchLongitudeCrossingsWith(elongationAt, "Moon-minus-Sun",
      target.targetElongation, from, to, { stepDays: STEP_DAYS, maxSamples: remaining });
    samples += result.samples;
    if (result.status === "refused") return refused();
    for (const crossing of result.crossings) {
      // Date truncation can move a refined root onto the excluded opening edge.
      if (crossing.at.getTime() <= from.getTime() || crossing.at.getTime() > to.getTime()) continue;
      events.push({ ...target, at: crossing.at.toISOString(), retrograde: crossing.retrograde });
    }
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.targetElongation - b.targetElongation);
  const lunations = events.map(event => {
    const chart = castEventChart({
      at: event.at, place: request.place, houseSystem: request.houseSystem
    });
    return Object.freeze({
      kind: "lunation" as const, ...event, chart,
      ...analyzeFactors(chart)
    });
  });
  return Object.freeze({ status: "complete", request, search, samples, lunations: Object.freeze(lunations) });
}
