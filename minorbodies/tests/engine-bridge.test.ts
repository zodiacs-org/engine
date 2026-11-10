import { describe, expect, it } from "vitest";
import {
  ENGINE_BRIDGE_SETTINGS, icrfToEclipticMatrix, reduceIcrfState, resolveMinorBodyTime
} from "../src/engine-bridge.ts";
import type { IcrfState, MinorBodyTimeInput } from "../src/engine-bridge.ts";
import type { CartesianTriple } from "../src/chebyshev.ts";

const J2000 = 2451545;
const DAY_SECONDS = 86400;

describe("engine time bridge", () => {
  it("preserves explicit TT Julian dates without consulting a civil time model", () => {
    const jd = J2000 + 0.123456789;
    expect(resolveMinorBodyTime({ jd, scale: "tt" })).toEqual({
      jdTt: jd,
      timeReceipt: {
        request: { jd, scale: "tt" }, jdTt: jd, source: "explicit-tt", engineTimeBasis: null
      }
    });
  });

  it("uses the engine's listed leap seconds and keeps time provenance", () => {
    const actual = resolveMinorBodyTime({ date: "2000-01-01T12:00:00Z" });
    // The IERS leap-second list gives TAI-UTC=32 s here; TT-TAI=32.184 s.
    expect(actual.jdTt).toBe(J2000 + 64.184 / DAY_SECONDS);
    expect(actual.timeReceipt.engineTimeBasis?.timeScale).toMatchObject({
      input: "utc", basis: "iers", leapSeconds: { taiMinusUtc: 32, listed: true }
    });
    expect(actual.timeReceipt.engineTimeBasis?.deltaT).toMatchObject({ model: "iers-utc/1" });
    const before = resolveMinorBodyTime({ date: "2016-12-31T23:59:59Z" });
    const after = resolveMinorBodyTime({ date: "2017-01-01T00:00:00Z" });
    expect((after.jdTt - before.jdTt) * DAY_SECONDS).toBeCloseTo(2, 4);
    expect(after.timeReceipt.engineTimeBasis?.timeScale.leapSeconds?.taiMinusUtc).toBe(37);
  });

  it("accepts equivalent offsets, Date and millisecond inputs through the existing parser", () => {
    const date = new Date("2000-01-01T12:00:00Z");
    const expected = resolveMinorBodyTime({ date }).jdTt;
    expect(resolveMinorBodyTime({ date: date.getTime() }).jdTt).toBe(expected);
    const offset = resolveMinorBodyTime({ date: "2000-01-01T17:30:00+05:30" });
    expect(offset.jdTt).toBe(expected);
    expect(offset.timeReceipt.request).toEqual({ date: "2000-01-01T17:30:00+05:30", timeScale: "utc" });
    date.setUTCFullYear(2010);
    expect(offset.jdTt).toBe(expected);
  });

  it("supports UT1 with a pinned Delta T and explicit TT calendar readings", () => {
    const ut1 = resolveMinorBodyTime({ date: "2000-01-01T12:00:00Z", timeScale: "ut1", deltaT: 60 });
    expect(ut1.jdTt).toBe(J2000 + 60 / DAY_SECONDS);
    expect(ut1.timeReceipt.engineTimeBasis?.timeScale).toMatchObject({ input: "ut1", basis: "pinned" });
    const tt = resolveMinorBodyTime({ date: "2000-01-01T12:00:00Z", timeScale: "tt" });
    expect(tt.jdTt).toBe(J2000);
    const ttPinned = resolveMinorBodyTime({ date: "2000-01-01T12:00:00Z", timeScale: "tt", deltaT: 60 });
    expect(ttPinned.jdTt).toBe(J2000);
    expect(ttPinned.timeReceipt.engineTimeBasis?.deltaT.seconds).toBe(60);
  });

  it("preserves the engine's historical and future clock uncertainty", () => {
    for (const date of ["1800-01-01", "2200-01-01"]) {
      const result = resolveMinorBodyTime({ date });
      expect(result.timeReceipt.engineTimeBasis?.timeScale.basis).toBe("delta-t");
      expect(result.timeReceipt.engineTimeBasis?.deltaT.model).toBe("zodiacs-deltat/1");
      expect(result.timeReceipt.engineTimeBasis?.deltaT.sigma).toBeGreaterThan(0);
    }
    expect(resolveMinorBodyTime({ date: "2200-01-01" }).timeReceipt.engineTimeBasis?.timeScale.ut1MinusUtc)
      .toEqual({ seconds: 0, sigma: 0.9, source: "fallback" });
  });

  it.each([
    { jd: NaN, scale: "tt" }, { jd: 0, scale: "tt" }, { jd: 10_000_001, scale: "tt" },
    { jd: J2000, scale: "utc" }, { jd: J2000 }, { jd: J2000, scale: "tt", deltaT: 0 },
    { jd: J2000, scale: "tt", date: "2000-01-01" },
    { date: "2000-02-30" }, { date: "2000-01-01T12:00:00" },
    { date: "2016-12-31T23:59:60Z" }, { date: "2000-01-01", timeScale: "UTC" },
    { date: "2000-01-01", timeScale: null }, { date: "2000-01-01", deltaT: Infinity },
    { date: "2000-01-01", deltaT: 1e10 + 1 }, { date: "2000-01-01", scale: "tt" },
    { date: new Date(NaN) }, { date: 1e20 }, {}, null
  ])("refuses malformed or ambiguous clock input %#", (input) => {
    expect(() => resolveMinorBodyTime(input as MinorBodyTimeInput)).toThrow(RangeError);
  });

  it("does not evaluate input accessors and deeply freezes its receipt snapshot", () => {
    let called = false;
    const input = { get date(): string { called = true; return "2000-01-01"; } };
    expect(() => resolveMinorBodyTime(input)).toThrow(RangeError);
    expect(called).toBe(false);
    const result = resolveMinorBodyTime({ date: "2000-01-01" });
    for (const value of [result, result.timeReceipt, result.timeReceipt.request, result.timeReceipt.engineTimeBasis,
      result.timeReceipt.engineTimeBasis?.deltaT, result.timeReceipt.engineTimeBasis?.timeScale,
      result.timeReceipt.engineTimeBasis?.timeScale.ut1MinusUtc, result.timeReceipt.engineTimeBasis?.timeScale.leapSeconds]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });
});

// Matrix identities and analytic synthetic trajectories are mechanical checks,
// not ephemeris or independent frame accuracy evidence.
describe("engine frame bridge mechanics", () => {
  const position: CartesianTriple = [1.2, -0.4, 0.7];
  const velocity: CartesianTriple = [0.003, 0.004, -0.002];
  const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, v, i) => sum + v * b[i]!, 0);
  const turn = (matrix: readonly number[], vector: CartesianTriple): CartesianTriple => [
    dot(matrix.slice(0, 3), vector), dot(matrix.slice(3, 6), vector), dot(matrix.slice(6, 9), vector)
  ];

  it("preserves norms and orientation throughout the target interval", () => {
    for (const jd of [2378496.5, J2000, 2524958.5]) {
      const matrix = icrfToEclipticMatrix(jd);
      const rows = [matrix.slice(0, 3), matrix.slice(3, 6), matrix.slice(6, 9)];
      for (let a = 0; a < 3; a += 1) for (let b = 0; b < 3; b += 1) {
        expect(dot(rows[a]!, rows[b]!)).toBeCloseTo(a === b ? 1 : 0, 14);
      }
      const determinant = matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7])
        - matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6])
        + matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6]);
      expect(determinant).toBeCloseTo(1, 14);
      expect(Math.hypot(...turn(matrix, position))).toBeCloseTo(Math.hypot(...position), 14);
      expect(Object.isFrozen(matrix)).toBe(true);
    }
  });

  it("differentiates the complete moving-frame position, including rotation", () => {
    const jd = 2460200.25;
    const actual = reduceIcrfState(jd, { positionAu: position, velocityAuPerDay: velocity });
    const h = 0.02;
    const probe = (offset: number): CartesianTriple => {
      const at = jd + offset;
      const elapsed = at - jd;
      const p: CartesianTriple = [position[0] + elapsed * velocity[0], position[1] + elapsed * velocity[1], position[2] + elapsed * velocity[2]];
      return turn(icrfToEclipticMatrix(at), p);
    };
    const before = probe(-h);
    const after = probe(h);
    const elapsed = (jd + h) - (jd - h);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(Math.abs(actual.velocityAuPerDay[axis]! - (after[axis]! - before[axis]!) / elapsed)).toBeLessThan(1e-10);
    }
    const fixed = reduceIcrfState(jd, { positionAu: position, velocityAuPerDay: [0, 0, 0] });
    expect(Math.abs(fixed.longitudeSpeedDegPerDay)).toBeGreaterThan(1e-6);
    expect(Math.abs(fixed.distanceSpeedAuPerDay)).toBeLessThan(1e-12);
    expect(ENGINE_BRIDGE_SETTINGS.frameDerivative).toBe("symmetric-five-point");
    expect(ENGINE_BRIDGE_SETTINGS.frameDerivativeStepDays).toBe(0.01);
  });

  it("computes spherical speeds and retrograde from an analytic Cartesian path", () => {
    const jd = J2000;
    const angularRate = -0.01;
    const p: CartesianTriple = [2, 1, 0.4];
    const v: CartesianTriple = [-p[1] * angularRate, p[0] * angularRate, 0];
    const result = reduceIcrfState(jd, { positionAu: p, velocityAuPerDay: v });
    const sample = (offset: number) => {
      const at = jd + offset;
      const angle = (at - jd) * angularRate;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      return reduceIcrfState(at, {
        positionAu: [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]],
        velocityAuPerDay: [0, 0, 0]
      });
    };
    const h = 0.002;
    const before = sample(-h);
    const after = sample(h);
    const elapsed = (jd + h) - (jd - h);
    expect(Math.abs(result.longitudeSpeedDegPerDay - (after.longitudeDeg - before.longitudeDeg) / elapsed)).toBeLessThan(1e-9);
    expect(Math.abs(result.latitudeSpeedDegPerDay - (after.latitudeDeg - before.latitudeDeg) / elapsed)).toBeLessThan(1e-9);
    expect(result.distanceAu).toBeCloseTo(Math.hypot(...p), 14);
    expect(Math.abs(result.distanceSpeedAuPerDay)).toBeLessThan(1e-12);
    expect(result.longitudeDeg).toBeGreaterThanOrEqual(0);
    expect(result.longitudeDeg).toBeLessThan(360);
    expect(result.retrograde).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.positionAu)).toBe(true);
    expect(Object.isFrozen(result.velocityAuPerDay)).toBe(true);
  });

  it("refuses undefined or nonfinite positions and rates", () => {
    for (const invalid of [
      { positionAu: [0, 0, 0], velocityAuPerDay: velocity },
      { positionAu: [NaN, 0, 0], velocityAuPerDay: velocity },
      { positionAu: position, velocityAuPerDay: [Infinity, 0, 0] },
      { positionAu: [1, 2], velocityAuPerDay: velocity },
      { positionAu: position, velocityAuPerDay: [0, 0, 0], extra: true },
      { positionAu: [1e308, 1e308, 1e308], velocityAuPerDay: velocity },
      { positionAu: [1e-200, 1e-200, 1e-200], velocityAuPerDay: velocity }
    ]) expect(() => reduceIcrfState(J2000, invalid as unknown as IcrfState)).toThrow(RangeError);
    expect(() => icrfToEclipticMatrix(Infinity)).toThrow(RangeError);
    expect(() => reduceIcrfState(NaN, { positionAu: position, velocityAuPerDay: velocity })).toThrow(RangeError);
  });
});
