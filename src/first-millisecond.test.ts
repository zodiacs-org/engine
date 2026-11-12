/**
 * firstMillisecond against step functions whose crossing is known exactly:
 * `reached(t)` is `t >= T` for a chosen whole millisecond T. The answer must
 * be T whatever the estimate, near or far, early or late, which is the
 * property the sky entry relies on (the same event found from two windows is
 * the same instant). A predicate that never changes within the search span
 * is refused.
 */
import { describe, expect, it } from "vitest";
import { firstMillisecond } from "./first-millisecond.js";

const at = (crossing: number) => {
  const calls: number[] = [];
  const reached = (ms: number): boolean => {
    expect(Number.isInteger(ms), `probe ${ms} is a whole millisecond`).toBe(true);
    calls.push(ms);
    return ms >= crossing;
  };
  return { reached, calls };
};

describe("firstMillisecond", () => {
  const T = 946_728_000_123; // 2000-01-01T12:00:00.123Z

  it("finds the crossing from an estimate within the first bracket of 4 ms either side", () => {
    for (const offset of [-4, -3.6, -1, -0.4, 0, 0.4, 1, 3, 3.4]) {
      expect(firstMillisecond(at(T).reached, T + offset), String(offset)).toBe(T);
    }
  });

  it("finds it from an estimate that is late, widening the bracket backwards", () => {
    for (const offset of [5, 17, 1_000, 3_600_000, 2 ** 24]) {
      expect(firstMillisecond(at(T).reached, T + offset), String(offset)).toBe(T);
    }
  });

  it("finds it from an estimate that is early, widening the bracket forwards", () => {
    for (const offset of [-5, -17, -1_000, -3_600_000, -(2 ** 24)]) {
      expect(firstMillisecond(at(T).reached, T + offset), String(offset)).toBe(T);
    }
  });

  it("returns a whole millisecond for a fractional estimate, and works on either side of the epoch", () => {
    for (const crossing of [-86_400_000_001, -1, 0, 1, 253_402_300_799_999]) {
      expect(firstMillisecond(at(crossing).reached, crossing + 123.456), String(crossing)).toBe(crossing);
      expect(firstMillisecond(at(crossing).reached, crossing - 987.654), String(crossing)).toBe(crossing);
    }
  });

  it("takes a number of probes that grows with the logarithm of the estimate's error", () => {
    const near = at(T);
    firstMillisecond(near.reached, T + 2);
    const far = at(T);
    firstMillisecond(far.reached, T + 3_600_000);
    expect(near.calls.length).toBeLessThanOrEqual(6);
    expect(far.calls.length).toBeLessThanOrEqual(2 * 22 + 2);
  });

  it("refuses a predicate that is already true far before the estimate", () => {
    expect(() => firstMillisecond(() => true, T)).toThrow(new RangeError("A crossing could not be bracketed."));
  });

  it("refuses a predicate that is still false far after the estimate", () => {
    expect(() => firstMillisecond(() => false, T)).toThrow(new RangeError("A crossing could not be bracketed."));
  });

  it("refuses a crossing beyond the widest bracket, about 2^25 ms from the estimate, on either side", () => {
    const far = 2 ** 26;
    expect(() => firstMillisecond(at(T).reached, T + far)).toThrow(RangeError);
    expect(() => firstMillisecond(at(T).reached, T - far)).toThrow(RangeError);
  });
});
