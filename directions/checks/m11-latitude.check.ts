import { describe, expect, it } from "vitest";
import {
  M11_LATITUDE_ALLOWANCES, M11_LATITUDE_CASES, M11_LATITUDE_GAP_EXPONENTS,
  M11_LATITUDE_REFUSALS, measureM11Latitude,
} from "../evidence/m11-latitude.js";

/** Exact nonnegative binary64 value in units of 2^-1074. */
function dyadicInteger(value: number): bigint {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, Math.abs(value), false);
  const bits = view.getBigUint64(0, false);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const mantissa = bits & ((1n << 52n) - 1n);
  if (exponent === 0) return mantissa;
  return ((1n << 52n) | mantissa) << BigInt(exponent - 1);
}

describe("M11 independent latitude and near-tangency evidence", () => {
  it("compares all semi-arcs and AD with the independent half-angle identity", () => {
    const measured = measureM11Latitude();
    expect(measured.numeric).toHaveLength(M11_LATITUDE_CASES.length * 4);
    for (const row of measured.numeric) {
      expect(row.passed, JSON.stringify(row)).toBe(true);
      expect(row.residual).toBe(row.actual - row.expected);
      expect(row.allowance).toBe(row.quantity === "shortSemiArcDegrees"
        ? row.expected * M11_LATITUDE_ALLOWANCES.shortArcRelative
        : M11_LATITUDE_ALLOWANCES.angleDegrees);
    }
  });

  it("checks each construction gap using exact binary arithmetic", () => {
    for (const fixture of M11_LATITUDE_CASES) {
      const phi = dyadicInteger(fixture.input.latitudeDegrees);
      const delta = dyadicInteger(fixture.input.declinationDegrees);
      const gap = dyadicInteger(fixture.gapDegrees);
      expect(phi + delta + gap, fixture.id).toBe(dyadicInteger(90));
      expect(gap, fixture.id).toBeGreaterThan(0n);
      expect(fixture.expected.shortSemiArcDegrees, fixture.id).toBeGreaterThan(0);
    }
  });

  it("preserves all hemisphere signs and every declared equal-magnitude gap", () => {
    const expected = [-1, 1].flatMap(phi => [-1, 1].flatMap(delta =>
      M11_LATITUDE_GAP_EXPONENTS.map(exponent => `${phi}/${delta}/${2 ** -exponent}`)));
    const actual = M11_LATITUDE_CASES.filter(row => row.family === "equal-magnitudes")
      .map(row => `${Math.sign(row.input.latitudeDegrees)}/${Math.sign(row.input.declinationDegrees)}/${row.gapDegrees}`);
    expect(actual.sort()).toEqual(expected.sort());
    expect(new Set(M11_LATITUDE_CASES.map(row => row.id)).size).toBe(M11_LATITUDE_CASES.length);
  });

  it("covers interior input sums that round onto the tangent boundary", () => {
    for (const row of M11_LATITUDE_CASES.filter(row => row.family === "unequal-magnitudes"
      && row.gapDegrees === 2 ** -48)) {
      expect(Math.abs(row.input.latitudeDegrees) + Math.abs(row.input.declinationDegrees)).toBe(90);
      expect(dyadicInteger(row.input.latitudeDegrees) + dyadicInteger(row.input.declinationDegrees))
        .toBeLessThan(dyadicInteger(90));
    }
  });

  it("checks exact, just-outside and pole refusal codes", () => {
    const measured = measureM11Latitude().refusals;
    expect(measured).toHaveLength(M11_LATITUDE_REFUSALS.length);
    for (const row of measured) expect(row.passed, JSON.stringify(row)).toBe(true);
    for (const row of M11_LATITUDE_REFUSALS) {
      const sum = dyadicInteger(row.input.latitudeDegrees) + dyadicInteger(row.input.declinationDegrees);
      if (row.expectedCode === "horizon-tangency") expect(sum, row.id).toBe(dyadicInteger(90));
      if (row.expectedCode.startsWith("circumpolar")) expect(sum, row.id).toBeGreaterThan(dyadicInteger(90));
    }
    expect(new Set(M11_LATITUDE_REFUSALS.map(row => row.id)).size).toBe(M11_LATITUDE_REFUSALS.length);
  });
});
