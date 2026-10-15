import { describe, expect, it } from "vitest";
import { contactIntervals } from "../src/contact-intervals.js";

const scan = (valueAt: (ms: number) => number, from = 0, to = 10_000, step = 1_000) =>
  contactIntervals(valueAt, from, to, step, 10_000);
const unresolved = { status: "refused", reason: "unresolved-contact" };
const entry = (at: number, from = at) => ({ at, before: 1, after: -1, bracket: { from, to: at } });
const exit = (at: number, from = at) => ({ at, before: -1, after: 1, bracket: { from, to: at } });

describe("contact intervals against analytic scalar functions", () => {
  it("reports exact transverse roots with direction and point brackets", () => {
    expect(scan((ms) => (ms - 2_000) * (ms - 8_000) / 1e7)).toEqual({
      status: "complete",
      intervals: [{ from: 2_000, to: 8_000, start: "entry", end: "exit" }],
      contacts: [entry(2_000), exit(8_000)]
    });
  });

  it("uses the first integer millisecond on or after either crossing", () => {
    expect(scan((ms) => (ms - 2_000.3) * (ms - 8_000.7) / 1e7)).toEqual({
      status: "complete",
      intervals: [{ from: 2_001, to: 8_001, start: "entry", end: "exit" }],
      contacts: [entry(2_001, 2_000), exit(8_001, 8_000)]
    });
    expect(scan((ms) => (Math.abs(ms + 5_000) - 2_000.3) / 10_000, -10_000, 0)).toEqual({
      status: "complete",
      intervals: [{ from: -7_000, to: -2_999, start: "entry", end: "exit" }],
      contacts: [entry(-7_000, -7_001), exit(-2_999, -3_000)]
    });
  });

  it("preserves clipped intervals with no invented ingress or egress", () => {
    expect(scan((ms) => (ms - 4_000) / 10_000)).toEqual({
      status: "complete", intervals: [{ from: 0, to: 4_000, start: "window", end: "exit" }], contacts: [exit(4_000)]
    });
    expect(scan((ms) => (4_000 - ms) / 10_000)).toEqual({
      status: "complete", intervals: [{ from: 4_000, to: 10_000, start: "entry", end: "window" }], contacts: [entry(4_000)]
    });
    expect(scan(() => -1)).toEqual({
      status: "complete", intervals: [{ from: 0, to: 10_000, start: "window", end: "window" }], contacts: []
    });
    expect(scan(() => 1)).toEqual({ status: "complete", intervals: [], contacts: [] });
  });

  it("excludes exact lower-edge contacts and uses their following state", () => {
    expect(scan((ms) => ms / 10_000)).toEqual({ status: "complete", intervals: [], contacts: [] });
    expect(scan((ms) => -ms / 10_000)).toEqual({
      status: "complete", intervals: [{ from: 0, to: 10_000, start: "window", end: "window" }], contacts: []
    });
  });

  it("owns both directions of exact upper-edge contact, without a singleton interval", () => {
    expect(scan((ms) => (ms - 10_000) / 10_000)).toEqual({
      status: "complete", intervals: [{ from: 0, to: 10_000, start: "window", end: "exit" }], contacts: [exit(10_000)]
    });
    expect(scan((ms) => (10_000 - ms) / 10_000)).toEqual({ status: "complete", intervals: [], contacts: [entry(10_000)] });
  });

  it("assigns a split-window root once, including when fractional times round to the split", () => {
    for (const root of [5_000, 4_999.7]) {
      const valueAt = (ms: number) => (root - ms) / 10_000;
      const before = scan(valueAt, 0, 5_000);
      const after = scan(valueAt, 5_000, 10_000);
      expect(before.status).toBe("complete");
      expect(after.status).toBe("complete");
      if (before.status !== "complete" || after.status !== "complete") throw new Error("Expected complete split searches.");
      expect([...before.contacts, ...after.contacts]).toEqual([entry(5_000, root === 5_000 ? 5_000 : 4_999)]);
      expect(after.intervals).toEqual([{ from: 5_000, to: 10_000, start: "window", end: "window" }]);
    }
  });

  it("finds a complete pair between coarse samples through the engine's extremum search", () => {
    expect(scan((ms) => (ms - 1_200) * (ms - 2_800) / 1e7, 0, 8_000, 4_000)).toEqual({
      status: "complete", intervals: [{ from: 1_200, to: 2_800, start: "entry", end: "exit" }], contacts: [entry(1_200), exit(2_800)]
    });
  });

  it("keeps millisecond ownership when a root is rounded onto either endpoint", () => {
    for (const epoch of [-1_700_000_000_000, 0, 1_700_000_000_000]) {
      for (const offset of [0.25, 9_999.75]) {
        const result = scan((ms) => (epoch + offset - ms) / 10_000, epoch, epoch + 10_000);
        expect(result.status).toBe("complete");
        if (result.status !== "complete") throw new Error("Expected a complete endpoint search.");
        expect(result.contacts).toEqual([entry(epoch + Math.ceil(offset), epoch + Math.floor(offset))]);
        expect(result.intervals).toEqual(offset < 1
          ? [{ from: epoch + 1, to: epoch + 10_000, start: "entry", end: "window" }]
          : []);
      }
    }
  });

  it("follows multiple separated intervals in either clearance direction", () => {
    const valueAt = (ms: number) => (ms - 1_000) * (ms - 3_000) * (ms - 6_000) * (ms - 9_000) / 1e15;
    expect(scan(valueAt)).toEqual({
      status: "complete",
      intervals: [{ from: 1_000, to: 3_000, start: "entry", end: "exit" }, { from: 6_000, to: 9_000, start: "entry", end: "exit" }],
      contacts: [entry(1_000), exit(3_000), entry(6_000), exit(9_000)]
    });
    expect(scan((ms) => -valueAt(ms))).toEqual({
      status: "complete",
      intervals: [
        { from: 0, to: 1_000, start: "window", end: "exit" },
        { from: 3_000, to: 6_000, start: "entry", end: "exit" },
        { from: 9_000, to: 10_000, start: "entry", end: "window" }
      ],
      contacts: [exit(1_000), entry(3_000), exit(6_000), entry(9_000)]
    });
  });

  it("refuses observed roots lost to the engine's subsecond deduplication", () => {
    expect(scan((ms) => (ms - 4_900) * (ms - 5_100) / 1e7)).toEqual(unresolved);
    expect(scan((ms) => -(ms - 4_900) * (ms - 5_100) / 1e7)).toEqual(unresolved);
  });

  it("refuses sampled tangencies and zero plateaus, including at either edge", () => {
    for (const root of [0, 5_000, 10_000]) {
      expect(scan((ms) => ((ms - root) / 10_000) ** 2)).toEqual(unresolved);
      expect(scan((ms) => -(((ms - root) / 10_000) ** 2))).toEqual(unresolved);
    }
    expect(scan(() => 0)).toEqual(unresolved);
    expect(scan((ms) => ms < 4_000 ? 1 : ms <= 6_000 ? 0 : -1)).toEqual(unresolved);
    expect(scan((ms) => ms < 0 ? 1 : ms <= 2 ? 0 : -1)).toEqual(unresolved);
  });

  it("does not identify angular-rounding zeros as physical contacts", () => {
    expect(scan(() => 1e-18)).toEqual({ status: "complete", intervals: [], contacts: [] });
    expect(scan(() => -1e-18)).toEqual({
      status: "complete", intervals: [{ from: 0, to: 10_000, start: "window", end: "window" }], contacts: []
    });
    expect(scan((ms) => ms < 5_000 ? 1e-18 : -1e-18)).toEqual(unresolved);
    expect(scan((ms) => ((ms - 5_000) / 10_000) ** 2 * 1e-18)).toEqual(unresolved);
    // Exact endpoint roots are classified from raw samples even if the engine
    // cannot distinguish any of the transformed values from angular zero.
    expect(scan((ms) => (10_000 - ms) * 1e-22)).toEqual({ status: "complete", intervals: [], contacts: [entry(10_000)] });
  });

  it("supports a one-millisecond window and reads only its allowed halo", () => {
    const samples: number[] = [];
    expect(scan((ms) => { samples.push(ms); return -ms; }, -1, 0, 1)).toEqual({
      status: "complete", intervals: [], contacts: [entry(0)]
    });
    expect(samples.every((ms) => Number.isInteger(ms) && ms >= -2 && ms <= 1)).toBe(true);
    expect(samples).toContain(1);
  });

  it("charges all callback calls and refuses the whole result when verification exhausts the budget", () => {
    let completeCalls = 0;
    const valueAt = (ms: number) => (ms - 2_000.3) * (ms - 8_000.7) / 1e7;
    expect(scan((ms) => { completeCalls += 1; return valueAt(ms); }).status).toBe("complete");
    let boundedCalls = 0;
    expect(contactIntervals((ms) => { boundedCalls += 1; return valueAt(ms); }, 0, 10_000, 1_000, completeCalls - 1)).toEqual({
      status: "refused", reason: "sample-budget"
    });
    expect(boundedCalls).toBe(completeCalls - 1);
    let preflightCalls = 0;
    expect(contactIntervals(() => { preflightCalls += 1; return 1; }, 0, 10_000, 1_000, 1)).toEqual({
      status: "refused", reason: "sample-budget"
    });
    expect(preflightCalls).toBe(0);
  });

  it("rejects nonfinite clearances and invalid bounds, steps and budgets", () => {
    expect(() => contactIntervals(() => 1, 1, 0, 1, 100)).toThrow(RangeError);
    expect(() => contactIntervals(() => 1, 0, 0, 1, 100)).toThrow(RangeError);
    expect(() => contactIntervals(() => 1, 0.5, 10, 1, 100)).toThrow(RangeError);
    expect(() => contactIntervals(() => 1, -8_640_000_000_000_000, 0, 1, 100)).toThrow(RangeError);
    expect(() => contactIntervals(() => 1, 0, 8_640_000_000_000_000, 1, 100)).toThrow(RangeError);
    for (const step of [0, 0.5, Infinity, NaN]) expect(() => contactIntervals(() => 1, 0, 10, step, 100)).toThrow(RangeError);
    for (const budget of [0, -1, 0.5, Infinity, NaN]) expect(() => contactIntervals(() => 1, 0, 10, 1, budget)).toThrow(RangeError);
    expect(() => scan(() => NaN)).toThrow(RangeError);
    expect(() => scan(() => Infinity)).toThrow(RangeError);
  });
});
