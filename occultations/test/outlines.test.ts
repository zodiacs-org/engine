import { afterEach, describe, expect, it, vi } from "vitest";
import { CALC_SPAN } from "../../src/calc.js";
import { timeBasis } from "../../src/time-scale.js";
import * as engine from "../src/engine.js";
import * as shadows from "../src/shadow-geometry.js";
import * as stars from "../src/star-position.js";
import { lunarVisibilityOutline, OUTLINE_LIMITS } from "../src/outlines.js";
import type { LunarOutlineRequest, LunarOutlineResult } from "../src/outlines.js";

// API and adapter integration checks only. Published outline accuracy belongs
// to the separate frozen reference suite, not these implementation comparisons.
const EMPTY: LunarOutlineRequest = { target: "Saturn", longitudes: [0],
  window: { from: "2024-01-01", to: "2024-01-01T00:01:00Z" } };
const SATURN: LunarOutlineRequest = { target: "Saturn", longitudes: [0, 5],
  window: { from: "2024-05-31T09:00:00Z", to: "2024-05-31T09:01:00Z" } };
const ALDEBARAN: LunarOutlineRequest = { target: "sao:94027", longitudes: [-71],
  window: { from: "1923-01-27T23:30:00Z", to: "1923-01-27T23:31:00Z" } };

function complete(result: LunarOutlineResult) {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Unexpected outline refusal: ${result.reason}`);
  return result;
}

function frozen(value: unknown, seen = new Set<object>()): void {
  if (value !== null && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) frozen(child, seen);
  }
}

afterEach(() => vi.restoreAllMocks());

describe("coarse outline orchestration and receipts", () => {
  it("returns a receipted empty geometric window without local position calls", () => {
    const positions = vi.spyOn(engine, "positionAt");
    const result = complete(lunarVisibilityOutline(EMPTY));
    expect(result.meridians).toHaveLength(1);
    expect(result.meridians[0]).toMatchObject({ longitudeDegrees: 0, status: "resolved",
      reason: null, overlap: [], full: [],
      band: { west: -180, east: -180, crossesDateline: true, evaluatedAt: "exact-meridian-only" } });
    expect(result.receipt.search).toMatchObject({ samples: 2, planeSamples: 2, localSamples: 0,
      intersections: 4, timeStepMilliseconds: 60_000, completeness: "sampled-time-and-longitude;not-proven",
      windowOwnership: "closed-footprint-intersection;window-edges-are-not-contacts" });
    expect(positions).toHaveBeenCalledTimes(4);
    expect(positions.mock.calls.every(([request]) => request.observer === undefined)).toBe(true);
    expect(result.receipt.uncertainty.physicalLatitudeErrorDegrees).toBeNull();
    expect(result.receipt.uncertainty.betweenMeridians).toBe("uncomputed");
    expect(result.meridians[0]!.receipt).toBe(result.receipt);
    frozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each([SATURN, ALDEBARAN])("checks every retained boundary with the topocentric adapters %#", (request) => {
    const positions = vi.spyOn(engine, "positionAt");
    const starPositions = vi.spyOn(stars, "starPositionAt");
    const result = complete(lunarVisibilityOutline(request));
    expect(result.meridians.length).toBe(request.longitudes!.length);
    for (const meridian of result.meridians) {
      expect(meridian.status).toBe("resolved");
      expect(meridian.reason).toBeNull();
      expect(meridian.receipt).toBe(result.receipt);
      expect(meridian.overlap.length).toBeGreaterThan(0);
      expect(meridian.full.length).toBeGreaterThan(0);
      for (const interval of [...meridian.overlap, ...meridian.full]) {
        expect(interval.south.latitudeDegrees).toBeLessThan(interval.north.latitudeDegrees);
        for (const boundary of [interval.south, interval.north]) {
          expect(boundary.latitudeBracket.north - boundary.latitudeBracket.south)
            .toBeLessThanOrEqual(OUTLINE_LIMITS.localLatitudeBracketDegrees);
          expect(boundary.latitudeDegrees).toBeGreaterThanOrEqual(boundary.latitudeBracket.south);
          expect(boundary.latitudeDegrees).toBeLessThanOrEqual(boundary.latitudeBracket.north);
          expect(Math.abs(boundary.latitudeDegrees - boundary.planeLatitudeDegrees))
            .toBeLessThanOrEqual(OUTLINE_LIMITS.localLatitudeGuardDegrees);
          expect(boundary.local.at).toBe(boundary.at);
          expect(boundary.local.latitudeDegrees).toBe(boundary.latitudeDegrees);
          expect(Number.isFinite(boundary.local.clearanceDegrees)).toBe(true);
          expect(boundary.local.targetGeometricAltitudeDegrees).toBeGreaterThanOrEqual(0);
          expect(boundary.local.timeBasis).toEqual(timeBasis(Date.parse(boundary.at)));
          const observer = { latitude: boundary.latitudeDegrees, longitude: meridian.longitudeDegrees, elevationMeters: 0 };
          expect(boundary.local.moon.request).toMatchObject({ body: "Moon", time: boundary.at, observer,
            frame: "equatorial-true-of-date" });
          expect(boundary.local.target.request).toMatchObject({ time: boundary.at, observer,
            frame: "equatorial-true-of-date" });
          expect(Date.parse(boundary.at)).toBeGreaterThanOrEqual(new Date(request.window.from).getTime());
          expect(Date.parse(boundary.at)).toBeLessThanOrEqual(new Date(request.window.to).getTime());
          expect(boundary.atWindowBoundary).toBe(boundary.at === result.receipt.request.window.from ||
            boundary.at === result.receipt.request.window.to);
        }
      }
      if (request === ALDEBARAN) expect(meridian.full).toEqual(meridian.overlap);
      else for (const inner of meridian.full) {
        expect(meridian.overlap.some((outer) => outer.south.latitudeDegrees < inner.south.latitudeDegrees &&
          inner.north.latitudeDegrees < outer.north.latitudeDegrees)).toBe(true);
      }
    }
    expect(result.receipt.search.samples).toBe(result.receipt.search.planeSamples + result.receipt.search.localSamples);
    expect(positions.mock.calls.length + starPositions.mock.calls.length).toBe(2 * result.receipt.search.samples);
    for (const [sample] of [...positions.mock.calls, ...starPositions.mock.calls]) {
      expect(new Date(sample.time).getTime()).toBeGreaterThanOrEqual(new Date(request.window.from).getTime());
      expect(new Date(sample.time).getTime()).toBeLessThanOrEqual(new Date(request.window.to).getTime());
    }
    if (request === ALDEBARAN) {
      expect(result.receipt.star?.id).toBe("sao:94027");
      expect(result.receipt.catalogue).not.toBeNull();
    } else {
      expect(result.receipt.star).toBeNull();
      expect(result.receipt.catalogue).toBeNull();
    }
    frozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("preserves exact requested meridians, sorts a copy, and describes dateline bands", () => {
    const original = [10, 180, -170, -0, -59.663885];
    const from = new Date(EMPTY.window.from), to = new Date(EMPTY.window.to);
    const request = { ...EMPTY, longitudes: original, window: { from, to } };
    const result = complete(lunarVisibilityOutline(request));
    expect(result.meridians.map((row) => row.longitudeDegrees)).toEqual([-180, -170, -59.663885, 0, 10]);
    expect(result.receipt.request.longitudes).toEqual([-180, -170, -59.663885, 0, 10]);
    expect(Object.is(result.receipt.request.longitudes[3], -0)).toBe(false);
    expect(result.meridians[0]!.band).toMatchObject({ west: 95, east: -175, crossesDateline: true,
      evaluatedAt: "exact-meridian-only" });
    expect(result.meridians[1]!.band).toMatchObject({ west: -175, crossesDateline: false,
      evaluatedAt: "exact-meridian-only" });
    expect(result.meridians[1]!.band.east).toBeCloseTo(-114.8319425, 12);
    expect(result.meridians[0]!.band.widthDegrees).toBe(90);
    expect(result.meridians.reduce((sum, row) => sum + row.band.widthDegrees, 0)).toBeCloseTo(360, 12);
    expect(original).toEqual([10, 180, -170, -0, -59.663885]);
    expect(Object.isFrozen(original)).toBe(false);
    expect(Object.isFrozen(request)).toBe(false);
    expect(Object.isFrozen(request.window)).toBe(false);
    expect(Object.isFrozen(from)).toBe(false);
    from.setUTCFullYear(2001); original[0] = 12;
    expect(result.receipt.request.window.from).toBe("2024-01-01T00:00:00.000Z");
    expect(result.receipt.request.longitudes.at(-1)).toBe(10);
  });

  it("uses the bounded default longitude grid and floors submillisecond step fractions", () => {
    const { longitudes: _unused, ...request } = EMPTY;
    const result = complete(lunarVisibilityOutline({ ...request, stepSeconds: 59.9999 }));
    expect(result.meridians.map((row) => row.longitudeDegrees))
      .toEqual(Array.from({ length: 360 / OUTLINE_LIMITS.defaultLongitudeStepDegrees }, (_, i) =>
        -180 + i * OUTLINE_LIMITS.defaultLongitudeStepDegrees));
    expect(result.receipt.search.timeStepMilliseconds).toBe(59_999);
    expect(result.receipt.search.planeSamples).toBe(3);
    expect(result.receipt.request.stepSeconds).toBe(59.9999);
  });

  it("captures caller request and array getters once", () => {
    let targetReads = 0, longitudeReads = 0, elementReads = 0;
    const longitudes = [0];
    Object.defineProperty(longitudes, 0, { get() { elementReads++; return 0; } });
    const result = complete(lunarVisibilityOutline({ ...EMPTY,
      get target() { targetReads++; return "Saturn" as const; },
      get longitudes() { longitudeReads++; return longitudes; } }));
    expect(result.receipt.request.longitudes).toEqual([0]);
    expect([targetReads, longitudeReads, elementReads]).toEqual([1, 1, 1]);
    expect(Object.isFrozen(longitudes)).toBe(false);
  });

  it.each([
    { from: "1799-12-31", to: "1800-01-01" },
    { from: "2199-12-31T23:59:59Z", to: CALC_SPAN.to },
    { from: new Date(-8_640_000_000_000_000), to: new Date(8_640_000_000_000_000) }
  ])("refuses the unsupported clock range before position sampling %#", (window) => {
    const positions = vi.spyOn(engine, "positionAt");
    const result = lunarVisibilityOutline({ ...EMPTY, window });
    expect(result).toMatchObject({ status: "refused", reason: "out-of-range", meridians: [],
      receipt: { search: { samples: 0, intersections: 0 } } });
    expect(positions).not.toHaveBeenCalled();
    frozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("refuses an included leap-second seam before sampling", () => {
    const positions = vi.spyOn(engine, "positionAt");
    const result = lunarVisibilityOutline({ ...EMPTY,
      window: { from: "2016-12-31T23:59:59Z", to: "2017-01-01T00:00:01Z" } });
    expect(result).toMatchObject({ status: "refused", reason: "time-discontinuity", meridians: [],
      failure: { at: "2017-01-01T00:00:00.000Z" },
      receipt: { seams: [{ at: "2017-01-01T00:00:00.000Z", kind: "leap-second" }],
        search: { samples: 0, intersections: 0 } } });
    expect(positions).not.toHaveBeenCalled();
  });

  it.each([
    { request: { maxSamples: 1 }, reason: "sample-budget" },
    { request: { maxIntersections: 3 }, reason: "intersection-budget" }
  ])("refuses an insufficient $reason preflight without sampling", ({ request, reason }) => {
    const positions = vi.spyOn(engine, "positionAt");
    const result = lunarVisibilityOutline({ ...EMPTY, ...request });
    expect(result).toMatchObject({ status: "refused", reason, meridians: [],
      receipt: { search: { samples: 0, intersections: 0 } } });
    expect(positions).not.toHaveBeenCalled();
  });

  it.each(["samples", "intersections"] as const)("discards earlier resolved meridians after late %s exhaustion", (unit) => {
    const baseline = complete(lunarVisibilityOutline(SATURN));
    expect(baseline.meridians.every((row) => row.status === "resolved" && row.overlap.length > 0)).toBe(true);
    const maximum = baseline.receipt.search[unit] - 1;
    const result = lunarVisibilityOutline({ ...SATURN,
      ...(unit === "samples" ? { maxSamples: maximum } : { maxIntersections: maximum }) });
    expect(result).toMatchObject({ status: "refused",
      reason: unit === "samples" ? "sample-budget" : "intersection-budget", meridians: [] });
    expect(result.receipt.search[unit]).toBe(maximum);
    expect(result.receipt.search.localSamples).toBeGreaterThan(0);
    if (result.status !== "refused") throw new Error("late budget unexpectedly completed");
    expect(result.failure.at).not.toBeNull();
    frozen(result);
  });

  it("retains adapter refusal provenance and discards results after local checking starts", () => {
    const positionAt = engine.positionAt;
    vi.spyOn(engine, "positionAt").mockImplementation((request) => {
      const result = positionAt(request);
      return request.observer === undefined ? result : { status: "refused", reason: "unsupported-combination",
        detail: "Constructed local refusal", receipt: result.receipt };
    });
    const result = lunarVisibilityOutline(SATURN);
    expect(result).toMatchObject({ status: "refused", reason: "position-refused", meridians: [],
      failure: { positionReason: "unsupported-combination", position: { request: { body: "Moon" } } },
      receipt: { search: { localSamples: 1 } } });
    if (result.status !== "refused") throw new Error("position refusal unexpectedly completed");
    expect(result.failure.position?.request.observer).not.toBeNull();
  });

  it("exposes degenerate meridians without publishing their partial intervals", () => {
    vi.spyOn(shadows, "meridianShadowIntervals").mockReturnValue({ unresolved: true,
      intervals: [{ south: { latitudeDegrees: -10, cause: "limb" }, north: { latitudeDegrees: 10, cause: "limb" } }] });
    const result = complete(lunarVisibilityOutline({ ...EMPTY, longitudes: [0, 10] }));
    expect(result.meridians).toHaveLength(2);
    for (const row of result.meridians) expect(row).toMatchObject({ status: "unresolved",
      reason: "degenerate-intersection", overlap: [], full: [] });
    expect(result.receipt.search.planeSamples).toBe(2);
    expect(result.receipt.search.localSamples).toBe(0);
  });

  it("keeps a meridian's unresolved status separate from another resolved empty meridian", () => {
    vi.spyOn(shadows, "meridianShadowIntervals")
      .mockReturnValue({ unresolved: false, intervals: [] })
      .mockReturnValueOnce({ unresolved: true, intervals: [] });
    const result = complete(lunarVisibilityOutline({ ...EMPTY, longitudes: [0, 10] }));
    expect(result.meridians[0]).toMatchObject({ longitudeDegrees: 0, status: "unresolved",
      reason: "degenerate-intersection", overlap: [], full: [] });
    expect(result.meridians[1]).toMatchObject({ longitudeDegrees: 10, status: "resolved",
      reason: null, overlap: [], full: [] });
    expect(result.meridians.every((row) => row.receipt === result.receipt)).toBe(true);
  });

  it("still detects a later ephemeris refusal after every meridian becomes unresolved", () => {
    vi.spyOn(shadows, "meridianShadowIntervals").mockReturnValue({ unresolved: true, intervals: [] });
    const positionAt = engine.positionAt;
    vi.spyOn(engine, "positionAt").mockImplementation((request) => {
      const result = positionAt(request);
      return new Date(request.time).getTime() === new Date(EMPTY.window.from).getTime() ? result : {
        status: "refused", reason: "unsupported-combination", detail: "Constructed later refusal", receipt: result.receipt };
    });
    const result = lunarVisibilityOutline(EMPTY);
    expect(result).toMatchObject({ status: "refused", reason: "position-refused", meridians: [],
      failure: { at: "2024-01-01T00:01:00.000Z", positionReason: "unsupported-combination" },
      receipt: { search: { planeSamples: 2, localSamples: 0 } } });
  });

  it.each([null, NaN, Infinity, -1])("refuses an invalid lunar range without returning partial bands: %s", (dist) => {
    const positionAt = engine.positionAt;
    vi.spyOn(engine, "positionAt").mockImplementation((request) => {
      const result = positionAt(request);
      return result.status === "ok" && request.body === "Moon" ? { ...result, dist } : result;
    });
    const result = lunarVisibilityOutline(EMPTY);
    expect(result).toMatchObject({ status: "refused", reason: "invalid-geometry", meridians: [],
      receipt: { search: { samples: 1, localSamples: 0 } } });
  });

  it("marks a plane/local mismatch unresolved instead of moving a boundary beyond its guard", () => {
    vi.spyOn(shadows, "meridianShadowIntervals").mockReturnValue({ unresolved: false,
      intervals: [{ south: { latitudeDegrees: -10, cause: "limb" }, north: { latitudeDegrees: 10, cause: "limb" } }] });
    const result = complete(lunarVisibilityOutline(EMPTY));
    expect(result.meridians[0]).toMatchObject({ status: "unresolved", reason: "local-check-failed", overlap: [], full: [] });
    expect(result.receipt.search.localSamples).toBe(2);
    expect(result.receipt.uncertainty.physicalLatitudeErrorDegrees).toBeNull();
  });

  it.each([
    null, [], {}, Object.create(EMPTY),
    ...["Sun", "Moon", "Earth", "saturn", "Aldebaran", "sao:0", null].map((target) => ({ ...EMPTY, target })),
    ...[null, [], {}, [Infinity], [NaN], [181], [-181], ["0"], [0, -0], [-180, 180],
      Array.from({ length: OUTLINE_LIMITS.maximumLongitudes + 1 }, (_, i) => i - 72)].map((longitudes) => ({ ...EMPTY, longitudes })),
    ...[0, -1, Infinity, NaN, null, "60", 0.0009, OUTLINE_LIMITS.maximumStepSeconds + 1].map((stepSeconds) => ({ ...EMPTY, stepSeconds })),
    ...[0, -1, Infinity, NaN, null, "10", 1.5, OUTLINE_LIMITS.maximumMaxSamples + 1].map((maxSamples) => ({ ...EMPTY, maxSamples })),
    ...[0, -1, Infinity, NaN, null, "10", 1.5, OUTLINE_LIMITS.maximumMaxIntersections + 1].map((maxIntersections) => ({ ...EMPTY, maxIntersections })),
    { ...EMPTY, window: { from: "2024-02-30", to: "2024-03-01" } },
    { ...EMPTY, window: { from: "2024-01-01", to: "2024-01-01" } },
    { ...EMPTY, observer: { latitude: 0, longitude: 0 } }, { ...EMPTY, [Symbol("unknown")]: true }
  ])("rejects malformed input %#", (request) => {
    expect(() => lunarVisibilityOutline(request as LunarOutlineRequest)).toThrow(RangeError);
  });
});
