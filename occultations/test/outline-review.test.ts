import { afterEach, describe, expect, it, vi } from "vitest";
import * as contacts from "../src/contact-geometry.js";
import * as engine from "../src/engine.js";
import * as shadows from "../src/shadow-geometry.js";
import * as sky from "../src/sky-geometry.js";
import { lunarVisibilityOutline } from "../src/outlines.js";

afterEach(() => vi.restoreAllMocks());

describe("outline temporal component retention", () => {
  it("does not extend a sampled component through an unrelated refined component", () => {
    const from = Date.parse("2024-01-01T00:00:00Z"), to = from + 60_000;
    let sampledAt = from, latitude = 0;
    const shadowTimes = new WeakMap<object, number>();
    const evaluated = new Set<number>();
    const positionAt = engine.positionAt, makeShadow = shadows.makeShadow;
    vi.spyOn(engine, "positionAt").mockImplementation((request) => {
      sampledAt = new Date(request.time).getTime();
      if (request.observer) latitude = request.observer.latitude;
      return positionAt(request);
    });
    vi.spyOn(shadows, "makeShadow").mockImplementation((...args) => {
      const shadow = makeShadow(...args);
      shadowTimes.set(shadow, sampledAt);
      return shadow;
    });

    // A synthetic orchestration case, not an ephemeris or accuracy fixture:
    // the coarse grid sees only a southern strip at the first instant. The
    // extra time samples see a northern strip separated by an uncovered gap.
    // Missing that short strip is allowed by the sampling contract; joining
    // the southern strip's lower edge to its upper edge invents coverage.
    const stripAt = (at: number): readonly [number, number] | null =>
      at === from ? [-30, -20] : at === to ? null : [20, 30];
    vi.spyOn(shadows, "meridianShadowIntervals").mockImplementation((shadow) => {
      const at = shadowTimes.get(shadow)!;
      evaluated.add(at);
      const strip = stripAt(at);
      return { unresolved: false, intervals: strip === null ? [] : [{
        south: { latitudeDegrees: strip[0], cause: "limb" },
        north: { latitudeDegrees: strip[1], cause: "limb" }
      }] };
    });
    // Supply independently defined local roots for each synthetic strip.
    // This makes a branch jump pass local endpoint checks, so only preserving
    // component identity can prevent the false connected interval.
    vi.spyOn(contacts, "contactGeometry").mockImplementation(() => {
      const strip = stripAt(sampledAt);
      const clearance = strip === null ? 1 : (latitude - strip[0]) * (latitude - strip[1]);
      return { moonSemidiameterDegrees: 0.2, targetSemidiameterDegrees: 0.01,
        externalClearanceDegrees: clearance, internalClearanceDegrees: clearance };
    });
    const horizontalFacts = sky.horizontalFacts;
    vi.spyOn(sky, "horizontalFacts").mockImplementation((...args) => ({
      ...horizontalFacts(...args), geometricAltitudeDegrees: 10, aboveGeometricHorizon: true
    }));

    const result = lunarVisibilityOutline({ target: "Saturn", longitudes: [0],
      window: { from: new Date(from), to: new Date(to) } });
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error(`Unexpected refusal: ${result.reason}`);
    expect([...evaluated].some((at) => at > from && at < to)).toBe(true);
    const meridian = result.meridians[0]!;
    expect(meridian.status).toBe("resolved");
    for (const intervals of [meridian.overlap, meridian.full]) {
      expect(intervals).toHaveLength(1);
      expect(intervals[0]!.south.latitudeDegrees).toBeCloseTo(-30, 4);
      expect(intervals[0]!.north.latitudeDegrees).toBeCloseTo(-20, 4);
      expect(intervals[0]!.south.at).toBe(new Date(from).toISOString());
      expect(intervals[0]!.north.at).toBe(new Date(from).toISOString());
    }
    expect(result.receipt.search.completeness).toBe("sampled-time-and-longitude;not-proven");
    expect(result.receipt.uncertainty.physicalLatitudeErrorDegrees).toBeNull();
  });
});
