/** Retrograde episodes assembled from the existing station search and endpoint states. */
import type { MinorBody } from "./catalog.ts";
import type { BodyAdapter, BodyAdapterRefusal } from "./body-adapter.ts";
import { createStationSearcher, STATION_SEARCH_CONVENTIONS } from "./stations.ts";
import type { StationEvent, StationSample, StationSearchReceipt, StationSearchRequest } from "./stations.ts";
import { readRetrogradeSourceIdentity } from "./engine-identity.ts";
import type { EngineSourceIdentity } from "./engine-identity.ts";

export const RETROGRADE_WINDOW_CONVENTIONS = Object.freeze({
  clock: "tt", interval: "query-clipped-episode-extents;station-boundaries-approximate",
  episode: "negative-longitude-speed-between-reversals;isolated-zero-touches-do-not-split",
  clipping: "query-boundary-without-classified-station;outside-state-unknown",
  startingZero: "inward-nonzero-probe;no-outside-direction-inferred",
  endingZero: "refused-without-following-direction",
  initialProbeMaxMs: STATION_SEARCH_CONVENTIONS.directionProbeMs,
  sampleAccounting: "provider-calls;station-search-plus-endpoints-and-initial-probe;repeats-count",
  support: "all-position-samples-inside-request;no-extrapolation",
  completeness: STATION_SEARCH_CONVENTIONS.completeness
} as const);

export type RetrogradeWindowRequest = StationSearchRequest;
export interface RetrogradeWindowSearchReceipt {
  readonly schema: "minorbodies-retrograde-window-search-v1";
  readonly implementation: EngineSourceIdentity;
  readonly stationSearch: StationSearchReceipt;
  readonly conventions: typeof RETROGRADE_WINDOW_CONVENTIONS;
  readonly endpoints: Readonly<{ from: StationSample | null; to: StationSample | null }>;
  readonly initialProbe: StationSample | null;
  readonly samples: number;
  readonly evaluatedShardDigests: readonly string[];
}
export interface RetrogradeWindow {
  readonly body: MinorBody;
  readonly startJdTt: number;
  readonly endJdTt: number;
  readonly clippedStart: boolean;
  readonly clippedEnd: boolean;
  readonly receipt: Readonly<{
    schema: "minorbodies-retrograde-window-v1";
    search: RetrogradeWindowSearchReceipt;
    startStation: StationEvent | null;
    endStation: StationEvent | null;
  }>;
}
export type RetrogradeWindowSearchResult =
  | { readonly status: "complete"; readonly windows: readonly RetrogradeWindow[];
      readonly stations: readonly StationEvent[]; readonly samples: number; readonly receipt: RetrogradeWindowSearchReceipt }
  | { readonly status: "refused"; readonly reason: string; readonly windows: readonly []; readonly stations: readonly [];
      readonly samples: number; readonly maxSamples: number | null; readonly receipt: RetrogradeWindowSearchReceipt;
      readonly refusal: BodyAdapterRefusal | null; readonly candidateJdTt: number | null };

class WindowStopped {
  readonly reason: string;
  readonly refusal: BodyAdapterRefusal | null;
  readonly candidateJdTt: number | null;
  constructor(reason: string, refusal: BodyAdapterRefusal | null = null, candidateJdTt: number | null = null) {
    this.reason = reason;
    this.refusal = refusal;
    this.candidateJdTt = candidateJdTt;
  }
}

/** Setup captures local identities; calculation reuses the station solver synchronously offline. */
export async function createRetrogradeWindowSearcher(adapter: BodyAdapter) {
  const implementation = await readRetrogradeSourceIdentity();
  const stationSearcher = await createStationSearcher(adapter);

  function searchRetrogradeWindows(input: RetrogradeWindowRequest): RetrogradeWindowSearchResult {
    // Station validation snapshots caller fields and resolves clocks. Read only
    // its immutable receipt after this call, never the mutable caller request.
    const search = stationSearcher.searchStations(input);
    const base = search.receipt;
    const budget = base.settings.maxSamples ?? Infinity;
    let samples = search.samples;
    let from: StationSample | null = null;
    let to: StationSample | null = null;
    let initialProbe: StationSample | null = null;
    const shards = new Set(base.evaluatedShardDigests);
    const receipt = (): RetrogradeWindowSearchReceipt => Object.freeze({
      schema: "minorbodies-retrograde-window-search-v1", implementation, stationSearch: base,
      conventions: RETROGRADE_WINDOW_CONVENTIONS, endpoints: Object.freeze({ from, to }), initialProbe,
      samples, evaluatedShardDigests: Object.freeze([...shards].sort())
    });
    const refuse = (reason: string, refusal: BodyAdapterRefusal | null = null,
      candidateJdTt: number | null = null): RetrogradeWindowSearchResult => Object.freeze({
        status: "refused", reason, windows: Object.freeze([]) as readonly [], stations: Object.freeze([]) as readonly [],
        samples, maxSamples: base.settings.maxSamples, receipt: receipt(), refusal, candidateJdTt
      });
    if (search.status === "refused") return refuse(search.reason, search.refusal, search.candidateJdTt);
    const fromJd = base.time!.from.jdTt;
    const toJd = base.time!.to.jdTt;
    const body = base.body as MinorBody;
    const pending: { startJdTt: number; endJdTt: number; startStation: StationEvent | null; endStation: StationEvent | null }[] = [];
    function evaluate(jd: number): StationSample {
      if (samples >= budget) throw new WindowStopped("sample-budget");
      samples++;
      const result = adapter.calcWithMinorBodies({ body, time: { jd, scale: "tt" } });
      if (result.status === "refused") throw new WindowStopped(result.reason, result);
      if (result.provider !== "minorbodies" || !Number.isFinite(result.result.longitudeSpeedDegPerDay)) {
        throw new WindowStopped("undefined-speed");
      }
      const shard = result.result.receipt.evaluatedShard;
      if (shard) shards.add(shard.sha256);
      return Object.freeze({ jdTt: result.result.jdTt,
        longitudeSpeedDegPerDay: result.result.longitudeSpeedDegPerDay, receipt: result.receipt });
    }
    try {
      if (fromJd < toJd) {
        from = evaluate(fromJd);
        to = evaluate(toJd);
        let motion = Math.sign(from.longitudeSpeedDegPerDay);
        if (motion === 0) {
          const limit = search.stations[0]?.jdTt ?? toJd;
          const probeJd = fromJd + Math.min(RETROGRADE_WINDOW_CONVENTIONS.initialProbeMaxMs / 86_400_000,
            (limit - fromJd) / 2);
          if (!(probeJd > fromJd && probeJd < limit)) {
            throw new WindowStopped("retrograde-state-unresolved", null, fromJd);
          }
          initialProbe = evaluate(probeJd);
          motion = Math.sign(initialProbe.longitudeSpeedDegPerDay);
          if (motion === 0) throw new WindowStopped("retrograde-state-unresolved", null, probeJd);
        }
        if (to.longitudeSpeedDegPerDay === 0) throw new WindowStopped("retrograde-state-unresolved", null, toJd);
        let start = fromJd;
        let startStation: StationEvent | null = null;
        for (const station of search.stations) {
          const before = station.direction === "direct-to-retrograde" ? 1 : -1;
          if (motion !== before) throw new WindowStopped("retrograde-state-inconsistent", null, station.jdTt);
          if (motion < 0 && start < station.jdTt) {
            pending.push({ startJdTt: start, endJdTt: station.jdTt, startStation, endStation: station });
          }
          motion = -before;
          if (motion < 0) { start = station.jdTt; startStation = station; }
        }
        if (motion !== Math.sign(to.longitudeSpeedDegPerDay)) {
          throw new WindowStopped("retrograde-state-inconsistent", null, toJd);
        }
        if (motion < 0 && start < toJd) {
          pending.push({ startJdTt: start, endJdTt: toJd, startStation, endStation: null });
        }
      }
    } catch (error) {
      if (!(error instanceof WindowStopped)) throw error;
      return refuse(error.reason, error.refusal, error.candidateJdTt);
    }
    const finalReceipt = receipt();
    const windows = Object.freeze(pending.map((window): RetrogradeWindow => Object.freeze({
      body, startJdTt: window.startJdTt, endJdTt: window.endJdTt,
      clippedStart: window.startStation === null, clippedEnd: window.endStation === null,
      receipt: Object.freeze({ schema: "minorbodies-retrograde-window-v1", search: finalReceipt,
        startStation: window.startStation, endStation: window.endStation })
    })));
    return Object.freeze({ status: "complete", windows, stations: search.stations, samples, receipt: finalReceipt });
  }
  return Object.freeze({ implementation, searchRetrogradeWindows });
}

export type RetrogradeWindowSearcher = Awaited<ReturnType<typeof createRetrogradeWindowSearcher>>;
