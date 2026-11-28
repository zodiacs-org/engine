import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import {
  WINDOW_LIMITS, searchWindow, searchConjunctions, searchAppulses, searchLunarOccultations,
  searchLunarContacts, lunarVisibilityOutline, starCatalogue
} from "../src/index.js";
import type { WindowQuery, WindowRequest, WindowResult } from "../src/index.js";

const window = { from: "2024-01-01T00:00:00Z", to: "2024-01-01T00:01:00Z" };
const conjunction = { kind: "conjunction", first: "Moon", second: "Mars", coordinate: "right-ascension" } as const;
const request: WindowRequest = { window, queries: [conjunction] };
const complete = (result: WindowResult) => {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Unexpected refusal: ${result.reason}/${result.failure.reason}`);
  return result;
};
function frozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(frozen);
  }
}

// Composition tests establish transport/delegation, not additional sky accuracy.
describe("explicit window API", () => {
  it("preserves each calculation and its receipt, including receipted empty results", () => {
    const star = starCatalogue().stars.find((row) => row.label === "Spica")!;
    const queries: WindowQuery[] = [conjunction,
      { kind: "appulse", first: "Moon", second: "Mars", maximumSeparationDegrees: 1 },
      { kind: "lunar-occultations", target: star.id as `sao:${number}` },
      { kind: "lunar-contacts", target: "Saturn", observer: { latitude: 0, longitude: 0 } },
      { kind: "visibility-outline", target: "Saturn", longitudes: [180, 0, -45] }
    ];
    const result = complete(searchWindow({ window, queries }));
    expect(result.results.map((entry) => entry.kind)).toEqual(queries.map((query) => query.kind));
    expect(result.results.map((entry) => entry.queryIndex)).toEqual([0, 1, 2, 3, 4]);
    for (const [index, entry] of result.results.entries()) {
      const query = result.receipt.request.queries[index]!;
      const { kind, ...options } = query;
      let direct;
      switch (kind) {
        case "conjunction": direct = searchConjunctions({ window, ...options } as Parameters<typeof searchConjunctions>[0]); break;
        case "appulse": direct = searchAppulses({ window, ...options } as Parameters<typeof searchAppulses>[0]); break;
        case "lunar-occultations": direct = searchLunarOccultations({ window, ...options } as Parameters<typeof searchLunarOccultations>[0]); break;
        case "lunar-contacts": direct = searchLunarContacts({ window, ...options } as Parameters<typeof searchLunarContacts>[0]); break;
        case "visibility-outline": direct = lunarVisibilityOutline({ window, ...options } as Parameters<typeof lunarVisibilityOutline>[0]); break;
      }
      expect(entry.result).toEqual(direct);
      expect(result.receipt.searches[index]!.receipt).toBe(entry.result.receipt);
    }
    expect(result.receipt.work.samples).toBe(result.results.reduce((total, entry) => total + entry.result.receipt.search.samples, 0));
    expect(result.receipt.work).toMatchObject({ attemptedQueries: 5, completedQueries: 5, unresolvedMeridians: 0 });
    expect(result.receipt.engine).toEqual({ name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: EPHEMERIS });
    frozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(searchWindow(result.receipt.request)).toEqual(result);
  });

  it("keeps coordinate conjunctions and appulses separate in a window with actual events", () => {
    const result = complete(searchWindow({ window: { from: "2020-12-21", to: "2020-12-22" }, queries: [
      { kind: "conjunction", first: "Jupiter", second: "Saturn", coordinate: "right-ascension" },
      { kind: "conjunction", first: "Jupiter", second: "Saturn", coordinate: "ecliptic-longitude" },
      { kind: "appulse", first: "Jupiter", second: "Saturn", maximumSeparationDegrees: 1 }
    ] }));
    const times: string[] = [];
    for (const entry of result.results) {
      if (entry.kind !== "conjunction" && entry.kind !== "appulse") throw new Error("Wrong query kind");
      expect(entry.result.events).toHaveLength(1);
      const event = entry.result.events[0]!;
      times.push(event.at);
      expect(event.receipt.search).toBe(entry.result.receipt);
      expect(event.receipt.first.engine).toEqual(result.receipt.engine);
    }
    expect(new Set(times).size).toBe(3);
  });

  it("captures caller inputs without freezing their objects or changing the observer", () => {
    const from = new Date(window.from), to = new Date(window.to), longitudes = [180, -0];
    const observer = { latitude: 20, longitude: -30, elevationMeters: 750 };
    const input: WindowRequest = { window: { from, to }, queries: [
      { kind: "lunar-contacts", target: "Saturn", observer },
      { kind: "visibility-outline", target: "Saturn", longitudes }
    ] };
    const result = complete(searchWindow(input));
    const snapshot = JSON.stringify(result);
    for (const object of [input, input.window, input.queries, observer, longitudes, from, to]) expect(Object.isFrozen(object)).toBe(false);
    observer.elevationMeters = 0; longitudes[0] = 25; from.setUTCFullYear(2030);
    expect(JSON.stringify(result)).toBe(snapshot);
    expect(result.receipt.request.queries[0]).toMatchObject({ observer: { elevationMeters: 750 } });
    expect(result.receipt.request.queries[1]).toMatchObject({ longitudes: [-180, 0] });
  });

  it("discards earlier events on a later child refusal and keeps search provenance", () => {
    const result = searchWindow({ window: { from: "2020-12-21", to: "2020-12-22" }, queries: [
      { ...conjunction, first: "Jupiter", second: "Saturn" },
      { kind: "lunar-occultations", target: "Saturn", maxSamples: 1 }
    ] });
    expect(result).toMatchObject({ status: "refused", reason: "search-refused", results: [],
      failure: { queryIndex: 1, kind: "lunar-occultations", reason: "sample-budget" },
      receipt: { work: { completedQueries: 1, attemptedQueries: 2 } } });
    expect(result.receipt.searches.map((row) => row.status)).toEqual(["complete", "refused"]);
    expect(result.receipt.searches[0]!.receipt.search.samples).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('"events"');
    frozen(result);
  });

  it("reuses unused per-query allowance and does not replenish the aggregate budget", () => {
    const one = complete(searchWindow(request)), used = one.receipt.work.samples;
    expect(used).toBeGreaterThan(0);
    const both = complete(searchWindow({ ...request, queries: [conjunction, conjunction], maxSamples: 2 * used }));
    expect(both.receipt.work.samples).toBe(2 * used);
    expect(both.results[1]!.result.receipt.request.maxSamples).toBe(used);
    const exact = searchWindow({ ...request, queries: [conjunction, conjunction], maxSamples: used });
    expect(exact).toMatchObject({ status: "refused", reason: "sample-budget", results: [],
      failure: { queryIndex: 1, receipt: null }, receipt: { work: { samples: used, attemptedQueries: 1 } } });
    const short = searchWindow({ ...request, queries: [conjunction, conjunction], maxSamples: 2 * used - 1 });
    expect(short.status).toBe("refused");
    expect(short.results).toEqual([]);
    expect(short.receipt.work.samples).toBeLessThanOrEqual(2 * used - 1);
  });

  it("receipts an unsupported clock range without doing position work", () => {
    const result = searchWindow({ ...request, window: { from: "1700-01-01", to: "1700-01-02" } });
    expect(result).toMatchObject({ status: "refused", failure: { reason: "out-of-range" }, results: [],
      receipt: { work: { samples: 0 }, searches: [{ receipt: { boundaryTimeBasis: { from: null, to: null } } }] } });
  });
});

describe("window parsing boundaries", () => {
  it("enforces the documented wrapper caps", () => {
    expect(WINDOW_LIMITS).toEqual({ maximumQueries: 32, defaultMaxSamples: 100_000, maximumMaxSamples: 200_000,
      defaultMaxIntersections: 2_000_000, maximumMaxIntersections: 2_000_000 });
  });
  it.each([
    null, [], {}, { ...request, queries: [] }, { ...request, queries: Array(1) },
    { ...request, queries: Array(33).fill(conjunction) }, { ...request, queries: [null] },
    { ...request, queries: [{ ...conjunction, kind: "recommend" }] },
    { ...request, queries: [{ ...conjunction, window }] },
    { ...request, queries: [{ ...conjunction, observer: { latitude: 0, longitude: 0 } }] },
    { ...request, queries: [{ ...conjunction, first: "Earth" }] },
    { ...request, queries: [{ ...conjunction, second: "Moon" }] },
    { ...request, queries: [{ ...conjunction, second: "sao:0" }] },
    { ...request, queries: [{ ...conjunction, coordinate: "declination" }] },
    { ...request, queries: [{ kind: "appulse", first: "Sun", second: "Mars", maximumSeparationDegrees: 1 }] },
    { ...request, queries: [{ kind: "appulse", first: "Moon", second: "Mars" }] },
    { ...request, queries: [{ kind: "lunar-contacts", target: "Saturn" }] },
    { ...request, queries: [{ kind: "lunar-occultations", target: "Sun" }] },
    { ...request, queries: [{ kind: "visibility-outline", target: "Saturn", longitudes: [-180, 180] }] },
    { ...request, queries: [{ kind: "visibility-outline", target: "Saturn", longitudes: Array(1) }] },
    { ...request, queries: [{ kind: "visibility-outline", target: "Saturn", maxIntersections: null }] },
    ...[null, Infinity, 0, -1, 1.5, "1", 200001].map((maxSamples) => ({ ...request, maxSamples })),
    ...[null, Infinity, 0, 2000001].map((maxIntersections) => ({ ...request, maxIntersections })),
    ...[null, Infinity, 0, 100001].map((maxSamples) => ({ ...request, queries: [{ ...conjunction, maxSamples }] })),
    ...[null, Infinity, 0, 0.5 / 86400000, 1].map((stepDays) => ({ ...request, queries: [{ ...conjunction, stepDays }] })),
    { ...request, ranking: "best" }, { ...request, [Symbol("extra")]: 1 }
  ])("rejects malformed request %#", (input) => {
    expect(() => searchWindow(input as WindowRequest)).toThrow(RangeError);
  });
});
