import { describe, expect, it } from "vitest";
import { LEAP_SECONDS_EXPIRE_MS, UT1_OBSERVED_TO_MS, UT1_TO_MS } from "../../src/time-scale-data.js";
import { elapsedDays, LEAP_SECOND_LIST, timeBasis } from "../../src/time-scale.js";
import { timeSeamsIn } from "../src/time-seams.js";
import type { TimeSeam } from "../src/time-seams.js";

// Clock integration tests, not an independent estimate of timing accuracy.
const representatives: readonly TimeSeam[] = [
  { at: "1940-12-31T18:00:00.000Z", kind: "delta-t-model" },
  { at: "1972-01-01T00:00:00.000Z", kind: "iers-start" },
  { at: "2017-01-01T00:00:00.000Z", kind: "leap-second" },
  { at: "2027-10-02T00:00:00.001Z", kind: "iers-end" }
];

describe("engine UTC time-basis seams", () => {
  it.each(representatives)("finds $kind at its first changed millisecond", (seam) => {
    const ms = Date.parse(seam.at);
    expect(timeSeamsIn(ms - 2, ms + 2)).toEqual([seam]);
    expect(Number.isNaN(elapsedDays(timeBasis(ms - 2), timeBasis(ms - 1), Number.NaN))).toBe(true);
    expect(Number.isNaN(elapsedDays(timeBasis(ms - 1), timeBasis(ms), Number.NaN))).toBe(false);
    expect(Number.isNaN(elapsedDays(timeBasis(ms), timeBasis(ms + 1), Number.NaN))).toBe(true);
  });

  it.each(representatives)("owns $kind only when from < seam <= to", (seam) => {
    const ms = Date.parse(seam.at);
    expect(timeSeamsIn(ms - 1, ms)).toEqual([seam]);
    expect(timeSeamsIn(ms, ms + 1)).toEqual([]);
    expect(timeSeamsIn(ms - 2, ms - 1)).toEqual([]);
    expect(timeSeamsIn(ms, ms)).toEqual([]);
  });

  it("finds the entire intervening IERS era in a long window", () => {
    const from = Date.parse("1960-01-01T00:00:00Z");
    const to = Date.parse("2030-01-01T00:00:00Z");
    const seams = timeSeamsIn(from, to);
    expect(seams[0]).toEqual(representatives[1]);
    expect(seams.at(-1)).toEqual(representatives[3]);
    expect(seams.filter((seam) => seam.kind === "leap-second")).toHaveLength(LEAP_SECOND_LIST.changes.length - 1);
    expect(seams.some((seam) => seam.kind === "delta-t-model")).toBe(false);
  });

  it("enumerates all engine-declared leap changes once and in chronological order", () => {
    const seams = timeSeamsIn(Date.parse("1800-01-01T00:00:00Z"), Date.parse("2200-01-01T00:00:00Z"));
    expect(seams).toHaveLength(LEAP_SECOND_LIST.changes.length + 2);
    expect(new Set(seams.map((seam) => seam.at)).size).toBe(seams.length);
    expect(seams.map((seam) => seam.at)).toEqual(seams.map((seam) => seam.at).sort());
    const leaps = seams.filter((seam) => seam.kind === "leap-second");
    for (const leap of leaps) {
      const ms = Date.parse(leap.at);
      const before = timeBasis(ms - 1).timeScale.leapSeconds!.taiMinusUtc;
      const after = timeBasis(ms).timeScale.leapSeconds!.taiMinusUtc;
      expect(after - before).toBe(1);
    }
  });

  it("keeps the exact IERS table endpoint in the preceding piece", () => {
    expect(timeBasis(UT1_TO_MS).timeScale.basis).toBe("iers");
    expect(timeBasis(UT1_TO_MS + 1).timeScale.basis).toBe("delta-t");
    expect(timeSeamsIn(UT1_TO_MS - 1, UT1_TO_MS)).toEqual([]);
    expect(timeSeamsIn(UT1_TO_MS, UT1_TO_MS + 1)).toEqual([representatives[3]]);
  });

  it.each([LEAP_SECONDS_EXPIRE_MS, UT1_OBSERVED_TO_MS, Date.parse("2000-01-01T12:00:00Z")])(
    "does not treat a source-status change or an ordinary instant as a seam (%s)", (ms) => {
      expect(timeSeamsIn(ms - 1, ms + 1)).toEqual([]);
    }
  );

  it("returns immutable records without changing engine data", () => {
    const ms = Date.parse(representatives[2]!.at);
    const result = timeSeamsIn(ms - 1, ms);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(timeSeamsIn(ms - 1, ms)).toEqual(result);
  });

  it.each([
    [Number.NaN, 0], [0, Number.POSITIVE_INFINITY], [0.5, 1], [1, 0],
    [0, 8_640_000_000_000_001], [-8_640_000_000_000_001, 0]
  ])("rejects an invalid millisecond window (%s, %s)", (from, to) => {
    expect(() => timeSeamsIn(from!, to!)).toThrow(RangeError);
  });
});
