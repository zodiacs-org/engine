import { describe, expect, it } from "vitest";
import { contactGeometry } from "../src/contact-geometry.js";

// Analytic right triangles use the engine's documented IAU mean lunar radius.
// They check spherical geometry, not the accuracy of a sky prediction.
const moonRadiusKm = 1_737.4;
const point = { separationDegrees: 0, moonDistanceKm: 2 * moonRadiusKm, targetDistanceKm: null, targetRadiusKm: 0 };

describe("topocentric spherical contact geometry", () => {
  it("uses the tangent from an observer outside a sphere, not a small-angle radius", () => {
    const result = contactGeometry(point);
    expect(result.moonSemidiameterDegrees).toBeCloseTo(30, 12);
    expect(result.targetSemidiameterDegrees).toBe(0);
    expect(result.externalClearanceDegrees).toBeCloseTo(-30, 12);
    expect(result.internalClearanceDegrees).toBe(result.externalClearanceDegrees);
  });

  it("distinguishes external disk contact from the whole target being hidden", () => {
    const input = { ...point, targetDistanceKm: 20_000, targetRadiusKm: 20_000 * Math.sin(Math.PI / 18) };
    const partial = contactGeometry({ ...input, separationDegrees: 25 });
    expect(partial.targetSemidiameterDegrees).toBeCloseTo(10, 12);
    expect(partial.externalClearanceDegrees).toBeCloseTo(-15, 12);
    expect(partial.internalClearanceDegrees).toBeCloseTo(5, 12);
    const full = contactGeometry({ ...input, separationDegrees: 15 });
    expect(full.externalClearanceDegrees).toBeCloseTo(-25, 12);
    expect(full.internalClearanceDegrees).toBeCloseTo(-5, 12);
  });

  it("does not turn an annular overlap into full hiding of a larger target", () => {
    const result = contactGeometry({ ...point, targetDistanceKm: 30_000, targetRadiusKm: 30_000 / Math.sqrt(2) });
    expect(result.targetSemidiameterDegrees).toBeCloseTo(45, 12);
    expect(result.externalClearanceDegrees).toBeCloseTo(-75, 12);
    expect(result.internalClearanceDegrees).toBeCloseTo(15, 12);
  });

  it("gives a zero internal boundary to exactly equal centered disks", () => {
    const result = contactGeometry({ ...point, targetDistanceKm: 20_000, targetRadiusKm: 10_000 });
    expect(result.internalClearanceDegrees).toBe(0);
    expect(result.externalClearanceDegrees).toBeLessThan(0);
  });

  it("recomputes semidiameter when the topocentric range changes", () => {
    const near = contactGeometry({ ...point, separationDegrees: 20 });
    const far = contactGeometry({ ...point, separationDegrees: 20, moonDistanceKm: 4 * moonRadiusKm });
    expect(near.externalClearanceDegrees).toBeLessThan(0);
    expect(far.externalClearanceDegrees).toBeGreaterThan(0);
  });

  it("rejects observers inside the lunar sphere and target depth inversions", () => {
    expect(() => contactGeometry({ ...point, moonDistanceKm: moonRadiusKm })).toThrow(RangeError);
    expect(() => contactGeometry({ ...point, targetDistanceKm: moonRadiusKm })).toThrow(RangeError);
    expect(() => contactGeometry({ ...point, targetDistanceKm: 3 * moonRadiusKm })).toThrow(RangeError);
    expect(() => contactGeometry({ ...point, targetDistanceKm: 10_000, targetRadiusKm: 5_000 })).toThrow(RangeError);
    expect(() => contactGeometry({ ...point, targetRadiusKm: 1 })).toThrow(RangeError);
  });

  it("rejects malformed lengths and separations before returning geometry", () => {
    for (const value of [-1, NaN, Infinity]) {
      expect(() => contactGeometry({ ...point, separationDegrees: value })).toThrow(RangeError);
      expect(() => contactGeometry({ ...point, moonDistanceKm: value })).toThrow(RangeError);
      expect(() => contactGeometry({ ...point, targetRadiusKm: value })).toThrow(RangeError);
      expect(() => contactGeometry({ ...point, targetDistanceKm: value })).toThrow(RangeError);
    }
    expect(() => contactGeometry({ ...point, separationDegrees: 180.01 })).toThrow(RangeError);
  });
});
