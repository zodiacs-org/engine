import { describe, expect, it } from "vitest";
import { clearanceIntervals } from "../src/clearance-intervals.js";

const scan = (valueAt: (ms: number) => number, from = 0, to = 10_000, step = 1_000) =>
  clearanceIntervals(valueAt, from, to, step, 10_000);
const unresolved = { status: "refused", reason: "unresolved-boundary" };

describe("scalar clearance intervals on analytic functions", () => {
  it("encloses an entry and exit with exact roots", () => {
    expect(scan((ms) => (ms - 2_000) * (ms - 8_000) / 1e7)).toEqual({
      status: "complete", intervals: [{ from: 2_000, to: 8_000, start: "entry", end: "exit" }]
    });
  });

  it("uses outside milliseconds to enclose nonintegral roots", () => {
    expect(scan((ms) => (ms - 2_000.3) * (ms - 8_000.7) / 1e7)).toEqual({
      status: "complete", intervals: [{ from: 2_000, to: 8_001, start: "entry", end: "exit" }]
    });
  });

  it("keeps intervals clipped by either or both window edges", () => {
    expect(scan((ms) => (ms - 4_000) / 10_000)).toEqual({
      status: "complete", intervals: [{ from: 0, to: 4_000, start: "window", end: "exit" }]
    });
    expect(scan((ms) => (4_000 - ms) / 10_000)).toEqual({
      status: "complete", intervals: [{ from: 4_000, to: 10_000, start: "entry", end: "window" }]
    });
    expect(scan(() => -1)).toEqual({
      status: "complete", intervals: [{ from: 0, to: 10_000, start: "window", end: "window" }]
    });
    expect(scan(() => 1)).toEqual({ status: "complete", intervals: [] });
  });

  it("handles a changing radius even with constant center separation", () => {
    const separation = 1;
    expect(scan((ms) => separation - (0.5 + ms / 10_000))).toEqual({
      status: "complete", intervals: [{ from: 5_000, to: 10_000, start: "entry", end: "window" }]
    });
  });

  it("finds an entire entry-exit pair between coarse samples", () => {
    expect(scan((ms) => (ms - 1_200) * (ms - 2_800) / 1e7, 0, 8_000, 4_000)).toEqual({
      status: "complete", intervals: [{ from: 1_200, to: 2_800, start: "entry", end: "exit" }]
    });
  });

  it("refuses observed topology after subsecond root deduplication", () => {
    expect(scan((ms) => (ms - 4_900) * (ms - 5_100) / 1e7)).toEqual(unresolved);
    expect(scan((ms) => -(ms - 4_900) * (ms - 5_100) / 1e7)).toEqual(unresolved);
  });

  it("does not turn angular-rounding zeros into physical crossings", () => {
    expect(scan(() => 1e-18)).toEqual({ status: "complete", intervals: [] });
    expect(scan(() => -1e-18)).toEqual({
      status: "complete", intervals: [{ from: 0, to: 10_000, start: "window", end: "window" }]
    });
    expect(scan((ms) => ms < 5_000 ? 1e-18 : -1e-18)).toEqual(unresolved);
  });

  it("refuses sampled tangencies and zero plateaus", () => {
    expect(scan((ms) => ((ms - 5_000) / 10_000) ** 2)).toEqual(unresolved);
    expect(scan((ms) => -(((ms - 5_000) / 10_000) ** 2))).toEqual(unresolved);
    expect(scan(() => 0)).toEqual(unresolved);
    expect(scan((ms) => ms < 4_000 ? 1 : ms <= 6_000 ? 0 : -1)).toEqual(unresolved);
  });

  it("uses interior signs at exact endpoint roots without singleton intervals", () => {
    expect(scan((ms) => ms / 10_000)).toEqual({ status: "complete", intervals: [] });
    expect(scan((ms) => -ms / 10_000)).toEqual({
      status: "complete", intervals: [{ from: 0, to: 10_000, start: "window", end: "window" }]
    });
    expect(scan((ms) => (ms - 10_000) / 10_000)).toEqual({
      status: "complete", intervals: [{ from: 0, to: 10_000, start: "window", end: "window" }]
    });
  });

  it("refuses an entry or touch exactly at the owned upper endpoint", () => {
    expect(scan((ms) => (10_000 - ms) / 10_000)).toEqual(unresolved);
    expect(scan((ms) => ((10_000 - ms) / 10_000) ** 2)).toEqual(unresolved);
    // Angular normalization rounds these transformed values to zero, so this
    // refusal must come from raw endpoint signs, not reported engine roots.
    expect(scan((ms) => (10_000 - ms) * 1e-22)).toEqual(unresolved);
  });

  it("refuses a sampled raw zero even when transformation suppresses all roots", () => {
    expect(scan((ms) => ((ms - 5_000) / 10_000) ** 2 * 1e-18)).toEqual(unresolved);
  });

  it("encloses fractional roots before Unix time without out-of-window sampling", () => {
    const sampled: number[] = [];
    expect(scan((ms) => { sampled.push(ms); return (Math.abs(ms + 5_000) - 2_000.3) / 10_000; }, -10_000, 0)).toEqual({
      status: "complete", intervals: [{ from: -7_001, to: -2_999, start: "entry", end: "exit" }]
    });
    expect(sampled.every((ms) => Number.isInteger(ms) && ms >= -10_000 && ms <= 0)).toBe(true);
  });

  it("accounts for every callback, including confirmation and topology verification", () => {
    let fullCalls = 0;
    const valueAt = (ms: number) => (ms - 2_000.3) * (ms - 8_000.7) / 1e7;
    expect(scan((ms) => { fullCalls += 1; return valueAt(ms); }).status).toBe("complete");
    let boundedCalls = 0;
    expect(clearanceIntervals((ms) => { boundedCalls += 1; return valueAt(ms); }, 0, 10_000, 1_000, fullCalls - 1)).toEqual({
      status: "refused", reason: "sample-budget"
    });
    expect(boundedCalls).toBe(fullCalls - 1);
    let rejectedCalls = 0;
    expect(clearanceIntervals(() => { rejectedCalls += 1; return 1; }, 0, 10_000, 1_000, 1)).toEqual({
      status: "refused", reason: "sample-budget"
    });
    expect(rejectedCalls).toBe(0);
  });

  it("rejects invalid bounds, nonfinite values and unbounded budgets", () => {
    expect(() => clearanceIntervals(() => 1, 1, 0, 1, 100)).toThrow(RangeError);
    expect(() => clearanceIntervals(() => 1, 0.5, 10, 1, 100)).toThrow(RangeError);
    expect(() => clearanceIntervals(() => 1, 0, 10, 0, 100)).toThrow(RangeError);
    expect(() => clearanceIntervals(() => 1, 0, 10, 1, Infinity)).toThrow(RangeError);
    expect(() => clearanceIntervals(() => NaN, 0, 10, 1, 100)).toThrow(RangeError);
  });
});
