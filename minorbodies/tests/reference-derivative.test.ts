import { describe, expect, it } from "vitest";
import { sevenPointReferenceRate } from "../src/reference-derivative.ts";
import type { IndependentEclipticRow } from "../src/pilot-validation.ts";

const epoch = 2451545.123456;
const normalized = (value: number) => ((value % 360) + 360) % 360;
function rowsFor(step: number, polynomial: (offset: number) => number): IndependentEclipticRow[] {
  return [-3, -2, -1, 0, 1, 2, 3].map(index => ({
    jdTt: epoch + index * step,
    longitudeDeg: normalized(359.999 + 0.01 * polynomial(index * step)),
    latitudeDeg: 0.1 * polynomial(index * step),
    distanceAu: 20 + 0.001 * polynomial(index * step)
  }));
}

describe("independent seven-point position derivative", () => {
  for (const step of [0.25, 0.5]) {
    it(`differentiates analytic polynomials through degree six at ${step} days through longitude wrap`, () => {
      for (let power = 0; power <= 6; power++) {
        const actual = sevenPointReferenceRate(rowsFor(step, offset => offset ** power));
        const derivative = power === 1 ? 1 : 0;
        expect(Math.abs(actual.longitudeSpeedDegPerDay - 0.01 * derivative)).toBeLessThan(2e-12);
        expect(Math.abs(actual.latitudeSpeedDegPerDay - 0.1 * derivative)).toBeLessThan(1e-13);
        expect(Math.abs(actual.distanceSpeedAuPerDay - 0.001 * derivative)).toBeLessThan(1e-13);
      }
    });
  }

  it("has the analytic sixth-order leading remainder on a seventh-degree polynomial", () => {
    for (const step of [0.25, 0.5]) {
      // f'(0)=0 and f^(7)(0)=7!=5040, so h^6*f^(7)/140 = 36*h^6.
      const actual = sevenPointReferenceRate(rowsFor(step, offset => offset ** 7));
      const remainder = 36 * step ** 6;
      expect(Math.abs(actual.longitudeSpeedDegPerDay - 0.01 * remainder)).toBeLessThan(2e-12);
      expect(Math.abs(actual.latitudeSpeedDegPerDay - 0.1 * remainder)).toBeLessThan(1e-13);
      expect(Math.abs(actual.distanceSpeedAuPerDay - 0.001 * remainder)).toBeLessThan(1e-13);
    }
  });

  it("makes the expected noise amplification explicit without using a fitted ephemeris", () => {
    const noise = 1e-10;
    for (const step of [0.25, 0.5]) {
      const signs = [-1, 1, -1, 0, 1, -1, 1];
      const rows = rowsFor(step, () => 0).map((row, index) => ({ ...row, distanceAu: row.distanceAu + signs[index]! * noise }));
      const actual = sevenPointReferenceRate(rows).distanceSpeedAuPerDay;
      const predicted = 110 * noise / (60 * step);
      // Bound the few ulps incurred when adding the analytic perturbation to 20 AU.
      expect(Math.abs(actual - predicted)).toBeLessThan(4e-14);
    }
  });

  it("rejects missing, reversed, nonuniform and nonfinite samples", () => {
    const rows = rowsFor(0.25, offset => offset);
    expect(() => sevenPointReferenceRate(rows.slice(1))).toThrow("seven reference positions");
    expect(() => sevenPointReferenceRate([...rows].reverse())).toThrow("epochs must increase");
    const shifted = rows.map((row, index) => index === 1 ? { ...row, jdTt: row.jdTt + 1e-6 } : row);
    expect(() => sevenPointReferenceRate(shifted)).toThrow("nonuniform actual epochs");
    const invalid = rows.map((row, index) => index === 4 ? { ...row, distanceAu: NaN } : row);
    expect(() => sevenPointReferenceRate(invalid)).toThrow("invalid values");
  });
});
