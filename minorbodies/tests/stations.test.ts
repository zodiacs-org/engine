import { describe, expect, it, vi } from "vitest";
import { timeBasis } from "../../src/time-scale.js";
import { createBodyAdapter } from "../src/body-adapter.ts";
import { ENGINE_BRIDGE_SETTINGS } from "../src/engine-bridge.ts";
import type { EngineSourceIdentity } from "../src/engine-identity.ts";
import { POSITION_CONVENTIONS } from "../src/ephemeris.ts";
import type { DatasetReceipt, MinorBodyEphemeris, PositionReceipt } from "../src/ephemeris.ts";
import { createStationSearcher, STATION_SEARCH_CONVENTIONS } from "../src/stations.ts";
import type { StationSearchRequest, StationSearchResult } from "../src/stations.ts";

// Invented trajectories exercise search mechanics only. They are not astronomical
// references and cannot establish agreement with JPL or event-time accuracy.
const JD = 2451545;
const DAY_MS = 86_400_000;
const DIGEST = "0".repeat(64);
const implementation: EngineSourceIdentity = Object.freeze({ schema: "minorbodies-engine-source-v1",
  packageVersion: "0.0.0", nodeVersion: process.version, files: Object.freeze([]), sha256: DIGEST });
const request = { body: "Chiron", from: { jd: JD, scale: "tt" }, to: { jd: JD + 2, scale: "tt" },
  stepDays: 0.5 } as const satisfies StationSearchRequest;

function frozenTree(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  expect(value).not.toBeInstanceOf(Date);
  for (const child of Object.values(value)) frozenTree(child);
}

interface SyntheticOptions {
  start?: number;
  end?: number;
  refuseAtCall?: number;
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
    shardDigests: Object.freeze([DIGEST]) });
  const provider: MinorBodyEphemeris = Object.freeze({ dataset, engineSource: implementation,
    calculate(body, time) {
      if (!("jd" in time)) throw new Error("The station wrapper must use explicit TT.");
      calls.push(time.jd);
      const receipt: PositionReceipt = Object.freeze({ schema: "minorbodies-position-receipt-v1",
        implementation: "minorbodies-position-v1", body, conventions: POSITION_CONVENTIONS,
        engineBridge: ENGINE_BRIDGE_SETTINGS, engineSource: implementation, dataset,
        time: Object.freeze({ request: Object.freeze({ jd: time.jd, scale: "tt" }), jdTt: time.jd,
          source: "explicit-tt", engineTimeBasis: null }),
        evaluatedShard: Object.freeze({ sha256: DIGEST, segmentIndex: 0 }) });
      if (options.refuseAtCall === calls.length) return Object.freeze({ status: "refused", reason: "undefined-position", receipt });
      const rate = speed(time.jd - JD);
      return Object.freeze({ status: "ok", body, jdTt: time.jd, longitudeDeg: 123, latitudeDeg: 0, distanceAu: 1,
        longitudeSpeedDegPerDay: rate, latitudeSpeedDegPerDay: 0, distanceSpeedAuPerDay: 0,
        retrograde: rate < 0, receipt });
    } });
  const adapter = await createBodyAdapter([provider]);
  const searcher = await createStationSearcher(adapter);
  return { ...searcher, adapter, dataset, calls };
}

function completed(result: StationSearchResult) {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Search refused: ${result.reason}`);
  return result;
}

describe("station reversal classification through engine crossings", () => {
  it.each([
    { slope: -1, direction: "direct-to-retrograde" },
    { slope: 1, direction: "retrograde-to-direct" }
  ])("classifies $direction from raw speed signs", async ({ slope, direction }) => {
    const searcher = await synthetic(days => slope * (days - 1));
    const result = completed(searcher.searchStations(request));
    expect(result.stations).toHaveLength(1);
    expect(result.stations[0]).toMatchObject({ body: "Chiron", jdTt: JD + 1, direction,
      position: { longitudeDeg: 123 } });
    const event = result.stations[0]!;
    expect(Math.abs(event.position.longitudeSpeedDegPerDay)).toBe(0);
    expect(Math.sign(event.receipt.before.longitudeSpeedDegPerDay)).toBe(-slope);
    expect(Math.sign(event.receipt.after.longitudeSpeedDegPerDay)).toBe(slope);
    expect(event.receipt.before.jdTt).toBeLessThan(event.jdTt);
    expect(event.receipt.after.jdTt).toBeGreaterThan(event.jdTt);
    expect(event.receipt.search).toBe(result.receipt);
    expect(result.samples).toBe(searcher.calls.length);
    expect(result.receipt.evaluatedShardDigests).toEqual([DIGEST]);
    frozenTree(result);
  });

  it.each([1, -1])("omits a sampled zero-speed touch with equal one-sided signs (%s)", async side => {
    const searcher = await synthetic(days => side * (days - 1) ** 2);
    const result = completed(searcher.searchStations(request));
    expect(result.stations).toEqual([]);
    expect(result.receipt.rejectedTouches).toBe(1);
    expect(result.samples).toBe(searcher.calls.length);
  });

  it("finds both reversals hidden in an edge coarse cell", async () => {
    const searcher = await synthetic(days => (days - 0.2) * (days - 0.4));
    const result = completed(searcher.searchStations({ ...request, stepDays: 1 }));
    expect(result.stations.map(event => event.direction)).toEqual(["direct-to-retrograde", "retrograde-to-direct"]);
    expect(result.stations).toHaveLength(2);
    for (const [index, expected] of [JD + 0.2, JD + 0.4].entries()) {
      expect(Math.abs(result.stations[index]!.jdTt - expected) * DAY_MS).toBeLessThan(10);
    }
    expect(searcher.calls.every(jd => jd >= JD && jd <= JD + 2)).toBe(true);
  });

  it("excludes an exact lower-bound reversal", async () => {
    const searcher = await synthetic(days => days);
    expect(completed(searcher.searchStations(request)).stations).toEqual([]);
  });

  it("refuses an exact upper-bound zero without inventing the outside direction", async () => {
    const searcher = await synthetic(days => days - 2);
    const result = searcher.searchStations(request);
    expect(result).toMatchObject({ status: "refused", reason: "station-direction-unresolved", stations: [], candidateJdTt: JD + 2 });
    expect(searcher.calls.every(jd => jd >= JD && jd <= JD + 2)).toBe(true);
    expect(result.samples).toBe(searcher.calls.length);
  });

  it.each(["near-from", "near-to"] as const)("classifies a submillisecond %s reversal at the largest allowed step", async edge => {
    const to = JD + 10;
    const root = edge === "near-from" ? JD + 0.25 / DAY_MS : to - 0.25 / DAY_MS;
    const searcher = await synthetic(days => (JD + days) - root);
    const result = completed(searcher.searchStations({ ...request, to: { jd: to, scale: "tt" }, stepDays: 5 }));
    expect(result.stations).toHaveLength(1);
    const event = result.stations[0]!;
    expect(event.direction).toBe("retrograde-to-direct");
    expect(event.jdTt).toBeGreaterThan(JD);
    expect(event.jdTt).toBeLessThanOrEqual(to);
    expect(Math.abs(event.jdTt - root) * DAY_MS).toBeLessThan(26);
    expect(event.receipt.before.longitudeSpeedDegPerDay).toBeLessThan(0);
    expect(event.receipt.after.longitudeSpeedDegPerDay).toBeGreaterThan(0);
    expect(searcher.calls.every(jd => jd >= JD && jd <= to)).toBe(true);
  });

  it("uses the exact fractional upper endpoint to classify a root in its final millisecond", async () => {
    const to = JD + 1000.4 / DAY_MS;
    const root = to - 0.25 / DAY_MS;
    const searcher = await synthetic(days => (JD + days) - root);
    const result = completed(searcher.searchStations({ ...request, to: { jd: to, scale: "tt" }, stepDays: 1000 / DAY_MS }));
    expect(result.stations).toHaveLength(1);
    const event = result.stations[0]!;
    expect(event.direction).toBe("retrograde-to-direct");
    expect(event.receipt.after.jdTt).toBe(to);
    expect(event.receipt.before.longitudeSpeedDegPerDay).toBeLessThan(0);
    expect(event.receipt.after.longitudeSpeedDegPerDay).toBeGreaterThan(0);
    expect(searcher.calls.every(jd => jd >= JD && jd <= to)).toBe(true);
  });

  it("refuses an unresolved zero at a direction probe", async () => {
    const probeJd = JD + 1 - 60_000 / DAY_MS;
    const searcher = await synthetic(days => (days - 1) * ((JD + days) - probeJd) ** 2);
    expect(searcher.searchStations(request)).toMatchObject({ status: "refused", reason: "station-direction-unresolved", stations: [] });
  });

  it("does no position work for an empty in-coverage window", async () => {
    const searcher = await synthetic(() => { throw new Error("Empty window evaluated."); });
    const result = searcher.searchStations({ ...request, to: request.from });
    expect(result).toMatchObject({ status: "complete", stations: [], samples: 0 });
    expect(searcher.calls).toEqual([]);
    frozenTree(result);
  });

  it("finds no reversal in constant nonzero or zero speed", async () => {
    for (const speed of [-1, 0, 1]) {
      const searcher = await synthetic(() => speed);
      expect(completed(searcher.searchStations(request)).stations).toEqual([]);
    }
  });
});

describe("shared station evaluation budgets and refusals", () => {
  it("refuses a coarse scan before making any provider call", async () => {
    const searcher = await synthetic(() => { throw new Error("Budget preflight evaluated."); });
    expect(searcher.searchStations({ ...request, maxSamples: 4 }))
      .toMatchObject({ status: "refused", reason: "sample-budget", stations: [], samples: 0, maxSamples: 4 });
    expect(searcher.calls).toEqual([]);
  });

  it("applies the finite default budget to a long request before sampling", async () => {
    const searcher = await synthetic(() => { throw new Error("Default budget preflight evaluated."); }, { end: JD + 150_000 });
    const result = searcher.searchStations({ body: "Chiron", from: request.from, to: { jd: JD + 100_001, scale: "tt" } });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", stations: [], samples: 0,
      maxSamples: 100_000, receipt: { settings: { stepDays: 1, maxSamples: 100_000 } } });
    expect(searcher.calls).toEqual([]);
  });

  it("counts every refinement and returns no partial crossings on exhaustion", async () => {
    const searcher = await synthetic(days => days - 0.7);
    const result = searcher.searchStations({ ...request, maxSamples: 6 });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", stations: [], samples: 6 });
    expect(searcher.calls).toHaveLength(6);
  });

  it("shares the budget with direction probes and final station positions", async () => {
    const baseline = await synthetic(days => days - 1);
    const full = completed(baseline.searchStations(request));
    expect(full.samples).toBeGreaterThanOrEqual(8);
    const event = full.stations[0]!;
    expect(baseline.calls.slice(-3)).toEqual([event.receipt.before.jdTt, event.receipt.after.jdTt, event.jdTt]);
    for (const budget of [full.samples - 3, full.samples - 2, full.samples - 1]) {
      const searcher = await synthetic(days => days - 1);
      const result = searcher.searchStations({ ...request, maxSamples: budget });
      expect(result).toMatchObject({ status: "refused", reason: "sample-budget", stations: [], samples: budget });
      expect(searcher.calls).toHaveLength(budget);
      expect(result.receipt.samples).toBe(budget);
    }
  });

  it("discards an earlier station if a later event position exhausts the budget", async () => {
    const speed = (days: number) => (days - 0.5) * (days - 1.5);
    const baseline = await synthetic(speed);
    const full = completed(baseline.searchStations(request));
    expect(full.stations).toHaveLength(2);
    const searcher = await synthetic(speed);
    const result = searcher.searchStations({ ...request, maxSamples: full.samples - 1 });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", stations: [], samples: full.samples - 1 });
    expect(searcher.calls).toHaveLength(full.samples - 1);
  });

  it("carries a provider refusal and drops an earlier candidate", async () => {
    const speed = (days: number) => (days - 0.5) * (days - 1.5);
    const baseline = await synthetic(speed);
    const full = completed(baseline.searchStations(request));
    const searcher = await synthetic(speed, { refuseAtCall: full.samples });
    const result = searcher.searchStations(request);
    expect(result).toMatchObject({ status: "refused", reason: "undefined-position", stations: [], samples: full.samples,
      refusal: { status: "refused", reason: "undefined-position", receipt: { provider: "minorbodies" } } });
    expect(result.receipt.evaluatedShardDigests).toEqual([DIGEST]);
    frozenTree(result);
  });

  it.each([NaN, Infinity, -Infinity])("refuses nonfinite provider speed %s", async speed => {
    const searcher = await synthetic(() => speed);
    expect(searcher.searchStations(request)).toMatchObject({ status: "refused", reason: "undefined-speed", stations: [], samples: 1 });
  });

  it.each([1e-20, -1e-20, 4e-16, -4e-16, 1e100, -1e100])("refuses an unresolved mapped speed %s", async speed => {
    const searcher = await synthetic(() => speed);
    expect(searcher.searchStations(request)).toMatchObject({ status: "refused", reason: "speed-resolution", stations: [], samples: 1 });
  });

  it("records an unlimited budget as JSON null and never fetches runtime data", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network in station search."));
    try {
      const searcher = await synthetic(days => days - 1);
      const result = completed(searcher.searchStations({ ...request, maxSamples: Infinity }));
      expect(result.receipt.settings.maxSamples).toBeNull();
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
});

describe("station clocks, coverage and immutable receipts", () => {
  it("keeps exact fractional TT endpoints and all samples inside the query", async () => {
    const from = JD + 0.123456789;
    const to = JD + 1.987654321;
    const searcher = await synthetic(days => days - 1);
    const result = completed(searcher.searchStations({ ...request, from: { jd: from, scale: "tt" }, to: { jd: to, scale: "tt" } }));
    expect(searcher.calls).toContain(from);
    expect(searcher.calls).toContain(to);
    expect(searcher.calls.every(jd => jd >= from && jd <= to)).toBe(true);
    expect(result.receipt.time).toMatchObject({ from: { jdTt: from }, to: { jdTt: to } });
    expect(result.stations).toHaveLength(1);
    expect(Math.abs(result.stations[0]!.jdTt - (JD + 1)) * DAY_MS).toBeLessThan(5);
  });

  it("resolves caller clock labels to TT before scanning and retains their Delta T pins", async () => {
    const from = { iso: "2000-01-01T12:00:00Z", deltaT: 120 };
    const to = { iso: "2000-01-03T12:00:00+00:00", deltaT: 120 };
    const expectedFrom = JD + timeBasis(Date.parse(from.iso), "utc", 120).ttDays;
    const expectedTo = JD + timeBasis(Date.parse(to.iso), "utc", 120).ttDays;
    const searcher = await synthetic(days => days - 1);
    const result = completed(searcher.searchStations({ ...request, from, to }));
    expect(result.receipt.request).toEqual({ from, to });
    expect(result.receipt.time).toMatchObject({ from: { jdTt: expectedFrom }, to: { jdTt: expectedTo } });
    expect(searcher.calls).toContain(expectedFrom);
    expect(searcher.calls).toContain(expectedTo);
  });

  it("refuses unavailable, unknown and out-of-coverage searches before sampling", async () => {
    const searcher = await synthetic(() => 1, { start: JD, end: JD + 2 });
    for (const [change, reason] of [
      [{ body: "Mars" }, "unknown-body"],
      [{ body: "Chiron typo" }, "unknown-body"],
      [{ body: "Ceres" }, "body-unavailable"],
      [{ from: { jd: JD - 1e-6, scale: "tt" } }, "outside-coverage"],
      [{}, "outside-coverage"]
    ] as const) {
      const result = searcher.searchStations({ ...request, ...change } as StationSearchRequest);
      expect(result).toMatchObject({ status: "refused", reason, stations: [], samples: 0 });
      frozenTree(result);
    }
    expect(searcher.calls).toEqual([]);
  });

  it("accepts the dataset start and the last interior endpoint", async () => {
    const searcher = await synthetic(() => 1, { start: JD, end: JD + 2 });
    expect(completed(searcher.searchStations({ ...request, to: { jd: JD + 2 - 1e-6, scale: "tt" } })).stations).toEqual([]);
    expect(searcher.calls.every(jd => jd >= JD && jd < JD + 2)).toBe(true);
  });

  it("returns a receipted invalid-time refusal for an operationally unsupported TT", async () => {
    const searcher = await synthetic(() => 1);
    const result = searcher.searchStations({ ...request, from: { jd: 0, scale: "tt" } });
    expect(result).toMatchObject({ status: "refused", reason: "invalid-time", stations: [], samples: 0,
      receipt: { time: null, request: { from: { jd: 0, scale: "tt" } } } });
    expect(searcher.calls).toEqual([]);
    frozenTree(result);
  });

  it("snapshots Date inputs and records wrapper plus engine solver implementation", async () => {
    const searcher = await synthetic(days => days - 1);
    const from = new Date("2000-01-01T12:00:00Z");
    const to = new Date("2000-01-03T12:00:00Z");
    const result = completed(searcher.searchStations({ ...request, from, to }));
    const encoded = JSON.stringify(result);
    from.setUTCFullYear(1990);
    to.setUTCFullYear(1990);
    expect(JSON.stringify(result)).toBe(encoded);
    expect(result.receipt.implementation.files.map(file => file.path)).toEqual(expect.arrayContaining([
      "minorbodies/src/stations.ts", "src/crossings.ts"
    ]));
    expect(result.receipt.conventions).toEqual(STATION_SEARCH_CONVENTIONS);
    expect(result.receipt.dataset).toBe(searcher.dataset);
    frozenTree(result);
  });
});

describe("station input validation", () => {
  it("rejects malformed fields, intervals and numerical options", async () => {
    const searcher = await synthetic(() => 1);
    for (const input of [
      null, [], {}, { ...request, body: " Chiron" }, { ...request, body: 2060 },
      { ...request, from: "2000-02-30" }, { ...request, from: new Date(NaN) },
      { ...request, from: request.to, to: request.from }, { ...request, unknown: undefined },
      ...[0, -1, NaN, Infinity, 6, 0.5 / DAY_MS].map(stepDays => ({ ...request, stepDays })),
      ...[0, -1, NaN, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1].map(maxSamples => ({ ...request, maxSamples }))
    ]) expect(() => searcher.searchStations(input as unknown as StationSearchRequest)).toThrow(RangeError);
    expect(searcher.calls).toEqual([]);
  });

  it("rejects getter and hidden or symbol options without evaluating caller accessors", async () => {
    const searcher = await synthetic(() => 1);
    const getter = vi.fn(() => "Chiron");
    const accessor = Object.defineProperty({ ...request }, "body", { get: getter, enumerable: true });
    const hidden = Object.defineProperty({ ...request }, "stepDays", { value: 1, enumerable: false });
    const symbol = { ...request, [Symbol("extra")]: 1 };
    const nested = { ...request, from: Object.defineProperty({}, "jd", { get: getter, enumerable: true }) };
    for (const input of [accessor, hidden, symbol, nested]) {
      expect(() => searcher.searchStations(input as StationSearchRequest)).toThrow(RangeError);
    }
    expect(getter).not.toHaveBeenCalled();
    expect(searcher.calls).toEqual([]);
  });
});
