import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../src/calc-frames.js";
import { add, cross, dot, scale, unit } from "../src/astrometry.js";
import { makeShadow, meridianShadowIntervals } from "../src/shadow-geometry.js";
import type { ShadowGeometry } from "../src/shadow-geometry.js";

// Synthetic Euclidean constructions are independent geometry checks, not a sky
// accuracy comparison. Lengths use km solely to match the kernel's interface.
const RAD = Math.PI / 180;
const u: Vec3 = [10, 0, 0], v: Vec3 = [0, 0, 8];
const point = (direction: Vec3 = [1, 0, 0]) => ({ direction, distanceKm: null, radiusKm: 0 });
function observer(latitude: number, equator = u, pole = v): Vec3 {
  const a = Math.hypot(...equator), b = Math.hypot(...pole);
  const theta = Math.atan2(b * Math.sin(latitude * RAD), a * Math.cos(latitude * RAD));
  return add(scale(equator, Math.cos(theta)), scale(pole, Math.sin(theta)));
}
function angularClearance(shadow: ShadowGeometry, latitude: number, coverage: "overlap" | "full"): number {
  const o = observer(latitude), moon = add(shadow.moonKm, scale(o, -1));
  const target = shadow.targetKm === null ? shadow.targetDirection : add(shadow.targetKm, scale(o, -1));
  const m = unit(moon), t = unit(target);
  const separation = Math.atan2(Math.hypot(...cross(m, t)), dot(m, t));
  const lunarRadius = Math.asin(shadow.moonRadiusKm / Math.hypot(...moon));
  const targetRadius = shadow.targetKm === null ? 0 : Math.asin(shadow.targetRadiusKm / Math.hypot(...target));
  return separation - lunarRadius + (coverage === "overlap" ? -targetRadius : targetRadius);
}

describe("fundamental-plane shadow and exact meridian intersections", () => {
  it("solves a central cylinder on an ellipsoid in geodetic latitude", () => {
    const shadow = makeShadow([100, 0, 0], point(), 2);
    const result = meridianShadowIntervals(shadow, u, v, "overlap");
    // b sin(theta) = radius, then tan(phi) = (a/b) tan(theta).
    const limit = Math.atan(10 * 2 / (8 * Math.sqrt(8 ** 2 - 2 ** 2))) / RAD;
    expect(result.unresolved).toBe(false);
    expect(result.intervals).toHaveLength(1);
    expect(result.intervals[0]!.south.cause).toBe("limb");
    expect(result.intervals[0]!.north.cause).toBe("limb");
    expect(result.intervals[0]!.south.latitudeDegrees).toBeCloseTo(-limit, 9);
    expect(result.intervals[0]!.north.latitudeDegrees).toBeCloseTo(limit, 9);
    expect(meridianShadowIntervals(shadow, u, v, "full")).toEqual(result);
  });

  it("uses a right-handed orthonormal plane and a deterministic polar basis", () => {
    for (const direction of [[1, 2, 3], [0, 0, 1], [0, 0, -1]] as Vec3[]) {
      const shadow = makeShadow(scale(unit(direction), 100), point(direction), 2);
      expect(dot(shadow.axis, shadow.east)).toBeCloseTo(0, 14);
      expect(dot(shadow.axis, shadow.north)).toBeCloseTo(0, 14);
      expect(dot(cross(shadow.east, shadow.north), shadow.axis)).toBeCloseTo(1, 14);
    }
  });

  it("matches separate external and internal angular tangent equations for finite spheres", () => {
    const target: Vec3 = [1000, 2, 4];
    const shadow = makeShadow([100, 0, 1], {
      direction: unit(target), distanceKm: Math.hypot(...target), radiusKm: 5
    }, 2);
    const overlap = meridianShadowIntervals(shadow, u, v, "overlap");
    const full = meridianShadowIntervals(shadow, u, v, "full");
    expect(overlap.unresolved).toBe(false);
    expect(full.unresolved).toBe(false);
    expect(overlap.intervals).toHaveLength(1);
    expect(full.intervals).toHaveLength(1);
    expect(full.intervals[0]!.south.latitudeDegrees).toBeGreaterThan(overlap.intervals[0]!.south.latitudeDegrees);
    expect(full.intervals[0]!.north.latitudeDegrees).toBeLessThan(overlap.intervals[0]!.north.latitudeDegrees);
    for (const [coverage, result] of [["overlap", overlap], ["full", full]] as const) {
      for (const boundary of [result.intervals[0]!.south, result.intervals[0]!.north]) {
        expect(boundary.cause).toBe("limb");
        expect(Math.abs(angularClearance(shadow, boundary.latitudeDegrees, coverage))).toBeLessThan(2e-11);
      }
      for (let latitude = -89; latitude <= 89; latitude += 0.37) {
        const predicted = result.intervals.some(interval => latitude > interval.south.latitudeDegrees && latitude < interval.north.latitudeDegrees);
        expect(predicted).toBe(angularClearance(shadow, latitude, coverage) < 0);
      }
    }
  });

  it("does not make the negative full-cone radius into an annular full occultation", () => {
    const shadow = makeShadow([100, 0, 0], { direction: [1, 0, 0], distanceKm: 1000, radiusKm: 50 }, 2);
    expect(meridianShadowIntervals(shadow, u, v, "overlap").intervals).toHaveLength(1);
    expect(meridianShadowIntervals(shadow, u, v, "full").intervals).toEqual([]);
    expect(angularClearance(shadow, 0, "full")).toBeGreaterThan(0);
  });

  it("clips a large cylinder to the stellar center's geometric horizon", () => {
    const direction: Vec3 = [Math.cos(30 * RAD), 0, Math.sin(30 * RAD)];
    const shadow = makeShadow(scale(direction, 100), point(direction), 20);
    const result = meridianShadowIntervals(shadow, u, v, "overlap");
    expect(result.unresolved).toBe(false);
    expect(result.intervals).toHaveLength(1);
    expect(result.intervals[0]!.south.cause).toBe("horizon");
    expect(result.intervals[0]!.south.latitudeDegrees).toBeCloseTo(-60, 9);
    expect(result.intervals[0]!.north).toEqual({ latitudeDegrees: 90, cause: "pole" });
  });

  it("uses the finite target direction from each observer for the horizon", () => {
    const shadow = makeShadow([100, 0, 0], { direction: [1, 0, 0], distanceKm: 1000, radiusKm: 10 }, 20);
    const result = meridianShadowIntervals(shadow, u, [0, 0, 10], "overlap");
    const limit = Math.acos(10 / 1000) / RAD;
    expect(result.unresolved).toBe(false);
    expect(result.intervals).toHaveLength(1);
    for (const side of ["south", "north"] as const) {
      expect(result.intervals[0]![side].cause).toBe("horizon");
      expect(result.intervals[0]![side].latitudeDegrees).toBeCloseTo(side === "south" ? -limit : limit, 9);
    }
  });

  it("retains a polar cap while excluding the back side of the Earth", () => {
    const shadow = makeShadow([0, 0, 100], point([0, 0, 1]), 2);
    const result = meridianShadowIntervals(shadow, u, [0, 0, 10], "overlap");
    expect(result.unresolved).toBe(false);
    expect(result.intervals).toHaveLength(1);
    expect(result.intervals[0]!.south.latitudeDegrees).toBeCloseTo(Math.acos(0.2) / RAD, 9);
    expect(result.intervals[0]!.north).toEqual({ latitudeDegrees: 90, cause: "pole" });
    const opposite = makeShadow([0, 0, -100], point([0, 0, 1]), 2);
    expect(meridianShadowIntervals(opposite, u, v, "overlap").intervals).toEqual([]);
  });

  it("preserves disconnected latitude intervals on one longitude", () => {
    const direction: Vec3 = [0.1, Math.sqrt(0.99), 0];
    const transverse: Vec3 = [Math.sqrt(0.99), -0.1, 0];
    const shadow = makeShadow(add(scale(direction, 1000), scale(transverse, -10)), point(direction), 15);
    const result = meridianShadowIntervals(shadow, u, [0, 0, 10], "overlap");
    // -cos(phi)^2 + 20 sqrt(99) cos(phi) - 25 = 0, evaluated
    // with a rationalized quadratic root to avoid subtracting nearby values.
    const c = 50 / (20 * Math.sqrt(99) + Math.sqrt(400 * 99 - 100));
    const innerLimit = Math.acos(c) / RAD;
    expect(result.unresolved).toBe(false);
    expect(result.intervals).toHaveLength(2);
    expect(result.intervals[0]!.south).toEqual({ latitudeDegrees: -90, cause: "pole" });
    expect(result.intervals[0]!.north.latitudeDegrees).toBeCloseTo(-innerLimit, 8);
    expect(result.intervals[1]!.south.latitudeDegrees).toBeCloseTo(innerLimit, 8);
    expect(result.intervals[1]!.north).toEqual({ latitudeDegrees: 90, cause: "pole" });
  });

  it("finds a sub-grid strip without a latitude sampling grid", () => {
    const shadow = makeShadow([100, 0, 3.23456789], point(), 0.00001);
    const result = meridianShadowIntervals(shadow, u, v, "overlap");
    const latitude = (z: number) => Math.atan2(10 * z, 8 * Math.sqrt(64 - z * z)) / RAD;
    expect(result.unresolved).toBe(false);
    expect(result.intervals).toHaveLength(1);
    expect(result.intervals[0]!.south.latitudeDegrees).toBeCloseTo(latitude(3.23455789), 6);
    expect(result.intervals[0]!.north.latitudeDegrees).toBeCloseTo(latitude(3.23457789), 6);
  });

  it("marks an isolated limb tangent unresolved instead of claiming a finite strip", () => {
    const shadow = makeShadow([100, 2, 0], point(), 2);
    const result = meridianShadowIntervals(shadow, u, v, "overlap");
    expect(result.intervals).toEqual([]);
    expect(result.unresolved).toBe(true);
  });

  it("marks a horizon plateau unresolved rather than assigning visibility", () => {
    const shadow = makeShadow([0, 100, 0], point([0, 1, 0]), 20);
    const result = meridianShadowIntervals(shadow, u, v, "overlap");
    expect(result.intervals).toEqual([]);
    expect(result.unresolved).toBe(true);
  });

  it("reports an ordinary miss as resolved and is invariant to shared rotation", () => {
    const missed = makeShadow([100, 20, 0], point(), 2);
    expect(meridianShadowIntervals(missed, u, v, "overlap")).toEqual({ intervals: [], unresolved: false });
    const rotate = ([x, y, z]: Vec3): Vec3 => [y, z, x];
    const shadow = makeShadow([100, 0, 1], point(), 2);
    const rotated = makeShadow(rotate(shadow.moonKm), point(rotate(shadow.targetDirection)), 2);
    const original = meridianShadowIntervals(shadow, u, v, "overlap");
    const result = meridianShadowIntervals(rotated, rotate(u), rotate(v), "overlap");
    expect(result.unresolved).toBe(original.unresolved);
    expect(result.intervals).toHaveLength(original.intervals.length);
    expect(result.intervals[0]!.south.latitudeDegrees).toBeCloseTo(original.intervals[0]!.south.latitudeDegrees, 10);
    expect(result.intervals[0]!.north.latitudeDegrees).toBeCloseTo(original.intervals[0]!.north.latitudeDegrees, 10);
  });

  it("agrees with direct observer angles and normal horizons over synthetic orientations", () => {
    let state = 0x4193ba7;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
    for (let construction = 0; construction < 30; ++construction) {
      const direction = unit([2 * random() - 1, 2 * random() - 1, 2 * random() - 1]);
      const moon = add(scale(direction, 100), [24 * random() - 12, 24 * random() - 12, 24 * random() - 12]);
      const shadow = makeShadow(moon, construction % 2 === 0 ? point(direction) :
        { direction, distanceKm: 1000, radiusKm: 15 * random() }, 2 + 5 * random());
      for (const coverage of ["overlap", "full"] as const) {
        const result = meridianShadowIntervals(shadow, u, v, coverage);
        expect(result.unresolved).toBe(false);
        for (let latitude = -89.73; latitude < 90; latitude += 1.17) {
          const o = observer(latitude);
          const normal: Vec3 = [o[0] / 100, 0, o[2] / 64];
          const target = shadow.targetKm === null ? shadow.targetDirection : add(shadow.targetKm, scale(o, -1));
          const horizon = dot(normal, target);
          const clearance = angularClearance(shadow, latitude, coverage);
          const contained = result.intervals.some(interval => latitude > interval.south.latitudeDegrees && latitude < interval.north.latitudeDegrees);
          expect(contained).toBe(horizon > 0 && clearance < 0);
        }
        for (const interval of result.intervals) {
          for (const boundary of [interval.south, interval.north]) {
            if (boundary.cause === "limb") {
              expect(Math.abs(angularClearance(shadow, boundary.latitudeDegrees, coverage))).toBeLessThan(2e-11);
            } else if (boundary.cause === "horizon") {
              const o = observer(boundary.latitudeDegrees);
              const normal: Vec3 = [o[0] / 100, 0, o[2] / 64];
              const target = shadow.targetKm === null ? shadow.targetDirection : add(shadow.targetKm, scale(o, -1));
              expect(Math.abs(dot(unit(normal), unit(target)))).toBeLessThan(2e-11);
            }
          }
        }
      }
    }
  });

  it("refuses invalid vectors, radii, depth order and meridian bases", () => {
    for (const radius of [-1, 0, NaN, Infinity, 100]) expect(() => makeShadow([100, 0, 0], point(), radius)).toThrow(RangeError);
    expect(() => makeShadow([NaN, 0, 0], point(), 2)).toThrow(RangeError);
    expect(() => makeShadow([100, 0, 0], point([0, 0, 0]), 2)).toThrow(RangeError);
    expect(() => makeShadow([100, 0, 0], { ...point(), radiusKm: 1 }, 2)).toThrow(RangeError);
    for (const distanceKm of [-1, NaN, Infinity, 100]) {
      expect(() => makeShadow([100, 0, 0], { ...point(), distanceKm }, 2)).toThrow(RangeError);
    }
    const shadow = makeShadow([100, 0, 0], point(), 2);
    expect(() => meridianShadowIntervals(shadow, [0, 0, 0], v, "overlap")).toThrow(RangeError);
    expect(() => meridianShadowIntervals(shadow, u, [1, 0, 8], "overlap")).toThrow(RangeError);
    expect(() => meridianShadowIntervals(shadow, [100, 0, 0], v, "overlap")).toThrow(RangeError);
    expect(() => meridianShadowIntervals(shadow, u, [0, NaN, 8], "overlap")).toThrow(RangeError);
    const nearTarget = makeShadow([100, 0, 0], { ...point(), distanceKm: 110 }, 2);
    expect(() => meridianShadowIntervals(nearTarget, u, v, "overlap")).toThrow(RangeError);
  });
});
