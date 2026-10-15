import { describe, expect, it, vi } from "vitest";
import { timeBasis } from "../../src/time-scale.js";
import { createBodyAdapter } from "../src/body-adapter.ts";
import { ENGINE_BRIDGE_SETTINGS } from "../src/engine-bridge.ts";
import type { EngineSourceIdentity } from "../src/engine-identity.ts";
import { POSITION_CONVENTIONS } from "../src/ephemeris.ts";
import type { DatasetReceipt, MinorBodyEphemeris, PositionReceipt } from "../src/ephemeris.ts";
import { createIngressSearcher, INGRESS_SEARCH_CONVENTIONS } from "../src/ingresses.ts";
import type { IngressSearchRequest, IngressSearchResult } from "../src/ingresses.ts";

// These invented longitudes and their analytic derivatives test search mechanics.
// They are not astronomical references or evidence of agreement with JPL.
const JD = 2451545;
const DAY_MS = 86_400_000;
const DIGEST = "0".repeat(64);
const OTHER_DIGEST = "1".repeat(64);
const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio",
  "sagittarius", "capricorn", "aquarius", "pisces"] as const;
const implementation: EngineSourceIdentity = Object.freeze({ schema: "minorbodies-engine-source-v1",
  packageVersion: "0.0.0", nodeVersion: process.version, files: Object.freeze([]), sha256: DIGEST });
const request = { body: "Chiron", from: { jd: JD, scale: "tt" }, to: { jd: JD + 2, scale: "tt" },
  stepDays: 0.5 } as const satisfies IngressSearchRequest;

interface SyntheticOptions {
  start?: number;
  end?: number;
  refuseAtCall?: number;
  longitudeAtCall?: (days: number, call: number) => number;
  rateAtCall?: (days: number, call: number) => number;
  shardAtCall?: (call: number) => string;
  onCall?: () => void;
}

async function synthetic(longitude: (days: number) => number, speed: (days: number) => number,
  options: SyntheticOptions = {}) {
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
      if (!("jd" in time) || time.scale !== "tt") throw new Error("Ingress samples must use explicit TT.");
      calls.push(time.jd);
      options.onCall?.();
      const receipt: PositionReceipt = Object.freeze({ schema: "minorbodies-position-receipt-v1",
        implementation: "minorbodies-position-v1", body, conventions: POSITION_CONVENTIONS,
        engineBridge: ENGINE_BRIDGE_SETTINGS, engineSource: implementation, dataset,
        time: Object.freeze({ request: Object.freeze({ jd: time.jd, scale: "tt" }), jdTt: time.jd,
          source: "explicit-tt", engineTimeBasis: null }),
        evaluatedShard: Object.freeze({ sha256: options.shardAtCall?.(calls.length) ?? DIGEST, segmentIndex: 0 }) });
      if (options.refuseAtCall === calls.length) return Object.freeze({ status: "refused", reason: "undefined-position", receipt });
      const days = time.jd - JD;
      const rate = options.rateAtCall?.(days, calls.length) ?? speed(days);
      const modulo = longitude(days) % 360;
      const longitudeDeg = options.longitudeAtCall?.(days, calls.length) ?? (modulo < 0 ? modulo + 360 : modulo);
      return Object.freeze({ status: "ok", body, jdTt: time.jd, longitudeDeg, latitudeDeg: 0, distanceAu: 1,
        longitudeSpeedDegPerDay: rate, latitudeSpeedDegPerDay: 0, distanceSpeedAuPerDay: 0,
        retrograde: rate < 0, receipt });
    } });
  const adapter = await createBodyAdapter([provider]);
  const searcher = await createIngressSearcher(adapter);
  return { ...searcher, dataset, calls };
}

function completed(result: IngressSearchResult) {
  expect(result.status, result.status === "refused" ? result.reason : undefined).toBe("complete");
  if (result.status !== "complete") throw new Error(`Ingress search refused: ${result.reason}`);
  return result;
}

function frozenTree(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  expect(value).not.toBeInstanceOf(Date);
  for (const child of Object.values(value)) frozenTree(child);
}

describe("sign boundaries and ingress direction", () => {
  it.each(SIGNS.flatMap((sign, index) => [1, -1].map(slope => ({ sign, index, slope }))))
  ("labels boundary $index at rate $slope, including the zero wrap", async ({ sign, index, slope }) => {
    const boundary = index * 30;
    const searcher = await synthetic(days => boundary + slope * (days - 1), () => slope);
    const result = completed(searcher.searchIngresses(request));
    expect(result.ingresses).toHaveLength(1);
    const event = result.ingresses[0]!;
    expect(event).toMatchObject({ body: "Chiron", jdTt: JD + 1, longitudeDeg: boundary,
      direction: slope > 0 ? "direct" : "retrograde",
      fromSign: slope > 0 ? SIGNS[(index + 11) % 12] : sign,
      toSign: slope > 0 ? sign : SIGNS[(index + 11) % 12] });
    expect(event.position.longitudeDeg).toBe(boundary);
    expect(event.receipt.schema).toBe("minorbodies-ingress-v1");
    expect(event.receipt.search).toBe(result.receipt);
    expect(event.receipt.position.calculation).toBe(event.position.receipt);
    expect(event.receipt.before.jdTt).toBeLessThan(event.jdTt);
    expect(event.receipt.after.jdTt).toBeGreaterThan(event.jdTt);
    expect(event.receipt.before.longitudeSpeedDegPerDay).toBe(slope);
    expect(event.receipt.after.longitudeSpeedDegPerDay).toBe(slope);
    expect(event.receipt.before.receipt.time?.jdTt).toBe(event.receipt.before.jdTt);
    expect(event.receipt.after.receipt.time?.jdTt).toBe(event.receipt.after.jdTt);
    expect(result.samples).toBe(searcher.calls.length);
    expect(result.receipt.samples).toBe(result.samples);
  });

  it("sorts events across boundary scans and does not duplicate the zero boundary", async () => {
    const searcher = await synthetic(days => 350 + 40 * days, () => 40);
    const result = completed(searcher.searchIngresses(request));
    expect(result.ingresses.map(event => [event.longitudeDeg, event.toSign])).toEqual([
      [0, "aries"], [30, "taurus"], [60, "gemini"]
    ]);
    for (const [index, days] of [0.25, 1, 1.75].entries()) {
      expect(Math.abs(result.ingresses[index]!.jdTt - (JD + days)) * DAY_MS).toBeLessThan(5);
    }
    expect(new Set(result.ingresses.map(event => event.jdTt)).size).toBe(3);
    expect(result.ingresses.every(event => event.receipt.search === result.receipt)).toBe(true);
  });

  it("preserves repeated direct, retrograde and direct passages through one boundary", async () => {
    const searcher = await synthetic(days => 30 + (days - 0.4) * (days - 1) * (days - 1.6),
      days => 3 * (days - 1) ** 2 - 0.36);
    const result = completed(searcher.searchIngresses({ ...request, stepDays: 0.1 }));
    expect(result.ingresses.map(event => event.direction)).toEqual(["direct", "retrograde", "direct"]);
    for (const [index, expected] of [0.4, 1, 1.6].entries()) {
      expect(Math.abs(result.ingresses[index]!.jdTt - (JD + expected)) * DAY_MS).toBeLessThan(10);
      expect(result.ingresses[index]!.longitudeDeg).toBe(30);
    }
  });

  it("recovers both sign passages around a station hidden in the first coarse cell", async () => {
    const searcher = await synthetic(days => 30 + (days - 0.2) * (days - 0.4), days => 2 * days - 0.6);
    const result = completed(searcher.searchIngresses({ ...request, stepDays: 1 }));
    expect(result.ingresses.map(event => [event.direction, event.fromSign, event.toSign])).toEqual([
      ["retrograde", "taurus", "aries"], ["direct", "aries", "taurus"]
    ]);
    for (const [index, expected] of [0.2, 0.4].entries()) {
      expect(Math.abs(result.ingresses[index]!.jdTt - (JD + expected)) * DAY_MS).toBeLessThan(10);
    }
    expect(searcher.calls.every(jd => jd >= JD && jd <= JD + 2)).toBe(true);
  });

  it.each([1, -1])("omits an exact boundary touch with no sign passage (%s)", async side => {
    const searcher = await synthetic(days => 30 + side * (days - 1) ** 2, days => 2 * side * (days - 1));
    const result = completed(searcher.searchIngresses(request));
    expect(result.ingresses).toEqual([]);
    expect(result.receipt.rejectedTouches).toBe(1);
  });

  it("refuses a rounded near-touch instead of asserting an exact touch", async () => {
    const searcher = await synthetic(days => 30 + (days - 0.3) ** 2 + 2 ** -47, days => 2 * (days - 0.3));
    const result = searcher.searchIngresses({ ...request, stepDays: 1 });
    expect(result).toMatchObject({ status: "refused", reason: "longitude-resolution", ingresses: [] });
    expect(result.receipt.rejectedTouches).toBe(0);
  });

  it.each([1, -1])("refuses a slow passage erased by the solver's angular normalization (%s)", async direction => {
    const rate = direction * 2 ** -47;
    const searcher = await synthetic(days => 30 + rate * (days - 1), () => rate);
    const result = searcher.searchIngresses(request);
    expect(result).toMatchObject({ status: "refused", reason: "longitude-resolution", ingresses: [] });
    expect(result.receipt.rejectedTouches).toBe(0);
    expect(result.samples).toBe(searcher.calls.length);
    expect(result.samples).toBeGreaterThan(0);
  });

  it.each([0, 30, 123])("finds no ingress for constant longitude %s", async longitude => {
    const searcher = await synthetic(() => longitude, () => 0);
    expect(completed(searcher.searchIngresses(request)).ingresses).toEqual([]);
  });

  it("excludes an exact lower-bound passage", async () => {
    const searcher = await synthetic(days => 30 + days, () => 1);
    expect(completed(searcher.searchIngresses(request)).ingresses).toEqual([]);
  });

  it("refuses an exact upper-bound passage without sampling outside the request", async () => {
    const searcher = await synthetic(days => 28 + days, () => 1);
    const result = searcher.searchIngresses(request);
    expect(result).toMatchObject({ status: "refused", reason: "ingress-direction-unresolved", ingresses: [],
      candidateJdTt: JD + 2 });
    expect(searcher.calls.every(jd => jd >= JD && jd <= JD + 2)).toBe(true);
  });

  it.each(["near-from", "near-to"] as const)("classifies a submillisecond %s passage at the largest allowed step", async edge => {
    const to = JD + 10;
    const root = edge === "near-from" ? JD + 0.25 / DAY_MS : to - 0.25 / DAY_MS;
    const searcher = await synthetic(days => 30 + (JD + days - root), () => 1);
    const result = completed(searcher.searchIngresses({ ...request, to: { jd: to, scale: "tt" }, stepDays: 5 }));
    expect(result.ingresses).toHaveLength(1);
    const event = result.ingresses[0]!;
    expect(event.direction).toBe("direct");
    expect(event.jdTt).toBeGreaterThan(JD);
    expect(event.jdTt).toBeLessThanOrEqual(to);
    expect(Math.abs(event.jdTt - root) * DAY_MS).toBeLessThan(26);
    expect(event.receipt.before.longitudeDeg).toBeLessThan(30);
    expect(event.receipt.after.longitudeDeg).toBeGreaterThan(30);
    expect(searcher.calls.every(jd => jd >= JD && jd <= to)).toBe(true);
  });

  it("uses the exact fractional upper endpoint when a crossing lies in its last millisecond", async () => {
    const to = JD + 1000.4 / DAY_MS;
    const root = to - 0.25 / DAY_MS;
    const searcher = await synthetic(days => 30 + (JD + days - root), () => 1);
    const result = completed(searcher.searchIngresses({ ...request, to: { jd: to, scale: "tt" }, stepDays: 1000 / DAY_MS }));
    expect(result.ingresses).toHaveLength(1);
    const event = result.ingresses[0]!;
    expect(event.direction).toBe("direct");
    expect(event.receipt.after.jdTt).toBe(to);
    expect(event.receipt.before.longitudeDeg).toBeLessThan(30);
    expect(event.receipt.after.longitudeDeg).toBeGreaterThan(30);
    expect(searcher.calls.every(jd => jd >= JD && jd <= to)).toBe(true);
  });

  it("does no provider work for an empty covered interval", async () => {
    const searcher = await synthetic(() => { throw new Error("Empty request evaluated."); }, () => 0);
    const result = searcher.searchIngresses({ ...request, to: request.from });
    expect(result).toMatchObject({ status: "complete", ingresses: [], samples: 0 });
    expect(searcher.calls).toEqual([]);
    frozenTree(result);
  });
});

describe("one evaluation budget across every sign and every receipt", () => {
  it("preflights the combined coarse scans before any provider evaluation", async () => {
    const searcher = await synthetic(() => { throw new Error("Failed preflight evaluated."); }, () => 0);
    expect(searcher.searchIngresses({ ...request, maxSamples: 59 }))
      .toMatchObject({ status: "refused", reason: "sample-budget", ingresses: [], samples: 0, maxSamples: 59 });
    expect(searcher.calls).toEqual([]);
  });

  it("counts repeated coarse calls to all boundaries within one finite budget", async () => {
    const searcher = await synthetic(() => 123, () => 0);
    const result = completed(searcher.searchIngresses({ ...request, maxSamples: 60 }));
    expect(result.samples).toBe(60);
    for (const jd of [JD, JD + 0.5, JD + 1, JD + 1.5, JD + 2]) {
      expect(searcher.calls.filter(call => call === jd)).toHaveLength(12);
    }
  });

  it("applies the finite default to all boundaries of a long scan before sampling", async () => {
    const searcher = await synthetic(() => { throw new Error("Default preflight evaluated."); }, () => 0,
      { end: JD + 150_000 });
    const result = searcher.searchIngresses({ body: "Chiron", from: request.from, to: { jd: JD + 10_000, scale: "tt" } });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", ingresses: [], samples: 0,
      maxSamples: 100_000, receipt: { settings: { stepDays: 1, maxSamples: 100_000 } } });
    expect(searcher.calls).toEqual([]);
  });

  it("drops all candidates when scans, probes or event positions exhaust the shared budget", async () => {
    const longitude = (days: number) => 350 + 40 * days;
    const baseline = await synthetic(longitude, () => 40);
    const full = completed(baseline.searchIngresses(request));
    expect(full.ingresses).toHaveLength(3);
    for (const maxSamples of [60, full.samples - 3, full.samples - 2, full.samples - 1]) {
      const searcher = await synthetic(longitude, () => 40);
      const result = searcher.searchIngresses({ ...request, maxSamples });
      expect(result).toMatchObject({ status: "refused", reason: "sample-budget", ingresses: [], samples: maxSamples });
      expect(searcher.calls).toHaveLength(maxSamples);
      expect(result.receipt.samples).toBe(maxSamples);
    }
  });

  it("propagates a late provider refusal without partial events", async () => {
    const longitude = (days: number) => 350 + 40 * days;
    const baseline = await synthetic(longitude, () => 40);
    const full = completed(baseline.searchIngresses(request));
    const searcher = await synthetic(longitude, () => 40, { refuseAtCall: full.samples });
    const result = searcher.searchIngresses(request);
    expect(result).toMatchObject({ status: "refused", reason: "undefined-position", ingresses: [], samples: full.samples,
      refusal: { status: "refused", reason: "undefined-position", receipt: { provider: "minorbodies" } } });
    frozenTree(result);
  });

  it.each([NaN, Infinity, -Infinity, -1, 360])("refuses invalid longitude %s with no partial events", async longitude => {
    const searcher = await synthetic(() => 123, () => 0, { longitudeAtCall: () => longitude });
    expect(searcher.searchIngresses(request))
      .toMatchObject({ status: "refused", reason: "undefined-longitude", ingresses: [], samples: 1 });
  });

  it.each([NaN, Infinity, -Infinity])("refuses nonfinite speed %s", async speed => {
    const searcher = await synthetic(days => 29 + days, () => speed);
    expect(searcher.searchIngresses(request))
      .toMatchObject({ status: "refused", reason: "undefined-speed", ingresses: [], samples: 1 });
  });

  it("includes shard identities from direction and event evaluations", async () => {
    const baseline = await synthetic(days => 29 + days, () => 1);
    const full = completed(baseline.searchIngresses(request));
    const searcher = await synthetic(days => 29 + days, () => 1,
      { shardAtCall: call => call === full.samples ? OTHER_DIGEST : DIGEST });
    const result = completed(searcher.searchIngresses(request));
    expect(result.receipt.evaluatedShardDigests).toEqual([DIGEST, OTHER_DIGEST]);
  });

  it("serializes an unlimited budget as null and runs without network access", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network in ingress search."));
    try {
      const searcher = await synthetic(days => 29 + days, () => 1);
      const result = completed(searcher.searchIngresses({ ...request, maxSamples: Infinity }));
      expect(result.receipt.settings.maxSamples).toBeNull();
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
      expect(fetch).not.toHaveBeenCalled();
      frozenTree(result);
    } finally { fetch.mockRestore(); }
  });
});

describe("ingress clocks, coverage and immutable input", () => {
  it("retains exact fractional TT endpoints and keeps all samples inside them", async () => {
    const from = JD + 0.123456789;
    const to = JD + 1.987654321;
    const searcher = await synthetic(days => 29 + days, () => 1);
    const result = completed(searcher.searchIngresses({ ...request, from: { jd: from, scale: "tt" }, to: { jd: to, scale: "tt" } }));
    expect(searcher.calls).toContain(from);
    expect(searcher.calls).toContain(to);
    expect(searcher.calls.every(jd => jd >= from && jd <= to)).toBe(true);
    expect(result.receipt.time).toMatchObject({ from: { jdTt: from }, to: { jdTt: to } });
    expect(result.ingresses).toHaveLength(1);
    expect(Math.abs(result.ingresses[0]!.jdTt - (JD + 1)) * DAY_MS).toBeLessThan(5);
  });

  it("resolves caller clock readings and preserves Delta T pins in the receipt", async () => {
    const from = { iso: "2000-01-01T12:00:00Z", deltaT: 120 };
    const to = { iso: "2000-01-03T12:00:00+00:00", deltaT: 120 };
    const expectedFrom = JD + timeBasis(Date.parse(from.iso), "utc", 120).ttDays;
    const expectedTo = JD + timeBasis(Date.parse(to.iso), "utc", 120).ttDays;
    const searcher = await synthetic(days => 29 + days, () => 1);
    const result = completed(searcher.searchIngresses({ ...request, from, to }));
    expect(result.receipt.request).toEqual({ from, to });
    expect(result.receipt.time).toMatchObject({ from: { jdTt: expectedFrom }, to: { jdTt: expectedTo } });
    expect(searcher.calls).toContain(expectedFrom);
    expect(searcher.calls).toContain(expectedTo);
  });

  it("refuses unavailable bodies and coverage gaps before evaluation without clipping", async () => {
    const searcher = await synthetic(() => { throw new Error("Refused request evaluated."); }, () => 0,
      { start: JD, end: JD + 2 });
    for (const [change, reason] of [
      [{ body: "Mars" }, "unknown-body"], [{ body: "Chiron typo" }, "unknown-body"],
      [{ body: "Ceres" }, "body-unavailable"],
      [{ from: { jd: JD - 2 ** -31, scale: "tt" } }, "outside-coverage"],
      [{}, "outside-coverage"], [{ from: request.to }, "outside-coverage"]
    ] as const) {
      const result = searcher.searchIngresses({ ...request, ...change } as IngressSearchRequest);
      expect(result).toMatchObject({ status: "refused", reason, ingresses: [], samples: 0 });
      frozenTree(result);
    }
    expect(searcher.calls).toEqual([]);
  });

  it("accepts coverage start and the last interior endpoint", async () => {
    const searcher = await synthetic(() => 123, () => 0, { start: JD, end: JD + 2 });
    const result = completed(searcher.searchIngresses({ ...request, to: { jd: JD + 2 - 2 ** -31, scale: "tt" } }));
    expect(result.ingresses).toEqual([]);
    expect(searcher.calls.every(jd => jd >= JD && jd < JD + 2)).toBe(true);
    expect(result.receipt.dataset).toBe(searcher.dataset);
  });

  it("returns a receipted refusal for a TT instant beyond operational support", async () => {
    const searcher = await synthetic(() => 123, () => 0);
    const result = searcher.searchIngresses({ ...request, from: { jd: 0, scale: "tt" } });
    expect(result).toMatchObject({ status: "refused", reason: "invalid-time", ingresses: [], samples: 0,
      receipt: { time: null, request: { from: { jd: 0, scale: "tt" } } } });
    expect(searcher.calls).toEqual([]);
  });

  it("snapshots inputs before a provider can mutate them and records wrapper plus solver sources", async () => {
    const from = new Date("2000-01-01T12:00:00Z");
    const to = new Date("2000-01-03T12:00:00Z");
    const input = { ...request, from, to };
    const searcher = await synthetic(days => 29 + days, () => 1, { onCall() {
      from.setUTCFullYear(1990);
      to.setUTCFullYear(1990);
      input.from = new Date("1980-01-01T00:00:00Z");
      input.to = new Date("1980-01-01T00:00:00Z");
    } });
    const result = completed(searcher.searchIngresses(input));
    expect(result.receipt.request).toEqual({ from: { iso: "2000-01-01T12:00:00.000Z" }, to: { iso: "2000-01-03T12:00:00.000Z" } });
    expect(result.receipt.implementation.files.map(file => file.path)).toEqual(expect.arrayContaining([
      "minorbodies/src/ingresses.ts", "src/crossings.ts"
    ]));
    expect(result.receipt.schema).toBe("minorbodies-ingress-search-v1");
    expect(result.receipt.conventions).toEqual(INGRESS_SEARCH_CONVENTIONS);
    expect(result.receipt.dataset).toBe(searcher.dataset);
    frozenTree(result);
  });
});

describe("ingress request validation", () => {
  it("rejects invalid fields, reversed intervals and invalid numerical options", async () => {
    const searcher = await synthetic(() => { throw new Error("Malformed request evaluated."); }, () => 0);
    for (const input of [
      null, [], {}, { ...request, body: " Chiron" }, { ...request, body: 2060 },
      { ...request, from: "2000-02-30" }, { ...request, from: new Date(NaN) },
      { ...request, from: request.to, to: request.from }, { ...request, unknown: undefined },
      ...[0, -1, NaN, Infinity, 6, 0.5 / DAY_MS].map(stepDays => ({ ...request, stepDays })),
      ...[0, -1, NaN, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1].map(maxSamples => ({ ...request, maxSamples }))
    ]) expect(() => searcher.searchIngresses(input as unknown as IngressSearchRequest)).toThrow(RangeError);
    expect(searcher.calls).toEqual([]);
  });

  it("rejects hidden, symbol and accessor fields without calling getters", async () => {
    const getter = vi.fn(() => "Chiron");
    const accessor = Object.defineProperty({ ...request }, "body", { get: getter, enumerable: true });
    const hidden = Object.defineProperty({ ...request }, "stepDays", { value: 1, enumerable: false });
    const symbol = { ...request, [Symbol("unknown")]: 1 };
    const nested = { ...request, from: Object.defineProperty({}, "jd", { get: getter, enumerable: true }) };
    const searcher = await synthetic(() => { throw new Error("Malformed request evaluated."); }, () => 0);
    for (const input of [accessor, hidden, symbol, nested]) {
      expect(() => searcher.searchIngresses(input as IngressSearchRequest)).toThrow(RangeError);
    }
    expect(getter).not.toHaveBeenCalled();
    expect(searcher.calls).toEqual([]);
  });
});
