import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CALC_SPAN } from "../../src/calc.js";
import { SKY_RADII_KM } from "../../src/sky.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { timeBasis } from "../../src/time-scale.js";
import {
  OCCULTATION_LIMITS, OCCULTATION_PLANETS, OCCULTATION_RADII,
  positionAt, searchLunarOccultations, starCatalogue, starPositionAt
} from "../src/index.js";
import type { OccultationPlanet } from "../src/index.js";

type Request = Parameters<typeof searchLunarOccultations>[0];
type Result = ReturnType<typeof searchLunarOccultations>;
const DAY = 86_400_000;
const SATURN: Request = {
  target: "Saturn", window: { from: "2024-05-31T00:00:00Z", to: "2024-06-01T00:00:00Z" }
};
const ALDEBARAN: Request = {
  target: "sao:94027", window: { from: "1923-01-27T00:00:00Z", to: "1923-01-29T00:00:00Z" }
};
const MARS: Request = {
  target: "Mars", window: { from: "2024-01-10T00:00:00Z", to: "2024-01-11T00:00:00Z" }
};
const iso = (ms: number): string => new Date(ms).toISOString();
const midpoint = (from: string, to: string): string => iso(Math.floor((Date.parse(from) + Date.parse(to)) / 2));

function complete(result: Result): Extract<Result, { status: "complete" }> {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Unexpected candidate refusal: ${result.reason}`);
  return result;
}

function expectDeepFrozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectDeepFrozen(child);
  }
}

// Separate angular arithmetic on the same adapter positions tests geometry
// integration only. It is not independent physical accuracy evidence.
function sampleGeometry(target: Request["target"], at: string) {
  const moon = positionAt({ body: "Moon", time: at });
  const other = target.startsWith("sao:") ? starPositionAt({ star: target, time: at }) :
    positionAt({ body: target as OccultationPlanet, time: at });
  if (moon.status !== "ok" || other.status !== "ok" || moon.dist === null) {
    throw new Error("Unexpected integration position refusal");
  }
  const radians = Math.PI / 180;
  const haversine = Math.sin((moon.lat - other.lat) * radians / 2) ** 2 +
    Math.cos(moon.lat * radians) * Math.cos(other.lat * radians) *
    Math.sin((moon.lon - other.lon) * radians / 2) ** 2;
  const separation = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) / radians;
  const moonDistance = moon.dist * OCCULTATION_RADII.auKm;
  const targetDistance = "dist" in other && other.dist !== null ? other.dist * OCCULTATION_RADII.auKm : null;
  const targetRadius = target.startsWith("sao:") ? 0 : OCCULTATION_RADII.planetKm[target as OccultationPlanet];
  const angle = (radius: number, distance: number) => Math.asin(radius / distance) / radians;
  const geocentricLimit = angle(OCCULTATION_RADII.moonKm, moonDistance) +
    (targetDistance === null ? 0 : angle(targetRadius, targetDistance));
  return { moon, other, separation, geocentricLimit };
}

describe("real engine lunar candidate integration, not accuracy", () => {
  it.each([SATURN, ALDEBARAN])("retains the adapter geometry and distinguishes candidate intervals from disk overlap %#", (request) => {
    const result = complete(searchLunarOccultations(request));
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const candidate of result.candidates) {
      expect(candidate.target).toBe(request.target);
      expect(candidate.kind).toBe("lunar-occultation-candidate");
      expect(candidate.sample.at).toBe(midpoint(candidate.interval.from, candidate.interval.to));
      const actual = sampleGeometry(request.target, candidate.sample.at);
      expect(candidate.sample.separationDegrees).toBeCloseTo(actual.separation, 10);
      expect(candidate.sample.geocentricLimitDegrees).toBeCloseTo(actual.geocentricLimit, 12);
      expect(candidate.sample.geocentricClearanceDegrees)
        .toBeCloseTo(actual.separation - actual.geocentricLimit, 10);
      expect(candidate.sample.envelopeClearanceDegrees).toBeLessThanOrEqual(0);
      expect(candidate.sample.observerEnvelopeDegrees).toBeGreaterThan(candidate.sample.geocentricLimitDegrees);
      expect(candidate.receipt.moon).toEqual(actual.moon.receipt);
      expect(candidate.receipt.target).toEqual(actual.other.receipt);
      expect(candidate.receipt.timeBasis).toEqual(timeBasis(Date.parse(candidate.sample.at)));
      expect(candidate.receipt.search).toBe(result.receipt);
      expect(candidate.geocentricOverlap).toBe(candidate.geocentricOverlapIntervals.length > 0);
      for (const disk of candidate.geocentricOverlapIntervals) {
        expect(Date.parse(disk.from)).toBeGreaterThanOrEqual(Date.parse(candidate.interval.from));
        expect(Date.parse(disk.to)).toBeLessThanOrEqual(Date.parse(candidate.interval.to));
        const diskSample = sampleGeometry(request.target, midpoint(disk.from, disk.to));
        expect(diskSample.separation).toBeLessThanOrEqual(diskSample.geocentricLimit);
      }
      // A short interval just inside the broad envelope survives screening
      // while the much smaller geocentric disks remain separated.
      const shoulderFrom = Date.parse(candidate.interval.from) + 1000;
      const shoulderTo = shoulderFrom + 1000;
      expect(shoulderTo).toBeLessThan(Date.parse(candidate.sample.at));
      const shoulder = complete(searchLunarOccultations({ target: request.target,
        window: { from: iso(shoulderFrom), to: iso(shoulderTo) } }));
      expect(shoulder.candidates).toHaveLength(1);
      expect(shoulder.candidates[0]).toMatchObject({
        geocentricOverlap: false, geocentricOverlapIntervals: [],
        interval: { from: iso(shoulderFrom), to: iso(shoulderTo), start: "window", end: "window" }
      });
      expect(shoulder.candidates[0]!.sample.geocentricClearanceDegrees).toBeGreaterThan(0);
    }
    expect(result.receipt.search.completeness).toBe("sampled;not-proven");
    expect(result.receipt.engine).toEqual({ name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: EPHEMERIS });
    expect(result.receipt.radii).toEqual(OCCULTATION_RADII);
    expect(result.receipt.conventions).toContain("corrections:existing-adapters;no-additional-light-time-or-aberration");
    const membership = result.series.flatMap((series) => {
      expect(series.target).toBe(request.target);
      expect(series.receipt.search).toBe(result.receipt);
      expect(series.receipt.continuation).toBe("outside-window-unknown");
      for (const index of series.candidateIndices) {
        const candidate = result.candidates[index]!;
        expect(candidate.seriesIndex).toBe(series.seriesIndex);
        expect(series.passageIndices).toContain(candidate.passageIndex);
      }
      return series.candidateIndices;
    });
    expect([...membership].sort()).toEqual(result.candidates.map((_, index) => index));
  });

  it.each([SATURN, ALDEBARAN])("returns both clipped interval pieces when split at an interior witness %#", (request) => {
    const full = complete(searchLunarOccultations(request));
    const candidate = full.candidates[0]!;
    const split = candidate.sample.at;
    const left = complete(searchLunarOccultations({ ...request, window: { from: request.window.from, to: split } }));
    const right = complete(searchLunarOccultations({ ...request, window: { from: split, to: request.window.to } }));
    const leftPiece = left.candidates.at(-1)!;
    const rightPiece = right.candidates[0]!;
    expect(leftPiece.interval).toEqual({ ...candidate.interval, to: split, end: "window" });
    expect(rightPiece.interval).toEqual({ ...candidate.interval, from: split, start: "window" });
    expect(leftPiece.passageIndex).toBe(rightPiece.passageIndex);
    expect(leftPiece.sample.envelopeClearanceDegrees).toBeLessThanOrEqual(0);
    expect(rightPiece.sample.envelopeClearanceDegrees).toBeLessThanOrEqual(0);
    // Candidates are intersected intervals. The containing event is therefore
    // present on both sides, unlike ownership of a single conjunction instant.
    expect(left.receipt.search.windowOwnership).toBe("interval-intersection;(from,to]");
    expect(right.receipt.search.windowOwnership).toBe("interval-intersection;(from,to]");
  });

  it("returns an empty receipted candidate search for the development Moon/Mars appulse day", () => {
    const result = complete(searchLunarOccultations(MARS));
    expect(result.candidates).toEqual([]);
    expect(result.series).toEqual([]);
    expect(result.receipt.search.samples).toBeGreaterThan(0);
    expectDeepFrozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("retains stellar source provenance and unknown distance", () => {
    const result = complete(searchLunarOccultations(ALDEBARAN));
    const catalogue = starCatalogue();
    expect(result.receipt.catalogue).toEqual(catalogue.receipt);
    expect(result.receipt.star).toEqual(catalogue.stars.find((star) => star.id === ALDEBARAN.target));
    expect(result.receipt.conventions).toContain("star:infinite-distance-point-source-model;distance-unknown");
    expect(result.receipt.limitations).toContain("catalogue-distance-component-motion-and-completeness-unvalidated");
    expect(result.candidates[0]!.sample.targetSemidiameterDegrees).toBe(0);
    const planet = complete(searchLunarOccultations(SATURN));
    expect(planet.receipt.catalogue).toBeNull();
    expect(planet.receipt.star).toBeNull();
    expect(planet.candidates[0]!.sample.targetSemidiameterDegrees).toBeGreaterThan(0);
  });

  it.each(OCCULTATION_PLANETS)("accepts the supported planet %s in a short synthetic window", (target) => {
    const result = complete(searchLunarOccultations({ target,
      window: { from: "2024-01-01", to: "2024-01-01T01:00:00Z" } }));
    expect(result.receipt.request.target).toBe(target);
    expect(result.receipt.search.samples).toBeGreaterThan(0);
  });

  it("records capped steps rounded down to integer milliseconds", () => {
    const result = complete(searchLunarOccultations({ ...SATURN, stepDays: (3_600_000 + 0.75) / DAY }));
    expect(result.receipt.search.stepMilliseconds).toBe(3_600_000);
    expect(result.receipt.search.maxSamples).toBe(OCCULTATION_LIMITS.defaultMaxSamples);
    expect(result.receipt.search.samples).toBeGreaterThan(0);
    expect(result.receipt.search.samples).toBeLessThanOrEqual(result.receipt.search.maxSamples);
  });

  it("returns immutable JSON snapshots and repeatable replay without freezing caller or engine data", () => {
    const from = new Date(SATURN.window.from), to = new Date(SATURN.window.to);
    const window = { from, to }, request = { ...SATURN, window };
    const spanWasFrozen = Object.isFrozen(CALC_SPAN), ephemerisWasFrozen = Object.isFrozen(EPHEMERIS);
    const result = complete(searchLunarOccultations(request));
    expectDeepFrozen(result);
    for (const value of [request, window, from, to]) expect(Object.isFrozen(value)).toBe(false);
    expect(Object.isFrozen(CALC_SPAN)).toBe(spanWasFrozen);
    expect(Object.isFrozen(EPHEMERIS)).toBe(ephemerisWasFrozen);
    const restored = JSON.parse(JSON.stringify(result)) as Result;
    expect(restored).toEqual(result);
    expect(searchLunarOccultations(restored.receipt.request)).toEqual(result);
    from.setUTCFullYear(2030);
    to.setUTCFullYear(2030);
    expect(result.receipt.request.window).toEqual({
      from: "2024-05-31T00:00:00.000Z", to: "2024-06-01T00:00:00.000Z"
    });
    expect(() => { (result.candidates as unknown as unknown[]).pop(); }).toThrow(TypeError);
    expect(() => { (result.receipt.request.window as { from: string }).from = "changed"; }).toThrow(TypeError);
    expect(searchLunarOccultations(SATURN)).toEqual(result);
  });

  it("transcribes JPL equatorial radii and reuses the engine lunar sphere", () => {
    // JPL Planetary Physical Parameters, equatorial radius column, reference D:
    // https://ssd.jpl.nasa.gov/planets/phys_par.html (read 2026-10-15).
    // These assertions check source transcription, not physical limb accuracy.
    const expected = { Mercury: 2440.53, Venus: 6051.8, Earth: 6378.1366,
      Mars: 3396.19, Jupiter: 71492, Saturn: 60268, Uranus: 25559, Neptune: 24764, Pluto: 1188.3 };
    const source = JSON.parse(readFileSync(new URL("../data/radii-source.json", import.meta.url), "utf8"));
    expect(source.equatorialRadiusKm).toEqual(expected);
    expect(source.source).toMatchObject({
      url: "https://ssd.jpl.nasa.gov/planets/phys_par.html", bytes: 58244,
      sha256: "e49a487947295c389ba6e5833dd8fb04b63e826d39f70c123881882096e5e68b"
    });
    for (const planet of OCCULTATION_PLANETS) expect(OCCULTATION_RADII.planetKm[planet]).toBe(expected[planet]);
    expect(OCCULTATION_RADII.earthEquatorialKm).toBe(expected.Earth);
    expect(OCCULTATION_RADII.moonKm).toBe(SKY_RADII_KM.Moon);
    expect(OCCULTATION_RADII.observerEnvelopeKm).toBe(expected.Earth + OCCULTATION_RADII.maximumObserverElevationMeters / 1000);
    expect(OCCULTATION_RADII.source).toEqual(source.source);
    expectDeepFrozen(OCCULTATION_RADII);
  });
});

describe("lunar candidate budgets and input boundaries", () => {
  it("refuses an unaffordable scan before evaluating positions", () => {
    const result = searchLunarOccultations({ ...SATURN, maxSamples: 1 });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", candidates: [], series: [],
      receipt: { search: { samples: 0, maxSamples: 1 } } });
    expectDeepFrozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each([SATURN, ALDEBARAN])("charges final output sampling and discards every partial result on exhaustion %#", (request) => {
    const full = complete(searchLunarOccultations(request));
    const last = full.candidates.at(-1)!;
    expect(last).toBeDefined();
    const outputTimes = [last.interval.to, last.interval.from, last.sample.at];
    for (const [index, at] of outputTimes.entries()) {
      const budget = full.receipt.search.samples - index - 1;
      const result = searchLunarOccultations({ ...request, maxSamples: budget });
      expect(result).toMatchObject({ status: "refused", reason: "sample-budget", candidates: [], series: [],
        failure: { at }, receipt: { search: { samples: budget, maxSamples: budget } } });
      expectDeepFrozen(result);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
    const exact = complete(searchLunarOccultations({ ...request, maxSamples: full.receipt.search.samples }));
    expect(exact.candidates.map((candidate) => candidate.interval)).toEqual(full.candidates.map((candidate) => candidate.interval));
    expect(exact.receipt.search.samples).toBe(full.receipt.search.samples);
  });

  it.each([
    { from: "1940-12-31T17:59:59Z", to: "1940-12-31T18:00:01Z" },
    { from: "1971-12-31T23:59:59Z", to: "1972-01-01T00:00:01Z" },
    { from: "2016-12-31T23:59:59Z", to: "2017-01-01T00:00:01Z" },
    { from: "2027-10-02T00:00:00Z", to: "2027-10-02T00:00:00.002Z" }
  ])("refuses clock discontinuities before sampling %#", (window) => {
    const result = searchLunarOccultations({ ...SATURN, window });
    expect(result).toMatchObject({ status: "refused", reason: "time-discontinuity", candidates: [], series: [],
      receipt: { search: { samples: 0 } } });
    expect(result.receipt.seams).toHaveLength(1);
    expectDeepFrozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each([
    { from: "1700-01-01", to: "1700-01-02" },
    { from: "2200-01-01", to: "2200-01-02" },
    { from: new Date(-8_640_000_000_000_000), to: new Date(8_640_000_000_000_000) }
  ])("refuses out-of-range windows before sampling %#", (window) => {
    const result = searchLunarOccultations({ ...SATURN, window });
    expect(result).toMatchObject({ status: "refused", reason: "out-of-range", candidates: [], series: [],
      receipt: { search: { samples: 0 } } });
    expectDeepFrozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("captures own request fields once and rejects inherited required fields", () => {
    let reads = 0;
    const result = searchLunarOccultations({ ...SATURN,
      get target() { return ++reads === 1 ? "Saturn" : "Mars"; }
    });
    expect(reads).toBe(1);
    expect(result).toEqual(searchLunarOccultations(SATURN));
    expect(() => searchLunarOccultations(Object.create(SATURN) as Request)).toThrow(RangeError);
  });

  it.each([
    null, [], {},
    ...["Sun", "Moon", "Earth", "North Node", "saturn", "Aldebaran", "sao:0", null]
      .map((target) => ({ ...SATURN, target })),
    { ...SATURN, window: null },
    { ...SATURN, window: { from: "2024-02-30", to: "2024-03-01" } },
    { ...SATURN, window: { from: "2024-05-31T00:00:00", to: "2024-06-01" } },
    { ...SATURN, window: { from: "2024-05-31", to: "2024-05-31" } },
    { ...SATURN, window: { from: "2024-06-01", to: "2024-05-31" } },
    { ...SATURN, window: { from: new Date(Number.NaN), to: "2024-06-01" } },
    ...[0, -1, 1.5, Infinity, Number.NaN, null, "10", OCCULTATION_LIMITS.maximumMaxSamples + 1]
      .map((maxSamples) => ({ ...SATURN, maxSamples })),
    ...[0, -1, Infinity, Number.NaN, null, "0.125", 0.5 / DAY, OCCULTATION_LIMITS.maximumStepDays + 0.001]
      .map((stepDays) => ({ ...SATURN, stepDays })),
    { ...SATURN, coordinate: "right-ascension" },
    { ...SATURN, observer: { latitude: 0, longitude: 0 } },
    { ...SATURN, [Symbol("unknown")]: true }
  ])("rejects malformed or unsupported requests %#", (request) => {
    expect(() => searchLunarOccultations(request as Request)).toThrow(RangeError);
  });
});
