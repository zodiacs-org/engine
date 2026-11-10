import { describe, expect, it } from "vitest";
import { m11RationalToNumber, measureM11Timing } from "../evidence/m11-timing.js";

describe("M11 independent rational timing boundary evidence", () => {
  const report = measureM11Timing();
  for (const row of report.numeric) it(row.id, () => {
    expect(Number.isFinite(row.expected)).toBe(true);
    expect(Number.isFinite(row.actual)).toBe(true);
    expect(Math.abs(row.residual)).toBeLessThanOrEqual(row.allowance);
    if (row.expected === 0) expect(Object.is(row.actual, 0)).toBe(true);
    else expect(row.actual).toBeGreaterThan(0);
    expect(row.passed).toBe(true);
  });
  for (const row of report.refusals) it(row.id, () => {
    expect(row.actualCode).toBe(row.expectedCode);
    expect(row.passed).toBe(true);
  });

  it("retains auditable requests and rational references in JSON", () => {
    const decoded = JSON.parse(JSON.stringify(report)) as typeof report;
    expect(decoded).toEqual(report);
    expect(new Set([...report.numeric, ...report.refusals].map(row => row.id)).size)
      .toBe(report.numeric.length + report.refusals.length);
    for (const row of report.numeric) {
      expect(BigInt(row.expectedRational.denominator)).toBeGreaterThan(0n);
      expect(row.request).toBeTypeOf("object");
    }
    const invalid = report.refusals.find(row => row.id === "ptolemy-arc-positive-infinity-julian-365.25-days");
    expect(invalid?.request).toMatchObject({ arcDegrees: "+Infinity" });
  });

  it("rounds the integer oracle's normal and subnormal halfway cases to even", () => {
    expect(m11RationalToNumber((1n << 53n) + 1n, 1n << 53n)).toBe(1);
    expect(m11RationalToNumber((1n << 53n) + 3n, 1n << 53n)).toBe(1 + 2 ** -51);
    expect(m11RationalToNumber(1n, 1n << 1075n)).toBe(0);
    expect(m11RationalToNumber(3n, 1n << 1075n)).toBe(2 * Number.MIN_VALUE);
    expect(m11RationalToNumber(5n, 1n << 1075n)).toBe(2 * Number.MIN_VALUE);
    expect(m11RationalToNumber(7n, 1n << 1075n)).toBe(4 * Number.MIN_VALUE);
    expect(m11RationalToNumber(1n, 1n << 1022n)).toBe(2 ** -1022);
    expect(m11RationalToNumber(1461n, 4n)).toBe(365.25);
  });
});
