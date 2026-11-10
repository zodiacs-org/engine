import { describe, expect, it, vi } from "vitest";
import { timeBasis } from "../../src/time-scale.js";
import { createBodyAdapter } from "../src/body-adapter.ts";
import { ENGINE_BRIDGE_SETTINGS } from "../src/engine-bridge.ts";
import type { EngineSourceIdentity } from "../src/engine-identity.ts";
import { POSITION_CONVENTIONS } from "../src/ephemeris.ts";
import type { DatasetReceipt, MinorBodyEphemeris, PositionReceipt } from "../src/ephemeris.ts";
import { createRetrogradeWindowSearcher, RETROGRADE_WINDOW_CONVENTIONS } from "../src/retrogrades.ts";
import type { RetrogradeWindowRequest, RetrogradeWindowSearchResult } from "../src/retrogrades.ts";

// These invented rates have independently known sign intervals. They test the
// wrapper's mechanics, not agreement with JPL or astronomical event accuracy.
const JD = 2451545;
const DAY_MS = 86_400_000;
const DIGEST = "0".repeat(64);
const OTHER_DIGEST = "1".repeat(64);
const implementation: EngineSourceIdentity = Object.freeze({ schema: "minorbodies-engine-source-v1",
  packageVersion: "0.0.0", nodeVersion: process.version, files: Object.freeze([]), sha256: DIGEST });
const request = { body: "Chiron", from: { jd: JD, scale: "tt" }, to: { jd: JD + 2, scale: "tt" },
  stepDays: 0.5 } as const satisfies RetrogradeWindowRequest;

interface SyntheticOptions {
  start?: number;
  end?: number;
  refuseAtCall?: number;
  rateAtCall?: (days: number, call: number) => number;
  shardAtCall?: (call: number) => string;
  onCall?: () => void;
}

async function synthetic(speed: (days: number) => number, options: SyntheticOptions = {}) {
  const calls: number[] = [];
  const dataset: DatasetReceipt = Object.freeze({ sourceManifestSha256: DIGEST, generatorSha256: DIGEST,
    sourceIdentity: Object.freeze({ body: "Chiron", targetNumber: 2060, targetName: "synthetic Chiron test label",
      targetSource: "synthetic analytic test", orbitSolutionDate: "synthetic", orbitEpochJdTdb: JD,
      initialPositionAu: Object.freeze([1, 0, 0] as const), initialVelocityAuPerDay: Object.freeze([0, 0, 0] as const),
      centerName: "Earth (399)", centerSource: "synthetic", smallPerturbersSource: "synthetic", eopFile: "synthetic" }),
    coverage: Object.freeze({ startJdTt: options.start ?? JD - 2, endJdTt: options.end ?? JD + 20,
      interval: "start-inclusive;end-exclusive" }), validation: "accuracy-not-certified-by-loader",
    shardDigests: Object.freeze([DIGEST, OTHER_DIGEST]) });
  const provider: MinorBodyEphemeris = Object.freeze({ dataset, engineSource: implementation,
    calculate(body, time) {
      if (!("jd" in time) || time.scale !== "tt") throw new Error("Window samples must use explicit TT.");
      calls.push(time.jd);
      options.onCall?.();
      const receipt: PositionReceipt = Object.freeze({ schema: "minorbodies-position-receipt-v1",
        implementation: "minorbodies-position-v1", body, conventions: POSITION_CONVENTIONS,
        engineBridge: ENGINE_BRIDGE_SETTINGS, engineSource: implementation, dataset,
        time: Object.freeze({ request: Object.freeze({ jd: time.jd, scale: "tt" }), jdTt: time.jd,
          source: "explicit-tt", engineTimeBasis: null }),
        evaluatedShard: Object.freeze({ sha256: options.shardAtCall?.(calls.length) ?? DIGEST, segmentIndex: 0 }) });
      if (options.refuseAtCall === calls.length) return Object.freeze({ status: "refused", reason: "undefined-position", receipt });
      const rate = options.rateAtCall?.(time.jd - JD, calls.length) ?? speed(time.jd - JD);
      return Object.freeze({ status: "ok", body, jdTt: time.jd, longitudeDeg: 123, latitudeDeg: 0, distanceAu: 1,
        longitudeSpeedDegPerDay: rate, latitudeSpeedDegPerDay: 0, distanceSpeedAuPerDay: 0,
        retrograde: rate < 0, receipt });
    } });
  const adapter = await createBodyAdapter([provider]);
  const searcher = await createRetrogradeWindowSearcher(adapter);
  return { ...searcher, dataset, calls };
}

function completed(result: RetrogradeWindowSearchResult) {
  expect(result.status, result.status === "refused" ? result.reason : undefined).toBe("complete");
  if (result.status !== "complete") throw new Error(`Window search refused: ${result.reason}`);
  return result;
}

function frozenTree(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  expect(value).not.toBeInstanceOf(Date);
  for (const child of Object.values(value)) frozenTree(child);
}

const closedEpisode = (days: number) => (days - 0.5) * (days - 1.5);

describe("retrograde episodes from station directions and endpoint signs", () => {
  it("bounds an entire episode by its two classified stations and shares the final receipt", async () => {
    const searcher = await synthetic(closedEpisode);
    const result = completed(searcher.searchRetrogradeWindows(request));
    expect(result.stations.map(event => event.direction)).toEqual(["direct-to-retrograde", "retrograde-to-direct"]);
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]).toMatchObject({ body: "Chiron", startJdTt: JD + 0.5, endJdTt: JD + 1.5,
      clippedStart: false, clippedEnd: false });
    const window = result.windows[0]!;
    expect(window.receipt.startStation).toBe(result.stations[0]);
    expect(window.receipt.endStation).toBe(result.stations[1]);
    expect(window.receipt.search).toBe(result.receipt);
    expect(window.receipt.startStation?.receipt.search).toBe(result.receipt.stationSearch);
    expect(window.receipt.endStation?.receipt.search).toBe(result.receipt.stationSearch);
    expect(result.receipt.endpoints.from).toMatchObject({ jdTt: JD, longitudeSpeedDegPerDay: 0.75 });
    expect(result.receipt.endpoints.to).toMatchObject({ jdTt: JD + 2, longitudeSpeedDegPerDay: 0.75 });
    expect(result.receipt.initialProbe).toBeNull();
    expect(result.samples).toBe(searcher.calls.length);
    expect(result.samples).toBe(result.receipt.stationSearch.samples + 2);
    expect(result.receipt.samples).toBe(result.samples);
    frozenTree(result);
  });

  it("returns separate episodes on either side of a direct interval with only query edges clipped", async () => {
    const searcher = await synthetic(days => -closedEpisode(days));
    const result = completed(searcher.searchRetrogradeWindows(request));
    expect(result.windows).toMatchObject([
      { startJdTt: JD, endJdTt: JD + 0.5, clippedStart: true, clippedEnd: false },
      { startJdTt: JD + 1.5, endJdTt: JD + 2, clippedStart: false, clippedEnd: true }
    ]);
    expect(result.windows[0]!.receipt.startStation).toBeNull();
    expect(result.windows[0]!.receipt.endStation).toBe(result.stations[0]);
    expect(result.windows[1]!.receipt.startStation).toBe(result.stations[1]);
    expect(result.windows[1]!.receipt.endStation).toBeNull();
  });

  it.each([-1, 1])("uses endpoint states when a constant rate %s has no stations", async rate => {
    const searcher = await synthetic(() => rate);
    const result = completed(searcher.searchRetrogradeWindows(request));
    expect(result.stations).toEqual([]);
    if (rate > 0) expect(result.windows).toEqual([]);
    else expect(result.windows).toMatchObject([{ startJdTt: JD, endJdTt: JD + 2,
      clippedStart: true, clippedEnd: true, receipt: { startStation: null, endStation: null } }]);
  });

  it.each([-1, 1])("does not split an episode at an isolated zero-speed touch (%s)", async side => {
    const searcher = await synthetic(days => side * (days - 1) ** 2);
    const result = completed(searcher.searchRetrogradeWindows(request));
    expect(result.stations).toEqual([]);
    expect(result.receipt.stationSearch.rejectedTouches).toBe(1);
    if (side < 0) expect(result.windows).toMatchObject([{ startJdTt: JD, endJdTt: JD + 2,
      clippedStart: true, clippedEnd: true }]);
    else expect(result.windows).toEqual([]);
    expect(result.receipt.conventions.episode).toBe("negative-longitude-speed-between-reversals;isolated-zero-touches-do-not-split");
  });

  it("joins adjacent query-clipped portions without losing or duplicating classified stations", async () => {
    const searcher = await synthetic(closedEpisode);
    const whole = completed(searcher.searchRetrogradeWindows(request));
    const left = completed(searcher.searchRetrogradeWindows({ ...request, to: { jd: JD + 1, scale: "tt" } }));
    const right = completed(searcher.searchRetrogradeWindows({ ...request, from: { jd: JD + 1, scale: "tt" } }));
    expect(left.windows).toMatchObject([{ startJdTt: whole.windows[0]!.startJdTt, endJdTt: JD + 1,
      clippedStart: false, clippedEnd: true }]);
    expect(right.windows).toMatchObject([{ startJdTt: JD + 1, endJdTt: whole.windows[0]!.endJdTt,
      clippedStart: true, clippedEnd: false }]);
    expect([...left.stations, ...right.stations].map(event => [event.jdTt, event.direction]))
      .toEqual(whole.stations.map(event => [event.jdTt, event.direction]));
  });

  it("preserves an exact adjacent station boundary as a refusal on the left and a clipped edge on the right", async () => {
    const searcher = await synthetic(closedEpisode);
    const left = searcher.searchRetrogradeWindows({ ...request, to: { jd: JD + 0.5, scale: "tt" } });
    expect(left).toMatchObject({ status: "refused", reason: "station-direction-unresolved", windows: [], stations: [],
      candidateJdTt: JD + 0.5 });
    const right = completed(searcher.searchRetrogradeWindows({ ...request, from: { jd: JD + 0.5, scale: "tt" } }));
    expect(right.windows).toMatchObject([{ startJdTt: JD + 0.5, endJdTt: JD + 1.5,
      clippedStart: true, clippedEnd: false, receipt: { startStation: null } }]);
    expect(right.stations).toHaveLength(1);
    expect(Math.abs(right.receipt.endpoints.from!.longitudeSpeedDegPerDay)).toBe(0);
    expect(right.receipt.initialProbe?.longitudeSpeedDegPerDay).toBeLessThan(0);
  });
});

describe("query endpoint zeros and empty intervals", () => {
  it.each([
    { sign: -1, power: 1 }, { sign: 1, power: 1 }, { sign: -1, power: 2 }, { sign: 1, power: 2 }
  ])("classifies the inside of a zero at from without inferring an outside station ($sign, $power)", async ({ sign, power }) => {
    const searcher = await synthetic(days => sign * days ** power);
    const result = completed(searcher.searchRetrogradeWindows(request));
    expect(result.stations).toEqual([]);
    expect(result.receipt.initialProbe!.jdTt).toBeGreaterThan(JD);
    expect(result.receipt.initialProbe!.jdTt).toBeLessThan(JD + 2);
    expect((result.receipt.initialProbe!.jdTt - JD) * DAY_MS).toBeLessThanOrEqual(60_001);
    expect(Math.sign(result.receipt.initialProbe!.longitudeSpeedDegPerDay)).toBe(sign);
    expect(result.samples).toBe(result.receipt.stationSearch.samples + 3);
    if (sign < 0) expect(result.windows).toMatchObject([{ startJdTt: JD, endJdTt: JD + 2,
      clippedStart: true, clippedEnd: true, receipt: { startStation: null } }]);
    else expect(result.windows).toEqual([]);
    expect(searcher.calls.every(jd => jd >= JD && jd <= JD + 2)).toBe(true);
  });

  it("keeps the inward zero probe before a nearby first station", async () => {
    const root = JD + 90_000 / DAY_MS;
    const speed = (days: number) => 100_000 * days * ((JD + days) - root);
    const searcher = await synthetic(speed);
    const result = completed(searcher.searchRetrogradeWindows({ ...request,
      to: { jd: JD + 180_000 / DAY_MS, scale: "tt" }, stepDays: 10_000 / DAY_MS }));
    expect(result.stations).toHaveLength(1);
    expect(result.windows).toHaveLength(1);
    expect(result.receipt.initialProbe!.jdTt).toBeGreaterThan(JD);
    expect(result.receipt.initialProbe!.jdTt).toBeLessThan(result.stations[0]!.jdTt);
    expect(result.receipt.initialProbe!.longitudeSpeedDegPerDay).toBeLessThan(0);
    expect(result.windows[0]).toMatchObject({ clippedStart: true, clippedEnd: false });
  });

  it("propagates a station at to without taking a sample outside the query", async () => {
    const searcher = await synthetic(days => days - 2);
    const result = searcher.searchRetrogradeWindows(request);
    expect(result).toMatchObject({ status: "refused", reason: "station-direction-unresolved", windows: [], stations: [],
      candidateJdTt: JD + 2, receipt: { endpoints: { from: null, to: null }, initialProbe: null } });
    expect(result.samples).toBe(result.receipt.stationSearch.samples);
    expect(result.samples).toBe(searcher.calls.length);
    expect(searcher.calls.every(jd => jd >= JD && jd <= JD + 2)).toBe(true);
  });

  it("refuses a zero-speed plateau instead of declaring an episode or assuming motion", async () => {
    const searcher = await synthetic(() => 0);
    const result = searcher.searchRetrogradeWindows(request);
    expect(result).toMatchObject({ status: "refused", reason: "retrograde-state-unresolved", windows: [], stations: [] });
    expect(result.receipt.initialProbe?.longitudeSpeedDegPerDay).toBe(0);
    expect(result.samples).toBe(result.receipt.stationSearch.samples + 3);
    frozenTree(result);
  });

  it("returns no episode or endpoint calculations for an empty covered interval", async () => {
    const searcher = await synthetic(() => { throw new Error("Empty interval must not evaluate."); });
    const result = completed(searcher.searchRetrogradeWindows({ ...request, to: request.from }));
    expect(result).toMatchObject({ windows: [], stations: [], samples: 0,
      receipt: { endpoints: { from: null, to: null }, initialProbe: null } });
    expect(searcher.calls).toEqual([]);
    frozenTree(result);
  });

  it("retains exact fractional endpoints in a submillisecond episode", async () => {
    const from = JD + 0.123456789;
    const to = from + 0.25 / DAY_MS;
    const searcher = await synthetic(() => -1);
    const result = completed(searcher.searchRetrogradeWindows({ ...request,
      from: { jd: from, scale: "tt" }, to: { jd: to, scale: "tt" } }));
    expect(result.windows).toMatchObject([{ startJdTt: from, endJdTt: to, clippedStart: true, clippedEnd: true }]);
    expect(result.receipt.endpoints.from?.jdTt).toBe(from);
    expect(result.receipt.endpoints.to?.jdTt).toBe(to);
    expect(searcher.calls.every(jd => jd >= from && jd <= to)).toBe(true);
  });

  it.each([-1, 1])("does not emit a zero-duration episode for a station rounded onto to (%s)", async slope => {
    const to = JD + 10;
    const root = to - 0.25 / DAY_MS;
    const searcher = await synthetic(days => slope * ((JD + days) - root));
    const result = completed(searcher.searchRetrogradeWindows({ ...request, to: { jd: to, scale: "tt" }, stepDays: 5 }));
    expect(result.stations).toHaveLength(1);
    expect(result.stations[0]!.jdTt).toBe(to);
    expect(result.stations[0]!.direction).toBe(slope < 0 ? "direct-to-retrograde" : "retrograde-to-direct");
    if (slope < 0) expect(result.windows).toEqual([]);
    else expect(result.windows).toMatchObject([{ startJdTt: JD, endJdTt: to, clippedStart: true, clippedEnd: false }]);
    expect(result.windows.every(window => window.startJdTt < window.endJdTt)).toBe(true);
    expect(searcher.calls.every(jd => jd >= JD && jd <= to)).toBe(true);
  });

  it("refuses when no distinct representable inward probe exists", async () => {
    // At this JD adjacent binary64 values are 2^-31 days apart. There is no
    // representable JD strictly between these endpoints.
    const to = JD + 2 ** -31;
    const searcher = await synthetic(days => days === 0 ? 0 : -1);
    const result = searcher.searchRetrogradeWindows({ ...request, to: { jd: to, scale: "tt" } });
    expect(result).toMatchObject({ status: "refused", reason: "retrograde-state-unresolved", windows: [], stations: [],
      candidateJdTt: JD, receipt: { initialProbe: null } });
    expect(searcher.calls.every(jd => jd === JD || jd === to)).toBe(true);
  });
});

describe("shared station and endpoint budgets", () => {
  it("keeps the station solver's coarse preflight and returns no partial work", async () => {
    const searcher = await synthetic(() => { throw new Error("Coarse budget refusal must not evaluate."); });
    const result = searcher.searchRetrogradeWindows({ ...request, maxSamples: 4 });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", windows: [], stations: [], samples: 0,
      maxSamples: 4, receipt: { endpoints: { from: null, to: null } } });
    expect(searcher.calls).toEqual([]);
  });

  it("charges repeated endpoint calls after every station call and refuses atomically", async () => {
    const baseline = await synthetic(closedEpisode);
    const full = completed(baseline.searchRetrogradeWindows(request));
    const stationSamples = full.receipt.stationSearch.samples;
    expect(full.samples).toBe(stationSamples + 2);
    expect(baseline.calls.slice(-2)).toEqual([JD, JD + 2]);
    for (const budget of [stationSamples, stationSamples + 1]) {
      const searcher = await synthetic(closedEpisode);
      const result = searcher.searchRetrogradeWindows({ ...request, maxSamples: budget });
      expect(result).toMatchObject({ status: "refused", reason: "sample-budget", windows: [], stations: [], samples: budget });
      expect(result.receipt.stationSearch.samples).toBe(stationSamples);
      expect(result.receipt.samples).toBe(budget);
      expect(searcher.calls).toHaveLength(budget);
    }
    const exactBudget = await synthetic(closedEpisode);
    expect(completed(exactBudget.searchRetrogradeWindows({ ...request, maxSamples: full.samples })).windows).toHaveLength(1);
  });

  it("charges the extra inward probe to that same budget", async () => {
    const baseline = await synthetic(days => -days);
    const full = completed(baseline.searchRetrogradeWindows(request));
    expect(full.samples).toBe(full.receipt.stationSearch.samples + 3);
    const searcher = await synthetic(days => -days);
    const result = searcher.searchRetrogradeWindows({ ...request, maxSamples: full.samples - 1 });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", windows: [], stations: [],
      samples: full.samples - 1, receipt: { initialProbe: null } });
    expect(result.receipt.endpoints.from).not.toBeNull();
    expect(result.receipt.endpoints.to).not.toBeNull();
    expect(searcher.calls).toHaveLength(full.samples - 1);
  });

  it("propagates an incomplete station search without performing endpoint work", async () => {
    const searcher = await synthetic(days => days - 0.7);
    const result = searcher.searchRetrogradeWindows({ ...request, maxSamples: 6 });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", windows: [], stations: [], samples: 6,
      receipt: { endpoints: { from: null, to: null }, initialProbe: null } });
    expect(result.samples).toBe(result.receipt.stationSearch.samples);
    expect(searcher.calls).toHaveLength(6);
  });

  it("records unlimited work as JSON null and makes no network request", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Search must remain offline."));
    try {
      const searcher = await synthetic(() => -1);
      const result = completed(searcher.searchRetrogradeWindows({ ...request, maxSamples: Infinity }));
      expect(result.receipt.stationSearch.settings.maxSamples).toBeNull();
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
});

describe("provider failures and inconsistent motion", () => {
  it("retains an original provider refusal during stations, either endpoint or the initial probe", async () => {
    const baseline = await synthetic(closedEpisode);
    const full = completed(baseline.searchRetrogradeWindows(request));
    for (const call of [full.receipt.stationSearch.samples, full.samples - 1, full.samples]) {
      const searcher = await synthetic(closedEpisode, { refuseAtCall: call });
      const result = searcher.searchRetrogradeWindows(request);
      expect(result).toMatchObject({ status: "refused", reason: "undefined-position", windows: [], stations: [],
        samples: call, refusal: { status: "refused", reason: "undefined-position", receipt: { provider: "minorbodies" } } });
      expect(searcher.calls).toHaveLength(call);
      frozenTree(result);
    }
    const zeroStart = await synthetic(days => -days);
    const withProbe = completed(zeroStart.searchRetrogradeWindows(request));
    const probeFailure = await synthetic(days => -days, { refuseAtCall: withProbe.samples });
    expect(probeFailure.searchRetrogradeWindows(request)).toMatchObject({ status: "refused", reason: "undefined-position",
      windows: [], stations: [], samples: withProbe.samples, receipt: { initialProbe: null } });
  });

  it.each([NaN, Infinity, -Infinity])("refuses nonfinite endpoint speed %s after a completed station scan", async invalid => {
    const baseline = await synthetic(() => -1);
    const full = completed(baseline.searchRetrogradeWindows(request));
    const stationSamples = full.receipt.stationSearch.samples;
    const searcher = await synthetic(() => -1, { rateAtCall: (_days, call) => call === stationSamples + 1 ? invalid : -1 });
    expect(searcher.searchRetrogradeWindows(request)).toMatchObject({ status: "refused", reason: "undefined-speed",
      windows: [], stations: [], samples: stationSamples + 1 });
  });

  it.each(["from", "to"] as const)("refuses a %s state inconsistent with the classified station sequence", async endpoint => {
    const baseline = await synthetic(closedEpisode);
    const full = completed(baseline.searchRetrogradeWindows(request));
    const changedCall = full.receipt.stationSearch.samples + (endpoint === "from" ? 1 : 2);
    // An injected provider is trusted executable code. Changing just its later
    // endpoint answer tests that the window wrapper checks the sequence itself.
    const searcher = await synthetic(closedEpisode, {
      rateAtCall: (days, call) => call === changedCall ? -closedEpisode(days) : closedEpisode(days)
    });
    const result = searcher.searchRetrogradeWindows(request);
    expect(result).toMatchObject({ status: "refused", reason: "retrograde-state-inconsistent", windows: [], stations: [],
      candidateJdTt: endpoint === "from" ? JD + 0.5 : JD + 2 });
    expect(result.samples).toBe(full.samples);
    expect(result.receipt.stationSearch.samples).toBe(full.receipt.stationSearch.samples);
    frozenTree(result);
  });

  it("refuses an inconsistent endpoint pair even when no station was found", async () => {
    const baseline = await synthetic(() => -1);
    const full = completed(baseline.searchRetrogradeWindows(request));
    const searcher = await synthetic(() => -1, { rateAtCall: (_days, call) => call === full.samples ? 1 : -1 });
    expect(searcher.searchRetrogradeWindows(request)).toMatchObject({ status: "refused", reason: "retrograde-state-inconsistent",
      windows: [], stations: [], candidateJdTt: JD + 2 });
  });

  it("refuses a final endpoint zero returned after a completed station scan", async () => {
    const baseline = await synthetic(() => -1);
    const full = completed(baseline.searchRetrogradeWindows(request));
    const searcher = await synthetic(() => -1, { rateAtCall: (_days, call) => call === full.samples ? 0 : -1 });
    expect(searcher.searchRetrogradeWindows(request)).toMatchObject({ status: "refused", reason: "retrograde-state-unresolved",
      windows: [], stations: [], candidateJdTt: JD + 2 });
  });

  it("includes shard identities from endpoint calculations in the final receipt", async () => {
    const baseline = await synthetic(() => -1);
    const full = completed(baseline.searchRetrogradeWindows(request));
    const searcher = await synthetic(() => -1, {
      shardAtCall: call => call > full.receipt.stationSearch.samples ? OTHER_DIGEST : DIGEST
    });
    const result = completed(searcher.searchRetrogradeWindows(request));
    expect(result.receipt.stationSearch.evaluatedShardDigests).toEqual([DIGEST]);
    expect(result.receipt.evaluatedShardDigests).toEqual([DIGEST, OTHER_DIGEST]);
  });
});

describe("coverage, time snapshots and request validation", () => {
  it("accepts the coverage start and the last interior endpoint without extrapolation", async () => {
    const to = JD + 2 - 2 ** -31;
    const searcher = await synthetic(() => -1, { start: JD, end: JD + 2 });
    const result = completed(searcher.searchRetrogradeWindows({ ...request, to: { jd: to, scale: "tt" } }));
    expect(result.windows).toMatchObject([{ startJdTt: JD, endJdTt: to, clippedStart: true, clippedEnd: true }]);
    expect(searcher.calls.every(jd => jd >= JD && jd < JD + 2)).toBe(true);
    expect(result.receipt.stationSearch.dataset).toBe(searcher.dataset);
  });

  it("does not silently clip requests to available coverage and propagates other preflight refusals", async () => {
    const searcher = await synthetic(() => { throw new Error("Refused request evaluated."); }, { start: JD, end: JD + 2 });
    for (const [input, reason] of [
      [request, "outside-coverage"],
      [{ ...request, from: { jd: JD - 2 ** -31, scale: "tt" }, to: { jd: JD + 1, scale: "tt" } }, "outside-coverage"],
      [{ ...request, from: request.to }, "outside-coverage"],
      [{ ...request, body: "Mars" }, "unknown-body"],
      [{ ...request, body: "Ceres" }, "body-unavailable"],
      [{ ...request, from: { jd: 0, scale: "tt" } }, "invalid-time"]
    ] as const) {
      const result = searcher.searchRetrogradeWindows(input as RetrogradeWindowRequest);
      expect(result).toMatchObject({ status: "refused", reason, windows: [], stations: [], samples: 0,
        receipt: { endpoints: { from: null, to: null }, initialProbe: null } });
      frozenTree(result);
    }
    expect(searcher.calls).toEqual([]);
  });

  it("retains caller clock labels and Delta T pins while evaluating only resolved TT", async () => {
    const from = { iso: "2000-01-01T12:00:00Z", deltaT: 120 };
    const to = { iso: "2000-01-03T12:00:00+00:00", deltaT: 120 };
    const expectedFrom = JD + timeBasis(Date.parse(from.iso), "utc", 120).ttDays;
    const expectedTo = JD + timeBasis(Date.parse(to.iso), "utc", 120).ttDays;
    const searcher = await synthetic(() => -1);
    const result = completed(searcher.searchRetrogradeWindows({ ...request, from, to }));
    expect(result.receipt.stationSearch.request).toEqual({ from, to });
    expect(result.receipt.stationSearch.time).toMatchObject({ from: { jdTt: expectedFrom }, to: { jdTt: expectedTo } });
    expect(result.receipt.endpoints.from?.jdTt).toBe(expectedFrom);
    expect(result.receipt.endpoints.to?.jdTt).toBe(expectedTo);
    expect(result.windows).toMatchObject([{ startJdTt: expectedFrom, endJdTt: expectedTo }]);
  });

  it("uses immutable input snapshots even if the provider mutates caller objects during its first call", async () => {
    const from = new Date("2000-01-01T12:00:00Z");
    const to = new Date("2000-01-03T12:00:00Z");
    const input = { ...request, from, to };
    const searcher = await synthetic(() => -1, { onCall() {
      from.setUTCFullYear(1990);
      to.setUTCFullYear(1990);
      input.from = new Date("1980-01-01T00:00:00Z");
      input.to = new Date("1980-01-01T00:00:00Z");
    } });
    const result = completed(searcher.searchRetrogradeWindows(input));
    expect(result.receipt.stationSearch.request).toEqual({
      from: { iso: "2000-01-01T12:00:00.000Z" }, to: { iso: "2000-01-03T12:00:00.000Z" }
    });
    expect(result.windows[0]!.startJdTt).toBeGreaterThanOrEqual(JD);
    expect(result.windows[0]!.endJdTt).toBeGreaterThanOrEqual(JD + 2);
    expect(result.receipt.conventions).toEqual(RETROGRADE_WINDOW_CONVENTIONS);
    expect(result.receipt.implementation.files.map(file => file.path)).toEqual(expect.arrayContaining([
      "minorbodies/src/retrogrades.ts", "minorbodies/src/stations.ts", "src/crossings.ts"
    ]));
    frozenTree(result);
  });

  it("rejects malformed requests and numerical options before evaluation", async () => {
    const searcher = await synthetic(() => { throw new Error("Malformed request evaluated."); });
    for (const input of [
      null, [], {}, { ...request, body: " Chiron" }, { ...request, body: 2060 },
      { ...request, from: "2000-02-30" }, { ...request, from: new Date(NaN) },
      { ...request, from: request.to, to: request.from }, { ...request, unknown: undefined },
      ...[0, -1, NaN, Infinity, 6, 0.5 / DAY_MS].map(stepDays => ({ ...request, stepDays })),
      ...[0, -1, NaN, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1].map(maxSamples => ({ ...request, maxSamples }))
    ]) expect(() => searcher.searchRetrogradeWindows(input as unknown as RetrogradeWindowRequest)).toThrow(RangeError);
    expect(searcher.calls).toEqual([]);
  });

  it("rejects hidden, symbol and accessor fields without invoking getters", async () => {
    const getter = vi.fn(() => "Chiron");
    const accessor = Object.defineProperty({ ...request }, "body", { get: getter, enumerable: true });
    const hidden = Object.defineProperty({ ...request }, "stepDays", { value: 1, enumerable: false });
    const symbol = { ...request, [Symbol("unknown")]: 1 };
    const nested = { ...request, from: Object.defineProperty({}, "jd", { get: getter, enumerable: true }) };
    const searcher = await synthetic(() => { throw new Error("Malformed request evaluated."); });
    for (const input of [accessor, hidden, symbol, nested]) {
      expect(() => searcher.searchRetrogradeWindows(input as RetrogradeWindowRequest)).toThrow(RangeError);
    }
    expect(getter).not.toHaveBeenCalled();
    expect(searcher.calls).toEqual([]);
  });
});
