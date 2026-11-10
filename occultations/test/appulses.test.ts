import { describe, expect, it } from "vitest";
import { CALC_SPAN } from "../../src/calc.js";
import { timeBasis } from "../../src/time-scale.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { APPULSE_LIMITS, positionAt, searchAppulses, searchConjunctions } from "../src/index.js";

type Request = Parameters<typeof searchAppulses>[0];
type Result = ReturnType<typeof searchAppulses>;
type Body = Request["first"];
const DAY = 86_400_000;
const LUNAR: Request = {
  first: "Moon", second: "Mars", maximumSeparationDegrees: 10,
  window: { from: "2024-01-10T00:00:00Z", to: "2024-01-11T00:00:00Z" }
};
const PLANETS: Request = {
  first: "Jupiter", second: "Saturn", maximumSeparationDegrees: 10,
  window: { from: "2020-12-21T00:00:00Z", to: "2020-12-22T00:00:00Z" }
};

function complete(result: Result): Extract<Result, { status: "complete" }> {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Unexpected appulse refusal: ${result.reason}`);
  return result;
}

function expectDeepFrozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectDeepFrozen(child);
  }
}

function positions(first: Body, second: Body, at: string) {
  const a = positionAt({ body: first, time: at, frame: "equatorial-true-of-date" });
  const b = positionAt({ body: second, time: at, frame: "equatorial-true-of-date" });
  if (a.status !== "ok" || b.status !== "ok") throw new Error("Unexpected integration position refusal");
  return { a, b };
}

// The haversine form checks reduction of adapter directions independently of
// the search's vector geometry. These are integration checks, not sky accuracy.
function separation(first: Body, second: Body, at: string): number {
  const { a, b } = positions(first, second, at);
  const radians = Math.PI / 180;
  const haversine = Math.sin((a.lat - b.lat) * radians / 2) ** 2 +
    Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin((a.lon - b.lon) * radians / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) / radians;
}

describe("real engine appulse integration, not accuracy", () => {
  it.each([LUNAR, PLANETS])("returns a spherical minimum distinct from both coordinate conjunctions %#", (request) => {
    const result = complete(searchAppulses(request));
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.kind).toBe("appulse");
    expect(event.first).toBe(request.first);
    expect(event.second).toBe(request.second);
    expect(event.separationDegrees).toBeCloseTo(separation(request.first, request.second, event.at), 10);
    for (const offset of [-300_000, 300_000]) {
      const neighbor = new Date(Date.parse(event.at) + offset).toISOString();
      expect(event.separationDegrees).toBeLessThan(separation(request.first, request.second, neighbor));
    }
    for (const coordinate of ["right-ascension", "ecliptic-longitude"] as const) {
      const conjunctions = searchConjunctions({
        first: request.first, second: request.second, window: request.window, coordinate
      });
      expect(conjunctions.status).toBe("complete");
      expect(conjunctions.events).toHaveLength(1);
      expect(event.at).not.toBe(conjunctions.events[0]!.at);
      expect(event.separationDegrees).toBeLessThan(conjunctions.events[0]!.separationDegrees);
    }
    const { a, b } = positions(request.first, request.second, event.at);
    expect(event.receipt.first).toEqual(a.receipt);
    expect(event.receipt.second).toEqual(b.receipt);
    expect(event.receipt.timeBasis).toEqual(timeBasis(Date.parse(event.at)));
    expect(event.receipt.search).toBe(result.receipt);
    expect(result.receipt.frame).toBe("equatorial-true-of-date");
    expect(result.receipt.search.completeness).toBe("sampled;not-proven");
    expect(result.receipt.engine).toEqual({ name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: EPHEMERIS });
  });

  it.each([LUNAR, PLANETS])("preserves minimum instants and separation under pair reversal %#", (request) => {
    const forward = complete(searchAppulses(request));
    const reversed = complete(searchAppulses({ ...request, first: request.second, second: request.first }));
    expect(reversed.events.map((event) => [event.at, event.separationDegrees]))
      .toEqual(forward.events.map((event) => [event.at, event.separationDegrees]));
    expect(reversed.events[0]!.receipt.first.request.body).toBe(request.second);
    expect(reversed.events[0]!.receipt.second.request.body).toBe(request.first);
  });

  it("applies the requested angular cap inclusively without moving the event", () => {
    const broad = complete(searchAppulses(LUNAR));
    const event = broad.events[0]!;
    const exact = complete(searchAppulses({ ...LUNAR, maximumSeparationDegrees: event.separationDegrees }));
    expect(exact.events.map((item) => [item.at, item.separationDegrees])).toEqual([[event.at, event.separationDegrees]]);
    const below = complete(searchAppulses({ ...LUNAR, maximumSeparationDegrees: event.separationDegrees / 2 }));
    expect(below.events).toEqual([]);
    expect(below.receipt.request.maximumSeparationDegrees).toBe(event.separationDegrees / 2);
    expect(complete(searchAppulses({ ...LUNAR, maximumSeparationDegrees: 0 })).events).toEqual([]);
    const widest = complete(searchAppulses({ ...LUNAR, maximumSeparationDegrees: 180 }));
    expect(widest.events.map((item) => [item.at, item.separationDegrees]))
      .toEqual(broad.events.map((item) => [item.at, item.separationDegrees]));
  });

  it.each<Body>(["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"])(
    "accepts Moon/%s with an explicit cap", (second) => {
      const result = complete(searchAppulses({ ...LUNAR, second,
        window: { from: "2024-01-01", to: "2024-01-01T01:00:00Z" } }));
      expect(result.receipt.request.second).toBe(second);
      expect(result.receipt.search.samples).toBeGreaterThan(0);
    }
  );

  it("returns an empty receipted search when the window contains no minimum", () => {
    const result = complete(searchAppulses({ ...LUNAR, window: { from: "2024-01-01", to: "2024-01-02" } }));
    expect(result.events).toEqual([]);
    expect(result.receipt.search.samples).toBeGreaterThan(0);
    expectDeepFrozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("records bounded settings and the expanded evaluation interval", () => {
    expect(APPULSE_LIMITS).toEqual({
      defaultStepDays: 0.25, maximumStepDays: 0.25,
      defaultMaxSamples: 10_000, maximumMaxSamples: 100_000,
      derivativeHalfWidthMilliseconds: 60_000
    });
    const result = complete(searchAppulses({ ...LUNAR, stepDays: (3_600_000 + 0.75) / DAY }));
    expect(result.receipt.search).toMatchObject({
      stepMilliseconds: 3_600_000, maxSamples: APPULSE_LIMITS.defaultMaxSamples,
      stencilHalfWidthMilliseconds: 60_000,
      evaluationWindow: { from: "2024-01-09T23:58:59.999Z", to: "2024-01-11T00:01:00.001Z" }
    });
    expect(result.receipt.search.samples).toBeGreaterThan(0);
    expect(result.receipt.search.samples).toBeLessThanOrEqual(result.receipt.search.maxSamples);
  });

  it("returns repeatable immutable JSON snapshots without freezing caller or engine data", () => {
    const from = new Date("2024-01-10T00:00:00Z"), to = new Date("2024-01-11T00:00:00Z");
    const window = { from, to }, request = { ...LUNAR, window };
    const spanWasFrozen = Object.isFrozen(CALC_SPAN), ephemerisWasFrozen = Object.isFrozen(EPHEMERIS);
    const result = complete(searchAppulses(request));
    expectDeepFrozen(result);
    for (const value of [request, window, from, to]) expect(Object.isFrozen(value)).toBe(false);
    expect(Object.isFrozen(CALC_SPAN)).toBe(spanWasFrozen);
    expect(Object.isFrozen(EPHEMERIS)).toBe(ephemerisWasFrozen);
    const restored = JSON.parse(JSON.stringify(result)) as Result;
    expect(restored).toEqual(result);
    expect(searchAppulses(restored.receipt.request)).toEqual(result);
    from.setUTCFullYear(2030);
    to.setUTCFullYear(2030);
    expect(result.receipt.request.window).toEqual({
      from: "2024-01-10T00:00:00.000Z", to: "2024-01-11T00:00:00.000Z"
    });
    expect(() => { (result.events as unknown as unknown[]).pop(); }).toThrow(TypeError);
    expect(() => { (result.receipt.request.window as { from: string }).from = "changed"; }).toThrow(TypeError);
    expect(searchAppulses(LUNAR)).toEqual(result);
  });
});

describe("appulse budgets and input boundaries", () => {
  it("refuses an unaffordable coarse scan before any positions are sampled", () => {
    const result = searchAppulses({ ...LUNAR, maxSamples: 1 });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", events: [],
      receipt: { search: { samples: 0, maxSamples: 1 }, request: { maxSamples: 1 } } });
    expectDeepFrozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("charges refinement and output positions to the same budget and never returns a partial list", () => {
    const request = { ...LUNAR, window: { from: "2024-01-01", to: "2024-02-15" } };
    const full = complete(searchAppulses(request));
    expect(full.events.length).toBeGreaterThanOrEqual(2);
    const budget = full.receipt.search.samples - 1;
    const result = searchAppulses({ ...request, maxSamples: budget });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", events: [],
      receipt: { search: { samples: budget, maxSamples: budget } } });
    expectDeepFrozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each([
    { from: "2017-01-01T00:00:30Z", to: "2017-01-01T00:00:45Z" },
    { from: "2016-12-31T23:59:15Z", to: "2016-12-31T23:59:30Z" },
    { from: "2016-12-31T23:59:30Z", to: "2017-01-01T00:00:30Z" }
  ])("refuses clock discontinuities reached by either derivative halo %#", (window) => {
    const result = searchAppulses({ ...LUNAR, window });
    expect(result).toMatchObject({ status: "refused", reason: "time-discontinuity", events: [],
      receipt: { search: { samples: 0 }, seams: [{ at: "2017-01-01T00:00:00.000Z", kind: "leap-second" }] } });
    expectDeepFrozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each([
    { from: "1700-01-01", to: "1700-01-02" },
    { from: "1800-01-01T00:00:30Z", to: "1800-01-01T00:00:45Z" },
    { from: "2200-01-01", to: "2200-01-02" },
    { from: new Date(-8_640_000_000_000_000), to: new Date(8_640_000_000_000_000) }
  ])("refuses a window or its derivative halo outside the engine span %#", (window) => {
    const result = searchAppulses({ ...LUNAR, window });
    expect(result).toMatchObject({ status: "refused", reason: "out-of-range", events: [],
      receipt: { search: { samples: 0 } } });
    expectDeepFrozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("captures own request fields once and rejects inherited required fields", () => {
    let reads = 0;
    const result = searchAppulses({ ...LUNAR,
      get second() { return ++reads === 1 ? "Mars" : "Moon"; }
    });
    expect(reads).toBe(1);
    expect(result).toEqual(searchAppulses(LUNAR));
    expect(() => searchAppulses(Object.create(LUNAR) as Request)).toThrow(RangeError);
  });

  it.each([
    null, [], {},
    { first: "Moon", second: "Mars", window: LUNAR.window },
    ...["Sun", "Earth", "North Node", "moon", "sao:157923", null]
      .flatMap((body) => [{ ...LUNAR, first: body }, { ...LUNAR, second: body }]),
    { ...LUNAR, second: "Moon" },
    ...[-1, 180.0001, Number.NaN, Infinity, null, "10"]
      .map((maximumSeparationDegrees) => ({ ...LUNAR, maximumSeparationDegrees })),
    { ...LUNAR, window: null },
    { ...LUNAR, window: { from: "2024-02-30", to: "2024-03-01" } },
    { ...LUNAR, window: { from: "2024-01-10T00:00:00", to: "2024-01-11" } },
    { ...LUNAR, window: { from: "2024-01-10", to: "2024-01-10" } },
    { ...LUNAR, window: { from: "2024-01-11", to: "2024-01-10" } },
    { ...LUNAR, window: { from: new Date(Number.NaN), to: "2024-01-11" } },
    ...[0, -1, 1.5, Infinity, Number.NaN, null, "10", 100_001]
      .map((maxSamples) => ({ ...LUNAR, maxSamples })),
    ...[0, -1, Infinity, Number.NaN, null, "0.25", 0.5 / DAY, 0.26]
      .map((stepDays) => ({ ...LUNAR, stepDays })),
    { ...LUNAR, coordinate: "right-ascension" },
    { ...LUNAR, observer: { latitude: 0, longitude: 0 } },
    { ...LUNAR, [Symbol("unknown")]: true }
  ])("rejects malformed or unsupported appulse request %#", (request) => {
    expect(() => searchAppulses(request as Request)).toThrow(RangeError);
  });
});
