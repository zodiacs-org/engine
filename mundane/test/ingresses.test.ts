import { afterEach, describe, expect, it, vi } from "vitest";
import { searchLongitudeCrossingsWith } from "../../src/crossings.js";
import * as returns from "../../src/returns.js";
import * as casting from "../src/chart.js";
import {
  analyzeAngularity, analyzeAngleRulers, CARDINAL_INGRESSES, castEventChart, searchIngresses
} from "../src/index.js";
import type { IngressSearchOptions, MundaneRequest } from "../src/index.js";

const place = { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 };
const request = { year: 2000, place };
const DAY = 86_400_000;
const epoch = Date.parse("2000-01-01T00:00:00Z");
afterEach(() => vi.restoreAllMocks());

// Hand-defined linear geometry, not an astronomical reference: Sun longitude
// is elapsed days modulo 360. Cardinal roots occur at days 0, 90, 180, 270.
// Keep the real engine crossing solver and real chart casting in these tests.
function syntheticSun() {
  return vi.spyOn(returns, "searchLongitudeCrossings").mockImplementation(
    (body, target, from, to, options) => searchLongitudeCrossingsWith(
      (_, date) => (((date.getTime() - epoch) / DAY) % 360 + 360) % 360,
      body, target, new Date(from), new Date(to), options
    )
  );
}

function frozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) frozen(child);
  }
}

describe("ingress range and budget contracts with hand-defined motion", () => {
  it("keeps exact closing roots and excludes exact opening roots in adjacent windows", () => {
    syntheticSun();
    const boundary = new Date(epoch + 90 * DAY);
    const first = searchIngresses({ place, from: epoch, to: boundary });
    const next = searchIngresses({ place, from: boundary, to: epoch + 270 * DAY });
    expect(first.status).toBe("complete");
    expect(first.ingresses.map(row => [row.sign, row.at])).toEqual([
      ["Cancer", boundary.toISOString()]
    ]);
    expect(next.ingresses.map(row => [row.sign, row.at])).toEqual([
      ["Libra", new Date(epoch + 180 * DAY).toISOString()],
      ["Capricorn", new Date(epoch + 270 * DAY).toISOString()]
    ]);
  });

  it("supports empty event ranges and a millisecond window ending exactly at a root", () => {
    syntheticSun();
    const at = epoch + 90 * DAY;
    expect(searchIngresses({ place, from: epoch, to: epoch + DAY }).ingresses).toEqual([]);
    expect(searchIngresses({ place, from: at - 1, to: at }).ingresses.map(row => row.at))
      .toEqual([new Date(at).toISOString()]);
    expect(searchIngresses({ place, from: at, to: at + 1 }).ingresses).toEqual([]);
  });

  it("preserves integer-Date sampling for a synthetic submillisecond root", () => {
    // Artificial continuous root at epoch + half a millisecond. The solver
    // evaluates integer Dates: the first positive offset is at epoch + 1.
    vi.spyOn(returns, "searchLongitudeCrossings").mockImplementation((body, target, from, to, options) =>
      searchLongitudeCrossingsWith(
        (_, date) => (360 + date.getTime() - epoch - 0.5) % 360,
        body, target, new Date(from), new Date(to), options
      )
    );
    expect(searchIngresses({ place, from: epoch, to: epoch + 1 }).ingresses.map(row => row.at))
      .toEqual([new Date(epoch + 1).toISOString()]);
  });

  it("sorts roots across repeated signs rather than grouping them by target", () => {
    syntheticSun();
    // A coarse grid beginning five days earlier lands exactly on each root.
    const result = searchIngresses({ place, from: epoch - 5 * DAY, to: epoch + 366 * DAY });
    expect(result.status).toBe("complete");
    expect(result.ingresses.map(row => [row.sign, Date.parse(row.at) - epoch])).toEqual([
      ["Aries", 0], ["Cancer", 90 * DAY], ["Libra", 180 * DAY],
      ["Capricorn", 270 * DAY], ["Aries", 360 * DAY]
    ]);
  });

  it("refuses combined coarse work before any longitude scan or casting", () => {
    const scan = syntheticSun();
    const cast = vi.spyOn(casting, "castEventChart");
    const result = searchIngresses(request, { maxSamples: 299 });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", samples: 0, ingresses: [] });
    expect(scan).not.toHaveBeenCalled();
    expect(cast).not.toHaveBeenCalled();
    frozen(result);
  });

  it("discards earlier successful target roots when a later refinement exhausts the shared budget", () => {
    const scan = syntheticSun();
    const cast = vi.spyOn(casting, "castEventChart");
    // Offset the sample grid by one day so every cardinal root needs
    // refinement. Coarse work is 74 samples per target, and each root adds
    // the solver's 24 refinement samples: total 392 if all scans complete.
    const result = searchIngresses({ place, from: epoch + DAY, to: epoch + 366 * DAY }, { maxSamples: 390 });
    expect(result.status).toBe("refused");
    expect(result.samples).toBe(390);
    expect(result.ingresses).toEqual([]);
    expect(scan.mock.calls.length).toBeGreaterThan(1);
    expect(cast).not.toHaveBeenCalled();
    expect(scan.mock.calls[1]![4]!.maxSamples).toBeLessThan(390);
  });

  it("accounts for an engine coarse refusal after earlier scans used refinement samples", () => {
    syntheticSun();
    const cast = vi.spyOn(casting, "castEventChart");
    const result = searchIngresses({ place, from: epoch + DAY, to: epoch + 366 * DAY }, { maxSamples: 300 });
    expect(result.status).toBe("refused");
    expect(result.samples).toBe(294);
    expect(result.ingresses).toEqual([]);
    expect(cast).not.toHaveBeenCalled();
  });

  it("completes with an exactly exhausted budget", () => {
    syntheticSun();
    const baseline = searchIngresses(request);
    const exact = searchIngresses(request, { maxSamples: baseline.samples });
    expect(exact.status).toBe("complete");
    expect(exact.samples).toBe(baseline.samples);
    expect(exact.ingresses).toEqual(baseline.ingresses);
  });
});

// These are engine integration and coverage checks, not accuracy evidence.
describe("ingress engine integration", () => {
  it("searches each cardinal longitude, sorts charts, and includes existing analyses", () => {
    const result = searchIngresses(request);
    expect(result.status).toBe("complete");
    expect(result.ingresses.map(row => row.sign)).toEqual(CARDINAL_INGRESSES.map(row => row.sign));
    expect(result.search).toEqual({
      method: "engine-searchLongitudeCrossings;Sun", window: "(from,to]",
      stepDays: 5, maxSamples: 10_000,
      budgetUnit: "sun-longitude-evaluations;chart-casting-excluded",
      completeness: "engine-sampled-search;not-proven"
    });
    let expectedSamples = 0;
    for (const target of CARDINAL_INGRESSES) {
      const engine = returns.searchLongitudeCrossings("Sun", target.targetLongitude,
        result.request.range.from, result.request.range.to, { stepDays: 5 });
      const event = result.ingresses.find(row => row.sign === target.sign)!;
      expectedSamples += engine.samples;
      expect(event.kind).toBe("solar-ingress");
      expect(event.targetLongitude).toBe(target.targetLongitude);
      expect(event.at).toBe(engine.crossings[0]!.at.toISOString());
      expect(event.retrograde).toBe(false);
      expect(event.chart).toEqual(castEventChart({ at: event.at, place }));
      expect(event.angularity).toEqual(analyzeAngularity(event.chart));
      expect(event.angleRulers).toEqual(analyzeAngleRulers(event.chart));
    }
    expect(result.samples).toBe(expectedSamples);
    expect(result.samples).toBeLessThanOrEqual(result.search.maxSamples);
    const times = result.ingresses.map(row => Date.parse(row.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    frozen(result);
  });

  it("timing is place independent while houses and angles use the supplied place", () => {
    const ordinary = searchIngresses(request);
    const polar = searchIngresses({ year: 2000, place: { latitude: -78.5, longitude: 31.25 }, houseSystem: "koch" });
    expect(polar.ingresses.map(row => row.at)).toEqual(ordinary.ingresses.map(row => row.at));
    for (const event of polar.ingresses) {
      expect(event.chart.houses).toMatchObject({ requested: "koch", actual: "whole" });
      expect(event.chart.flags).toContain("polar-fallback");
      expect(event.angularity.houses).toEqual({ requested: "koch", actual: "whole" });
    }
    expect(polar.ingresses[0]!.chart.angles).not.toEqual(ordinary.ingresses[0]!.chart.angles);
  });

  it("retains outside-reference-span flags rather than claiming verified timing", () => {
    const result = searchIngresses({ ...request, year: 1750 });
    expect(result.status).toBe("complete");
    expect(result.ingresses.length).toBe(4);
    for (const event of result.ingresses) expect(event.chart.flags).toContain("outside-reference-span");
  });

  it("captures detached Date and place input without mutation", () => {
    const from = new Date(epoch);
    const to = new Date(epoch + DAY);
    const local = { ...place };
    const result = searchIngresses({ from, to, place: local });
    from.setUTCFullYear(2020);
    to.setUTCFullYear(2020);
    local.latitude = 20;
    expect(result.request.range.from).toBe(new Date(epoch).toISOString());
    expect(result.request.place.latitude).toBe(12.5);
    expect(Object.isFrozen(local)).toBe(false);
  });
});

describe("ingress validation", () => {
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, "100"])(
    "rejects invalid budget %s", maxSamples => {
      expect(() => searchIngresses(request, { maxSamples } as IngressSearchOptions)).toThrow(RangeError);
    }
  );
  it.each([null, [], 2, { stepDays: 400 }, { unknown: 1 }, { [Symbol("hidden")]: 1 }])(
    "rejects malformed or unsupported options %j", options => {
      expect(() => searchIngresses(request, options as IngressSearchOptions)).toThrow(RangeError);
    }
  );
  it("rejects accessor options without calling them", () => {
    const getter = vi.fn(() => 100);
    expect(() => searchIngresses(request, Object.defineProperty({}, "maxSamples", { get: getter, enumerable: true })))
      .toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
  });
  it.each([
    { year: 0 }, { year: 3999 },
    { from: "2000-01-01", to: "4000-01-01" },
    { from: "0001-04-30T12:00:00Z", to: "0001-05-02" },
    { from: "3998-09-01", to: "3998-09-03T12:00:00Z" }
  ])("checks both chart-safe ephemeris endpoints before a budget refusal: %j", range => {
    const scan = syntheticSun();
    expect(() => searchIngresses({ place, ...range } as MundaneRequest, { maxSamples: 1 }))
      .toThrow(/ephemeris span/u);
    expect(scan).not.toHaveBeenCalled();
  });
  it.each([
    { from: "2000-02-30", to: "2000-03-01" },
    { from: "2000-01-02", to: "2000-01-01" },
    { from: "2000-01-01", to: "2000-01-01" },
    { year: 2000, from: "2000-01-01", to: "2001-01-01" },
    { year: 2000, place: { latitude: 90, longitude: 0 } },
    { year: 2000, houseSystem: "unknown" }
  ])("delegates request validation: %j", changes => {
    expect(() => searchIngresses({ place, ...changes } as MundaneRequest)).toThrow(RangeError);
  });
  it.each([null, [], { ...request, timeScale: "tt" }, { ...request, deltaT: 0 }, { ...request, [Symbol("key")]: 1 }])(
    "rejects malformed requests and unsupported settings", input => {
      expect(() => searchIngresses(input as MundaneRequest)).toThrow(RangeError);
    }
  );
  it("bounds a long valid search with the default budget", () => {
    expect(searchIngresses({ place, from: "1800-01-01", to: "2200-01-01" }))
      .toMatchObject({ status: "refused", samples: 0, ingresses: [] });
  });
});
