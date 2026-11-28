import { REFERENCE_SPAN } from "../../src/reference-span.js";
import { optionsOf } from "../../src/sky/riseset.js";
import { horizonEvents } from "./engine.js";
import type { EnginePosition, HorizonEvents, ReceiptedSkyEvent } from "./engine.js";
import { dateRange, observer, visibilityBody } from "./inputs.js";
import type { DateInput, ObservationBody, Observer, VisibilityBody } from "./inputs.js";
import { partitionWindows } from "./window-partition.js";

const DAY_MS = 86_400_000;
// An operational limit, not an accuracy claim. Longer requests can be split.
export const OBSERVING_WINDOW_LIMITS = Object.freeze({
  maxRangeDays: 366, supportPaddingDays: 2, defaultMaxSamples: 200_000
} as const);

export interface ObservingWindowOptions {
  /** Shared finite budget for both sky searches, including support padding. */
  readonly maxSamples?: number;
}

export type WindowBoundaryCause =
  | "range-start" | "range-end" | "sun-rise" | "sun-set"
  | "sun-upper-transit" | "sun-lower-transit" | "target-rise" | "target-set";

export interface WindowBoundary {
  readonly at: string;
  readonly causes: readonly WindowBoundaryCause[];
  readonly events: readonly Readonly<{ body: ObservationBody; event: ReceiptedSkyEvent }>[];
}

export interface ObservingWindow {
  readonly period: "morning" | "evening";
  readonly from: string;
  readonly to: string;
  readonly start: WindowBoundary;
  readonly end: WindowBoundary;
  /** These physical anchors can lie outside the clipped observing interval. */
  readonly solarHalf: Readonly<{ start: ReceiptedSkyEvent; end: ReceiptedSkyEvent }>;
}

export interface WindowDiagnostic {
  readonly body: ObservationBody;
  readonly code: "no-rise-in-support" | "no-set-in-support" | "above-throughout-support" | "below-throughout-support";
  readonly scope: "support-search";
}

const CONVENTIONS = Object.freeze({
  scope: "geometric-candidate-windows;not-visibility-predictions",
  horizon: "airless-topocentric-centres;sky-wgs84;no-dip",
  selection: "sun-below-horizon;target-above-horizon",
  evening: "solar-upper-transit-to-next-lower-transit",
  morning: "solar-lower-transit-to-next-upper-transit",
  intervals: "[from,to);crossings-own-the-following-state;zero-duration-contacts-omitted",
  completeness: "partition-of-engine-sky-events;inherits-sampled-solver-limits;not-a-proof",
  sampleBudget: "sum-of-sky-search-samples;receipt-position-calls-excluded",
  receiptScope: "calc-event-positions-only;not-sky-search-or-window-partition"
} as const);

interface WindowSearch {
  readonly body: VisibilityBody;
  readonly observer: Readonly<Required<Observer>>;
  readonly from: string;
  readonly to: string;
  /** Proposed support interval, even on a refusal before evaluation. */
  readonly support: Readonly<{ from: string; to: string }>;
  readonly maxSamples: number;
  readonly samples: number;
  readonly horizons: Readonly<{ sun: HorizonEvents | null; target: HorizonEvents | null }>;
  readonly diagnostics: readonly WindowDiagnostic[];
  readonly receiptScope: "event-positions";
  readonly conventions: typeof CONVENTIONS;
}

export type WindowRefusalReason =
  | "range-budget" | "sample-budget" | "support-outside-reference-span" | "geographic-pole" | "engine-position";

export type ObservingWindowsResult = WindowSearch & (
  | { readonly status: "complete"; readonly windows: readonly ObservingWindow[] }
  | {
    readonly status: "refused"; readonly reason: WindowRefusalReason; readonly windows: readonly [];
    readonly positionRefusal: Extract<EnginePosition, { status: "refused" }> | null;
  }
  | { readonly status: "unresolved"; readonly reason: "event-sequence"; readonly detail: string; readonly windows: readonly [] }
);

function diagnosticsFor(result: HorizonEvents): WindowDiagnostic[] {
  if (result.status !== "complete") return [];
  const diagnostics: WindowDiagnostic[] = [];
  for (const kind of ["rise", "set"] as const) {
    if (!result.events.some((event) => event.kind === kind)) {
      diagnostics.push(Object.freeze({ body: result.body as ObservationBody, code: `no-${kind}-in-support`, scope: "support-search" }));
    }
  }
  for (const flag of result.flags) {
    if (flag === "never-rises" || flag === "never-sets") diagnostics.push(Object.freeze({
      body: result.body as ObservationBody, scope: "support-search",
      code: flag === "never-rises" ? "below-throughout-support" : "above-throughout-support"
    }));
  }
  return diagnostics;
}

/**
 * Bounded candidate intervals using only the engine's horizon/transit solver.
 * Morning/evening are solar meridian halves, including during polar night;
 * they do not assert a morning/evening-star phase or a visibility criterion.
 * No own altitude-crossing, transit, refraction or position solver is used.
 */
export function observingWindows(
  body: VisibilityBody, site: Observer, from: DateInput, to: DateInput, options?: ObservingWindowOptions
): ObservingWindowsResult {
  const name = visibilityBody(body);
  const place = observer(site);
  const range = dateRange(from, to);
  const input = optionsOf(options, ["maxSamples"], "observing window options");
  const maxSamples = input.maxSamples === undefined ? OBSERVING_WINDOW_LIMITS.defaultMaxSamples : input.maxSamples;
  if (typeof maxSamples !== "number" || !Number.isSafeInteger(maxSamples) || maxSamples < 1) {
    throw new RangeError("maxSamples must be a finite positive safe integer.");
  }
  const fromMs = range.from.getTime();
  const toMs = range.to.getTime();
  const pad = OBSERVING_WINDOW_LIMITS.supportPaddingDays * DAY_MS;
  // Clamp representable Date edges for diagnostic serialization only. Such
  // inputs are refused by the support coverage check before any engine work.
  const supportFrom = Math.max(-8_640_000_000_000_000, fromMs - pad);
  const supportTo = Math.min(8_640_000_000_000_000, toMs + pad);
  let sun: HorizonEvents | null = null;
  let target: HorizonEvents | null = null;
  let samples = 0;
  const base = (): WindowSearch => ({
    body: name, observer: place, from: range.from.toISOString(), to: range.to.toISOString(),
    support: Object.freeze({ from: new Date(supportFrom).toISOString(), to: new Date(supportTo).toISOString() }),
    maxSamples, samples, horizons: Object.freeze({ sun, target }),
    diagnostics: Object.freeze([...(sun ? diagnosticsFor(sun) : []), ...(target ? diagnosticsFor(target) : [])]),
    receiptScope: "event-positions", conventions: CONVENTIONS
  });
  const refuse = (
    reason: WindowRefusalReason, positionRefusal: Extract<EnginePosition, { status: "refused" }> | null = null
  ): ObservingWindowsResult => Object.freeze({
    ...base(), status: "refused", reason, positionRefusal, windows: Object.freeze([]) as readonly []
  });
  if (toMs - fromMs > OBSERVING_WINDOW_LIMITS.maxRangeDays * DAY_MS) return refuse("range-budget");
  if (Math.abs(place.latitude) === 90) return refuse("geographic-pole");
  // Sky internally scans an extra hour on both sides. Do not silently shorten
  // support searches at the engine's reference edge or lose position receipts.
  if (supportFrom - 3_600_000 < Date.parse(REFERENCE_SPAN.from)
    || supportTo + 3_600_000 >= Date.parse(REFERENCE_SPAN.to)) return refuse("support-outside-reference-span");

  sun = horizonEvents("Sun", place, supportFrom, supportTo, { limb: "centre", refraction: "none", maxSamples });
  samples += sun.samples;
  if (sun.status === "refused" || samples >= maxSamples) return refuse("sample-budget");
  target = horizonEvents(name, place, supportFrom, supportTo, {
    limb: "centre", refraction: "none", maxSamples: maxSamples - samples
  });
  samples += target.samples;
  if (target.status === "refused") return refuse("sample-budget");
  for (const result of [sun, target]) {
    for (const event of result.events) {
      if (event.position.status === "refused") return refuse("engine-position", event.position);
    }
  }
  const partition = partitionWindows(sun, target, fromMs, toMs);
  if (partition.status === "unresolved") return Object.freeze({
    ...base(), status: "unresolved", reason: "event-sequence", detail: partition.detail,
    windows: Object.freeze([]) as readonly []
  });

  // Index source events once. Boundary objects retain their exact solver event
  // and position receipt, including events that coincide with a range edge.
  const anchors = new Map<number, { cause: WindowBoundaryCause; body: ObservationBody; event: ReceiptedSkyEvent }[]>();
  for (const [source, result] of [["Sun", sun], [name, target]] as const) {
    for (const event of result.events) {
      if (source !== "Sun" && event.kind !== "rise" && event.kind !== "set") continue;
      const cause = `${source === "Sun" ? "sun" : "target"}-${event.kind}` as WindowBoundaryCause;
      const at = event.at.getTime();
      const rows = anchors.get(at) ?? [];
      rows.push({ cause, body: source, event });
      anchors.set(at, rows);
    }
  }
  const boundary = (ms: number): WindowBoundary => {
    const rows = anchors.get(ms) ?? [];
    const causes: WindowBoundaryCause[] = [];
    if (ms === fromMs) causes.push("range-start");
    if (ms === toMs) causes.push("range-end");
    causes.push(...rows.map((row) => row.cause));
    return Object.freeze({ at: new Date(ms).toISOString(), causes: Object.freeze(causes),
      events: Object.freeze(rows.map(({ body: source, event }) => Object.freeze({ body: source, event }))) });
  };
  const windows = partition.windows.map((window): ObservingWindow => Object.freeze({
    period: window.period, from: new Date(window.from).toISOString(), to: new Date(window.to).toISOString(),
    start: boundary(window.from), end: boundary(window.to), solarHalf: Object.freeze(window.solarHalf)
  }));
  return Object.freeze({ ...base(), status: "complete", windows: Object.freeze(windows) });
}
