import { castEventChart } from "./chart.js";
import type { EventChart } from "./chart.js";
import { analyzeFactors } from "./factors.js";
import type { ChartFactorAnalysis } from "./factors.js";
import { normalizeRequest } from "./inputs.js";
import type { MundaneRequest, NormalizedRequest } from "./inputs.js";
import { captureEclipseAdapter, eclipseLabel, snapshotMetadata } from "./eclipse-adapter.js";
import type { EclipseAdapter, SuppliedEclipseInstant, SuppliedEclipseSearch } from "./eclipse-adapter.js";

export type EclipseChart = ChartFactorAnalysis & {
  readonly kind: "eclipse";
  readonly eclipseKind: "solar" | "lunar";
  readonly contactKind: string;
  readonly at: string;
  readonly supplied: SuppliedEclipseInstant;
  readonly chart: EventChart;
};

type SearchSummary = Omit<SuppliedEclipseSearch, "events" | "status">;
export type EclipseChartSearchResult = { readonly request: NormalizedRequest;
  readonly window: "(from,to]" } & (
  | { readonly status: "unavailable"; readonly reason: "not-installed" | "unsupported-api";
      readonly eclipses: readonly [] }
  | (SearchSummary & (
      | { readonly status: "complete"; readonly eclipses: readonly EclipseChart[] }
      | { readonly status: "refused"; readonly reason: "evaluation-budget" | "cancelled";
          readonly eclipses: readonly [] }
    ))
);

/** Delegate eclipse timing; do no eclipse geometry or contact solving here. */
export function searchEclipseCharts(input: MundaneRequest, suppliedAdapter: EclipseAdapter = {
  status: "unavailable", reason: "not-installed"
}): EclipseChartSearchResult {
  if (input === null || typeof input !== "object" || Array.isArray(input) ||
    Reflect.ownKeys(input).some(key => !["place", "houseSystem", "year", "from", "to"].includes(String(key)))) {
    throw new RangeError("eclipse request accepts only place, houseSystem, year, from and to.");
  }
  const request = normalizeRequest(input);
  const base = { request, window: "(from,to]" as const };
  const adapter = captureEclipseAdapter(suppliedAdapter);
  if (adapter.status === "unavailable") {
    return Object.freeze({ ...base, status: "unavailable", reason: adapter.reason,
      eclipses: Object.freeze([]) as readonly [] });
  }
  const window = Object.freeze({ startMs: Date.parse(request.range.from),
    endMs: Date.parse(request.range.to), clock: "utc" as const });
  // Capture the entire source result before chart casting can call other code.
  const result = snapshotMetadata(adapter.search(window)) as unknown as SuppliedEclipseSearch;
  if (!result || !Number.isSafeInteger(result.evaluations) || result.evaluations < 0 ||
    !Array.isArray(result.events) || !("provenance" in result)) {
    throw new RangeError("invalid eclipse search result.");
  }
  eclipseLabel(result.completeness);
  const metadata = { ...base, evaluations: result.evaluations,
    completeness: result.completeness, provenance: result.provenance };
  if (result.status === "refused") {
    if ((result.reason !== "evaluation-budget" && result.reason !== "cancelled") || result.events.length !== 0) {
      throw new RangeError("eclipse refusals must contain no partial events and a supported reason.");
    }
    return Object.freeze({ ...metadata, status: "refused", reason: result.reason,
      eclipses: Object.freeze([]) as readonly [] });
  }
  if (result.status !== "complete") throw new RangeError("invalid eclipse search status.");
  for (const contact of result.events) {
    if (!contact || (contact.eclipseKind !== "solar" && contact.eclipseKind !== "lunar") ||
      contact.clock !== "utc" || !Number.isSafeInteger(contact.atMs) ||
      contact.atMs < window.startMs || contact.atMs > window.endMs || !("provenance" in contact)) {
      throw new RangeError("eclipse instants require UTC integer milliseconds inside the supplied window.");
    }
    eclipseLabel(contact.contactKind);
  }
  // Inclusive opening samples can be supplied by a source. Apply our window
  // ownership, retaining distinct and coincident contact kinds in source order.
  const contacts = result.events.filter(contact => contact.atMs > window.startMs);
  contacts.sort((a, b) => a.atMs - b.atMs);
  const eclipses = contacts.map(supplied => {
    const at = new Date(supplied.atMs).toISOString();
    const chart = castEventChart({ at, place: request.place, houseSystem: request.houseSystem });
    return Object.freeze({ kind: "eclipse" as const, eclipseKind: supplied.eclipseKind,
      contactKind: supplied.contactKind, at, supplied, chart, ...analyzeFactors(chart) });
  });
  return Object.freeze({ ...metadata, status: "complete", eclipses: Object.freeze(eclipses) });
}
