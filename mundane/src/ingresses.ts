import { onChartClock, NODE_SPEED_STEP_DAYS } from "../../src/ephemeris.js";
import { searchLongitudeCrossings } from "../../src/returns.js";
import type { AngleRulerAnalysis } from "./angle-rulers.js";
import type { AngularityAnalysis } from "./angularity.js";
import { analyzeFactors } from "./factors.js";
import type { FactorList } from "./factors.js";
import { castEventChart } from "./chart.js";
import type { EventChart } from "./chart.js";
import { normalizeRequest } from "./inputs.js";
import type { MundaneRequest, NormalizedRequest } from "./inputs.js";

const DAY = 86_400_000;
const STEP_DAYS = 5;
const DEFAULT_MAX_SAMPLES = 10_000;

export const CARDINAL_INGRESSES = Object.freeze([
  Object.freeze({ sign: "Aries", targetLongitude: 0 }),
  Object.freeze({ sign: "Cancer", targetLongitude: 90 }),
  Object.freeze({ sign: "Libra", targetLongitude: 180 }),
  Object.freeze({ sign: "Capricorn", targetLongitude: 270 })
] as const);

export interface IngressSearchOptions {
  /** Total Sun longitude evaluations across all cardinal searches. */
  readonly maxSamples?: number;
}

export interface SolarIngress {
  readonly kind: "solar-ingress";
  readonly sign: typeof CARDINAL_INGRESSES[number]["sign"];
  readonly targetLongitude: typeof CARDINAL_INGRESSES[number]["targetLongitude"];
  readonly at: string;
  readonly retrograde: boolean;
  readonly chart: EventChart;
  readonly angularity: AngularityAnalysis;
  readonly angleRulers: AngleRulerAnalysis;
  readonly factors: FactorList;
}

interface SearchMetadata {
  readonly request: NormalizedRequest;
  readonly search: {
    readonly method: "engine-searchLongitudeCrossings;Sun";
    readonly window: "(from,to]";
    readonly stepDays: number;
    readonly maxSamples: number;
    readonly budgetUnit: "sun-longitude-evaluations;chart-casting-excluded";
    readonly completeness: "engine-sampled-search;not-proven";
  };
  readonly samples: number;
}

export type IngressSearchResult = SearchMetadata & (
  | { readonly status: "complete"; readonly ingresses: readonly SolarIngress[] }
  | { readonly status: "refused"; readonly reason: "sample-budget"; readonly ingresses: readonly [] }
);

function optionsBudget(options: IngressSearchOptions): number {
  const prototype: unknown = options !== null && typeof options === "object"
    ? Object.getPrototypeOf(options) : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RangeError("ingress options must be a plain object.");
  }
  for (const key of Reflect.ownKeys(options)) {
    const slot = Object.getOwnPropertyDescriptor(options, key);
    if (key !== "maxSamples" || !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError("ingress options accept only a plain maxSamples data property.");
    }
  }
  const budget = options.maxSamples === undefined ? DEFAULT_MAX_SAMPLES : options.maxSamples;
  if (!Number.isSafeInteger(budget) || budget < 1) {
    throw new RangeError("maxSamples must be a positive safe integer.");
  }
  return budget;
}

/**
 * Search tropical geocentric Sun longitudes on the engine's UTC input clock.
 * Refusal discards every partial result and casts no charts. The fixed step
 * preserves the engine's sampling assumptions; callers control only budget.
 */
export function searchIngresses(
  input: MundaneRequest, options: IngressSearchOptions = {}
): IngressSearchResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new RangeError("ingress request must be an object.");
  }
  for (const key of Reflect.ownKeys(input)) {
    if (key !== "place" && key !== "houseSystem" && key !== "year" && key !== "from" && key !== "to") {
      throw new RangeError("ingress request accepts only place, houseSystem, year, from and to.");
    }
  }
  const request = normalizeRequest(input);
  const maxSamples = optionsBudget(options);
  const from = new Date(request.range.from);
  const to = new Date(request.range.to);
  // Check both ends even if the budget would refuse. Include the largest
  // chart speed stencil (the nodes); use the engine's TT span check directly
  // without evaluating positions or replicating its clock/span arithmetic.
  for (const end of [from.getTime(), to.getTime()]) {
    for (const offset of [-NODE_SPEED_STEP_DAYS, NODE_SPEED_STEP_DAYS]) {
      onChartClock(end + offset * DAY, "utc", undefined, () => undefined);
    }
  }
  const search: SearchMetadata["search"] = Object.freeze({
    method: "engine-searchLongitudeCrossings;Sun",
    window: "(from,to]",
    stepDays: STEP_DAYS,
    maxSamples,
    budgetUnit: "sun-longitude-evaluations;chart-casting-excluded",
    completeness: "engine-sampled-search;not-proven"
  });
  let samples = 0;
  const refused = (): IngressSearchResult => Object.freeze({
    status: "refused", reason: "sample-budget", request, search, samples,
    ingresses: Object.freeze([]) as readonly []
  });
  // With an integer-millisecond fixed step, this is exactly the solver's
  // endpoint-inclusive coarse count. Reject all four scans before evaluation
  // when even their combined coarse work cannot fit.
  const coarsePerTarget = Math.ceil((to.getTime() - from.getTime()) / (STEP_DAYS * DAY)) + 1;
  if (coarsePerTarget * CARDINAL_INGRESSES.length > maxSamples) return refused();

  const events: Array<typeof CARDINAL_INGRESSES[number] & { at: string; retrograde: boolean }> = [];
  for (const target of CARDINAL_INGRESSES) {
    const remaining = maxSamples - samples;
    if (remaining === 0) return refused();
    const result = searchLongitudeCrossings("Sun", target.targetLongitude, from, to, {
      stepDays: STEP_DAYS, maxSamples: remaining
    });
    samples += result.samples;
    if (result.status === "refused") return refused();
    for (const crossing of result.crossings) {
      // Date truncates fractional milliseconds. Preserve the public window
      // even when a refined root rounds back onto its excluded opening edge.
      if (crossing.at.getTime() <= from.getTime() || crossing.at.getTime() > to.getTime()) continue;
      events.push({ ...target, at: crossing.at.toISOString(), retrograde: crossing.retrograde });
    }
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.targetLongitude - b.targetLongitude);
  const ingresses = events.map(event => {
    const chart = castEventChart({
      at: event.at, place: request.place, houseSystem: request.houseSystem
    });
    return Object.freeze({
      kind: "solar-ingress" as const, ...event, chart,
      ...analyzeFactors(chart)
    });
  });
  return Object.freeze({ status: "complete", request, search, samples, ingresses: Object.freeze(ingresses) });
}
