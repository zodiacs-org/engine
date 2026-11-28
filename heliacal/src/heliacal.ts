import type { CalcRefusal } from "../../src/calc.js";
import { optionsOf } from "../../src/sky/riseset.js";
import { partitionHorizonOpportunities } from "./appearance-sequence.js";
import type { ObservationPeriod } from "./appearance-sequence.js";
import type { ReceiptedSkyEvent } from "./engine.js";
import { sunBodyGeometry } from "./geometry.js";
import type { SunBodyGeometry } from "./geometry.js";
import { dateRange, observer, visibilityBody } from "./inputs.js";
import type { DateInput, Observer, VisibilityBody } from "./inputs.js";
import { horizonArcusVisionis } from "./visibility.js";
import type { HorizonArcusVisionis } from "./visibility.js";
import { observingWindows } from "./windows.js";
import type { ObservingWindowsResult, WindowRefusalReason } from "./windows.js";

export const HELIACAL_APPEARANCES = Object.freeze([
  "first-morning", "last-evening", "first-evening", "last-morning"
] as const);
export type HeliacalAppearance = (typeof HELIACAL_APPEARANCES)[number];

export interface HorizonArcusModel {
  readonly model: "horizon-arcus-visionis/1";
  /** Explicit degrees for each requested appearance. No calibrated defaults. */
  readonly thresholds: Readonly<Partial<Record<HeliacalAppearance, number>>>;
}

export const HELIACAL_SEARCH_LIMITS = Object.freeze({ defaultMaxGeometrySamples: 800 } as const);

export interface HeliacalSearchOptions {
  /** Shared sky budget, with the same default and meaning as observingWindows. */
  readonly maxSamples?: number;
  /** Number of Sun/body geometry calls, separate from the sky search budget. */
  readonly maxGeometrySamples?: number;
}

interface OpportunityBase {
  readonly period: ObservationPeriod;
  /** Full solar meridian half, even when it intersects a clipped request edge. */
  readonly from: string;
  readonly to: string;
  readonly solarHalf: Readonly<{ start: ReceiptedSkyEvent; end: ReceiptedSkyEvent }>;
}

export interface EvaluatedHeliacalOpportunity extends OpportunityBase {
  readonly status: "evaluated";
  readonly crossing: ReceiptedSkyEvent;
  /** Actual calc geometry at the sky event, not forced to zero body altitude. */
  readonly geometry: SunBodyGeometry;
  readonly criteria: Readonly<Partial<Record<HeliacalAppearance, Readonly<HorizonArcusVisionis>>>>;
}

export interface UnavailableHeliacalOpportunity extends OpportunityBase {
  readonly status: "unavailable";
  readonly crossing: ReceiptedSkyEvent | null;
  readonly reason: "missing-crossing" | "multiple-crossings" | "crossing-outside-range";
}

export type HeliacalOpportunity = EvaluatedHeliacalOpportunity | UnavailableHeliacalOpportunity;

const CONVENTIONS = Object.freeze({
  source: "Schoch1924:pp731-734;caller-selected-thresholds",
  scope: "horizon-criterion-transitions;not-observed-sightings",
  horizon: "engine-sky;airless-topocentric-centres;wgs84;no-dip",
  solarDepression: "calc-topocentric-airless-centre-at-sky-target-crossing;iers2003",
  reductionDifference: "sky-and-calc-observer-and-apparent-corrections-differ;actual-geometry-retained",
  morning: "target-rise-in-solar-lower-to-upper-transit-half",
  evening: "target-set-in-solar-upper-to-lower-transit-half",
  interval: "[from,to);both-bracket-crossings-required-inside-request",
  bracket: "consecutive-same-period-solar-halves;opportunity-bracket-not-continuous-root",
  eventTime: "passing-horizon-reference-epoch;first=after;last=before;not-sighting-time",
  gaps: "missing-multiple-or-out-of-range-crossing-breaks-adjacency",
  photometry: "not-applied;empirical-threshold-only;no-extinction-or-magnitude-defaults",
  moon: "geometric-arcus-extension;not-a-crescent-visibility-model",
  completeness: "all-eligible-engine-horizon-opportunities-processed;sampled-solver-limits;gaps-explicit",
  receiptScope: "engine-positions-only;not-horizon-search-or-visibility-criterion"
} as const);

export interface HeliacalEvent {
  readonly body: VisibilityBody;
  readonly appearance: HeliacalAppearance;
  readonly period: ObservationPeriod;
  readonly at: string;
  readonly model: Readonly<HorizonArcusModel>;
  readonly bracket: Readonly<{
    readonly kind: "successive-horizon-opportunities";
    readonly from: string;
    readonly to: string;
    readonly before: EvaluatedHeliacalOpportunity;
    readonly after: EvaluatedHeliacalOpportunity;
  }>;
  readonly interpretation: "planetary-arcus-criterion" | "lunar-geometric-arcus-only";
  readonly receiptScope: "positions";
  readonly conventions: typeof CONVENTIONS;
}

export type HeliacalDiagnostic =
  | Readonly<{ code: "lunar-geometric-extension" }>
  | Readonly<{
    code: "opportunity-gap";
    period: ObservationPeriod;
    from: string;
    to: string;
    reason: UnavailableHeliacalOpportunity["reason"];
  }>;

interface HeliacalSearch {
  readonly body: VisibilityBody;
  readonly observer: Readonly<Required<Observer>>;
  readonly from: string;
  readonly to: string;
  readonly model: Readonly<HorizonArcusModel>;
  /** Full support searches, including sky samples, flags and position receipts. */
  readonly observing: ObservingWindowsResult;
  readonly geometrySamples: number;
  readonly maxGeometrySamples: number;
  readonly diagnostics: readonly HeliacalDiagnostic[];
  readonly receiptScope: "positions";
  readonly conventions: typeof CONVENTIONS;
}

export type HeliacalEventsResult = HeliacalSearch & (
  | { readonly status: "complete"; readonly events: readonly HeliacalEvent[]; readonly opportunities: readonly HeliacalOpportunity[] }
  | {
    readonly status: "refused";
    readonly reason: WindowRefusalReason | "geometry-budget";
    readonly positionRefusal: CalcRefusal | null;
    readonly events: readonly [];
    readonly opportunities: readonly [];
  }
  | {
    readonly status: "unresolved"; readonly reason: "event-sequence"; readonly detail: string;
    readonly events: readonly []; readonly opportunities: readonly [];
  }
);

function periodOf(appearance: HeliacalAppearance): ObservationPeriod {
  return appearance.endsWith("morning") ? "morning" : "evening";
}

function modelOf(body: VisibilityBody, value: HorizonArcusModel): Readonly<HorizonArcusModel> {
  const input = optionsOf(value, ["model", "thresholds"], "heliacal model");
  if (input.model !== "horizon-arcus-visionis/1") throw new RangeError('model must be "horizon-arcus-visionis/1".');
  const fields = optionsOf(input.thresholds, HELIACAL_APPEARANCES, "heliacal thresholds");
  const thresholds: Partial<Record<HeliacalAppearance, number>> = {};
  for (const appearance of HELIACAL_APPEARANCES) {
    if (!(appearance in fields)) continue;
    const applicable = body === "Moon"
      ? appearance === "first-evening" || appearance === "last-morning"
      : body === "Mercury" || body === "Venus" || appearance === "first-morning" || appearance === "last-evening";
    if (!applicable) throw new RangeError(`${appearance} is not an available heliacal appearance for ${body}.`);
    // Use the public criterion's validation and inclusive domain, not a second
    // independently maintained set of angle limits.
    thresholds[appearance] = horizonArcusVisionis(0, fields[appearance] as number).requiredSolarDepressionDeg;
  }
  if (!Object.keys(thresholds).length) throw new RangeError("Supply at least one applicable appearance threshold.");
  return Object.freeze({ model: input.model, thresholds: Object.freeze(thresholds) });
}

function budget(value: unknown, fallback: number): number {
  const count = value === undefined ? fallback : value;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 1) {
    throw new RangeError("maxGeometrySamples must be a finite positive safe integer.");
  }
  return count;
}

/**
 * Search Schoch's horizon arcus criterion at successive engine crossings.
 * Each requested appearance has its own explicit threshold. Daylight failures
 * remain in the sequence; empty solar halves break it. No daily interpolation,
 * sighting instant, conjunction identification or lunar calibration is implied.
 * The Moon supports only geometric first-evening / last-morning extensions.
 * All horizon and transit solving is delegated to src/sky/riseset.ts.
 */
export function heliacalEvents(
  body: VisibilityBody, site: Observer, from: DateInput, to: DateInput,
  parameters: HorizonArcusModel, options?: HeliacalSearchOptions
): HeliacalEventsResult {
  const name = visibilityBody(body);
  const place = observer(site);
  const range = dateRange(from, to);
  const model = modelOf(name, parameters);
  const fields = optionsOf(options, ["maxSamples", "maxGeometrySamples"], "heliacal search options");
  const maxGeometrySamples = budget(fields.maxGeometrySamples, HELIACAL_SEARCH_LIMITS.defaultMaxGeometrySamples);
  const observing = observingWindows(name, place, range.from, range.to,
    fields.maxSamples === undefined ? undefined : { maxSamples: fields.maxSamples as number });
  let geometrySamples = 0;
  const diagnostics: HeliacalDiagnostic[] = name === "Moon" ? [Object.freeze({ code: "lunar-geometric-extension" })] : [];
  const base = (): HeliacalSearch => ({
    body: name, observer: place, from: range.from.toISOString(), to: range.to.toISOString(), model,
    observing, geometrySamples, maxGeometrySamples, diagnostics: Object.freeze([...diagnostics]),
    receiptScope: "positions", conventions: CONVENTIONS
  });
  const refuse = (reason: WindowRefusalReason | "geometry-budget", positionRefusal: CalcRefusal | null = null): HeliacalEventsResult => Object.freeze({
    ...base(), status: "refused", reason, positionRefusal,
    events: Object.freeze([]) as readonly [], opportunities: Object.freeze([]) as readonly []
  });
  const unresolved = (detail: string): HeliacalEventsResult => Object.freeze({
    ...base(), status: "unresolved", reason: "event-sequence", detail,
    events: Object.freeze([]) as readonly [], opportunities: Object.freeze([]) as readonly []
  });
  if (observing.status === "refused") return refuse(observing.reason, observing.positionRefusal);
  if (observing.status === "unresolved") return unresolved(observing.detail);
  const { sun, target } = observing.horizons;
  if (sun?.status !== "complete" || target?.status !== "complete") {
    return unresolved("Completed support is missing its complete Sun or target horizon search.");
  }
  const partition = partitionHorizonOpportunities(sun.events, target.events, range.from.getTime(), range.to.getTime());
  if (partition.status === "unresolved") return unresolved(partition.detail);
  const appearances = HELIACAL_APPEARANCES.filter((appearance) => model.thresholds[appearance] !== undefined);
  const periods = new Set(appearances.map(periodOf));
  const selected = partition.opportunities.filter((row) => periods.has(row.period));
  // Exact preflight count: one complete geometry call per eligible crossing,
  // shared by all requested criteria for that period. Never return a prefix.
  if (selected.filter((row) => row.reason === null).length > maxGeometrySamples) return refuse("geometry-budget");
  const opportunities: HeliacalOpportunity[] = [];
  const events: HeliacalEvent[] = [];
  const previous = new Map<ObservationPeriod, EvaluatedHeliacalOpportunity>();
  for (const row of selected) {
    const common: OpportunityBase = {
      period: row.period, from: new Date(row.from).toISOString(), to: new Date(row.to).toISOString(),
      solarHalf: Object.freeze(row.solarHalf)
    };
    if (row.reason !== null || row.crossing === null) {
      const reason = row.reason ?? "missing-crossing";
      opportunities.push(Object.freeze({ ...common, status: "unavailable", crossing: row.crossing, reason }));
      diagnostics.push(Object.freeze({ code: "opportunity-gap", period: common.period, from: common.from, to: common.to, reason }));
      previous.delete(row.period);
      continue;
    }
    geometrySamples += 1;
    const geometry = sunBodyGeometry(name, row.crossing.at, place);
    if (geometry.status === "refused") return refuse("engine-position", geometry);
    const criteria: Partial<Record<HeliacalAppearance, Readonly<HorizonArcusVisionis>>> = {};
    for (const appearance of appearances) {
      if (periodOf(appearance) !== row.period) continue;
      criteria[appearance] = horizonArcusVisionis(
        geometry.topocentric.sun.horizontal.altitudeDeg, model.thresholds[appearance]!
      );
    }
    const opportunity: EvaluatedHeliacalOpportunity = Object.freeze({
      ...common, status: "evaluated", crossing: row.crossing, geometry, criteria: Object.freeze(criteria)
    });
    opportunities.push(opportunity);
    const before = previous.get(row.period);
    if (before) {
      for (const appearance of appearances) {
        const afterCriterion = criteria[appearance];
        const beforeCriterion = before.criteria[appearance];
        if (!afterCriterion || !beforeCriterion) continue;
        const first = appearance.startsWith("first-");
        if (beforeCriterion.passesCriterion !== !first || afterCriterion.passesCriterion !== first) continue;
        const after = opportunity;
        events.push(Object.freeze({
          body: name, appearance, period: row.period, at: (first ? after : before).crossing.at.toISOString(), model,
          bracket: Object.freeze({ kind: "successive-horizon-opportunities",
            from: before.crossing.at.toISOString(), to: after.crossing.at.toISOString(), before, after }),
          interpretation: name === "Moon" ? "lunar-geometric-arcus-only" : "planetary-arcus-criterion",
          receiptScope: "positions", conventions: CONVENTIONS
        }));
      }
    }
    previous.set(row.period, opportunity);
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)
    || HELIACAL_APPEARANCES.indexOf(a.appearance) - HELIACAL_APPEARANCES.indexOf(b.appearance));
  return Object.freeze({ ...base(), status: "complete", events: Object.freeze(events), opportunities: Object.freeze(opportunities) });
}
