import type { CalcRefusal } from "../../src/calc.js";
import { REFERENCE_SPAN } from "../../src/reference-span.js";
import { optionsOf } from "../../src/sky/riseset.js";
import type { ObservationPeriod } from "./appearance-sequence.js";
import { crescentGeometry } from "./crescent-geometry.js";
import { partitionCrescentOpportunities } from "./crescent-opportunities.js";
import type { CrescentPairingGap, CrescentTiming } from "./crescent-opportunities.js";
import type { CrescentCriterion } from "./crescent.js";
import { horizonEvents } from "./engine.js";
import type { HorizonEvents, ReceiptedSkyEvent } from "./engine.js";
import { sunBodyGeometry } from "./geometry.js";
import type { SunBodyGeometry } from "./geometry.js";
import { dateRange, observer } from "./inputs.js";
import type { DateInput, Observer } from "./inputs.js";
import { ODEH_MODEL, evaluateOdeh } from "./odeh.js";
import { synodicPhase } from "./phase.js";
import { OBSERVING_WINDOW_LIMITS } from "./windows.js";
import type { WindowRefusalReason } from "./windows.js";
import { YALLOP_MODEL, evaluateYallop } from "./yallop.js";

/** Operational bounds, not accuracy claims. */
export const CRESCENT_SEARCH_LIMITS = Object.freeze({
  ...OBSERVING_WINDOW_LIMITS, defaultMaxGeometrySamples: 800
} as const);

interface CrescentSelection {
  /** Explicit search domain, (0,90] degrees. Not a calibration validity limit. */
  readonly maxElongationDeg: number;
  /** Morning timing is an unvalidated symmetry extension; disabled by default. */
  readonly morningTiming?: "disabled" | "mirror-evening";
}

/** Accept all categories from A through the named category within this model. */
export type CrescentSearchPolicy = CrescentSelection & (
  | { readonly model: typeof YALLOP_MODEL.id; readonly lastAcceptedCategory: "A" | "B" | "C" | "D" }
  | { readonly model: typeof ODEH_MODEL.id; readonly lastAcceptedCategory: "A" | "B" | "C" }
);

export type ResolvedCrescentPolicy = Readonly<CrescentSearchPolicy & {
  readonly morningTiming: "disabled" | "mirror-evening";
  readonly acceptedCategories: readonly string[];
}>;

export interface CrescentSearchOptions {
  /** Shared budget of sky solver samples; position receipt calls excluded. */
  readonly maxSamples?: number;
  /** Complete Sun/Moon geometry calls, separate from the sky solver budget. */
  readonly maxGeometrySamples?: number;
}

const CONVENTIONS = Object.freeze({
  scope: "selected-crescent-criterion-transitions;not-observed-sightings",
  horizon: "engine-sky;upper-limbs;standard-refraction;wgs84;no-dip",
  criterionGeometry: "engine-calc;airless-centres;iers2003;actual-geometry-retained",
  reductionDifference: "sky-and-calc-observer-and-apparent-corrections-differ",
  evening: "sunset-and-moonset-in-solar-upper-to-lower-transit-half",
  morning: "moonrise-and-sunrise-in-solar-lower-to-upper-transit-half;explicit-mirror-extension",
  pairing: "unique-same-half-crossings;positive-evening-moonset-lag-or-morning-sunrise-lag",
  selection: "caller-category-prefix;geocentric-synodic-sign;caller-geocentric-elongation-ceiling",
  atmosphere: "fixed-model-calibration;no-extinction-or-magnitude-adjustment",
  interval: "[from,to);all-source-crossings-of-both-bracket-opportunities-inside-request",
  bracket: "consecutive-same-period-opportunities;not-a-continuous-root-or-uncertainty-bound",
  eventTime: "passing-best-time;first=after;last=before;not-sighting-time",
  gaps: "missing-multiple-or-out-of-range-source-breaks-adjacency",
  completeness: "all-selected-engine-opportunities-processed;sampled-solver-limits;gaps-explicit",
  receiptScope: "engine-positions-only;not-sky-search-model-or-derived-event"
} as const);

interface OpportunityBase {
  readonly period: ObservationPeriod;
  readonly from: string;
  readonly to: string;
  readonly solarHalf: Readonly<{ start: ReceiptedSkyEvent; end: ReceiptedSkyEvent }>;
}

export interface UnavailableCrescentOpportunity extends OpportunityBase {
  readonly status: "unavailable";
  readonly reason: CrescentPairingGap;
  readonly sunCrossing: ReceiptedSkyEvent | null;
  readonly moonCrossing: ReceiptedSkyEvent | null;
}

interface PairedOpportunity extends OpportunityBase {
  readonly sunCrossing: ReceiptedSkyEvent;
  readonly moonCrossing: ReceiptedSkyEvent;
  readonly lagMilliseconds: number;
}

export interface IneligibleCrescentOpportunity extends PairedOpportunity {
  readonly status: "ineligible";
  readonly reason: "nonpositive-lag";
  readonly bestTime: null;
  readonly passesSelection: false;
}

export type CrescentEligibilityFailure = "wrong-lunar-phase" | "elongation-outside-selection";

export interface EvaluatedCrescentOpportunity extends PairedOpportunity {
  readonly status: "evaluated";
  readonly bestTime: Readonly<CrescentTiming>;
  readonly geometry: SunBodyGeometry;
  readonly criterionGeometry: ReturnType<typeof crescentGeometry>;
  readonly signedSynodicAngleDeg: number;
  readonly criterion: CrescentCriterion;
  readonly eligibilityFailures: readonly CrescentEligibilityFailure[];
  /** Both the explicit search domain and selected model category must pass. */
  readonly passesSelection: boolean;
}

export type CrescentOpportunity = UnavailableCrescentOpportunity | IneligibleCrescentOpportunity | EvaluatedCrescentOpportunity;
type AssessedOpportunity = IneligibleCrescentOpportunity | EvaluatedCrescentOpportunity;

export interface CrescentEvent {
  readonly body: "Moon";
  readonly appearance: "first-evening" | "last-morning";
  readonly period: ObservationPeriod;
  readonly at: string;
  readonly policy: ResolvedCrescentPolicy;
  readonly modelParameters: typeof YALLOP_MODEL | typeof ODEH_MODEL;
  readonly interpretation: "evening-criterion" | "morning-symmetry-extension";
  readonly bracket: Readonly<{
    kind: "successive-crescent-opportunities";
    from: string;
    to: string;
    before: AssessedOpportunity;
    after: AssessedOpportunity;
  }>;
  readonly receiptScope: "positions";
  readonly conventions: typeof CONVENTIONS;
}

export type CrescentDiagnostic =
  | Readonly<{ code: "morning-symmetry-extension" }>
  | Readonly<{
    code: "opportunity-gap"; period: ObservationPeriod; from: string; to: string; reason: CrescentPairingGap;
  }>;

interface CrescentSearch {
  readonly body: "Moon";
  readonly observer: Readonly<Required<Observer>>;
  readonly from: string;
  readonly to: string;
  readonly support: Readonly<{ from: string; to: string }>;
  readonly policy: ResolvedCrescentPolicy;
  readonly modelParameters: typeof YALLOP_MODEL | typeof ODEH_MODEL;
  readonly horizons: Readonly<{ sun: HorizonEvents | null; moon: HorizonEvents | null }>;
  readonly samples: number;
  readonly maxSamples: number;
  readonly geometrySamples: number;
  readonly maxGeometrySamples: number;
  readonly diagnostics: readonly CrescentDiagnostic[];
  readonly receiptScope: "positions";
  readonly conventions: typeof CONVENTIONS;
}

export type CrescentEventsResult = CrescentSearch & (
  | { readonly status: "complete"; readonly events: readonly CrescentEvent[]; readonly opportunities: readonly CrescentOpportunity[] }
  | {
    readonly status: "refused"; readonly reason: WindowRefusalReason | "geometry-budget";
    readonly positionRefusal: CalcRefusal | null;
    readonly events: readonly []; readonly opportunities: readonly [];
  }
  | {
    readonly status: "unresolved"; readonly reason: "event-sequence"; readonly detail: string;
    readonly events: readonly []; readonly opportunities: readonly [];
  }
);

function policyOf(value: CrescentSearchPolicy): ResolvedCrescentPolicy {
  const input = optionsOf(value, ["model", "lastAcceptedCategory", "maxElongationDeg", "morningTiming"], "crescent search policy");
  if (input.model !== YALLOP_MODEL.id && input.model !== ODEH_MODEL.id) {
    throw new RangeError("model must be yallop-1997/1 or odeh-2006/1.");
  }
  const categories = input.model === YALLOP_MODEL.id ? ["A", "B", "C", "D"] : ["A", "B", "C"];
  const last = categories.indexOf(input.lastAcceptedCategory as string);
  if (last < 0) throw new RangeError("lastAcceptedCategory must name a sighting category of the selected model.");
  const maxElongationDeg = input.maxElongationDeg;
  if (typeof maxElongationDeg !== "number" || !Number.isFinite(maxElongationDeg)
    || maxElongationDeg <= 0 || maxElongationDeg > 90) {
    throw new RangeError("maxElongationDeg must be a finite number in (0,90].");
  }
  const morningTiming = input.morningTiming === undefined ? "disabled" : input.morningTiming;
  if (morningTiming !== "disabled" && morningTiming !== "mirror-evening") {
    throw new RangeError("morningTiming must be disabled or mirror-evening.");
  }
  return Object.freeze({
    model: input.model, lastAcceptedCategory: categories[last], maxElongationDeg, morningTiming,
    acceptedCategories: Object.freeze(categories.slice(0, last + 1))
  }) as ResolvedCrescentPolicy;
}

function budget(value: unknown, fallback: number, label: string): number {
  const count = value === undefined ? fallback : value;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 1) {
    throw new RangeError(`${label} must be a finite positive safe integer.`);
  }
  return count;
}

/**
 * First evening and explicitly enabled last morning criterion transitions.
 * The engine alone computes positions, frames, rise/set and solar transits.
 * A passing initial or final sample alone establishes no first/last event.
 * Nonpositive paired lags are definite failed opportunities; missing sources
 * break adjacency. Neither a conjunction epoch nor a sighting is inferred.
 */
export function crescentEvents(
  site: Observer, from: DateInput, to: DateInput, selection: CrescentSearchPolicy, options?: CrescentSearchOptions
): CrescentEventsResult {
  const place = observer(site);
  const range = dateRange(from, to);
  const policy = policyOf(selection);
  const input = optionsOf(options, ["maxSamples", "maxGeometrySamples"], "crescent search options");
  const maxSamples = budget(input.maxSamples, CRESCENT_SEARCH_LIMITS.defaultMaxSamples, "maxSamples");
  const maxGeometrySamples = budget(input.maxGeometrySamples, CRESCENT_SEARCH_LIMITS.defaultMaxGeometrySamples, "maxGeometrySamples");
  const fromMs = range.from.getTime();
  const toMs = range.to.getTime();
  const pad = CRESCENT_SEARCH_LIMITS.supportPaddingDays * 86_400_000;
  const supportFrom = Math.max(-8_640_000_000_000_000, fromMs - pad);
  const supportTo = Math.min(8_640_000_000_000_000, toMs + pad);
  let sun: HorizonEvents | null = null;
  let moon: HorizonEvents | null = null;
  let samples = 0;
  let geometrySamples = 0;
  const diagnostics: CrescentDiagnostic[] = policy.morningTiming === "mirror-evening"
    ? [Object.freeze({ code: "morning-symmetry-extension" })] : [];
  const base = (): CrescentSearch => ({
    body: "Moon", observer: place, from: range.from.toISOString(), to: range.to.toISOString(),
    support: Object.freeze({ from: new Date(supportFrom).toISOString(), to: new Date(supportTo).toISOString() }),
    policy, modelParameters: policy.model === YALLOP_MODEL.id ? YALLOP_MODEL : ODEH_MODEL,
    horizons: Object.freeze({ sun, moon }), samples, maxSamples, geometrySamples, maxGeometrySamples,
    diagnostics: Object.freeze([...diagnostics]), receiptScope: "positions", conventions: CONVENTIONS
  });
  const refuse = (reason: WindowRefusalReason | "geometry-budget", positionRefusal: CalcRefusal | null = null): CrescentEventsResult => Object.freeze({
    ...base(), status: "refused", reason, positionRefusal,
    events: Object.freeze([]) as readonly [], opportunities: Object.freeze([]) as readonly []
  });
  const unresolved = (detail: string): CrescentEventsResult => Object.freeze({
    ...base(), status: "unresolved", reason: "event-sequence", detail,
    events: Object.freeze([]) as readonly [], opportunities: Object.freeze([]) as readonly []
  });
  if (toMs - fromMs > CRESCENT_SEARCH_LIMITS.maxRangeDays * 86_400_000) return refuse("range-budget");
  if (Math.abs(place.latitude) === 90) return refuse("geographic-pole");
  // The engine scans an extra hour on each side. Keep all support and position
  // receipts inside the same reference span rather than clipping the request.
  if (supportFrom - 3_600_000 < Date.parse(REFERENCE_SPAN.from)
    || supportTo + 3_600_000 >= Date.parse(REFERENCE_SPAN.to)) return refuse("support-outside-reference-span");
  sun = horizonEvents("Sun", place, supportFrom, supportTo, { limb: "upper", refraction: "standard", maxSamples });
  samples += sun.samples;
  if (sun.status === "refused" || samples >= maxSamples) return refuse("sample-budget");
  moon = horizonEvents("Moon", place, supportFrom, supportTo, {
    limb: "upper", refraction: "standard", maxSamples: maxSamples - samples
  });
  samples += moon.samples;
  if (moon.status === "refused") return refuse("sample-budget");
  for (const result of [sun, moon]) {
    for (const event of result.events) {
      if (event.position.status === "refused") return refuse("engine-position", event.position);
    }
  }
  const partition = partitionCrescentOpportunities(sun.events, moon.events, fromMs, toMs);
  if (partition.status === "unresolved") return unresolved(partition.detail);
  const selected = partition.opportunities.filter((row) => row.period === "evening" || policy.morningTiming === "mirror-evening");
  if (selected.filter((row) => row.bestTime !== null).length > maxGeometrySamples) return refuse("geometry-budget");
  const opportunities: CrescentOpportunity[] = [];
  const events: CrescentEvent[] = [];
  const previous = new Map<ObservationPeriod, AssessedOpportunity>();
  for (const row of selected) {
    const common: OpportunityBase = {
      period: row.period, from: new Date(row.from).toISOString(), to: new Date(row.to).toISOString(),
      solarHalf: Object.freeze(row.solarHalf)
    };
    if (row.reason !== null || row.sunCrossing === null || row.moonCrossing === null || row.lagMilliseconds === null) {
      const reason = row.reason ?? "missing-moon-crossing";
      opportunities.push(Object.freeze({ ...common, status: "unavailable", sunCrossing: row.sunCrossing, moonCrossing: row.moonCrossing, reason }));
      diagnostics.push(Object.freeze({ code: "opportunity-gap", period: row.period, from: common.from, to: common.to, reason }));
      previous.delete(row.period);
      continue;
    }
    const paired: PairedOpportunity = {
      ...common, sunCrossing: row.sunCrossing, moonCrossing: row.moonCrossing, lagMilliseconds: row.lagMilliseconds
    };
    let opportunity: AssessedOpportunity;
    if (row.bestTime === null) {
      opportunity = Object.freeze({ ...paired, status: "ineligible", reason: "nonpositive-lag", bestTime: null, passesSelection: false });
    } else {
      geometrySamples += 1;
      const geometry = sunBodyGeometry("Moon", row.bestTime.at, place);
      if (geometry.status === "refused") return refuse("engine-position", geometry);
      const derived = crescentGeometry(geometry);
      const criterion = policy.model === YALLOP_MODEL.id ? evaluateYallop(derived.yallop) : evaluateOdeh(derived.odeh);
      const { signedSynodicAngleDeg } = synodicPhase(geometry.geocentric.target.ecliptic.lon, geometry.geocentric.sun.ecliptic.lon);
      const eligibilityFailures: CrescentEligibilityFailure[] = [];
      if (row.period === "evening" ? !(signedSynodicAngleDeg > 0 && signedSynodicAngleDeg < 180) : !(signedSynodicAngleDeg < 0)) {
        eligibilityFailures.push("wrong-lunar-phase");
      }
      if (geometry.geocentric.elongationDeg > policy.maxElongationDeg) eligibilityFailures.push("elongation-outside-selection");
      opportunity = Object.freeze({
        ...paired, status: "evaluated", bestTime: row.bestTime, geometry, criterionGeometry: derived,
        signedSynodicAngleDeg, criterion, eligibilityFailures: Object.freeze(eligibilityFailures),
        passesSelection: eligibilityFailures.length === 0 && policy.acceptedCategories.includes(criterion.category)
      });
    }
    opportunities.push(opportunity);
    const before = previous.get(row.period);
    const first = row.period === "evening";
    if (before && before.passesSelection === !first && opportunity.passesSelection === first) {
      const passing = first ? opportunity : before;
      // Only an evaluated row can pass. Keep this invariant visible to TS and
      // fail loudly if a future branch changes that contract.
      if (passing.status !== "evaluated") throw new Error("Passing crescent opportunity requires a best-time evaluation.");
      const sourceTimes = [before.sunCrossing, before.moonCrossing, opportunity.sunCrossing, opportunity.moonCrossing]
        .map((event) => event.at.getTime());
      events.push(Object.freeze({
        body: "Moon", appearance: first ? "first-evening" : "last-morning", period: row.period,
        at: passing.bestTime.at, policy, modelParameters: criterionParameters(policy),
        interpretation: first ? "evening-criterion" : "morning-symmetry-extension",
        bracket: Object.freeze({ kind: "successive-crescent-opportunities", before, after: opportunity,
          from: new Date(Math.min(...sourceTimes)).toISOString(), to: new Date(Math.max(...sourceTimes)).toISOString() }),
        receiptScope: "positions", conventions: CONVENTIONS
      }));
    }
    previous.set(row.period, opportunity);
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return Object.freeze({ ...base(), status: "complete", events: Object.freeze(events), opportunities: Object.freeze(opportunities) });
}

function criterionParameters(policy: ResolvedCrescentPolicy): typeof YALLOP_MODEL | typeof ODEH_MODEL {
  return policy.model === YALLOP_MODEL.id ? YALLOP_MODEL : ODEH_MODEL;
}
