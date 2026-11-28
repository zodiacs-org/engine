/** Tropical sign transitions located by the engine's existing longitude solver. */
import { searchLongitudeCrossingsWith } from "../../src/crossings.js";
import { SIGN_SLUGS } from "../../src/signs.js";
import type { CalcTime } from "../../src/calc.js";
import type { ZodiacSign } from "../../src/types.js";
import { isMinorBody } from "./catalog.ts";
import type { MinorBody } from "./catalog.ts";
import type { BodyAdapter, BodyAdapterPosition, BodyAdapterReceipt, BodyAdapterRefusal } from "./body-adapter.ts";
import type { DatasetReceipt, MinorBodyPosition } from "./ephemeris.ts";
import { readAdapterTime, resolveAdapterTime } from "./adapter-input.ts";
import type { AdapterTimeRequest, AdapterTimeReceipt } from "./adapter-input.ts";
import { readIngressSourceIdentity } from "./engine-identity.ts";
import type { EngineSourceIdentity } from "./engine-identity.ts";

const DAY_MS = 86_400_000;
export const INGRESS_SEARCH_CONVENTIONS = Object.freeze({
  clock: "tt", interval: "from-exclusive;to-inclusive", solver: "engine-searchLongitudeCrossingsWith",
  zodiac: "tropical", frame: "ecliptic-true-of-date",
  targetDegrees: Object.freeze(SIGN_SLUGS.map((_, index) => index * 30)),
  signLabels: "engine-ZodiacSign-slugs;fromSign-and-toSign-describe-one-sided-motion",
  defaultStepDays: 1, maxStepDays: 5, defaultMaxSamples: 100_000,
  directionProbeMs: 60_000, solverBisections: 24, solverDeduplicationMs: 1000,
  deduplication: "per-longitude-target;different-boundaries-remain-distinct",
  grid: "solver-integer-ms-relative-to-exact-from-TT;final-sample-is-exact-to-TT;direction-probes-may-be-fractional-ms",
  sampleAccounting: "provider-calls;all-targets-and-direction-and-position;repeats-count",
  support: "all-position-samples-inside-request;no-extrapolation",
  completeness: "scan-completed;not-proven;assumes-smooth-longitude-and-at-most-one-station-in-two-steps"
} as const);

export interface IngressSearchRequest {
  readonly body: MinorBody;
  readonly from: CalcTime;
  readonly to: CalcTime;
  readonly stepDays?: number;
  readonly maxSamples?: number;
}
export type IngressDirection = "direct" | "retrograde";
export interface IngressSearchReceipt {
  readonly schema: "minorbodies-ingress-search-v1";
  readonly implementation: EngineSourceIdentity;
  readonly adapterImplementation: EngineSourceIdentity;
  readonly body: string;
  readonly request: Readonly<{ from: AdapterTimeRequest; to: AdapterTimeRequest }>;
  readonly time: Readonly<{ from: AdapterTimeReceipt; to: AdapterTimeReceipt }> | null;
  readonly dataset: DatasetReceipt | null;
  readonly conventions: typeof INGRESS_SEARCH_CONVENTIONS;
  readonly settings: Readonly<{ stepDays: number; maxSamples: number | null }>;
  readonly samples: number;
  readonly evaluatedShardDigests: readonly string[];
  readonly rejectedTouches: number;
}
export interface IngressSample {
  readonly jdTt: number;
  readonly longitudeDeg: number;
  readonly longitudeSpeedDegPerDay: number;
  readonly receipt: BodyAdapterReceipt;
}
export interface IngressEvent {
  readonly body: MinorBody;
  readonly jdTt: number;
  /** Exact sign boundary, distinct from the evaluated position at the approximate event time. */
  readonly longitudeDeg: number;
  readonly direction: IngressDirection;
  readonly fromSign: ZodiacSign;
  readonly toSign: ZodiacSign;
  readonly position: MinorBodyPosition;
  readonly receipt: Readonly<{
    schema: "minorbodies-ingress-v1";
    search: IngressSearchReceipt;
    position: BodyAdapterReceipt;
    before: IngressSample;
    after: IngressSample;
  }>;
}
export type IngressSearchResult =
  | { readonly status: "complete"; readonly ingresses: readonly IngressEvent[]; readonly samples: number;
      readonly receipt: IngressSearchReceipt }
  | { readonly status: "refused"; readonly reason: string; readonly ingresses: readonly [];
      readonly samples: number; readonly maxSamples: number | null; readonly receipt: IngressSearchReceipt;
      readonly refusal: BodyAdapterRefusal | null; readonly candidateJdTt: number | null };

class SearchStopped {
  readonly reason: string;
  readonly refusal: BodyAdapterRefusal | null;
  readonly candidateJdTt: number | null;
  constructor(reason: string, refusal: BodyAdapterRefusal | null = null, candidateJdTt: number | null = null) {
    this.reason = reason;
    this.refusal = refusal;
    this.candidateJdTt = candidateJdTt;
  }
}

function requestFields(input: IngressSearchRequest): Record<string, unknown> {
  if (input === null || typeof input !== "object" ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new RangeError("Ingress search requires a plain request object.");
  }
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    const field = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== "string" || !["body", "from", "to", "stepDays", "maxSamples"].includes(key) ||
        !field || !("value" in field) || !field.enumerable) {
      throw new RangeError("Ingress search requires known own data fields.");
    }
    result[key] = field.value as unknown;
  }
  return result;
}

// Match the engine's coarse-grid count, including multiplication rounding at
// an endpoint. This preflight does no ephemeris work or event enumeration.
function coarseSamples(durationMs: number, stepMs: number): number {
  if (durationMs === 0) return 0;
  let interior = Math.max(0, Math.ceil(durationMs / stepMs) - 1);
  while (interior > 0 && interior * stepMs >= durationMs) interior--;
  while ((interior + 1) * stepMs < durationMs) interior++;
  return interior + 2;
}

// The inputs are already in [0, 360). Avoid adding 360 to small differences:
// that operation can erase a real offset from a sign boundary at binary64 precision.
function offset(longitude: number, target: number): number {
  const delta = longitude - target;
  return delta > 180 ? delta - 360 : delta <= -180 ? delta + 360 : delta;
}

/** Capture source identities explicitly, then search synchronously using local datasets. */
export async function createIngressSearcher(adapter: BodyAdapter) {
  const implementation = await readIngressSourceIdentity();

  function searchIngresses(input: IngressSearchRequest): IngressSearchResult {
    const given = requestFields(input);
    const body = given.body;
    if (typeof body !== "string" || body.length < 1 || body.length > 80 || body.trim() !== body || /[\x00-\x1f\x7f]/.test(body)) {
      throw new RangeError("Ingress body must be an exact nonempty label.");
    }
    const request = Object.freeze({ from: readAdapterTime(given.from as CalcTime), to: readAdapterTime(given.to as CalcTime) });
    const stepDays = given.stepDays === undefined ? INGRESS_SEARCH_CONVENTIONS.defaultStepDays : given.stepDays;
    const maxSamples = given.maxSamples === undefined ? INGRESS_SEARCH_CONVENTIONS.defaultMaxSamples : given.maxSamples;
    if (typeof stepDays !== "number" || !Number.isFinite(stepDays) || stepDays * DAY_MS < 1 ||
        stepDays > INGRESS_SEARCH_CONVENTIONS.maxStepDays) throw new RangeError("Ingress step must be at least one millisecond and at most five TT days.");
    if (typeof maxSamples !== "number" || (maxSamples !== Infinity && (!Number.isSafeInteger(maxSamples) || maxSamples < 1))) {
      throw new RangeError("Ingress budget must be a positive safe integer or Infinity.");
    }
    const budget: number = maxSamples;
    const settings = Object.freeze({ stepDays, maxSamples: maxSamples === Infinity ? null : maxSamples });
    const dataset = adapter.datasets.find(item => item.sourceIdentity.body === body) ?? null;
    let time: IngressSearchReceipt["time"] = null;
    let samples = 0;
    let rejectedTouches = 0;
    const shards = new Set<string>();
    const receipt = (): IngressSearchReceipt => Object.freeze({ schema: "minorbodies-ingress-search-v1", implementation,
      adapterImplementation: adapter.implementation, body, request, time, dataset, conventions: INGRESS_SEARCH_CONVENTIONS,
      settings, samples, evaluatedShardDigests: Object.freeze([...shards].sort()), rejectedTouches });
    const refuse = (reason: string, refusal: BodyAdapterRefusal | null = null, candidateJdTt: number | null = null): IngressSearchResult =>
      Object.freeze({ status: "refused", reason, ingresses: Object.freeze([]) as readonly [], samples,
        maxSamples: settings.maxSamples, receipt: receipt(), refusal, candidateJdTt });
    try { time = Object.freeze({ from: resolveAdapterTime(request.from), to: resolveAdapterTime(request.to) }); }
    catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return refuse("invalid-time");
    }
    const fromJd = time.from.jdTt;
    const toJd = time.to.jdTt;
    if (fromJd > toJd) throw new RangeError("Ingress search requires from <= to on TT.");
    if (!isMinorBody(body)) return refuse("unknown-body");
    if (!dataset) return refuse("body-unavailable");
    if (fromJd < dataset.coverage.startJdTt || toJd >= dataset.coverage.endJdTt) return refuse("outside-coverage");
    const durationMs = Math.ceil((toJd - fromJd) * DAY_MS);
    if (coarseSamples(durationMs, stepDays * DAY_MS) * SIGN_SLUGS.length > budget) return refuse("sample-budget");
    const jdAt = (ms: number) => ms === durationMs ? toJd : Math.min(toJd, fromJd + ms / DAY_MS);
    type MinorCalculation = Extract<BodyAdapterPosition, { provider: "minorbodies" }>;
    function evaluate(ms: number): MinorCalculation {
      if (samples >= budget) throw new SearchStopped("sample-budget");
      samples++;
      const result = adapter.calcWithMinorBodies({ body: body as MinorBody, time: { jd: jdAt(ms), scale: "tt" } });
      if (result.status === "refused") throw new SearchStopped(result.reason, result);
      if (result.provider !== "minorbodies" || !Number.isFinite(result.result.longitudeDeg) ||
          result.result.longitudeDeg < 0 || result.result.longitudeDeg >= 360) throw new SearchStopped("undefined-longitude");
      if (!Number.isFinite(result.result.longitudeSpeedDegPerDay)) throw new SearchStopped("undefined-speed");
      const shard = result.result.receipt.evaluatedShard;
      if (shard) shards.add(shard.sha256);
      return result;
    }
    const pending: Omit<IngressEvent, "receipt">[] = [];
    const evidence: { position: BodyAdapterReceipt; before: IngressSample; after: IngressSample }[] = [];
    const sampleRecord = (calculation: MinorCalculation): IngressSample => Object.freeze({ jdTt: calculation.result.jdTt,
      longitudeDeg: calculation.result.longitudeDeg, longitudeSpeedDegPerDay: calculation.result.longitudeSpeedDegPerDay,
      receipt: calculation.receipt });
    try {
      const candidates: { atMs: number; target: number; signIndex: number }[] = [];
      for (const [signIndex, target] of INGRESS_SEARCH_CONVENTIONS.targetDegrees.entries()) {
        if (durationMs === 0) break;
        if (samples >= budget) throw new SearchStopped("sample-budget");
        const found = searchLongitudeCrossingsWith((_body, date) => {
          const longitude = evaluate(date.getTime()).result.longitudeDeg;
          // The engine's circular normalization can round a small nonzero
          // offset to zero. Refuse before it turns a crossing into a plateau.
          if ((((longitude - target) % 360) + 360) % 360 === 0 && offset(longitude, target) !== 0) {
            throw new SearchStopped("longitude-resolution");
          }
          return longitude;
        },
          body, target, new Date(0), new Date(durationMs), { stepDays, maxSamples: budget - samples });
        if (found.status === "refused") return refuse("sample-budget");
        for (const crossing of found.crossings) {
          const atMs = crossing.at.getTime();
          if (atMs > 0 && atMs <= durationMs && jdAt(atMs) > fromJd) candidates.push({ atMs, target, signIndex });
        }
      }
      candidates.sort((a, b) => a.atMs - b.atMs || a.target - b.target);
      for (let index = 0; index < candidates.length; index++) {
        const { atMs, target, signIndex } = candidates[index]!;
        const previous = index === 0 ? 0 : candidates[index - 1]!.atMs;
        const next = index + 1 === candidates.length ? durationMs : candidates[index + 1]!.atMs;
        const beforeMs = atMs - Math.min(INGRESS_SEARCH_CONVENTIONS.directionProbeMs,
          index === 0 ? atMs : (atMs - previous) / 2);
        const afterMs = atMs + Math.min(INGRESS_SEARCH_CONVENTIONS.directionProbeMs,
          index + 1 === candidates.length ? durationMs - atMs : (next - atMs) / 2);
        const before = evaluate(beforeMs);
        const after = evaluate(afterMs);
        const left = offset(before.result.longitudeDeg, target);
        const right = offset(after.result.longitudeDeg, target);
        if (left === 0 || right === 0 || Math.abs(left) >= 30 || Math.abs(right) >= 30 ||
            before.result.jdTt >= after.result.jdTt) {
          throw new SearchStopped("ingress-direction-unresolved", null, jdAt(atMs));
        }
        const position = evaluate(atMs);
        if (Math.sign(left) === Math.sign(right)) {
          // An approximate extremum or a rounded boundary candidate is not
          // evidence of a touch. Require the actual unnormalized value and speed.
          if (position.result.longitudeDeg !== target || position.result.longitudeSpeedDegPerDay !== 0) {
            throw new SearchStopped("ingress-direction-unresolved", null, jdAt(atMs));
          }
          rejectedTouches++;
          continue;
        }
        const direct = left < 0;
        const lowerSign = SIGN_SLUGS[(signIndex + SIGN_SLUGS.length - 1) % SIGN_SLUGS.length]!;
        const upperSign = SIGN_SLUGS[signIndex]!;
        pending.push(Object.freeze({ body, jdTt: position.result.jdTt, longitudeDeg: target,
          direction: direct ? "direct" : "retrograde", fromSign: direct ? lowerSign : upperSign,
          toSign: direct ? upperSign : lowerSign, position: position.result }));
        evidence.push({ position: position.receipt, before: sampleRecord(before), after: sampleRecord(after) });
      }
    } catch (error) {
      if (!(error instanceof SearchStopped)) throw error;
      return refuse(error.reason, error.refusal, error.candidateJdTt);
    }
    const searchReceipt = receipt();
    const ingresses = Object.freeze(pending.map((event, index): IngressEvent => Object.freeze({ ...event,
      receipt: Object.freeze({ schema: "minorbodies-ingress-v1", search: searchReceipt, ...evidence[index]! }) })));
    return Object.freeze({ status: "complete", ingresses, samples, receipt: searchReceipt });
  }
  return Object.freeze({ implementation, searchIngresses });
}

export type IngressSearcher = Awaited<ReturnType<typeof createIngressSearcher>>;
