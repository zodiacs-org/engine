import { describe, expect, it } from "vitest";
import {
  containsPoint, geographicBounds, MAX_POLYLINE_POINTS, splitAntimeridian, wrapLongitude
} from "../src/index.js";
import type { GeographicBounds, GeographicPoint } from "../src/index.js";

const point = (latitude: number, longitude: number): GeographicPoint => ({ latitude, longitude });
const bounds: GeographicBounds = { south: -20, north: 20, west: 170, east: -170 };

describe("geographic bounds and longitude wrapping", () => {
  it.each([
    [180, -180], [-180, -180], [540, -180], [-540, -180], [360, 0],
    [-360, 0], [181, -179], [-181, 179], [0, 0], [-0, 0], [12.3456789, 12.3456789]
  ])("wraps %s degrees to %s", (input, expected) => {
    expect(wrapLongitude(input)).toBe(expected);
  });

  it("handles very large finite longitudes without overflow", () => {
    for (const longitude of [Number.MAX_VALUE, -Number.MAX_VALUE, 1e100, -1e100]) {
      const result = wrapLongitude(longitude);
      expect(result).toBeGreaterThanOrEqual(-180);
      expect(result).toBeLessThan(180);
      expect(wrapLongitude(result)).toBe(result);
    }
  });

  it.each([NaN, Infinity, -Infinity, "0", null, undefined])("rejects nonfinite/nonnumeric longitude: %s", (value) => {
    expect(() => wrapLongitude(value as number)).toThrow(RangeError);
  });

  it("captures crossing bounds and checks inclusive membership on either side", () => {
    expect(geographicBounds(bounds)).toEqual({ ...bounds, longitudeSpan: 20, eastUnwrapped: 190 });
    for (const longitude of [170, 175, 180, -180, -175, -170]) {
      expect(containsPoint(bounds, point(20, longitude))).toBe(true);
    }
    for (const longitude of [169, -169, 0]) expect(containsPoint(bounds, point(0, longitude))).toBe(false);
    expect(containsPoint(bounds, point(20.001, 175))).toBe(false);
  });

  it("distinguishes the full world, a wide noncrossing arc and a single meridian", () => {
    expect(geographicBounds({ ...bounds, west: -180, east: 180 }).longitudeSpan).toBe(360);
    const wide = { ...bounds, west: -170, east: 170 };
    expect(geographicBounds(wide).longitudeSpan).toBe(340);
    expect(containsPoint(wide, point(0, 0))).toBe(true);
    expect(containsPoint(wide, point(0, 180))).toBe(false);
    for (const arc of [{ west: 180, east: -180 }, { west: -180, east: -180 }]) {
      const single = { ...bounds, ...arc };
      expect(geographicBounds(single).longitudeSpan).toBe(0);
      expect(containsPoint(single, point(0, 180))).toBe(true);
      expect(containsPoint(single, point(0, -180))).toBe(true);
      expect(containsPoint(single, point(0, 179))).toBe(false);
    }
  });

  it.each([
    null, [], {}, { ...bounds, south: 21 }, { ...bounds, south: -91 },
    { ...bounds, north: Infinity }, { ...bounds, west: NaN },
    { ...bounds, east: 181 }, { ...bounds, east: "0" }
  ])("rejects invalid bounds: %j", (input) => {
    expect(() => geographicBounds(input as GeographicBounds)).toThrow(RangeError);
  });

  it("allows geographic poles in pure bounds and checks point validity", () => {
    const world = { south: -90, north: 90, west: -180, east: 180 };
    expect(containsPoint(world, point(90, 0))).toBe(true);
    expect(() => containsPoint(world, point(91, 0))).toThrow(RangeError);
    expect(() => containsPoint(world, point(0, 181))).toThrow(RangeError);
  });

  it("does not round a point just beyond a degenerate seam bound into membership", () => {
    const single = { ...bounds, west: 180, east: 180 };
    expect(containsPoint(single, point(0, -180 + 2 ** -45))).toBe(false);
  });
});

describe("antimeridian geometry", () => {
  it("splits eastward links with explicit seam provenance", () => {
    const result = splitAntimeridian([point(10, 170), point(30, -170)]);
    expect(result).toEqual([
      [
        { point: point(10, 170), source: { kind: "sample", index: 0 } },
        { point: point(20, 180), source: { kind: "seam", fromIndex: 0, toIndex: 1, fraction: 0.5 } }
      ],
      [
        { point: point(20, -180), source: { kind: "seam", fromIndex: 0, toIndex: 1, fraction: 0.5 } },
        { point: point(30, -170), source: { kind: "sample", index: 1 } }
      ]
    ]);
  });

  it("splits westward links and computes the actual interpolation fraction", () => {
    const result = splitAntimeridian([point(-10, -175), point(30, 165)]);
    expect(result[0]![1]).toEqual({
      point: point(0, -180), source: { kind: "seam", fromIndex: 0, toIndex: 1, fraction: 0.25 }
    });
    expect(result[1]![0]!.point).toEqual(point(0, 180));
  });

  it("splits a repeated back-and-forth seam crossing in input order", () => {
    const result = splitAntimeridian([point(0, 170), point(10, -170), point(20, 170)]);
    expect(result.map((part) => part.map((vertex) => vertex.point))).toEqual([
      [point(0, 170), point(5, 180)],
      [point(5, -180), point(10, -170), point(15, -180)],
      [point(15, 180), point(20, 170)]
    ]);
  });

  it("changes seam spelling at exact seam samples without fabricating vertices or stubs", () => {
    const result = splitAntimeridian([point(0, 170), point(10, -180), point(20, -170)]);
    expect(result.map((part) => part.map((vertex) => vertex.point))).toEqual([
      [point(0, 170), point(10, 180)], [point(10, -180), point(20, -170)]
    ]);
    expect(result.flat().every((vertex) => vertex.source.kind === "sample")).toBe(true);
    expect(splitAntimeridian([point(0, 180), point(1, -170)]).map((part) => part.map((v) => v.point)))
      .toEqual([[point(0, -180), point(1, -170)]]);
    expect(splitAntimeridian([point(0, -180), point(1, 170)]).map((part) => part.map((v) => v.point)))
      .toEqual([[point(0, 180), point(1, 170)]]);
  });

  it("keeps seam aliases, half-world ties, singleton points and polar endpoints well-defined", () => {
    expect(splitAntimeridian([])).toEqual([]);
    expect(splitAntimeridian([point(90, 180)])).toEqual([
      [{ point: point(90, 180), source: { kind: "sample", index: 0 } }]
    ]);
    expect(splitAntimeridian([point(0, 180), point(10, -180)]).map((part) => part.map((v) => v.point)))
      .toEqual([[point(0, 180), point(10, 180)]]);
    for (const longitude of [-180, 180]) {
      expect(splitAntimeridian([point(-90, 0), point(90, longitude)])[0]![1]!.point.longitude).toBe(longitude);
    }
  });

  it("owns its geometry without mutating caller samples", () => {
    const input = Object.freeze([Object.freeze(point(0, 170)), Object.freeze(point(20, -170))]);
    const result = splitAntimeridian(input);
    (result[0]![0]!.point as { latitude: number }).latitude = 50;
    expect(input[0]!.latitude).toBe(0);
    expect(result[0]![1]!.point).not.toBe(result[1]![0]!.point);
  });

  it("keeps tiny distances on either side of the seam without false interior crossings", () => {
    const distance = 2 ** -45;
    const left = point(0, 180 - distance);
    const right = point(20, -180 + distance);
    expect(splitAntimeridian([left, right]).map((part) => part.map((v) => v.point)))
      .toEqual([[left, point(10, 180)], [point(10, -180), right]]);
    for (const sign of [-1, 1]) {
      const near = point(0, sign * (180 - distance));
      const seam = point(20, -sign * 180);
      const result = splitAntimeridian([near, seam]);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(2);
      expect(result[0]![1]).toEqual({ point: point(20, sign * 180), source: { kind: "sample", index: 1 } });
    }
  });

  it("keeps short displayed links and sample provenance over a seam and hemisphere corpus", () => {
    const longitudes = [-180, -180 + 2 ** -45, -170, -90, -0.1, 0, 0.1, 90, 170, 180 - 2 ** -45, 180];
    for (const from of longitudes) {
      for (const middle of longitudes) {
        for (const to of longitudes) {
          const input = [point(-80, from), point(0, middle), point(80, to)];
          const parts = splitAntimeridian(input);
          const sampleIndices = new Set<number>();
          for (const part of parts) {
            for (const [index, vertex] of part.entries()) {
              if (index > 0) expect(Math.abs(vertex.point.longitude - part[index - 1]!.point.longitude)).toBeLessThanOrEqual(180);
              if (vertex.source.kind === "sample") {
                sampleIndices.add(vertex.source.index);
                expect(vertex.point.latitude).toBe(input[vertex.source.index]!.latitude);
                expect(wrapLongitude(vertex.point.longitude)).toBe(wrapLongitude(input[vertex.source.index]!.longitude));
              }
            }
          }
          expect([...sampleIndices]).toEqual([0, 1, 2]);
          for (let index = 1; index < parts.length; index++) {
            const before = parts[index - 1]!.at(-1)!.point;
            const after = parts[index]![0]!.point;
            expect(before.latitude).toBe(after.latitude);
            expect(before.longitude).toBe(-after.longitude);
          }
        }
      }
    }
  });

  it("bounds polyline work and rejects malformed points, including sparse input", () => {
    const repeated = Array.from({ length: MAX_POLYLINE_POINTS }, () => point(0, 0));
    expect(splitAntimeridian(repeated)[0]).toHaveLength(MAX_POLYLINE_POINTS);
    expect(() => splitAntimeridian([...repeated, point(0, 0)])).toThrow(RangeError);
    for (const input of [null, {}, [point(91, 0)], [point(0, 181)], [point(NaN, 0)], new Array(2)]) {
      expect(() => splitAntimeridian(input as GeographicPoint[])).toThrow(RangeError);
    }
  });
});
