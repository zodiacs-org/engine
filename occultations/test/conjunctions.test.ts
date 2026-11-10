import { describe, expect, it } from "vitest";
import { CALC_SPAN } from "../../src/calc.js";
import { timeBasis } from "../../src/time-scale.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { CONJUNCTION_LIMITS, positionAt, searchConjunctions, starCatalogue, starPositionAt } from "../src/index.js";
import type { ConjunctionCoordinate, ConjunctionRequest, ConjunctionResult } from "../src/index.js";

// These exercise public contracts and delegation to the same engine. They are
// not independent accuracy evidence; published comparisons have their own file.
const LUNAR: ConjunctionRequest = {
  first: "Moon", second: "Mars", coordinate: "right-ascension",
  window: { from: "2024-01-10T00:00:00Z", to: "2024-01-11T00:00:00Z" }
};
const PLANETS: ConjunctionRequest = {
  first: "Jupiter", second: "Saturn", coordinate: "right-ascension",
  window: { from: "2020-12-21T00:00:00Z", to: "2020-12-22T00:00:00Z" }
};

function complete(result: ConjunctionResult): Extract<ConjunctionResult, { status: "complete" }> {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Unexpected conjunction refusal: ${result.reason}`);
  return result;
}

function expectDeepFrozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectDeepFrozen(child);
  }
}

describe("real engine conjunction integration, not accuracy", () => {
  it.each<ConjunctionCoordinate>(["right-ascension", "ecliptic-longitude"])(
    "delegates a Moon/SAO conjunction in %s and preserves both source receipts", (coordinate) => {
      const star = starCatalogue().stars.find((item) => item.label === "Spica")!;
      const result = complete(searchConjunctions({
        first: "Moon", second: star.id as `sao:${number}`, coordinate,
        window: { from: "2024-01-01", to: "2024-01-15" }
      }));
      expect(result.events).toHaveLength(1);
      const event = result.events[0]!;
      const frame = coordinate === "right-ascension" ? "equatorial-true-of-date" : "ecliptic-true-of-date";
      const moon = positionAt({ body: "Moon", time: event.at, frame });
      const target = starPositionAt({ star: star.id, time: event.at, frame });
      expect(moon.status).toBe("ok");
      expect(target.status).toBe("ok");
      if (moon.status !== "ok" || target.status !== "ok") throw new Error("Event position unexpectedly refused");
      expect(event.first).toBe("Moon");
      expect(event.second).toBe(star.id);
      expect(event.receipt.first).toEqual(moon.receipt);
      expect(event.receipt.second).toEqual(target.receipt);
      expect(event.receipt.second).toMatchObject({ source: star, catalogue: starCatalogue().receipt });
      expect(event.crossCoordinateDifferenceDegrees).toBe(moon.lat - target.lat);
      expect(event.receipt.timeBasis).toEqual(timeBasis(Date.parse(event.at)));
      expect(event.receipt.search).toBe(result.receipt);
      expect(result.receipt.frame).toBe(frame);
      expect(result.receipt.catalogue).toEqual(starCatalogue().receipt);
      expect(result.receipt.star).toEqual(star);
      expect(result.receipt.conventions).toContain("center:geocentric");
      expect(result.receipt.limitations).toContain("catalogue-and-contact-accuracy-unmeasured");
    }
  );

  it.each<ConjunctionCoordinate>(["right-ascension", "ecliptic-longitude"])(
    "preserves %s event instants when a planetary pair is reversed", (coordinate) => {
      const forward = complete(searchConjunctions({ ...PLANETS, coordinate }));
      const reversed = complete(searchConjunctions({ ...PLANETS, first: "Saturn", second: "Jupiter", coordinate }));
      expect(forward.events).toHaveLength(1);
      expect(reversed.events.map((event) => event.at)).toEqual(forward.events.map((event) => event.at));
      const a = forward.events[0]!, b = reversed.events[0]!;
      expect(a.relativeRetrograde).toBe(!b.relativeRetrograde);
      expect(a.crossCoordinateDifferenceDegrees).toBe(-b.crossCoordinateDifferenceDegrees);
      expect(a.coordinateDifferenceDegrees).toBeCloseTo(-b.coordinateDifferenceDegrees, 10);
      expect(a.separationDegrees).toBe(b.separationDegrees);
      expect(b.receipt.first.request.body).toBe("Saturn");
      expect(b.receipt.second.request).toMatchObject({ body: "Jupiter" });
    }
  );

  it("keeps RA and ecliptic conjunctions distinct and labels the coordinate actually searched", () => {
    const ra = complete(searchConjunctions(LUNAR));
    const ecliptic = complete(searchConjunctions({ ...LUNAR, coordinate: "ecliptic-longitude" }));
    expect(ra.events).toHaveLength(1);
    expect(ecliptic.events).toHaveLength(1);
    expect(ra.events[0]!.at).not.toBe(ecliptic.events[0]!.at);
    expect(ra.events[0]!.kind).toBe("right-ascension-conjunction");
    expect(ecliptic.events[0]!.kind).toBe("ecliptic-longitude-conjunction");
    expect(ra.receipt.frame).toBe("equatorial-true-of-date");
    expect(ecliptic.receipt.frame).toBe("ecliptic-true-of-date");
    for (const result of [ra, ecliptic]) {
      expect(result.receipt.search.solver).toBe("@zodiacs/engine/crossings:searchLongitudeCrossingsWith");
      expect(result.receipt.search.completeness).toBe("sampled;not-proven");
      expect(result.receipt.limitations).toContain("coordinate-conjunction-is-not-minimum-separation-or-occultation");
      expect(result.receipt.limitations).toContain("no-physical-timing-bound");
    }
  });

  it.each([LUNAR, PLANETS, {
    ...LUNAR, window: { from: "1900-01-01", to: "1900-02-01" }
  }])("owns returned boundary instants only in the preceding subwindow %#", (request) => {
    const whole = complete(searchConjunctions(request));
    expect(whole.events.length).toBeGreaterThan(0);
    const at = whole.events[0]!.at;
    const left = complete(searchConjunctions({ ...request, window: { from: request.window.from, to: at } }));
    const right = complete(searchConjunctions({ ...request, window: { from: at, to: request.window.to } }));
    expect(left.events.map((event) => event.at)).toEqual([at]);
    expect(right.events.map((event) => event.at)).not.toContain(at);
    expect([...left.events, ...right.events].map((event) => event.at))
      .toEqual(whole.events.map((event) => event.at));
    const singleMillisecond = complete(searchConjunctions({
      ...request, window: { from: new Date(Date.parse(at) - 1), to: at }
    }));
    expect(singleMillisecond.events.map((event) => event.at)).toEqual([at]);
    expect(whole.receipt.search.windowOwnership).toBe("(from,to]");
  });

  it("returns a receipted empty list for a completed window without a conjunction", () => {
    const result = complete(searchConjunctions({ ...LUNAR, window: { from: "2024-01-01", to: "2024-01-02" } }));
    expect(result.events).toEqual([]);
    expect(result.receipt.search.samples).toBeGreaterThan(0);
    expect(result.receipt.request.window).toEqual({
      from: "2024-01-01T00:00:00.000Z", to: "2024-01-02T00:00:00.000Z"
    });
    expect(result.receipt.engine).toEqual({ name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: EPHEMERIS });
    expectDeepFrozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("preserves stellar source provenance even when no event is returned or sampling is refused", () => {
    const star = starCatalogue().stars.find((item) => item.label === "Spica")!;
    const request = { ...LUNAR, second: star.id as `sao:${number}`,
      window: { from: "2024-01-01", to: "2024-01-02" } };
    const empty = complete(searchConjunctions(request));
    const refused = searchConjunctions({ ...request, maxSamples: 1 });
    expect(refused.status).toBe("refused");
    for (const result of [empty, refused]) {
      expect(result.events).toEqual([]);
      expect(result.receipt.catalogue).toEqual(starCatalogue().receipt);
      expect(result.receipt.star).toEqual(star);
      expectDeepFrozen(result);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  });

  it("keeps immutable JSON snapshots and repeatable receipts without freezing caller data", () => {
    const from = new Date("2024-01-10T00:00:00Z"), to = new Date("2024-01-11T00:00:00Z");
    const window = { from, to };
    const request = { ...LUNAR, window };
    const spanWasFrozen = Object.isFrozen(CALC_SPAN), ephemerisWasFrozen = Object.isFrozen(EPHEMERIS);
    const result = complete(searchConjunctions(request));
    expectDeepFrozen(result);
    for (const value of [request, window, from, to]) expect(Object.isFrozen(value)).toBe(false);
    expect(Object.isFrozen(CALC_SPAN)).toBe(spanWasFrozen);
    expect(Object.isFrozen(EPHEMERIS)).toBe(ephemerisWasFrozen);
    const restored = JSON.parse(JSON.stringify(result)) as ConjunctionResult;
    expect(restored).toEqual(result);
    expect(searchConjunctions(restored.receipt.request)).toEqual(result);
    from.setUTCFullYear(2030);
    to.setUTCFullYear(2030);
    window.from = new Date("2024-06-01");
    expect(result.receipt.request.window).toEqual({
      from: "2024-01-10T00:00:00.000Z", to: "2024-01-11T00:00:00.000Z"
    });
    expect(() => { (result.events as unknown as unknown[]).pop(); }).toThrow(TypeError);
    expect(() => { (result.receipt.request.window as { from: string }).from = "changed"; }).toThrow(TypeError);
    expect(searchConjunctions(LUNAR)).toEqual(result);
  });
});

describe("conjunction budgets and input boundaries", () => {
  it("refuses an unaffordable coarse scan before any positions are sampled", () => {
    const result = searchConjunctions({ ...LUNAR, maxSamples: 1 });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", events: [],
      receipt: { search: { samples: 0, maxSamples: 1 }, request: { maxSamples: 1 } } });
    expectDeepFrozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("returns no partial events when the budget expires after earlier roots are resolved", () => {
    const request = { ...LUNAR, window: { from: "2024-01-01", to: "2024-02-15" } };
    const full = complete(searchConjunctions(request));
    expect(full.events.length).toBeGreaterThanOrEqual(2);
    const budget = full.receipt.search.samples - 1;
    const result = searchConjunctions({ ...request, maxSamples: budget });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", events: [],
      receipt: { search: { samples: budget, maxSamples: budget } } });
    if (result.status !== "refused") throw new Error("Expected a whole-window budget refusal");
    expect(result.failure.at).not.toBeNull();
    expect(Date.parse(result.failure.at!)).toBeGreaterThan(Date.parse(full.events[0]!.at));
    expect(complete(searchConjunctions({ ...request, maxSamples: budget,
      window: { from: request.window.from, to: full.events[0]!.at } })).events).toHaveLength(1);
  });

  it.each([
    { from: "1700-01-01", to: "1700-01-02" },
    { from: "1799-12-31T23:59:59.999Z", to: "1800-01-02" },
    { from: "2199-12-31T00:00:00Z", to: "2199-12-31T23:59:59Z" },
    { from: "2200-01-01", to: "2200-01-02" },
    { from: new Date(-8_640_000_000_000_000), to: new Date(8_640_000_000_000_000) }
  ])("returns a zero-sample refusal for a valid out-of-span window %#", (window) => {
    const result = searchConjunctions({ ...LUNAR, window });
    expect(result).toMatchObject({ status: "refused", reason: "out-of-range", events: [],
      receipt: { search: { samples: 0 } } });
    expectDeepFrozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("captures own request fields once and rejects prototype-supplied required fields", () => {
    let reads = 0;
    const result = searchConjunctions({ ...LUNAR,
      get second() { return ++reads === 1 ? "Mars" : "Moon"; }
    });
    expect(reads).toBe(1);
    expect(result).toEqual(searchConjunctions(LUNAR));
    expect(() => searchConjunctions(Object.create(LUNAR) as ConjunctionRequest)).toThrow(RangeError);
  });

  it.each([
    null, [], {},
    { ...LUNAR, first: "Earth" }, { ...LUNAR, first: "North Node" }, { ...LUNAR, first: "moon" },
    { ...LUNAR, first: "sao:157923" }, { ...LUNAR, second: "Moon" }, { ...LUNAR, second: "Spica" },
    { ...LUNAR, second: "sao:0" }, { ...LUNAR, second: "sao:0157923" }, { ...LUNAR, second: null },
    { ...LUNAR, coordinate: null }, { ...LUNAR, coordinate: "declination" },
    { ...LUNAR, window: null }, { ...LUNAR, window: { from: "2024-02-30", to: "2024-03-01" } },
    { ...LUNAR, window: { from: "2024-01-10T00:00:00", to: "2024-01-11" } },
    { ...LUNAR, window: { from: "2024-01-10", to: "2024-01-10" } },
    { ...LUNAR, window: { from: "2024-01-11", to: "2024-01-10" } },
    { ...LUNAR, window: { from: new Date(Number.NaN), to: "2024-01-11" } },
    ...[0, -1, 1.5, Infinity, Number.NaN, null, "10", CONJUNCTION_LIMITS.maximumMaxSamples + 1]
      .map((maxSamples) => ({ ...LUNAR, maxSamples })),
    ...[0, -1, Infinity, Number.NaN, null, "0.25", 0.5 / 86_400_000, CONJUNCTION_LIMITS.maximumStepDays + 0.01]
      .map((stepDays) => ({ ...LUNAR, stepDays })),
    { ...LUNAR, observer: { latitude: 0, longitude: 0 } },
    { ...LUNAR, [Symbol("unknown")]: true }
  ])("rejects malformed or unsupported conjunction request %#", (request) => {
    expect(() => searchConjunctions(request as ConjunctionRequest)).toThrow(RangeError);
  });
});
