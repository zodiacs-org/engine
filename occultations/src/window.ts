import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { APPULSE_BODIES, APPULSE_LIMITS, searchAppulses } from "./appulses.js";
import type { AppulseRequest, AppulseResult } from "./appulses.js";
import { starCatalogue } from "./catalogue.js";
import { CONJUNCTION_LIMITS, searchConjunctions } from "./conjunctions.js";
import type { ConjunctionRequest, ConjunctionResult } from "./conjunctions.js";
import { CONTACT_LIMITS, searchLunarContacts } from "./contacts.js";
import type { LunarContactRequest, LunarContactResult } from "./contacts.js";
import { SOLAR_SYSTEM_BODIES } from "./engine.js";
import type { PositionReceipt } from "./engine.js";
import { fields, normalizeObserver, normalizeWindow } from "./input.js";
import type { NormalizedWindow, Observer, TimeWindow } from "./input.js";
import { OCCULTATION_PLANETS } from "./occultation-radii.js";
import { OCCULTATION_LIMITS, searchLunarOccultations } from "./occultations.js";
import type { LunarOccultationRequest, LunarOccultationResult } from "./occultations.js";
import { OUTLINE_LIMITS, lunarVisibilityOutline } from "./outlines.js";
import type { LunarOutlineRequest, LunarOutlineResult } from "./outlines.js";

export type WindowQuery =
  | ({ readonly kind: "conjunction" } & Omit<ConjunctionRequest, "window">)
  | ({ readonly kind: "appulse" } & Omit<AppulseRequest, "window">)
  | ({ readonly kind: "lunar-occultations" } & Omit<LunarOccultationRequest, "window">)
  | ({ readonly kind: "lunar-contacts" } & Omit<LunarContactRequest, "window">)
  | ({ readonly kind: "visibility-outline" } & Omit<LunarOutlineRequest, "window">);

export interface WindowRequest {
  readonly window: TimeWindow;
  /** Explicit searches, evaluated in supplied order. No implicit pair expansion. */
  readonly queries: readonly WindowQuery[];
  /** Sum of the existing searches' sample units, including composite contact sky work. */
  readonly maxSamples?: number;
  /** Separate sum of outline polynomial intersections. */
  readonly maxIntersections?: number;
}
export const WINDOW_LIMITS = Object.freeze({
  maximumQueries: 32, defaultMaxSamples: 100_000, maximumMaxSamples: 200_000,
  defaultMaxIntersections: 2_000_000, maximumMaxIntersections: 2_000_000
});

type ChildResult = ConjunctionResult | AppulseResult | LunarOccultationResult | LunarContactResult | LunarOutlineResult;
type ChildReceipt = ChildResult["receipt"];
export type WindowEntry =
  | { readonly queryIndex: number; readonly kind: "conjunction"; readonly result: Extract<ConjunctionResult, { status: "complete" }> }
  | { readonly queryIndex: number; readonly kind: "appulse"; readonly result: Extract<AppulseResult, { status: "complete" }> }
  | { readonly queryIndex: number; readonly kind: "lunar-occultations"; readonly result: Extract<LunarOccultationResult, { status: "complete" }> }
  | { readonly queryIndex: number; readonly kind: "lunar-contacts"; readonly result: Extract<LunarContactResult, { status: "complete" }> }
  | { readonly queryIndex: number; readonly kind: "visibility-outline"; readonly result: Extract<LunarOutlineResult, { status: "complete" }> };

export interface WindowReceipt {
  readonly schema: "zodiacs.occultations.window-receipt.v1";
  readonly implementation: "explicit-window-searches/1";
  readonly engine: PositionReceipt["engine"];
  readonly request: { readonly window: NormalizedWindow; readonly queries: readonly WindowQuery[];
    readonly maxSamples: number; readonly maxIntersections: number };
  readonly work: {
    readonly samples: number;
    readonly intersections: number;
    readonly attemptedQueries: number;
    readonly completedQueries: number;
    readonly unresolvedMeridians: number;
    readonly sampleUnit: "sum-of-child-sample-units;not-uniform-cost-or-wall-time";
  };
  /** Retained on refusal for audit, without earlier event or outline lists. */
  readonly searches: readonly { readonly queryIndex: number; readonly kind: WindowQuery["kind"];
    readonly status: ChildResult["status"]; readonly reason: string | null; readonly receipt: ChildReceipt }[];
  readonly conventions: readonly string[];
  readonly limitations: readonly string[];
}

export type WindowResult = {
  readonly status: "complete";
  readonly results: readonly WindowEntry[];
  readonly receipt: WindowReceipt;
} | {
  readonly status: "refused";
  readonly reason: "sample-budget" | "intersection-budget" | "search-refused";
  readonly results: readonly [];
  readonly failure: { readonly queryIndex: number; readonly kind: WindowQuery["kind"];
    readonly reason: string; readonly receipt: ChildReceipt | null;
    readonly details: Extract<ChildResult, { status: "refused" }>["failure"] | null };
  readonly receipt: WindowReceipt;
};

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function integer(value: unknown, fallback: number, maximum: number, label: string): number {
  const n = value === undefined ? fallback : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1 || n > maximum) {
    throw new RangeError(`${label} must be a positive integer within its exported limits.`);
  }
  return n;
}
function number(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} must be finite and within its exported limits.`);
  }
  return value;
}
const contains = (list: readonly unknown[], value: unknown): boolean => list.includes(value);
const isStar = (value: unknown): boolean => typeof value === "string" && starCatalogue().stars.some((star) => star.id === value);

function denseArray(value: unknown, maximum: number, label: string): unknown[] {
  if (!Array.isArray(value)) throw new RangeError(`${label} must be a nonempty bounded array.`);
  const length = value.length;
  if (!Number.isSafeInteger(length) || length < 1 || length > maximum) {
    throw new RangeError(`${label} must be a nonempty bounded array.`);
  }
  const result: unknown[] = [];
  for (let i = 0; i < length; i += 1) {
    const slot = Object.getOwnPropertyDescriptor(value, i);
    if (!slot || !("value" in slot)) throw new RangeError(`${label} must contain ordinary own data slots.`);
    result.push(slot.value);
  }
  return result;
}

/** Validate and snapshot every query before any ephemeris work, even later queries. */
function normalizeQuery(value: WindowQuery): WindowQuery & { readonly maxSamples: number } {
  // Read discriminant and every field once. The union check below rejects irrelevant fields.
  const q = fields(value, "window query", ["kind", "first", "second", "coordinate", "target", "observer",
    "maximumSeparationDegrees", "stepDays", "stepSeconds", "longitudes", "maxSamples", "maxIntersections"]);
  const common = ["kind", "maxSamples"];
  let keys: string[];
  let limits: { defaultMaxSamples: number; maximumMaxSamples: number };
  switch (q.kind) {
    case "conjunction":
      keys = [...common, "first", "second", "coordinate", "stepDays"]; limits = CONJUNCTION_LIMITS; break;
    case "appulse":
      keys = [...common, "first", "second", "maximumSeparationDegrees", "stepDays"]; limits = APPULSE_LIMITS; break;
    case "lunar-occultations":
      keys = [...common, "target", "stepDays"]; limits = OCCULTATION_LIMITS; break;
    case "lunar-contacts":
      keys = [...common, "target", "observer", "stepDays"]; limits = CONTACT_LIMITS; break;
    case "visibility-outline":
      keys = [...common, "target", "stepSeconds", "longitudes", "maxIntersections"]; limits = OUTLINE_LIMITS; break;
    default: throw new RangeError("Unknown window query kind.");
  }
  if (Object.keys(q).some((key) => !keys.includes(key))) throw new RangeError("Field does not apply to this window query kind.");
  const maxSamples = integer(q.maxSamples, limits.defaultMaxSamples, limits.maximumMaxSamples, "query.maxSamples");
  if (q.kind === "conjunction" || q.kind === "appulse") {
    const bodies = q.kind === "conjunction" ? SOLAR_SYSTEM_BODIES : APPULSE_BODIES;
    if (!contains(bodies, q.first) || (!contains(bodies, q.second) && !(q.kind === "conjunction" && isStar(q.second))) ||
      q.first === q.second) throw new RangeError("A pair query requires distinct supported targets.");
    if (q.kind === "conjunction") {
      if (q.coordinate !== "right-ascension" && q.coordinate !== "ecliptic-longitude") {
        throw new RangeError("coordinate must be right-ascension or ecliptic-longitude.");
      }
    } else q.maximumSeparationDegrees = number(q.maximumSeparationDegrees, 0, 180, "maximumSeparationDegrees");
  } else {
    if (!contains(OCCULTATION_PLANETS, q.target) && !isStar(q.target)) {
      throw new RangeError("target must name an occultation planet or exact catalogue id.");
    }
    if (q.kind === "lunar-contacts") q.observer = normalizeObserver(q.observer as Observer);
  }
  if (q.kind === "visibility-outline") {
    q.stepSeconds = number(q.stepSeconds === undefined ? OUTLINE_LIMITS.defaultStepSeconds : q.stepSeconds,
      0.001, OUTLINE_LIMITS.maximumStepSeconds, "stepSeconds");
    q.maxIntersections = integer(q.maxIntersections, OUTLINE_LIMITS.defaultMaxIntersections,
      OUTLINE_LIMITS.maximumMaxIntersections, "query.maxIntersections");
    const raw = q.longitudes === undefined ? Array.from({ length: 360 / OUTLINE_LIMITS.defaultLongitudeStepDegrees },
      (_, i) => -180 + i * OUTLINE_LIMITS.defaultLongitudeStepDegrees) : q.longitudes;
    const longitudes = denseArray(raw, OUTLINE_LIMITS.maximumLongitudes, "longitudes").map((value) => {
      const longitude = number(value, -180, 180, "longitude");
      return longitude === 180 ? -180 : Object.is(longitude, -0) ? 0 : longitude;
    }).sort((a, b) => a - b);
    if (new Set(longitudes).size !== longitudes.length) throw new RangeError("longitudes must name distinct meridians.");
    q.longitudes = longitudes;
  } else {
    const stepLimits = q.kind === "conjunction" ? CONJUNCTION_LIMITS : q.kind === "appulse" ? APPULSE_LIMITS :
      q.kind === "lunar-occultations" ? OCCULTATION_LIMITS : CONTACT_LIMITS;
    q.stepDays = number(q.stepDays === undefined ? stepLimits.defaultStepDays : q.stepDays,
      1 / 86_400_000, stepLimits.maximumStepDays, "stepDays");
  }
  return freeze({ ...q, maxSamples }) as WindowQuery & { readonly maxSamples: number };
}

/** Offline searches over one window. Any child refusal discards all event lists. */
export function searchWindow(request: WindowRequest): WindowResult {
  const input = fields(request, "window request", ["window", "queries", "maxSamples", "maxIntersections"]);
  const window = normalizeWindow(input.window as TimeWindow);
  const maxSamples = integer(input.maxSamples, WINDOW_LIMITS.defaultMaxSamples, WINDOW_LIMITS.maximumMaxSamples, "maxSamples");
  const maxIntersections = integer(input.maxIntersections, WINDOW_LIMITS.defaultMaxIntersections,
    WINDOW_LIMITS.maximumMaxIntersections, "maxIntersections");
  const queries = Object.freeze(denseArray(input.queries, WINDOW_LIMITS.maximumQueries, "queries")
    .map((query) => normalizeQuery(query as WindowQuery)));
  const normalized = Object.freeze({ window, queries, maxSamples, maxIntersections });
  const searches: Array<WindowReceipt["searches"][number]> = [];
  const results: WindowEntry[] = [];
  let samples = 0, intersections = 0, unresolvedMeridians = 0;
  const receipt = (): WindowReceipt => freeze({
    schema: "zodiacs.occultations.window-receipt.v1", implementation: "explicit-window-searches/1",
    engine: { name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: { ...EPHEMERIS } }, request: normalized,
    work: { samples, intersections, attemptedQueries: searches.length, completedQueries: results.length,
      unresolvedMeridians, sampleUnit: "sum-of-child-sample-units;not-uniform-cost-or-wall-time" }, searches,
    conventions: ["queries:explicit;caller-order;duplicates-retained", "budgets:actual-child-work-debited;per-query-ceilings-retained",
      "results:all-or-nothing-on-refusal;prior-search-receipts-retained", "window-ownership:each-child-convention-preserved",
      "observer:only-explicit-contact-queries;outlines-remain-zero-height-global", "facts-only;no-ranking-or-date-selection"],
    limitations: ["complete-means-finished;not-completeness-or-physical-accuracy",
      "outline-meridians-may-remain-unresolved;inspect-each-status", "sample-units-have-different-costs;no-wall-time-guarantee",
      "no-added-accuracy-or-model-correction;all-child-limitations-apply", "receipts-are-provenance-not-attestations"]
  });
  const refused = (queryIndex: number, reason: Extract<WindowResult, { status: "refused" }>["reason"],
    child?: Extract<ChildResult, { status: "refused" }>): WindowResult => freeze({
      status: "refused", reason, results: [] as const,
      failure: { queryIndex, kind: queries[queryIndex]!.kind, reason: child?.reason ?? reason,
        receipt: child?.receipt ?? null, details: child?.failure ?? null }, receipt: receipt()
    });
  for (const [queryIndex, query] of queries.entries()) {
    if (samples >= maxSamples) return refused(queryIndex, "sample-budget");
    if (query.kind === "visibility-outline" && intersections >= maxIntersections) return refused(queryIndex, "intersection-budget");
    const allowedSamples = Math.min(query.maxSamples, maxSamples - samples);
    const { kind, ...options } = query;
    // Dispatching through the discriminant preserves each existing calculation and receipt.
    let child: ChildResult;
    switch (kind) {
      case "conjunction": child = searchConjunctions({ ...options, window, maxSamples: allowedSamples } as ConjunctionRequest); break;
      case "appulse": child = searchAppulses({ ...options, window, maxSamples: allowedSamples } as AppulseRequest); break;
      case "lunar-occultations": child = searchLunarOccultations({ ...options, window, maxSamples: allowedSamples } as LunarOccultationRequest); break;
      case "lunar-contacts": child = searchLunarContacts({ ...options, window, maxSamples: allowedSamples } as LunarContactRequest); break;
      case "visibility-outline": child = lunarVisibilityOutline({ ...options, window, maxSamples: allowedSamples,
        maxIntersections: Math.min(query.maxIntersections!, maxIntersections - intersections) } as LunarOutlineRequest); break;
    }
    samples += child.receipt.search.samples;
    if ("intersections" in child.receipt.search) intersections += child.receipt.search.intersections;
    searches.push({ queryIndex, kind, status: child.status, reason: child.status === "refused" ? child.reason : null, receipt: child.receipt });
    if (child.status === "refused") return refused(queryIndex, "search-refused", child);
    if ("meridians" in child) unresolvedMeridians += child.meridians.filter((row) => row.status === "unresolved").length;
    results.push({ queryIndex, kind, result: child } as WindowEntry);
  }
  return freeze({ status: "complete", results, receipt: receipt() });
}
