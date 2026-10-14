import { describe, expect, it, vi } from "vitest";
import { GREAT_CIRCLE_DIRECTION_TOLERANCE, GreatCircleBudgetError, MAX_PATH_SAMPLES,
  planGreatCircle } from "../src/index.js";
import type { GeographicPoint, GreatCircleOptions } from "../src/index.js";

const options: GreatCircleOptions = { from: { latitude: 0, longitude: 0 },
  to: { latitude: 0, longitude: 80 }, stepDegrees: 20, maxSamples: 64 };

// Independent Cartesian and haversine geometry, not astronomical accuracy evidence.
const vector = (point: GeographicPoint) => {
  const phi = point.latitude * Math.PI / 180;
  const lambda = point.longitude * Math.PI / 180;
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
};
function distance(a: GeographicPoint, b: GeographicPoint) {
  const rad = Math.PI / 180;
  const hav = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad)
      * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(Math.max(0, 1 - hav))) / rad;
}

describe("bounded shortest great-circle geometry", () => {
  it("includes exact endpoints, steps in arc degrees and retains a shorter final interval", () => {
    const result = planGreatCircle({ ...options, to: { latitude: 0, longitude: 85 } });
    expect(result.samples.map((sample) => sample.distanceDegrees)).toEqual([0, 20, 40, 60, 80, 85]);
    expect(result.sampleCount).toBe(6);
    expect(result.lengthDegrees).toBe(85);
    expect(result.samples[0]!.point).toEqual(options.from);
    expect(result.samples.at(-1)!.point).toEqual({ latitude: 0, longitude: 85 });
    for (const sample of result.samples) {
      expect(sample.point.latitude).toBe(0);
      expect(sample.point.longitude).toBeCloseTo(sample.distanceDegrees, 12);
      expect(sample.fraction).toBe(sample.distanceDegrees / result.lengthDegrees);
    }
    expect(result.polylines).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("follows the arc plane and independent haversine distances for oblique paths", () => {
    for (const [from, to] of [[{ latitude: -31, longitude: 72 }, { latitude: 48, longitude: -14 }],
      [{ latitude: 89.999999, longitude: 3 }, { latitude: -58, longitude: 75 }],
      [{ latitude: -74, longitude: -158 }, { latitude: 33, longitude: 165 }]] as const) {
      const result = planGreatCircle({ from, to, stepDegrees: 7, maxSamples: 64 });
      const a = vector(from);
      const b = vector(to);
      const normal = [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
      expect(result.lengthDegrees).toBeCloseTo(distance(from, to), 11);
      for (const sample of result.samples) {
        const p = vector(sample.point);
        expect(Math.abs(p.reduce((sum, n, i) => sum + n * normal[i]!, 0))).toBeLessThan(1e-14);
        expect(distance(from, sample.point)).toBeCloseTo(sample.distanceDegrees, 10);
        expect(sample.point.latitude).toBeGreaterThanOrEqual(-90);
        expect(sample.point.latitude).toBeLessThanOrEqual(90);
      }
    }
  });

  it("takes the short arc through the seam and reports interpolated provenance", () => {
    const result = planGreatCircle({ ...options, from: { latitude: 20, longitude: 170 },
      to: { latitude: 25, longitude: -170 }, stepDegrees: 12 });
    expect(result.lengthDegrees).toBeLessThan(20);
    expect(result.polylines).toHaveLength(2);
    const seams = result.polylines.flat().filter((vertex) => vertex.source.kind === "seam");
    expect(seams).toHaveLength(2);
    expect(seams.map((vertex) => vertex.point.longitude)).toEqual([180, -180]);
    expect(seams[0]!.source).toEqual(seams[1]!.source);
    for (const vertex of result.polylines.flat()) {
      if (vertex.source.kind === "sample") {
        expect(vertex.point.latitude).toBe(result.samples[vertex.source.index]!.point.latitude);
        expect(Math.abs(vertex.point.longitude - result.samples[vertex.source.index]!.point.longitude) % 360).toBe(0);
      } else {
        expect(vertex.source.fraction).toBeGreaterThan(0);
        expect(vertex.source.fraction).toBeLessThan(1);
      }
    }
    for (const segment of result.polylines) {
      for (let i = 1; i < segment.length; i++) {
        expect(Math.abs(segment[i]!.point.longitude - segment[i - 1]!.point.longitude)).toBeLessThanOrEqual(180);
      }
    }
  });

  it("inserts a pole between coarse rows and breaks display runs there", () => {
    for (const sign of [1, -1]) {
      const result = planGreatCircle({ ...options, from: { latitude: sign * 80, longitude: 15 },
        to: { latitude: sign * 75, longitude: -165 }, stepDegrees: 30 });
      expect(result.sampleCount).toBe(3);
      expect(result.samples[1]).toMatchObject({ distanceDegrees: 10, point: { latitude: sign * 90, longitude: 0 } });
      expect(result.polylines.map((line) => line.length)).toEqual([1, 1]);
      expect(result.polylines.flat().every((vertex) => Math.abs(vertex.point.latitude) < 90)).toBe(true);
      const onRow = planGreatCircle({ ...options, from: result.from, to: result.to, stepDegrees: 10 });
      expect(onRow.samples.filter((sample) => Math.abs(sample.point.latitude) === 90)).toHaveLength(1);
      expect(onRow.sampleCount).toBe(onRow.samples.length);
      expect(onRow.samples.map((sample) => sample.distanceDegrees)).toEqual([0, 10, 20, onRow.lengthDegrees]);
    }
  });

  it("supports pole endpoints, seam aliases and coincident points without inventing a direction", () => {
    const point = planGreatCircle({ ...options, from: { latitude: 12, longitude: 180 },
      to: { latitude: 12, longitude: -180 }, maxSamples: 1 });
    expect(point.lengthDegrees).toBe(0);
    expect(point.samples).toEqual([{ index: 0, distanceDegrees: 0, fraction: 0, point: point.from }]);
    expect(point.to.longitude).toBe(-180);
    const pole = planGreatCircle({ ...options, from: { latitude: 90, longitude: 15 },
      to: { latitude: 90, longitude: -120 }, maxSamples: 1 });
    expect(pole.lengthDegrees).toBe(0);
    expect(pole.polylines).toEqual([]);
    const departure = planGreatCircle({ ...options, from: { latitude: -90, longitude: -170 },
      to: { latitude: -40, longitude: 42 }, stepDegrees: 25 });
    expect(departure.samples[0]!.point).toEqual(departure.from);
    for (const sample of departure.samples.slice(1)) expect(sample.point.longitude).toBeCloseTo(42, 12);
    expect(departure.polylines[0]![0]!.source).toEqual({ kind: "sample", index: 1 });
  });

  it("rejects antipodal and numerically ambiguous near-antipodal directions", () => {
    expect(GREAT_CIRCLE_DIRECTION_TOLERANCE).toBe(32 * Number.EPSILON);
    for (const [from, to] of [[{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }],
      [{ latitude: 30, longitude: -20 }, { latitude: -30, longitude: 160 }],
      [{ latitude: 90, longitude: 0 }, { latitude: -90, longitude: 100 }],
      [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 179.9999999999999 }]] as const) {
      expect(() => planGreatCircle({ ...options, from, to })).toThrow(/Antipodal/);
    }
    const near = planGreatCircle({ ...options, to: { latitude: 0, longitude: 179.999999 } });
    expect(near.lengthDegrees).toBeCloseTo(179.999999, 10);
    expect(near.samples.at(-1)!.point).toEqual(near.to);
  });

  it("reserves endpoints and inserted poles before allocating and bounds tiny steps", () => {
    expect(() => planGreatCircle({ ...options, maxSamples: 4 })).toThrow(GreatCircleBudgetError);
    expect(() => planGreatCircle({ ...options, stepDegrees: Number.MIN_VALUE })).toThrow(GreatCircleBudgetError);
    expect(() => planGreatCircle({ ...options, from: { latitude: 80, longitude: 0 },
      to: { latitude: 80, longitude: 180 }, stepDegrees: 30, maxSamples: 2 })).toThrow(GreatCircleBudgetError);
    const small = planGreatCircle({ ...options, to: { latitude: 0, longitude: 1e-12 }, stepDegrees: 180 });
    expect(small.samples).toHaveLength(2);
    expect(small.lengthDegrees).toBeCloseTo(1e-12, 20);
    expect(() => planGreatCircle({ ...options, to: { latitude: 0, longitude: Number.MIN_VALUE } })).toThrow(/precision/);
  });

  it.each([null, [], {}, { ...options, stepDegrees: 0 }, { ...options, stepDegrees: NaN },
    { ...options, stepDegrees: Infinity }, { ...options, stepDegrees: 181 },
    { ...options, maxSamples: 0 }, { ...options, maxSamples: 1.5 }, { ...options, maxSamples: Infinity },
    { ...options, maxSamples: MAX_PATH_SAMPLES + 1 }, { ...options, from: null },
    { ...options, to: [] }, { ...options, from: { latitude: 91, longitude: 0 } },
    { ...options, to: { latitude: 0, longitude: 181 } }, { ...options, to: { latitude: NaN, longitude: 0 } }
  ])("rejects invalid plans: %j", (value) => {
    expect(() => planGreatCircle(value as GreatCircleOptions)).toThrow(RangeError);
  });

  it("captures owned endpoint data and refuses endpoint accessors without invoking them", () => {
    const input = structuredClone(options);
    const result = planGreatCircle(input);
    const snapshot = structuredClone(result);
    (input.from as { latitude: number }).latitude = 20;
    expect(result).toEqual(snapshot);
    const getter = vi.fn(() => 0);
    const from = Object.defineProperty({ longitude: 0 }, "latitude", { get: getter });
    expect(() => planGreatCircle({ ...options, from: from as GeographicPoint })).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
    expect(planGreatCircle(Object.freeze({ ...options, from: Object.freeze(options.from) }))).toEqual(result);
  });
});
