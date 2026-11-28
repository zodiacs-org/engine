import type { CalcRefusal } from "../../src/calc.js";
import { optionsOf } from "../../src/sky/riseset.js";
import type { ReceiptedSkyEvent } from "./engine.js";
import { partitionHorizonPairs } from "./horizon-pairings.js";
import type { HorizonPairOpportunity } from "./horizon-pairings.js";
import { dateRange, observer, visibilityBody } from "./inputs.js";
import type { DateInput, Observer, VisibilityBody } from "./inputs.js";
import { observingWindows } from "./windows.js";
import type { ObservingWindowsResult, WindowRefusalReason } from "./windows.js";

export const HORIZON_PHENOMENA = Object.freeze([
  "cosmical-rising", "cosmical-setting", "acronychal-rising", "acronychal-setting"
] as const);
export type HorizonPhenomenon = (typeof HORIZON_PHENOMENA)[number];

/** Names alone are ambiguous in the literature; every result retains directions. */
export const HORIZON_TERMINOLOGY = Object.freeze({
  id: "sunrise-cosmical-sunset-acronychal/1",
  definitions: Object.freeze({
    "cosmical-rising": Object.freeze({ sunKind: "rise", targetKind: "rise" }),
    "cosmical-setting": Object.freeze({ sunKind: "rise", targetKind: "set" }),
    "acronychal-rising": Object.freeze({ sunKind: "set", targetKind: "rise" }),
    "acronychal-setting": Object.freeze({ sunKind: "set", targetKind: "set" })
  })
} as const);

export interface HorizonPhenomenaOptions {
  /** All four pairings by default. A nonempty subset in any order is accepted. */
  readonly kinds?: readonly HorizonPhenomenon[];
  /** Same shared sky search budget as observingWindows. */
  readonly maxSamples?: number;
}

type Pair = HorizonPairOpportunity<ReceiptedSkyEvent>;
interface OpportunityBase {
  readonly kind: HorizonPhenomenon;
  readonly period: Pair["period"];
  readonly sunKind: Pair["sunKind"];
  readonly targetKind: Pair["targetKind"];
  readonly from: string;
  readonly to: string;
  readonly solarHalf: Pair["solarHalf"];
}

export interface PairedHorizonOpportunity extends OpportunityBase {
  readonly status: "paired";
  readonly sunCrossing: ReceiptedSkyEvent;
  readonly targetCrossing: ReceiptedSkyEvent;
  /** Target crossing time minus Sun crossing time, in elapsed milliseconds. */
  readonly lagMilliseconds: number;
}

export interface UnavailableHorizonOpportunity extends OpportunityBase {
  readonly status: "unavailable";
  readonly sunCrossing: ReceiptedSkyEvent | null;
  readonly targetCrossing: ReceiptedSkyEvent | null;
  readonly lagMilliseconds: null;
  readonly reason: Exclude<Pair["reason"], null>;
}

export type HorizonPhenomenonOpportunity = PairedHorizonOpportunity | UnavailableHorizonOpportunity;

const CONVENTIONS = Object.freeze({
  scope: "geometric-horizon-order;not-visibility-or-crescent-predictions",
  horizon: "engine-sky;airless-topocentric-centres;wgs84;no-dip",
  pairing: "same-solar-meridian-half;morning=lower-to-upper;evening=upper-to-lower",
  lag: "target-crossing-minus-sun-crossing;elapsed-milliseconds",
  bracket: "successive-same-pairing-opportunities;not-a-continuous-root-or-error-bound",
  coincidence: "equal-engine-crossing-milliseconds;not-physical-exactness",
  interval: "[from,to);both-crossings-of-each-pair-required-inside-request",
  gaps: "missing-multiple-or-out-of-range-sun-or-target-crossing-breaks-adjacency",
  visibility: "not-evaluated;no-extinction-magnitude-or-twilight-criterion",
  completeness: "all-selected-engine-horizon-pairs-processed;sampled-solver-limits;gaps-explicit",
  receiptScope: "calc-event-positions-only;not-sky-search-pairing-or-derived-event"
} as const);

export interface HorizonPhenomenonEvent {
  readonly body: VisibilityBody;
  readonly kind: HorizonPhenomenon;
  readonly sunKind: Pair["sunKind"];
  readonly targetKind: Pair["targetKind"];
  readonly definition: "geometric-horizon-order";
  /** Null for an order-reversal bracket: no interpolated instant is invented. */
  readonly at: string | null;
  readonly direction: "target-earlier-to-later" | "target-later-to-earlier" | "coincident";
  readonly bracket: Readonly<{
    kind: "successive-horizon-pairs" | "coincident-engine-crossings";
    /** Encloses every Sun and target crossing retained in this bracket. */
    from: string;
    to: string;
    before: PairedHorizonOpportunity;
    after: PairedHorizonOpportunity;
  }>;
  readonly terminology: typeof HORIZON_TERMINOLOGY;
  readonly receiptScope: "event-positions";
  readonly conventions: typeof CONVENTIONS;
}

export interface HorizonPhenomenonDiagnostic {
  readonly code: "pairing-gap";
  readonly kind: HorizonPhenomenon;
  readonly from: string;
  readonly to: string;
  readonly reason: UnavailableHorizonOpportunity["reason"];
}

interface Search {
  readonly body: VisibilityBody;
  readonly observer: Readonly<Required<Observer>>;
  readonly from: string;
  readonly to: string;
  readonly kinds: readonly HorizonPhenomenon[];
  readonly observing: ObservingWindowsResult;
  readonly diagnostics: readonly HorizonPhenomenonDiagnostic[];
  readonly terminology: typeof HORIZON_TERMINOLOGY;
  readonly receiptScope: "event-positions";
  readonly conventions: typeof CONVENTIONS;
}

export type HorizonPhenomenaResult = Search & (
  | { readonly status: "complete"; readonly events: readonly HorizonPhenomenonEvent[]; readonly opportunities: readonly HorizonPhenomenonOpportunity[] }
  | {
    readonly status: "refused"; readonly reason: WindowRefusalReason;
    readonly positionRefusal: CalcRefusal | null;
    readonly events: readonly []; readonly opportunities: readonly [];
  }
  | {
    readonly status: "unresolved"; readonly reason: "event-sequence"; readonly detail: string;
    readonly events: readonly []; readonly opportunities: readonly [];
  }
);

function kindsOf(value: unknown): readonly HorizonPhenomenon[] {
  if (value === undefined) return HORIZON_PHENOMENA;
  if (!Array.isArray(value) || value.length === 0 || value.length > HORIZON_PHENOMENA.length) {
    throw new RangeError("kinds must be a nonempty array of distinct horizon phenomenon names.");
  }
  const selected = new Set<HorizonPhenomenon>();
  for (let i = 0; i < value.length; i += 1) {
    const slot = Object.getOwnPropertyDescriptor(value, String(i));
    if (!slot || !("value" in slot) || !HORIZON_PHENOMENA.includes(slot.value as HorizonPhenomenon)
      || selected.has(slot.value as HorizonPhenomenon)) {
      throw new RangeError("kinds must contain distinct supported names in ordinary array slots.");
    }
    selected.add(slot.value as HorizonPhenomenon);
  }
  return Object.freeze(HORIZON_PHENOMENA.filter((kind) => selected.has(kind)));
}

/**
 * Geometric acronychal/cosmical phenomena from the engine's horizon events.
 * Order reversals are brackets of discrete opportunities, not continuous roots.
 * A sampled equality means only that sky returned the same millisecond.
 * See SOURCES.md, Event terminology, for the named convention and its limits.
 */
export function horizonPhenomena(
  body: VisibilityBody, site: Observer, from: DateInput, to: DateInput, options?: HorizonPhenomenaOptions
): HorizonPhenomenaResult {
  const name = visibilityBody(body);
  const place = observer(site);
  const range = dateRange(from, to);
  const fields = optionsOf(options, ["kinds", "maxSamples"], "horizon phenomena options");
  const kinds = kindsOf(fields.kinds);
  const observing = observingWindows(name, place, range.from, range.to,
    fields.maxSamples === undefined ? undefined : { maxSamples: fields.maxSamples as number });
  const diagnostics: HorizonPhenomenonDiagnostic[] = [];
  const base = (): Search => ({
    body: name, observer: place, from: range.from.toISOString(), to: range.to.toISOString(), kinds,
    observing, diagnostics: Object.freeze([...diagnostics]), terminology: HORIZON_TERMINOLOGY,
    receiptScope: "event-positions", conventions: CONVENTIONS
  });
  const empty = { events: Object.freeze([]) as readonly [], opportunities: Object.freeze([]) as readonly [] };
  const unresolved = (detail: string): HorizonPhenomenaResult => Object.freeze({
    ...base(), ...empty, status: "unresolved", reason: "event-sequence", detail
  });
  if (observing.status === "refused") return Object.freeze({
    ...base(), ...empty, status: "refused", reason: observing.reason, positionRefusal: observing.positionRefusal
  });
  if (observing.status === "unresolved") return unresolved(observing.detail);
  const { sun, target } = observing.horizons;
  if (sun?.status !== "complete" || target?.status !== "complete") {
    return unresolved("Completed support is missing its complete Sun or target horizon search.");
  }
  const partition = partitionHorizonPairs(sun.events, target.events, range.from.getTime(), range.to.getTime());
  if (partition.status === "unresolved") return unresolved(partition.detail);
  const opportunities: HorizonPhenomenonOpportunity[] = [];
  const events: HorizonPhenomenonEvent[] = [];
  const previous = new Map<HorizonPhenomenon, PairedHorizonOpportunity>();
  for (const row of partition.opportunities) {
    const kind = HORIZON_PHENOMENA.find((candidate) => {
      const definition = HORIZON_TERMINOLOGY.definitions[candidate];
      return definition.sunKind === row.sunKind && definition.targetKind === row.targetKind;
    })!;
    if (!kinds.includes(kind)) continue;
    const common: OpportunityBase = {
      kind, period: row.period, sunKind: row.sunKind, targetKind: row.targetKind,
      from: new Date(row.from).toISOString(), to: new Date(row.to).toISOString(), solarHalf: Object.freeze(row.solarHalf)
    };
    if (row.reason !== null || row.sunCrossing === null || row.targetCrossing === null || row.lagMilliseconds === null) {
      const reason = row.reason ?? "missing-target-crossing";
      opportunities.push(Object.freeze({
        ...common, status: "unavailable", sunCrossing: row.sunCrossing, targetCrossing: row.targetCrossing,
        lagMilliseconds: null, reason
      }));
      diagnostics.push(Object.freeze({ code: "pairing-gap", kind, from: common.from, to: common.to, reason }));
      previous.delete(kind);
      continue;
    }
    const after: PairedHorizonOpportunity = Object.freeze({
      ...common, status: "paired", sunCrossing: row.sunCrossing, targetCrossing: row.targetCrossing,
      lagMilliseconds: row.lagMilliseconds
    });
    opportunities.push(after);
    const before = previous.get(kind);
    const coincident = after.lagMilliseconds === 0;
    const reversed = before !== undefined && before.lagMilliseconds !== 0
      && !coincident && Math.sign(before.lagMilliseconds) !== Math.sign(after.lagMilliseconds);
    if (coincident || reversed) {
      const left = coincident ? after : before!;
      const times = [left.sunCrossing, left.targetCrossing, after.sunCrossing, after.targetCrossing]
        .map((event) => event.at.getTime());
      events.push(Object.freeze({
        body: name, kind, sunKind: row.sunKind, targetKind: row.targetKind, definition: "geometric-horizon-order",
        at: coincident ? after.sunCrossing.at.toISOString() : null,
        direction: coincident ? "coincident" : after.lagMilliseconds > 0 ? "target-earlier-to-later" : "target-later-to-earlier",
        bracket: Object.freeze({
          kind: coincident ? "coincident-engine-crossings" : "successive-horizon-pairs",
          from: new Date(Math.min(...times)).toISOString(), to: new Date(Math.max(...times)).toISOString(),
          before: left, after
        }),
        terminology: HORIZON_TERMINOLOGY, receiptScope: "event-positions", conventions: CONVENTIONS
      }));
    }
    previous.set(kind, after);
  }
  events.sort((a, b) => Date.parse(a.bracket.from) - Date.parse(b.bracket.from)
    || HORIZON_PHENOMENA.indexOf(a.kind) - HORIZON_PHENOMENA.indexOf(b.kind));
  return Object.freeze({ ...base(), status: "complete", events: Object.freeze(events), opportunities: Object.freeze(opportunities) });
}
