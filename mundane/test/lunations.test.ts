import { afterEach, describe, expect, it, vi } from "vitest";
import { searchLongitudeCrossingsWith } from "../../src/crossings.js";
import * as ephemeris from "../../src/ephemeris.js";
import { normalizeLongitude } from "../../src/signs.js";
import * as casting from "../src/chart.js";
import {
  analyzeAngularity, analyzeAngleRulers, castEventChart, LUNATION_PHASES, searchLunations
} from "../src/index.js";
import type { LunationSearchOptions, MundaneRequest } from "../src/index.js";

const place = { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 };
const request = { year: 2000, place };
const DAY = 86_400_000;
const epoch = Date.parse("2000-01-01T00:00:00Z");
const atDay = (day: number) => new Date(epoch + day * DAY).toISOString();
afterEach(() => vi.restoreAllMocks());

// Hand-defined geometry, not an astronomical reference. Sun = 350 + d,
// Moon = 350 + 13d, both modulo 360; directed elongation = 12d modulo 360.
// New Moons are d = 30k; Full Moons d = 15 + 30k. The real crossing solver
// and chart casting are kept. Chart positions do not use this mocked export.
function syntheticMotion(direction = 1) {
  return vi.spyOn(ephemeris, "bodyLongitude").mockImplementation((body, date) => {
    const day = (date.getTime() - epoch) / DAY;
    if (body === "Sun") return normalizeLongitude(350 + day);
    if (body === "Moon") return normalizeLongitude(350 + (1 + direction * 12) * day);
    throw new Error("lunation timing must evaluate only Sun and Moon");
  });
}

function frozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) frozen(child);
  }
}

describe("lunation range and budget contracts with hand-defined motion", () => {
  it("keeps closing roots, excludes opening roots, and sorts repeated phases across longitude wraps", () => {
    syntheticMotion();
    const first = searchLunations({ place, from: epoch, to: epoch + 30 * DAY });
    const next = searchLunations({ place, from: epoch + 30 * DAY, to: epoch + 60 * DAY });
    expect(first.status).toBe("complete");
    expect(next.status).toBe("complete");
    expect([...first.lunations, ...next.lunations].map(row => [row.phase, row.at, row.retrograde]))
      .toEqual([
        ["full", atDay(15), false], ["new", atDay(30), false],
        ["full", atDay(45), false], ["new", atDay(60), false]
      ]);
    expect(searchLunations({ place, from: epoch, to: epoch + 60 * DAY }).lunations)
      .toEqual([...first.lunations, ...next.lunations]);
  });

  it.each([15, 30])("handles empty and millisecond windows around a day-%s root", day => {
    syntheticMotion();
    const at = epoch + day * DAY;
    expect(searchLunations({ place, from: epoch, to: epoch + DAY }).lunations).toEqual([]);
    expect(searchLunations({ place, from: at - 1, to: at }).lunations.map(row => row.at))
      .toEqual([new Date(at).toISOString()]);
    expect(searchLunations({ place, from: at, to: at + 1 }).lunations).toEqual([]);
  });

  it("passes the directed relative motion to the solver rather than absolute separation", () => {
    syntheticMotion(-1);
    const result = searchLunations({ place, from: epoch, to: epoch + 30 * DAY });
    expect(result.lunations.map(row => [row.phase, row.at, row.retrograde])).toEqual([
      ["full", atDay(15), true], ["new", atDay(30), true]
    ]);
  });

  it("retains integer-Date sampling for a synthetic submillisecond root", () => {
    vi.spyOn(ephemeris, "bodyLongitude").mockImplementation((body, date) =>
      body === "Sun" ? 0 : normalizeLongitude(date.getTime() - epoch - 0.5));
    expect(searchLunations({ place, from: epoch, to: epoch + 1 }).lunations.map(row => [row.phase, row.at]))
      .toEqual([["new", new Date(epoch + 1).toISOString()]]);
  });

  it("evaluates exactly two body longitudes per sample, inside the window only", () => {
    const positions = syntheticMotion();
    const result = searchLunations({ place, from: epoch + DAY, to: epoch + 61 * DAY });
    expect(result.status).toBe("complete");
    expect(positions.mock.calls.length).toBe(2 * result.samples);
    for (let index = 0; index < positions.mock.calls.length; index += 2) {
      const [moon, sun] = positions.mock.calls.slice(index, index + 2);
      expect(moon![0]).toBe("Moon");
      expect(sun![0]).toBe("Sun");
      expect(moon![1].getTime()).toBe(sun![1].getTime());
      expect(moon![1].getTime()).toBeGreaterThanOrEqual(epoch + DAY);
      expect(moon![1].getTime()).toBeLessThanOrEqual(epoch + 61 * DAY);
    }
  });

  it("refuses combined coarse work before body evaluations or chart casting", () => {
    const positions = syntheticMotion();
    const cast = vi.spyOn(casting, "castEventChart");
    // Leap year: ceil(366 / 0.25) + 1 = 1465 samples per phase.
    const result = searchLunations(request, { maxSamples: 2929 });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", samples: 0, lunations: [] });
    expect(positions).not.toHaveBeenCalled();
    expect(cast).not.toHaveBeenCalled();
    frozen(result);
  });

  it("discards earlier roots when refinement in the later phase exhausts the shared budget", () => {
    const positions = syntheticMotion();
    // Shift the quarter-day grid so both scans refine their roots.
    const range = { place, from: epoch + DAY / 10, to: epoch + 61 * DAY };
    const baseline = searchLunations(range);
    const cast = vi.spyOn(casting, "castEventChart");
    positions.mockClear();
    const result = searchLunations(range, { maxSamples: baseline.samples - 1 });
    expect(result).toMatchObject({
      status: "refused", reason: "sample-budget", samples: baseline.samples - 1, lunations: []
    });
    expect(positions.mock.calls.length).toBe(2 * result.samples);
    expect(cast).not.toHaveBeenCalled();
    const exact = searchLunations(range, { maxSamples: baseline.samples });
    expect(exact.status).toBe("complete");
    expect(exact.samples).toBe(baseline.samples);
    expect(exact.lunations).toEqual(baseline.lunations);
  });

  it("accounts for a later coarse refusal after the first phase used refinement samples", () => {
    const positions = syntheticMotion();
    const cast = vi.spyOn(casting, "castEventChart");
    // Each coarse scan needs 245 samples; the first scan's roots also refine.
    const result = searchLunations({ place, from: epoch + DAY / 10, to: epoch + 61 * DAY }, { maxSamples: 490 });
    expect(result.status).toBe("refused");
    expect(result.samples).toBeGreaterThan(245);
    expect(result.samples).toBeLessThan(490);
    expect(positions.mock.calls.length).toBe(2 * result.samples);
    expect(result.lunations).toEqual([]);
    expect(cast).not.toHaveBeenCalled();
  });

  it("completes an empty search with the minimum coarse budget", () => {
    syntheticMotion();
    const result = searchLunations({ place, from: epoch + DAY, to: epoch + 2 * DAY }, { maxSamples: 10 });
    expect(result).toMatchObject({ status: "complete", samples: 10, lunations: [] });
  });

  it("propagates invalid ephemeris values and failures without casting partial results", () => {
    const positions = syntheticMotion();
    const cast = vi.spyOn(casting, "castEventChart");
    positions.mockReturnValue(NaN);
    expect(() => searchLunations({ place, from: epoch, to: epoch + DAY })).toThrow(RangeError);
    const error = new Error("synthetic ephemeris failure");
    positions.mockImplementation(() => { throw error; });
    expect(() => searchLunations({ place, from: epoch, to: epoch + DAY })).toThrow(error);
    expect(cast).not.toHaveBeenCalled();
  });
});

// Direct engine comparisons establish integration only. Independent published
// lunation times belong to M8; no prior engine output is a timing fixture.
describe("lunation engine integration", () => {
  it("searches both phase targets for a year and casts charts with existing analyses", () => {
    const result = searchLunations(request);
    expect(result.status).toBe("complete");
    expect(LUNATION_PHASES).toEqual([
      { phase: "new", targetElongation: 0 }, { phase: "full", targetElongation: 180 }
    ]);
    frozen(LUNATION_PHASES);
    expect(result.search).toEqual({
      method: "engine-searchLongitudeCrossingsWith;Moon-minus-Sun", window: "(from,to]",
      stepDays: 0.25, maxSamples: 10_000, bodyLongitudesPerSample: 2,
      budgetUnit: "elongation-evaluations;chart-casting-excluded",
      completeness: "engine-sampled-search;not-proven"
    });
    let expectedSamples = 0;
    for (const target of LUNATION_PHASES) {
      const engine = searchLongitudeCrossingsWith((_, date) => normalizeLongitude(
        ephemeris.bodyLongitude("Moon", date) - ephemeris.bodyLongitude("Sun", date)
      ), "elongation", target.targetElongation,
      new Date(result.request.range.from), new Date(result.request.range.to), { stepDays: 0.25 });
      expectedSamples += engine.samples;
      const events = result.lunations.filter(row => row.phase === target.phase);
      expect(events.length).toBeGreaterThan(0);
      expect(events.map(row => row.at)).toEqual(engine.crossings.map(row => row.at.toISOString()));
      for (const event of events) {
        expect(event.kind).toBe("lunation");
        expect(event.targetElongation).toBe(target.targetElongation);
        expect(event.retrograde).toBe(false);
        expect(event.chart).toEqual(castEventChart({ at: event.at, place }));
        expect(event.angularity).toEqual(analyzeAngularity(event.chart));
        expect(event.angleRulers).toEqual(analyzeAngleRulers(event.chart));
        expect(event.angularity.label).toBe("traditional conventions, not predictions");
      }
    }
    expect(result.samples).toBe(expectedSamples);
    expect(result.samples).toBeLessThanOrEqual(result.search.maxSamples);
    const times = result.lunations.map(row => Date.parse(row.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    frozen(result);
  });

  it("has place-independent timing and preserves polar houses and reference flags", () => {
    const range = { from: "1750-01-01", to: "1750-02-01" };
    const ordinary = searchLunations({ ...range, place });
    const polar = searchLunations({ ...range, place: { latitude: -78.5, longitude: 31.25 }, houseSystem: "koch" });
    expect(ordinary.status).toBe("complete");
    expect(polar.status).toBe("complete");
    expect(polar.lunations.length).toBeGreaterThan(0);
    expect(polar.lunations.map(row => row.at)).toEqual(ordinary.lunations.map(row => row.at));
    for (const event of polar.lunations) {
      expect(event.chart.houses).toMatchObject({ requested: "koch", actual: "whole" });
      expect(event.chart.flags).toContain("polar-fallback");
      expect(event.chart.flags).toContain("outside-reference-span");
      expect(event.angularity.houses).toEqual({ requested: "koch", actual: "whole" });
    }
    expect(polar.lunations[0]!.chart.angles).not.toEqual(ordinary.lunations[0]!.chart.angles);
  });

  it("captures detached inputs and has no result dependence on previous calls", () => {
    const from = new Date(epoch);
    const to = new Date(epoch + DAY);
    const local = { ...place };
    const result = searchLunations({ from, to, place: local });
    from.setUTCFullYear(2020);
    to.setUTCFullYear(2020);
    local.latitude = 20;
    expect(result.request.range.from).toBe(atDay(0));
    expect(result.request.place.latitude).toBe(12.5);
    expect(Object.isFrozen(local)).toBe(false);
    expect(searchLunations({ place, from: epoch, to: epoch + DAY })).toEqual(result);
  });
});

describe("lunation validation", () => {
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, "100"])(
    "rejects invalid budget %s", maxSamples => {
      expect(() => searchLunations(request, { maxSamples } as LunationSearchOptions)).toThrow(RangeError);
    }
  );
  it.each([null, [], 2, new Date(), { stepDays: 5 }, { unknown: 1 }, { [Symbol("hidden")]: 1 },
    Object.create({ maxSamples: 100 }), Object.defineProperty({}, "maxSamples", { value: 100 })])(
    "rejects malformed or unsupported options %j", options => {
      expect(() => searchLunations(request, options as LunationSearchOptions)).toThrow(RangeError);
    }
  );
  it("rejects accessor options without invoking them and accepts a null-prototype options record", () => {
    const getter = vi.fn(() => 100);
    expect(() => searchLunations(request, Object.defineProperty({}, "maxSamples", { get: getter, enumerable: true })))
      .toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
    expect(searchLunations(request, Object.assign(Object.create(null), { maxSamples: 1 })))
      .toMatchObject({ status: "refused", samples: 0 });
  });
  it.each([
    { year: 0 }, { year: 3999 },
    { from: "2000-01-01", to: "4000-01-01" },
    { from: "0001-04-30T12:00:00Z", to: "0001-05-02" },
    { from: "3998-09-01", to: "3998-09-03T12:00:00Z" }
  ])("validates both chart-safe ephemeris endpoints before budget refusal: %j", range => {
    const positions = syntheticMotion();
    expect(() => searchLunations({ place, ...range } as MundaneRequest, { maxSamples: 1 }))
      .toThrow(/ephemeris span/u);
    expect(positions).not.toHaveBeenCalled();
  });
  it.each([
    { from: "2000-02-30", to: "2000-03-01" },
    { from: "2000-01-02", to: "2000-01-01" },
    { from: "2000-01-01", to: "2000-01-01" },
    { year: 2000, from: "2000-01-01", to: "2001-01-01" },
    { year: 2000, place: { latitude: 90, longitude: 0 } },
    { year: 2000, houseSystem: "unknown" }
  ])("delegates request validation: %j", changes => {
    expect(() => searchLunations({ place, ...changes } as MundaneRequest)).toThrow(RangeError);
  });
  it.each([null, [], 42, { ...request, timeScale: "tt" }, { ...request, deltaT: 0 },
    { ...request, phases: ["new"] }, { ...request, [Symbol("key")]: 1 }])(
    "rejects malformed requests and unsupported settings", input => {
      expect(() => searchLunations(input as MundaneRequest)).toThrow(RangeError);
    }
  );
  it("bounds a long valid search with the default budget", () => {
    const positions = syntheticMotion();
    expect(searchLunations({ place, from: "1800-01-01", to: "2200-01-01" }))
      .toMatchObject({ status: "refused", samples: 0, lunations: [] });
    expect(positions).not.toHaveBeenCalled();
  });
});
