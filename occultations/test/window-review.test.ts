import { afterEach, describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import * as shadows from "../src/shadow-geometry.js";
import { searchLunarContacts } from "../src/contacts.js";
import { searchWindow } from "../src/window.js";
import type { WindowQuery, WindowRequest, WindowResult } from "../src/window.js";

// Cross-search contracts and resource accounting only. Existing engine outputs
// here are integration inputs, never independent sky-accuracy expectations.
const MINUTE = { from: "2024-01-01T00:00:00Z", to: "2024-01-01T00:01:00Z" };
const OUTLINE: WindowQuery = { kind: "visibility-outline", target: "Saturn", longitudes: [0] };
const CONJUNCTION: WindowQuery = { kind: "conjunction", first: "Moon", second: "Mars",
  coordinate: "right-ascension" };

function complete(result: WindowResult) {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Unexpected refusal: ${result.failure.reason}`);
  return result;
}

afterEach(() => vi.restoreAllMocks());

describe("shared window cross-search review", () => {
  it("preserves an unresolved meridian while completing the other requested searches", () => {
    // Force a geometric degeneracy at one meridian, while keeping the real
    // search orchestration, time basis, budget counters and source receipts.
    vi.spyOn(shadows, "meridianShadowIntervals")
      .mockReturnValue({ unresolved: false, intervals: [] })
      .mockReturnValueOnce({ unresolved: true, intervals: [] });
    const result = complete(searchWindow({ window: MINUTE,
      queries: [{ kind: "visibility-outline", target: "Saturn", longitudes: [0, 10] }, CONJUNCTION] }));
    expect(result.receipt.work).toMatchObject({ attemptedQueries: 2, completedQueries: 2, unresolvedMeridians: 1 });
    const outline = result.results[0]!;
    if (outline.kind !== "visibility-outline") throw new Error("Wrong dispatch");
    expect(outline.result.meridians).toHaveLength(2);
    expect(outline.result.meridians[0]).toMatchObject({ longitudeDegrees: 0,
      status: "unresolved", reason: "degenerate-intersection", overlap: [], full: [] });
    expect(outline.result.meridians[1]).toMatchObject({ longitudeDegrees: 10,
      status: "resolved", reason: null, overlap: [], full: [] });
    expect(outline.result.meridians.every((row) => row.receipt === result.receipt.searches[0]!.receipt)).toBe(true);
    expect(result.receipt.limitations).toContain("outline-meridians-may-remain-unresolved;inspect-each-status");
    expect(result.receipt.limitations).toContain("complete-means-finished;not-completeness-or-physical-accuracy");
  });

  it("copies bounded array slots without reading caller iterators", () => {
    const queries: WindowQuery[] = [{ kind: "visibility-outline", target: "Saturn", longitudes: [180, 0] }];
    const longitudes = (queries[0] as Extract<WindowQuery, { kind: "visibility-outline" }>).longitudes!;
    let iteratorReads = 0;
    for (const values of [queries, longitudes]) {
      Object.defineProperty(values, Symbol.iterator, { get() {
        iteratorReads += 1;
        throw new Error("Custom iterators must not be read");
      } });
    }
    const result = complete(searchWindow({ window: MINUTE, queries }));
    expect(iteratorReads).toBe(0);
    expect(result.results).toHaveLength(1);
    expect(result.receipt.request.queries[0]).toMatchObject({ kind: "visibility-outline", longitudes: [-180, 0] });
    expect(Object.isFrozen(queries)).toBe(false);
    expect(Object.isFrozen(longitudes)).toBe(false);
  });

  it("does not let custom iterators disguise missing slots or excessive array lengths", () => {
    const positions = vi.spyOn(engine, "positionAt");
    let iteratorCalls = 0;
    const sparseQueries = new Array<WindowQuery>(1);
    sparseQueries[Symbol.iterator] = function* () { iteratorCalls += 1; yield CONJUNCTION; return undefined; };
    const tooManyQueries = Array<WindowQuery>(33).fill(CONJUNCTION);
    tooManyQueries[Symbol.iterator] = function* () { iteratorCalls += 1; yield CONJUNCTION; return undefined; };
    const sparseLongitudes = new Array<number>(1);
    sparseLongitudes[Symbol.iterator] = function* () { iteratorCalls += 1; yield 0; return undefined; };
    const tooManyLongitudes = Array<number>(145).fill(0);
    tooManyLongitudes[Symbol.iterator] = function* () { iteratorCalls += 1; yield 0; return undefined; };
    for (const queries of [sparseQueries, tooManyQueries]) {
      expect(() => searchWindow({ window: MINUTE, queries })).toThrow(RangeError);
    }
    for (const longitudes of [sparseLongitudes, tooManyLongitudes]) {
      expect(() => searchWindow({ window: MINUTE,
        queries: [{ kind: "visibility-outline", target: "Saturn", longitudes }] })).toThrow(RangeError);
    }
    expect(iteratorCalls).toBe(0);
    expect(positions).not.toHaveBeenCalled();
  });

  it("debits outline intersections across queries while allowing unrelated searches after exhaustion", () => {
    const positions = vi.spyOn(engine, "positionAt");
    const first = complete(searchWindow({ window: MINUTE, queries: [OUTLINE, CONJUNCTION], maxIntersections: 4 }));
    expect(first.receipt.work.intersections).toBe(4);
    expect(first.receipt.work.completedQueries).toBe(2);
    const firstCalls = positions.mock.calls.length;
    positions.mockClear();

    const exhausted = searchWindow({ window: MINUTE, queries: [OUTLINE, CONJUNCTION, OUTLINE], maxIntersections: 4 });
    expect(exhausted).toMatchObject({ status: "refused", reason: "intersection-budget", results: [],
      failure: { queryIndex: 2, kind: "visibility-outline", reason: "intersection-budget", receipt: null, details: null } });
    expect(exhausted.receipt.work).toMatchObject({ intersections: 4, attemptedQueries: 2, completedQueries: 2 });
    expect(exhausted.receipt.searches.map(({ status }) => status)).toEqual(["complete", "complete"]);
    expect(positions.mock.calls.length).toBe(firstCalls);

    const almost = searchWindow({ window: MINUTE, queries: [OUTLINE, OUTLINE], maxIntersections: 7 });
    expect(almost).toMatchObject({ status: "refused", reason: "search-refused", results: [],
      failure: { queryIndex: 1, reason: "intersection-budget",
        receipt: { request: { maxIntersections: 3 }, search: { samples: 0, intersections: 0 } } } });
    expect(almost.receipt.work).toMatchObject({ samples: 2, intersections: 4, attemptedQueries: 2, completedQueries: 1 });

    const enough = complete(searchWindow({ window: MINUTE, queries: [OUTLINE, OUTLINE], maxIntersections: 8 }));
    expect(enough.receipt.work).toMatchObject({ samples: 4, intersections: 8, completedQueries: 2 });
    expect(enough.receipt.searches.map(({ receipt }) => "maxIntersections" in receipt.request
      ? receipt.request.maxIntersections : null)).toEqual([8, 4]);
  });

  it("retains a later appulse stencil seam refusal after a valid conjunction search", () => {
    // The selected window is before the leap second. Only the appulse's
    // derivative stencil crosses it; the preceding conjunction is valid.
    const window = { from: "2016-12-31T23:58:00Z", to: "2016-12-31T23:59:30Z" };
    const appulse: WindowQuery = { kind: "appulse", first: "Moon", second: "Mars", maximumSeparationDegrees: 10 };
    // Give the first query an analytic crossing inside this short window, so
    // atomic refusal must discard a nonempty event list. No sky claim follows.
    const positionAt = engine.positionAt, root = Date.parse("2016-12-31T23:58:45Z");
    const positions = vi.spyOn(engine, "positionAt").mockImplementation((request) => {
      const position = positionAt(request);
      return position.status === "ok" ? { ...position,
        lon: request.body === "Moon" ? 30 + (new Date(request.time).getTime() - root) * 0.00001 : 30 } : position;
    });
    const first = complete(searchWindow({ window, queries: [CONJUNCTION] }));
    expect(first.results[0]!.kind).toBe("conjunction");
    if (first.results[0]!.kind !== "conjunction") throw new Error("Wrong dispatch");
    expect(first.results[0]!.result.events).toHaveLength(1);
    positions.mockClear();
    const result = searchWindow({ window, queries: [CONJUNCTION, appulse, OUTLINE] });
    expect(result).toMatchObject({ status: "refused", reason: "search-refused", results: [],
      failure: { queryIndex: 1, kind: "appulse", reason: "time-discontinuity",
        receipt: { seams: [{ at: "2017-01-01T00:00:00.000Z", kind: "leap-second" }],
          search: { samples: 0, evaluationWindow: { to: "2017-01-01T00:00:30.001Z" } } } } });
    expect(result.receipt.searches.map(({ kind, status }) => ({ kind, status })))
      .toEqual([{ kind: "conjunction", status: "complete" }, { kind: "appulse", status: "refused" }]);
    expect(result.receipt.work.samples).toBe(first.receipt.work.samples);
    expect(positions).toHaveBeenCalledTimes(2 * first.receipt.work.samples);
    if (result.status !== "refused") throw new Error("Expected stencil refusal");
    expect(result.failure.receipt).toBe(result.receipt.searches[1]!.receipt);
    expect(result.receipt.searches[0]!.receipt).toEqual(first.receipt.searches[0]!.receipt);
  });

  it("charges contact sky work once in the shared budget", () => {
    const request = { target: "Saturn" as const, observer: { latitude: -20, longitude: 0 },
      window: { from: "2024-05-31", to: "2024-06-01" } };
    const individual = searchLunarContacts(request);
    expect(individual.status).toBe("complete");
    if (individual.status !== "complete") throw new Error("Development integration window refused");
    expect(individual.receipt.search.skyEvaluations).toBeGreaterThan(0);
    const { window, ...options } = request;
    const query: WindowQuery = { kind: "lunar-contacts", ...options };
    const positions = vi.spyOn(engine, "positionAt");
    const pair = complete(searchWindow({ window, queries: [query, query],
      maxSamples: 2 * individual.receipt.search.samples }));
    expect(pair.receipt.work.samples).toBe(2 * individual.receipt.search.samples);
    expect(pair.receipt.work.completedQueries).toBe(2);
    // A paired sample calls two adapters; each counted composite sky sample
    // calls the Sun adapter once, plus the engine phase/geometry helpers.
    expect(positions).toHaveBeenCalledTimes(2 * pair.receipt.work.samples - 2 * individual.receipt.search.skyEvaluations);
    for (const entry of pair.results) {
      expect(entry.kind).toBe("lunar-contacts");
      if (entry.kind !== "lunar-contacts") throw new Error("Wrong dispatch");
      expect(entry.result.contacts.map(({ at, kind, sky }) => ({ at, kind, sky })))
        .toEqual(individual.contacts.map(({ at, kind, sky }) => ({ at, kind, sky })));
      expect(entry.result.receipt.search.skyEvaluations).toBe(individual.receipt.search.skyEvaluations);
    }
  });

  it.each([
    { kind: "visibility-outline", target: "Saturn", longitudes: [-180, 180] },
    { kind: "visibility-outline", target: "Saturn", longitudes: [0, -0] },
    { kind: "visibility-outline", target: "Saturn", longitudes: new Array(1) },
    { ...CONJUNCTION, window: MINUTE },
    { kind: "lunar-contacts", target: "Saturn", observer: { latitude: 0, longitude: 0, elevationMeters: Infinity } }
  ])("validates the entire later query before beginning any valid query %#", (invalid) => {
    const positions = vi.spyOn(engine, "positionAt");
    expect(() => searchWindow({ window: MINUTE, queries: [CONJUNCTION, invalid] } as WindowRequest)).toThrow(RangeError);
    expect(positions).not.toHaveBeenCalled();
  });
});
