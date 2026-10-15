import { searchIngresses } from "./ingresses.js";
import type { IngressSearchResult, SolarIngress } from "./ingresses.js";
import { normalizeRequest } from "./inputs.js";
import type { MundaneRequest, NormalizedRequest } from "./inputs.js";
import { searchLunations } from "./lunations.js";
import type { Lunation, LunationSearchResult } from "./lunations.js";

export interface MundaneReportOptions {
  /** Sun longitude evaluations, separate from the lunation budget. */
  readonly ingressMaxSamples?: number;
  /** Elongation evaluations, separate from the ingress budget. */
  readonly lunationMaxSamples?: number;
}

export type MundaneEvent = SolarIngress | Lunation;

// Distribute over the result union to preserve the refusal reason, while
// omitting charts and the repeated request from per-search metadata.
type SearchSummary<T> = T extends unknown ? Omit<T, "request" | "ingresses" | "lunations"> : never;

interface ReportMetadata {
  readonly request: NormalizedRequest;
  readonly label: "traditional conventions, not predictions";
  readonly search: {
    readonly window: "(from,to]";
    readonly completeness: "engine-sampled-search;not-proven";
    readonly ordering: "instant;ingress-before-lunation;target-longitude-or-elongation";
  };
  readonly searches: {
    readonly ingresses: SearchSummary<IngressSearchResult>;
    readonly lunations: SearchSummary<LunationSearchResult>;
  };
}

export type MundaneReportResult = ReportMetadata & (
  | { readonly status: "complete"; readonly events: readonly MundaneEvent[] }
  | { readonly status: "refused"; readonly reason: "sample-budget"; readonly events: readonly [] }
);

function captureOptions(options: MundaneReportOptions): MundaneReportOptions {
  const prototype: unknown = options !== null && typeof options === "object"
    ? Object.getPrototypeOf(options) : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RangeError("report options must be a plain object.");
  }
  const captured: { ingressMaxSamples?: number; lunationMaxSamples?: number } = {};
  for (const key of Reflect.ownKeys(options)) {
    const slot = Object.getOwnPropertyDescriptor(options, key);
    if ((key !== "ingressMaxSamples" && key !== "lunationMaxSamples") ||
      !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError("report options accept only plain ingressMaxSamples and lunationMaxSamples data properties.");
    }
    const value: unknown = slot.value;
    if (value !== undefined) {
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
  const metadata: ReportMetadata = {
    request,
    label: "traditional conventions, not predictions",
    search: Object.freeze({
      window: "(from,to]",
      completeness: "engine-sampled-search;not-proven",
      ordering: "instant;ingress-before-lunation;target-longitude-or-elongation"
    }),
    searches: Object.freeze({
      ingresses: Object.freeze(ingressSummary),
      lunations: Object.freeze(lunationSummary)
    })
  };
  if (ingressSummary.status === "refused" || lunationSummary.status === "refused") {
    return Object.freeze({
      ...metadata, status: "refused", reason: "sample-budget", events: Object.freeze([]) as readonly []
    });
  }
  const events: MundaneEvent[] = [...ingresses, ...lunations];
  events.sort((a, b) => {
    const timeOrder = Date.parse(a.at) - Date.parse(b.at);
    if (timeOrder !== 0) return timeOrder;
    if (a.kind !== b.kind) return a.kind === "solar-ingress" ? -1 : 1;
    const targetA = a.kind === "solar-ingress" ? a.targetLongitude : a.targetElongation;
    const targetB = b.kind === "solar-ingress" ? b.targetLongitude : b.targetElongation;
    return targetA - targetB;
  });
  return Object.freeze({ ...metadata, status: "complete", events: Object.freeze(events) });
}
