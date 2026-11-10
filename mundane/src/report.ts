import { searchIngresses } from "./ingresses.js";
import type { IngressSearchResult, SolarIngress } from "./ingresses.js";
import { normalizeRequest } from "./inputs.js";
import type { MundaneRequest, NormalizedRequest } from "./inputs.js";
import { searchLunations } from "./lunations.js";
import type { Lunation, LunationSearchResult } from "./lunations.js";
import { searchEclipseCharts } from "./eclipses.js";
import type { EclipseChart, EclipseChartSearchResult } from "./eclipses.js";
import type { EclipseAdapter } from "./eclipse-adapter.js";
import { captureEclipseAdapter } from "./eclipse-adapter.js";

export interface MundaneReportOptions {
  /** Sun longitude evaluations, separate from the lunation budget. */
  readonly ingressMaxSamples?: number;
  /** Elongation evaluations, separate from the ingress budget. */
  readonly lunationMaxSamples?: number;
  /** Explicit opt-in; load the optional adapter outside this pure API. */
  readonly eclipses?: EclipseAdapter;
}

export type MundaneEvent = SolarIngress | Lunation | EclipseChart;

// Distribute over the result union to preserve the refusal reason, while
// omitting charts and the repeated request from per-search metadata.
type SearchSummary<T> = T extends unknown ? Omit<T, "request" | "ingresses" | "lunations" | "eclipses"> : never;

interface ReportMetadata {
  readonly request: NormalizedRequest;
  readonly label: "traditional conventions, not predictions";
  readonly search: {
    readonly window: "(from,to]";
    readonly completeness: "engine-sampled-search;not-proven" | "component-searches;see-searches";
    readonly ordering: "instant;ingress-before-lunation;target-longitude-or-elongation" |
      "instant;ingress-before-lunation-before-eclipse;target-or-source-order";
  };
  readonly searches: {
    readonly ingresses: SearchSummary<IngressSearchResult>;
    readonly lunations: SearchSummary<LunationSearchResult>;
    readonly eclipses?: SearchSummary<EclipseChartSearchResult>;
  };
}

export type MundaneReportResult = ReportMetadata & (
  | { readonly status: "complete"; readonly events: readonly MundaneEvent[] }
  | { readonly status: "refused"; readonly reason: "sample-budget" | "eclipse-adapter-unavailable" |
      "evaluation-budget" | "cancelled"; readonly events: readonly [] }
);

function captureOptions(options: MundaneReportOptions): MundaneReportOptions {
  const prototype: unknown = options !== null && typeof options === "object"
    ? Object.getPrototypeOf(options) : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RangeError("report options must be a plain object.");
  }
  const captured: { ingressMaxSamples?: number; lunationMaxSamples?: number; eclipses?: EclipseAdapter } = {};
  for (const key of Reflect.ownKeys(options)) {
    const slot = Object.getOwnPropertyDescriptor(options, key);
    if ((key !== "ingressMaxSamples" && key !== "lunationMaxSamples" && key !== "eclipses") ||
      !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError("report options accept only plain ingressMaxSamples, lunationMaxSamples and eclipses data properties.");
    }
    const value: unknown = slot.value;
    if (value !== undefined) {
      if (key === "eclipses") {
        captured.eclipses = captureEclipseAdapter(value);
        continue;
      }
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
        throw new RangeError("report sample budgets must be positive safe integers.");
      }
      captured[key] = value;
    }
  }
  return Object.freeze(captured);
}

/** Compose the existing searches without changing timing or chart conventions. */
export function searchMundaneReport(
  input: MundaneRequest, options: MundaneReportOptions = {}
): MundaneReportResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new RangeError("report request must be an object.");
  }
  for (const key of Reflect.ownKeys(input)) {
    if (key !== "place" && key !== "houseSystem" && key !== "year" && key !== "from" && key !== "to") {
      throw new RangeError("report request accepts only place, houseSystem, year, from and to.");
    }
  }
  const request = normalizeRequest(input);
  const budgets = captureOptions(options);
  // Both searches receive the same captured window and place, even when the
  // original input uses mutable Dates or getters. Each validates coverage.
  const selection = { ...request.range, place: request.place, houseSystem: request.houseSystem };
  const { request: _ingressRequest, ingresses, ...ingressSummary } = searchIngresses(
    selection, budgets.ingressMaxSamples === undefined ? {} : { maxSamples: budgets.ingressMaxSamples }
  );
  const { request: _lunationRequest, lunations, ...lunationSummary } = searchLunations(
    selection, budgets.lunationMaxSamples === undefined ? {} : { maxSamples: budgets.lunationMaxSamples }
  );
  const eclipseResult = budgets.eclipses === undefined ? undefined : searchEclipseCharts(selection, budgets.eclipses);
  const eclipseSummary = eclipseResult === undefined ? undefined : (() => {
    const { request: _request, eclipses: _charts, ...summary } = eclipseResult;
    return Object.freeze(summary);
  })();
  const metadata: ReportMetadata = {
    request,
    label: "traditional conventions, not predictions",
    search: Object.freeze({
      window: "(from,to]",
      completeness: eclipseResult === undefined ? "engine-sampled-search;not-proven" : "component-searches;see-searches",
      ordering: eclipseResult === undefined ? "instant;ingress-before-lunation;target-longitude-or-elongation" :
        "instant;ingress-before-lunation-before-eclipse;target-or-source-order"
    }),
    searches: Object.freeze({
      ingresses: Object.freeze(ingressSummary),
      lunations: Object.freeze(lunationSummary),
      ...(eclipseSummary === undefined ? {} : { eclipses: eclipseSummary })
    })
  };
  if (ingressSummary.status === "refused" || lunationSummary.status === "refused") {
    return Object.freeze({
      ...metadata, status: "refused", reason: "sample-budget", events: Object.freeze([]) as readonly []
    });
  }
  if (eclipseResult !== undefined && eclipseResult.status !== "complete") {
    return Object.freeze({ ...metadata, status: "refused",
      reason: eclipseResult.status === "unavailable" ? "eclipse-adapter-unavailable" : eclipseResult.reason,
      events: Object.freeze([]) as readonly [] });
  }
  const events: MundaneEvent[] = [...ingresses, ...lunations, ...(eclipseResult?.eclipses ?? [])];
  events.sort((a, b) => {
    const timeOrder = Date.parse(a.at) - Date.parse(b.at);
    if (timeOrder !== 0) return timeOrder;
    if (a.kind !== b.kind) {
      const rank = { "solar-ingress": 0, lunation: 1, eclipse: 2 };
      return rank[a.kind] - rank[b.kind];
    }
    if (a.kind === "eclipse" || b.kind === "eclipse") return 0;
    const targetA = a.kind === "solar-ingress" ? a.targetLongitude : a.targetElongation;
    const targetB = b.kind === "solar-ingress" ? b.targetLongitude : b.targetElongation;
    return targetA - targetB;
  });
  return Object.freeze({ ...metadata, status: "complete", events: Object.freeze(events) });
}
