import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as sunriseModule from "../src/sunrise.js";
import * as transitionsModule from "../src/transitions.js";
import * as monthsModule from "../src/months.js";
import {
  DAY_CONVENTIONS, LIMB_KINDS, instantaneousPanchang, luminarySnapshot, panchangDay, prepareSunriseDay, resolveSunriseDay
} from "../src/index.js";
import type {
  CivilDayInput, PanchangDay, PanchangDayOptions, PanchangDayResult, SunriseDayWindow
} from "../src/index.js";
import { analyticalSource, EPOCH, iso, root, UNIT } from "./analytical.js";

const input: CivilDayInput = { date: "2024-03-20", timeZone: "Asia/Kolkata",
  observer: { latitude: 12.5, longitude: 75.25 } };
function ok(result: PanchangDayResult): PanchangDay {
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
}
function noDay(result: PanchangDayResult, reason: string): void {
  expect(result).toMatchObject({ status: "refused", reason });
  for (const key of ["segments", "sunriseState", "tithiComparison"]) expect(result).not.toHaveProperty(key);
}
afterEach(() => vi.restoreAllMocks());

describe("independently constructed day partitions (SOURCES.md)", () => {
  let seed: SunriseDayWindow;
  beforeAll(() => {
    const result = resolveSunriseDay(input);
    if (result.status !== "ok") throw new Error(result.reason);
    seed = result;
  });
  function source(from: number, to: number): void {
    analyticalSource(1, false, true);
    // Artificial sunrise times isolate partition arithmetic. The real seed
    // supplies diagnostic shapes only; its receipts certify no mock geometry.
    vi.spyOn(sunriseModule, "resolveSunriseDay").mockReturnValue({ ...seed,
      start: { ...seed.start, utc: iso(from), snapshot: luminarySnapshot(new Date(iso(from))) as typeof seed.start.snapshot },
      end: { ...seed.end, utc: iso(to), snapshot: luminarySnapshot(new Date(iso(to))) as typeof seed.end.snapshot } });
  }

  it.each([[0, UNIT], [1, UNIT - 1], [-UNIT, UNIT], [-1, 1], [12345, 12346], [0, UNIT / 2]])(
    "partitions [%i,%i) at the union of rational limb boundaries", (from, to) => {
      source(from, to);
      const result = ok(panchangDay(input, { monthConvention: "amanta" }));
      const expected = new Set([from, to]);
      for (const kind of LIMB_KINDS) {
        for (let k = -10; k <= 10; k++) {
          const ms = root(kind, k);
          if (ms > from && ms < to) expected.add(ms);
        }
      }
      const boundaries = [...expected].sort((a, b) => a - b);
      expect(result.segments.map(({ start, end }) => [start, end])).toEqual(
        boundaries.slice(0, -1).map((start, i) => [iso(start), iso(boundaries[i + 1]!)])
      );
      for (const segment of result.segments) {
        // Independent inverse of the rational sector periods at a whole ms.
        const t = Date.parse(segment.start) - EPOCH;
        const mod = (n: number, count: number) => ((n % count) + count) % count;
        expect(segment.tithi.index).toBe(mod(Math.floor(t / UNIT), 30));
        expect(segment.karana.index).toBe(mod(Math.floor(2 * t / UNIT), 60));
        expect(segment.yoga.index).toBe(mod(Math.floor(21 * t / (20 * UNIT)), 27));
        const pada = mod(Math.floor(39 * t / (10 * UNIT)), 108);
        expect(segment.nakshatra.index).toBe(Math.floor(pada / 4));
        expect(segment.nakshatra.pada).toBe(pada % 4 + 1);
        expect(segment.vara).toBe(result.sunrise.vara);
        expect(segment.nakshatra).not.toHaveProperty("elapsed");
        for (const kind of LIMB_KINDS) {
          const interval = segment.intervals[kind];
          expect(result.timeline.intervals).toContain(interval);
          expect(Date.parse(interval.start.at)).toBeLessThanOrEqual(Date.parse(segment.start));
          expect(Date.parse(interval.end.at)).toBeGreaterThanOrEqual(Date.parse(segment.end));
        }
      }
    }
  );

  it("groups simultaneous changes, includes sunrise changes and excludes the end", () => {
    source(-1, UNIT);
    const result = ok(panchangDay(input, { monthConvention: "amanta" }));
    expect(result.timeline.transitions.filter((event) => event.at === iso(0)).map((event) => event.kind)).toEqual(LIMB_KINDS);
    expect(result.segments.filter((segment) => segment.start === iso(0))).toHaveLength(1);
    expect(result.segments.find((segment) => segment.start === iso(0))).toMatchObject({
      tithi: { index: 0, name: "Pratipada", paksha: "shukla", pakshaNumber: 1 },
      karana: { index: 0, name: "Kimstughna", kind: "fixed" },
      nakshatra: { index: 0, name: "Ashwini", pada: 1 }, yoga: { index: 0, name: "Vishkambha" }
    });
    expect(result.timeline.transitions.some((event) => event.at === iso(UNIT))).toBe(false);
    expect(result.segments.at(-1)!.end).toBe(iso(UNIT));
    expect(result.segments.at(-1)!.tithi.index).toBe(0);
    expect(result.sunriseState.tithi).toMatchObject({ index: 29, paksha: "krishna", name: "Amavasya" });
    expect(result.tithiComparison).toMatchObject({ kind: "kshaya", startTithi: { index: 29 }, endTithi: { index: 1 } });
    expect(result.tithiComparison.skipped.map(({ index }) => index)).toEqual([0]);
  });

  it("clips display segments while preserving full boundary objects and receipts", () => {
    source(1, 12345);
    const result = ok(panchangDay(input, { monthConvention: "amanta" }));
    expect(result.segments).toHaveLength(1);
    const segment = result.segments[0]!;
    for (const kind of LIMB_KINDS) {
      const interval = segment.intervals[kind];
      expect(interval.start.at).toBe(iso(0));
      expect(interval.end.at).toBe(iso(root(kind, 1)));
      expect(interval.start.after.sun.sidereal.receipt).toBe(
        result.timeline.intervals.find((row) => row === interval)!.start.after.sun.sidereal.receipt);
    }
    expect(result.sunriseState).toBe(result.timeline.startState);
    expect(result.tithiComparison.kind).toBe("vriddhi");
    expect(result.tithiComparison.repeated).toBe(segment.intervals.tithi);
    expect(Object.isFrozen(result.segments)).toBe(true);
    expect(Object.isFrozen(segment)).toBe(true);
    expect(Object.isFrozen(segment.intervals)).toBe(true);
    expect(Object.isFrozen(segment.nakshatra)).toBe(true);
  });

  it.each(["amanta", "purnimanta"] as const)("attaches %s months to both sides of the matching phase change", (monthConvention) => {
    const boundary = monthConvention === "amanta" ? 0 : 15 * UNIT;
    source(boundary - 1, boundary + 1);
    const result = ok(panchangDay(input, { monthConvention }));
    expect(result.monthConvention).toBe(monthConvention);
    expect(result.months.monthConvention).toBe(monthConvention);
    expect(result.sunriseMonth).toBe(result.months.startMonth);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]!.month).toBe(result.sunriseMonth);
    expect(result.segments[1]!.month).toBe(result.months.intervals[1]);
    expect(result.segments[1]!.start).toBe(iso(boundary));
    expect(result.segments[0]!.month.end.at).toBe(iso(boundary));
    expect(result.segments[1]!.month.start.at).toBe(iso(boundary));
    expect(result.segments[1]!.month.index).toBe((result.sunriseMonth.index + 1) % 12);
    expect(result.segments[1]!.tithi.index).toBe(monthConvention === "amanta" ? 0 : 15);
  });
});

describe("whole-day refusal and validation", () => {
  it.each([
    [{ ...input, observer: { latitude: 89, longitude: 10.25 }, date: "2024-06-21" }, "missing-sunrise"],
    [{ ...input, timeZone: "Pacific/Apia", date: "2011-12-30" }, "civil-day-refused"],
    [{ ...input, date: "1750-01-01" }, "engine-refused"]
  ] as const)("retains sunrise refusal diagnostics: %j", async (request, reason) => {
    await prepareSunriseDay(request);
    const search = vi.spyOn(transitionsModule, "searchLimbTransitions");
    const result = panchangDay(request, { monthConvention: "amanta" });
    noDay(result, "sunrise-refused");
    expect(result.sunrise).toMatchObject({ status: "refused", reason });
    expect(result).not.toHaveProperty("timeline");
    expect(search).not.toHaveBeenCalled();
  });

  it("keeps sunrise and transition budgets separate and preserves budget diagnostics", () => {
    const sunriseLimited = panchangDay(input, { monthConvention: "amanta", sunriseMaxSamples: 1 });
    noDay(sunriseLimited, "sunrise-refused");
    expect(sunriseLimited.sunrise).toMatchObject({ reason: "sample-budget", maxSamples: 1, samples: 0 });
    const transitionsLimited = panchangDay(input, { monthConvention: "amanta", transitionMaxSamples: 1 });
    noDay(transitionsLimited, "transitions-refused");
    expect(transitionsLimited.sunrise.status).toBe("ok");
    expect(transitionsLimited).toMatchObject({ timeline: { status: "refused", reason: "sample-budget", samples: 1, maxSamples: 1 } });
  });

  it("retains a refused month search without returning partial day labels", () => {
    const result = panchangDay(input, { monthConvention: "amanta", monthMaxSamples: 1 });
    noDay(result, "months-refused");
    expect(result).toMatchObject({ months: { reason: "sample-budget", samples: 1, maxSamples: 1 }, timeline: { status: "ok" } });
    expect(result).not.toHaveProperty("sunriseMonth");
  });

  it("does not run months after an earlier resolver refuses", () => {
    const months = vi.spyOn(monthsModule, "searchLunarMonths");
    noDay(panchangDay(input, { monthConvention: "amanta", transitionMaxSamples: 1 }), "transitions-refused");
    expect(months).not.toHaveBeenCalled();
  });

  it.each([["2017-01-01", "time-basis-discontinuity"], ["1800-01-02", "engine-refused"]])(
    "returns no assembled day when the padded transition search refuses near %s", async (date, reason) => {
      const request = { ...input, date };
      await prepareSunriseDay(request);
      const result = panchangDay(request, { monthConvention: "amanta" });
      noDay(result, "transitions-refused");
      expect(result).toMatchObject({ timeline: { reason } });
    }
  );

  it.each([null, [], {}, { maxSamples: 1 },
    { monthConvention: "amanta", ayanamsa: null }, { monthConvention: "amanta", ayanamsa: "unknown" },
    { monthConvention: "amanta", sunriseMaxSamples: 0 }, { monthConvention: "amanta", transitionMaxSamples: 1.5 },
    { monthConvention: "amanta", transitionMaxSamples: null }, { monthConvention: "amanta", transitionMaxSamples: NaN },
    { monthConvention: "amanta", sunriseMaxSamples: -Infinity }, { monthConvention: "unknown" },
    { monthConvention: "amanta", monthMaxSamples: 0 }, { monthConvention: "amanta", monthMaxSamples: null },
    { [Symbol("unknown")]: 1 }])("rejects invalid day options before searching: %j", (options) => {
    const search = vi.spyOn(sunriseModule, "resolveSunriseDay");
    expect(() => panchangDay(input, options as PanchangDayOptions)).toThrow(RangeError);
    expect(search).not.toHaveBeenCalled();
  });

  it("rejects accessor options without executing them", () => {
    const getter = vi.fn(() => 10000);
    const options = Object.defineProperty({ monthConvention: "amanta" }, "transitionMaxSamples", { get: getter });
    expect(() => panchangDay(input, options as PanchangDayOptions)).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
  });
  it("validates the civil input through the existing resolver", () => {
    expect(() => panchangDay({ ...input, date: "2024-02-30" }, { monthConvention: "amanta" })).toThrow(RangeError);
    expect(() => panchangDay({ ...input, timeZone: "+05:30" }, { monthConvention: "amanta" })).toThrow(RangeError);
  });
  it("propagates unexpected engine failures", () => {
    const failure = new Error("Synthetic failure");
    vi.spyOn(transitionsModule, "searchLimbTransitions").mockImplementation(() => { throw failure; });
    expect(() => panchangDay(input, { monthConvention: "amanta" })).toThrow(failure);
  });
});

describe("real-engine day wiring, without an independent physical accuracy claim", () => {
  it.each(["lahiri", "raman"] as const)("assembles %s labels with original receipts and conventions", (ayanamsa) => {
    const original = structuredClone(input);
    const result = ok(panchangDay(input, { monthConvention: "amanta", ayanamsa, sunriseMaxSamples: Infinity, transitionMaxSamples: Infinity }));
    expect(input).toEqual(original);
    expect(result.ayanamsa).toBe(ayanamsa);
    expect(result.conventions).toBe(DAY_CONVENTIONS);
    expect(result.sunrise.maxSamples).toBe(Infinity);
    expect(result.timeline.maxSamples).toBe(Infinity);
    expect(result.months.ayanamsa).toBe(ayanamsa);
    expect(result.sunriseMonth).toBe(result.months.startMonth);
    expect(result.sunriseState).toEqual(instantaneousPanchang(result.sunrise.start.utc, { ayanamsa }));
    expect(result.sunriseState.sun).toEqual(result.sunrise.start.snapshot.sun);
    expect(result.sunriseState.moon).toEqual(result.sunrise.start.snapshot.moon);
    expect(result.sunriseState.ayanamsa.name).toBe(ayanamsa);
    const endState = instantaneousPanchang(result.sunrise.end.utc, { ayanamsa });
    if (endState.status !== "ok") throw new Error("Expected coverage");
    expect(result.tithiComparison.startTithi).toEqual(result.sunriseState.tithi);
    expect(result.tithiComparison.endTithi).toEqual(endState.tithi);
    expect(result.tithiComparison.start).toBe(result.sunrise.start);
    expect(result.tithiComparison.end).toBe(result.sunrise.end);
    expect(result.tithiComparison.ayanamsa).toBe(ayanamsa);
    expect(result.segments[0]!.start).toBe(result.sunrise.start.utc);
    expect(result.segments.at(-1)!.end).toBe(result.sunrise.end.utc);
    for (const [i, segment] of result.segments.entries()) {
      if (i > 0) expect(segment.start).toBe(result.segments[i - 1]!.end);
      expect(result.months.intervals).toContain(segment.month);
      expect(Date.parse(segment.month.start.at)).toBeLessThanOrEqual(Date.parse(segment.start));
      expect(Date.parse(segment.month.end.at)).toBeGreaterThanOrEqual(Date.parse(segment.end));
      const state = instantaneousPanchang(segment.start, { ayanamsa });
      if (state.status !== "ok") throw new Error("Expected coverage");
      expect(segment.tithi).toEqual(state.tithi);
      expect(segment.yoga).toEqual(state.yoga);
      expect(segment.karana).toEqual(state.karana);
      expect(segment.nakshatra).toEqual({ index: state.nakshatra.index, name: state.nakshatra.name, pada: state.nakshatra.pada });
      for (const kind of LIMB_KINDS) {
        const interval = segment.intervals[kind];
        expect(interval.start.after.ayanamsa.name).toBe(ayanamsa);
        expect(interval.end.after.sun.sidereal.receipt.engine.ephemeris.version).toBe("2.1.19");
      }
    }
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("uses Lahiri and the search defaults with an explicit month convention", () => {
    const result = ok(panchangDay(input, { monthConvention: "amanta" }));
    expect(result.ayanamsa).toBe("lahiri");
    expect(result.sunrise.maxSamples).toBe(20_000);
    expect(result.timeline.maxSamples).toBe(10_000);
    expect(result.months.maxSamples).toBe(5_000);
  });

  it.each(["amanta", "purnimanta"] as const)("assembles the sourced 2026 adhika month in %s at an invented site", (monthConvention) => {
    const result = ok(panchangDay({ ...input, date: "2026-05-20" }, { monthConvention }));
    expect(result.sunriseMonth).toMatchObject({ name: "Jyaishtha", kind: "adhika", omittedMonths: [] });
    for (const segment of result.segments) {
      expect(segment.month).toBe(result.sunriseMonth);
      expect(segment.month.namingLunation.ingresses).toEqual([]);
      expect(segment.month.namingLunation.start.after.ayanamsa.name).toBe("lahiri");
    }
  });
});
