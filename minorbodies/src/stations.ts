/** Zeroes of TT longitude speed, located by the engine's existing crossing solver. */
import { searchLongitudeCrossingsWith } from "../../src/crossings.js";
import type { CalcTime } from "../../src/calc.js";
import { isMinorBody } from "./catalog.ts";
import type { MinorBody } from "./catalog.ts";
import type { BodyAdapter, BodyAdapterPosition, BodyAdapterReceipt, BodyAdapterRefusal } from "./body-adapter.ts";
import type { DatasetReceipt, MinorBodyPosition } from "./ephemeris.ts";
import { readAdapterTime, resolveAdapterTime } from "./adapter-input.ts";
import type { AdapterTimeRequest, AdapterTimeReceipt } from "./adapter-input.ts";
import { readStationSourceIdentity } from "./engine-identity.ts";
import type { EngineSourceIdentity } from "./engine-identity.ts";

const DAY_MS = 86_400_000;
export const STATION_SEARCH_CONVENTIONS = Object.freeze({
  clock: "tt", interval: "from-exclusive;to-inclusive", solver: "engine-searchLongitudeCrossingsWith",
  mapping: "180+atan(longitudeSpeedDegPerDay/1)*180/pi", targetDegrees: 180,
  defaultStepDays: 1, maxStepDays: 5, defaultMaxSamples: 100_000,
  directionProbeMs: 60_000, solverBisections: 24, solverDeduplicationMs: 1000,
  grid: "solver-integer-ms-relative-to-exact-from-TT;final-sample-is-exact-to-TT;direction-probes-may-be-fractional-ms",
  sampleAccounting: "provider-calls;solver-and-direction-and-position;repeats-count",
  support: "all-position-samples-inside-request;no-extrapolation",
  completeness: "scan-completed;not-proven;assumes-smooth-speed-and-at-most-one-speed-extremum-in-two-steps"
} as const);

export interface StationSearchRequest {
  readonly body: MinorBody;
  readonly from: CalcTime;
  readonly to: CalcTime;
  readonly stepDays?: number;
  readonly maxSamples?: number;
}
export type StationDirection = "direct-to-retrograde" | "retrograde-to-direct";
export interface StationSearchReceipt {
  readonly schema: "minorbodies-station-search-v1";
  readonly implementation: EngineSourceIdentity;
  readonly adapterImplementation: EngineSourceIdentity;
  readonly body: string;
  readonly request: Readonly<{ from: AdapterTimeRequest; to: AdapterTimeRequest }>;
  readonly time: Readonly<{ from: AdapterTimeReceipt; to: AdapterTimeReceipt }> | null;
  readonly dataset: DatasetReceipt | null;
  readonly conventions: typeof STATION_SEARCH_CONVENTIONS;
  readonly settings: Readonly<{ stepDays: number; maxSamples: number | null }>;
  readonly samples: number;
  readonly evaluatedShardDigests: readonly string[];
  readonly rejectedTouches: number;
}
export interface StationSample {
  readonly jdTt: number;
  readonly longitudeSpeedDegPerDay: number;
  readonly receipt: BodyAdapterReceipt;
}
export interface StationEvent {
  readonly body: MinorBody;
  readonly jdTt: number;
  readonly direction: StationDirection;
  readonly position: MinorBodyPosition;
  readonly receipt: Readonly<{
    schema: "minorbodies-station-v1";
    search: StationSearchReceipt;
    position: BodyAdapterReceipt;
    before: StationSample;
    after: StationSample;
  }>;
}
export type StationSearchResult =
  | { readonly status: "complete"; readonly stations: readonly StationEvent[]; readonly samples: number;
      readonly receipt: StationSearchReceipt }
  | { readonly status: "refused"; readonly reason: string; readonly stations: readonly [];
      readonly samples: number; readonly maxSamples: number | null; readonly receipt: StationSearchReceipt;
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

function requestFields(input: StationSearchRequest): Record<string, unknown> {
  if (input === null || typeof input !== "object" ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new RangeError("Station search requires a plain request object.");
  }
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    const field = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== "string" || !["body", "from", "to", "stepDays", "maxSamples"].includes(key) ||
        !field || !("value" in field) || !field.enumerable) {
      throw new RangeError("Station search requires known own data fields.");
    }
    result[key] = field.value as unknown;
  }
  return result;
}

/** Explicit setup reads local source identities; all searches then run synchronously offline. */
export async function createStationSearcher(adapter: BodyAdapter) {
  const implementation = await readStationSourceIdentity();

  function searchStations(input: StationSearchRequest): StationSearchResult {
    const given = requestFields(input);
    const body = given.body;
    if (typeof body !== "string" || body.length < 1 || body.length > 80 || body.trim() !== body || /[\x00-\x1f\x7f]/.test(body)) {
      throw new RangeError("Station body must be an exact nonempty label.");
    }
    const request = Object.freeze({ from: readAdapterTime(given.from as CalcTime), to: readAdapterTime(given.to as CalcTime) });
    const stepDays = given.stepDays === undefined ? STATION_SEARCH_CONVENTIONS.defaultStepDays : given.stepDays;
    const maxSamples = given.maxSamples === undefined ? STATION_SEARCH_CONVENTIONS.defaultMaxSamples : given.maxSamples;
    if (typeof stepDays !== "number" || !Number.isFinite(stepDays) || stepDays * DAY_MS < 1 ||
        stepDays > STATION_SEARCH_CONVENTIONS.maxStepDays) throw new RangeError("Station step must be at least one millisecond and at most five TT days.");
    if (typeof maxSamples !== "number" || (maxSamples !== Infinity && (!Number.isSafeInteger(maxSamples) || maxSamples < 1))) {
      throw new RangeError("Station budget must be a positive safe integer or Infinity.");
    }
    const budget: number = maxSamples;
    const settings = Object.freeze({ stepDays, maxSamples: maxSamples === Infinity ? null : maxSamples });
    const dataset = adapter.datasets.find(item => item.sourceIdentity.body === body) ?? null;
    let time: StationSearchReceipt["time"] = null;
    let samples = 0;
    let rejectedTouches = 0;
    const shards = new Set<string>();
    const receipt = (): StationSearchReceipt => Object.freeze({ schema: "minorbodies-station-search-v1", implementation,
      adapterImplementation: adapter.implementation, body, request, time, dataset, conventions: STATION_SEARCH_CONVENTIONS,
      settings, samples, evaluatedShardDigests: Object.freeze([...shards].sort()), rejectedTouches });
    const refuse = (reason: string, refusal: BodyAdapterRefusal | null = null, candidateJdTt: number | null = null): StationSearchResult =>
      Object.freeze({ status: "refused", reason, stations: Object.freeze([]) as readonly [], samples,
        maxSamples: settings.maxSamples, receipt: receipt(), refusal, candidateJdTt });
    try { time = Object.freeze({ from: resolveAdapterTime(request.from), to: resolveAdapterTime(request.to) }); }
    catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return refuse("invalid-time");
    }
    const fromJd = time.from.jdTt;
    const toJd = time.to.jdTt;
    if (fromJd > toJd) throw new RangeError("Station search requires from <= to on TT.");
    if (!isMinorBody(body)) return refuse("unknown-body");
    if (!dataset) return refuse("body-unavailable");
    if (fromJd < dataset.coverage.startJdTt || toJd >= dataset.coverage.endJdTt) return refuse("outside-coverage");
    // Relative coordinates retain submillisecond input JDs. Only the final cell
    // may be shorter than a millisecond; that sample maps to the exact endpoint.
    const durationMs = Math.ceil((toJd - fromJd) * DAY_MS);
    const jdAt = (ms: number) => ms === durationMs ? toJd : Math.min(toJd, fromJd + ms / DAY_MS);
    type MinorCalculation = Extract<BodyAdapterPosition, { provider: "minorbodies" }>;
    function evaluate(ms: number): MinorCalculation {
      if (samples >= budget) throw new SearchStopped("sample-budget");
      samples++;
      const result = adapter.calcWithMinorBodies({ body: body as MinorBody, time: { jd: jdAt(ms), scale: "tt" } });
      if (result.status === "refused") throw new SearchStopped(result.reason, result);
      if (result.provider !== "minorbodies" || !Number.isFinite(result.result.longitudeSpeedDegPerDay)) {
        throw new SearchStopped("undefined-speed");
      }
      const shard = result.result.receipt.evaluatedShard;
      if (shard) shards.add(shard.sha256);
      return result;
    }
    const pending: Omit<StationEvent, "receipt">[] = [];
    const evidence: { position: BodyAdapterReceipt; before: StationSample; after: StationSample }[] = [];
    const sampleRecord = (calculation: MinorCalculation): StationSample => Object.freeze({ jdTt: calculation.result.jdTt,
      longitudeSpeedDegPerDay: calculation.result.longitudeSpeedDegPerDay, receipt: calculation.receipt });
    try {
      const found = searchLongitudeCrossingsWith((_body, date) => {
        const speed = evaluate(date.getTime()).result.longitudeSpeedDegPerDay;
        const angle = 180 + Math.atan(speed) * 180 / Math.PI;
        // Avoid treating arithmetic saturation/underflow as a sampled zero or
        // an offset on the far side of the circle that the solver would ignore.
        // The solver's signed-angle normalization adds 360 before its modulo;
        // that addition can erase an offset even when angle itself is not 180.
        if (angle <= 90 || angle >= 270 || ((angle - 180 + 360) % 360 === 0 && speed !== 0)) {
          throw new SearchStopped("speed-resolution");
        }
        return angle;
      }, body, 180, new Date(0), new Date(durationMs), { stepDays, maxSamples });
      if (found.status === "refused") return refuse("sample-budget");
      for (let index = 0; index < found.crossings.length; index++) {
        const atMs = found.crossings[index]!.at.getTime();
        // The original solver bisects submillisecond coordinates then truncates
        // Dates. Recheck half-open ownership on the reported grid point.
        if (atMs <= 0 || atMs > durationMs || jdAt(atMs) <= fromJd) continue;
        const previous = index === 0 ? 0 : found.crossings[index - 1]!.at.getTime();
        const next = index + 1 === found.crossings.length ? durationMs : found.crossings[index + 1]!.at.getTime();
        const beforeMs = atMs - Math.min(STATION_SEARCH_CONVENTIONS.directionProbeMs,
          index === 0 ? atMs : (atMs - previous) / 2);
        const afterMs = atMs + Math.min(STATION_SEARCH_CONVENTIONS.directionProbeMs,
          index + 1 === found.crossings.length ? durationMs - atMs : (next - atMs) / 2);
        const before = evaluate(beforeMs);
        const after = evaluate(afterMs);
        const left = Math.sign(before.result.longitudeSpeedDegPerDay);
        const right = Math.sign(after.result.longitudeSpeedDegPerDay);
        if (left === 0 || right === 0 || before.result.jdTt >= after.result.jdTt) {
          throw new SearchStopped("station-direction-unresolved", null, jdAt(atMs));
        }
        const position = evaluate(atMs);
        if (left === right) {
          // Same-side probes alone cannot establish a touch: a rounded candidate
          // can sit on one side of a real root near a boundary or another root.
          if (position.result.longitudeSpeedDegPerDay !== 0) {
            throw new SearchStopped("station-direction-unresolved", null, jdAt(atMs));
          }
          rejectedTouches++;
          continue;
        }
        pending.push(Object.freeze({ body, jdTt: position.result.jdTt,
          direction: left > 0 ? "direct-to-retrograde" : "retrograde-to-direct", position: position.result }));
        evidence.push({ position: position.receipt, before: sampleRecord(before), after: sampleRecord(after) });
      }
    } catch (error) {
      if (!(error instanceof SearchStopped)) throw error;
      return refuse(error.reason, error.refusal, error.candidateJdTt);
    }
    const searchReceipt = receipt();
    const stations = Object.freeze(pending.map((event, index): StationEvent => Object.freeze({ ...event,
      receipt: Object.freeze({ schema: "minorbodies-station-v1", search: searchReceipt, ...evidence[index]! }) })));
    return Object.freeze({ status: "complete", stations, samples, receipt: searchReceipt });
  }
  return Object.freeze({ implementation, searchStations });
}

export type StationSearcher = Awaited<ReturnType<typeof createStationSearcher>>;
