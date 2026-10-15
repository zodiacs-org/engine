import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import * as limbs from "../src/limbs.js";
import { compareSunriseTithis, instantaneousPanchang, resolveSunriseDay,
  searchLimbTransitions, TITHI_ANOMALY_CONVENTIONS } from "../src/index.js";
import type { LimbTransitions, SunriseDayWindow } from "../src/index.js";
import { analyticalSource, iso, UNIT } from "./analytical.js";

let seed: SunriseDayWindow;
beforeAll(() => {
  const window = resolveSunriseDay({ date: "2024-03-20", timeZone: "Asia/Kolkata",
    observer: { latitude: 12.5, longitude: 75.25 } });
  if (window.status !== "ok") throw new Error(window.reason);
  seed = window;
});
afterEach(() => vi.restoreAllMocks());

function source(from: number, to: number): { sunrise: SunriseDayWindow; timeline: LimbTransitions } {
  analyticalSource();
  const snapshot = (offset: number) => {
    const result = instantaneousPanchang(new Date(iso(offset)));
    if (result.status !== "ok") throw new Error("Analytical snapshot");
    return result;
  };
  const sunrise = { ...seed, start: { ...seed.start, utc: iso(from), snapshot: snapshot(from) },
    end: { ...seed.end, utc: iso(to), snapshot: snapshot(to) } };
  const timeline = searchLimbTransitions(iso(from), iso(to));
  if (timeline.status !== "ok") throw new Error(timeline.reason);
  return { sunrise, timeline };
}

describe("independent interval arithmetic at consecutive artificial sunrises (SOURCES.md)", () => {
  // E=12t/U: tithi k owns [kU,(k+1)U). These expected skipped
  // indices and repeat decisions are prescribed independently of the search.
  it.each([
    [1, UNIT - 1, "vriddhi", 0, 0, []],
    [0, UNIT - 1, "vriddhi", 0, 0, []],
    [0, UNIT, "ordinary", 0, 1, []],
    [UNIT - 1, UNIT + 1, "ordinary", 0, 1, []],
    [UNIT - 1, 2 * UNIT, "kshaya", 0, 2, [1]],
    [0, 2 * UNIT, "kshaya", 0, 2, [1]],
    [-1, 2 * UNIT + 1, "kshaya", 29, 2, [0, 1]],
    [29 * UNIT + 1, 31 * UNIT + 1, "kshaya", 29, 1, [0]],
    [15 * UNIT - 1, 16 * UNIT + 1, "kshaya", 14, 16, [15]],
    [-UNIT + 1, -1, "vriddhi", 29, 29, []]
  ] as const)("compares %i..%i as %s", (from, to, kind, startIndex, endIndex, skipped) => {
    const { sunrise, timeline } = source(from, to);
    const result = compareSunriseTithis(sunrise, timeline);
    expect(result).toMatchObject({ from: iso(from), to: iso(to), ayanamsa: "lahiri", kind,
      startTithi: { index: startIndex }, endTithi: { index: endIndex } });
    expect(result.skipped.map(({ index }) => index)).toEqual(skipped);
    for (const row of result.skipped) {
      expect(row.start.at).toBe(iso((row.index === 0 && from > 0 ? 30 : row.index) * UNIT));
      expect(timeline.intervals).toContain(row);
    }
    expect(Boolean(result.repeated)).toBe(kind === "vriddhi");
    if (result.repeated) {
      expect(result.repeated.index).toBe(startIndex);
      expect(result.repeated).toBe(timeline.intervals.find(({ kind }) => kind === "tithi"));
    }
    expect(result.start).toBe(sunrise.start);
    expect(result.end).toBe(sunrise.end);
    expect(result.conventions).toBe(TITHI_ANOMALY_CONVENTIONS);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.skipped)).toBe(true);
  });

  it("performs no additional snapshot searches and keeps original boundary receipts", () => {
    const { sunrise, timeline } = source(-1, UNIT + 1);
    const snapshot = vi.spyOn(engine, "luminarySnapshot");
    const count = vi.mocked(limbs.instantaneousPanchang).mock.calls.length;
    const result = compareSunriseTithis(sunrise, timeline);
    expect(snapshot).not.toHaveBeenCalled();
    expect(vi.mocked(limbs.instantaneousPanchang).mock.calls.length).toBe(count);
    expect(result.skipped[0]!.start.after.sun.tropical.receipt).toBe(
      timeline.intervals.find(({ kind, index }) => kind === "tithi" && index === 0)!.start.after.sun.tropical.receipt);
    expect(result.end.snapshot).toBe(sunrise.end.snapshot);
  });
});

describe("mismatched or incomplete comparison inputs", () => {
  it("rejects a different window or ayanamsa", () => {
    const { sunrise, timeline } = source(-1, UNIT + 1);
    expect(() => compareSunriseTithis(sunrise, { ...timeline, from: iso(0) })).toThrow(RangeError);
    expect(() => compareSunriseTithis(sunrise, { ...timeline, ayanamsa: "raman" })).toThrow(RangeError);
  });

  it("rejects missing tithi coverage, holes and corrupted indices", () => {
    const { sunrise, timeline } = source(-1, UNIT + 1);
    for (const index of [29, 0, 1]) {
      expect(() => compareSunriseTithis(sunrise, { ...timeline,
        intervals: timeline.intervals.filter((row) => !(row.kind === "tithi" && row.index === index)) })).toThrow(RangeError);
    }
    expect(() => compareSunriseTithis(sunrise, { ...timeline, intervals: [] })).toThrow(RangeError);
    expect(() => compareSunriseTithis(sunrise, { ...timeline,
      intervals: timeline.intervals.map((row) => row.kind === "tithi" ? { ...row, index: 8 } : row) })).toThrow(RangeError);
  });

  it("rejects sunrise snapshots that disagree with the interval partition", () => {
    const { sunrise, timeline } = source(-1, UNIT + 1);
    expect(() => compareSunriseTithis({ ...sunrise, end: { ...sunrise.end, snapshot: sunrise.start.snapshot } }, timeline))
      .toThrow(RangeError);
    expect(() => compareSunriseTithis({ ...sunrise, start: { ...sunrise.start, snapshot: sunrise.end.snapshot } }, timeline))
      .toThrow(RangeError);
  });
});
