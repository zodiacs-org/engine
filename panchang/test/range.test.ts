import { afterEach, describe, expect, it, vi } from "vitest";
import * as sky from "../../src/sky/riseset.js";
import * as civil from "../src/civil.js";
import * as engine from "../src/engine.js";
import {
  RANGE_CONVENTIONS, civilDatesInRange, panchangDay, panchangRange, preparePanchangRange, resolveSunriseDay
} from "../src/index.js";
import type { PanchangRangeInput, PanchangRangeOptions, PanchangRangeResult } from "../src/index.js";
import { analyticalSource, DAY, EPOCH, UNIT } from "./analytical.js";

const input: PanchangRangeInput = { from: "2024-03-20", to: "2024-03-21", timeZone: "Asia/Kolkata",
  observer: { latitude: 12.5, longitude: 75.25 } };
const options = { monthConvention: "amanta" } as const;
const ok = (result: PanchangRangeResult) => {
  if (result.status !== "ok") throw new Error(`${result.reason}: ${result.failedDate}`);
  return result;
};
afterEach(() => vi.restoreAllMocks());

// Prescribed synthetic rises at civil-start + 6 elapsed hours. These are a
// calendar/assembly instrument, not computed or published sunrise references.
function constructedSource(): void {
  const seed = resolveSunriseDay({ date: input.from, timeZone: input.timeZone, observer: input.observer });
  if (seed.status !== "ok") throw new Error(seed.reason);
  analyticalSource(1, false, true);
  vi.spyOn(sky, "skyEvents").mockImplementation((body, observer, from, to) => {
    const start = new Date(from).getTime();
    return { ...seed.searches[0], body, observer: { ...observer, height: observer.height ?? 0 },
      from: new Date(from), to: new Date(to), samples: 7,
      status: "complete", events: [{ ...seed.start.event, at: new Date(start + 6 * 3_600_000) }] };
  });
}

describe("independent Gregorian date iteration", () => {
  it.each([
    ["2024-02-28", "2024-03-01", ["2024-02-28", "2024-02-29", "2024-03-01"]],
    ["1900-02-28", "1900-03-01", ["1900-02-28", "1900-03-01"]],
    ["2000-02-28", "2000-03-01", ["2000-02-28", "2000-02-29", "2000-03-01"]],
    ["0099-12-31", "0100-01-01", ["0099-12-31", "0100-01-01"]],
    ["2023-12-31", "2024-01-01", ["2023-12-31", "2024-01-01"]],
    ["2024-03-20", "2024-03-20", ["2024-03-20"]],
    ["2011-12-29", "2011-12-31", ["2011-12-29", "2011-12-30", "2011-12-31"]]
  ] as const)("includes both endpoints %s through %s", (from, to, expected) => {
    const result = civilDatesInRange(from, to);
    expect(result).toEqual(expected);
    expect(Object.isFrozen(result)).toBe(true);
  });
  it.each([
    ["2024-01-31", "2024-01-01"], ["2024-02-30", "2024-03-01"],
    ["2024-01-01", "2024-02-01"], ["9999-12-30", "9999-12-30"],
    ["9999-12-31", "9999-12-31"], ["2024-1-1", "2024-01-02"], [null, "2024-01-02"]
  ])("rejects invalid, oversized or successor-less ranges: %j %j", (from, to) => {
    expect(() => civilDatesInRange(from as string, to as string)).toThrow(RangeError);
  });
  it("allows the documented maximum, including the latest preparable date", () => {
    const dates = civilDatesInRange("2024-01-01", "2024-01-31");
    expect(dates).toHaveLength(RANGE_CONVENTIONS.maxDays);
    expect(dates[0]).toBe("2024-01-01");
    expect(dates.at(-1)).toBe("2024-01-31");
    expect(civilDatesInRange("9999-12-29", "9999-12-29")).toEqual(["9999-12-29"]);
  });
});

describe("range wiring, sharing and bounded work with constructed astronomy", () => {
  it("preserves independent linear-sector labels, ordered partitions and original receipts", () => {
    constructedSource();
    const snapshotSpy = vi.mocked(engine.luminarySnapshot);
    const civilSpy = vi.spyOn(civil, "resolveCivilDay");
    const result = ok(panchangRange({ ...input, to: "2024-03-22" }, options));
    expect(result.days.map((day) => day.date)).toEqual(["2024-03-20", "2024-03-21", "2024-03-22"]);
    expect(result.days.map((day) => day.sunrise.vara.weekday)).toEqual(["Wednesday", "Thursday", "Friday"]);
    expect(result.skySamples).toBe(4 * 7);
    expect(result.skyCacheHits).toBe(2);
    expect(sky.skyEvents).toHaveBeenCalledTimes(4);
    expect(civilSpy).toHaveBeenCalledTimes(4);
    expect(result.snapshotSamples).toBe(snapshotSpy.mock.calls.length);
    const sampled = snapshotSpy.mock.calls.map(([at]) => new Date(at as Date).getTime());
    expect(new Set(sampled).size).toBe(sampled.length);
    expect(result.snapshotCacheHits).toBeGreaterThan(0);
    expect(result.samples).toBe(result.snapshotSamples + result.skySamples);
    expect(result.maxSamples).toBe(RANGE_CONVENTIONS.defaultMaxSamples);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.days)).toBe(true);
    for (const [i, day] of result.days.entries()) {
      const t = Date.parse(day.sunrise.start.utc) - EPOCH;
      expect(day.sunriseState.tithi.index).toBe(((Math.floor(t / UNIT) % 30) + 30) % 30);
      expect(day.sunriseState.karana.index).toBe(((Math.floor(2 * t / UNIT) % 60) + 60) % 60);
      expect(day.sunriseState.sun).toBe(day.sunrise.start.snapshot.sun);
      expect(day.sunriseState.sun.tropical.receipt).toBe(day.sunrise.start.snapshot.sun.tropical.receipt);
      if (i > 0) {
        const previous = result.days[i - 1]!;
        expect(previous.sunrise.end.utc).toBe(day.sunrise.start.utc);
        expect(previous.sunrise.end.snapshot).toBe(day.sunrise.start.snapshot);
        expect(previous.sunrise.end.event).toBe(day.sunrise.start.event);
        expect(previous.sunrise.civilDays[1]).toBe(day.sunrise.civilDays[0]);
      }
      expect(day.segments[0]!.start).toBe(day.sunrise.start.utc);
      expect(day.segments.at(-1)!.end).toBe(day.sunrise.end.utc);
    }
  });

  it("assembles the maximum date count without unbounded calendar work", () => {
    constructedSource();
    const result = ok(panchangRange({ ...input, from: "2024-03-01", to: "2024-03-31" }, options));
    expect(result.days).toHaveLength(31);
    expect(result.skySamples).toBe(32 * 7);
    expect(result.skyCacheHits).toBe(30);
    expect(result.samples).toBeLessThanOrEqual(result.maxSamples);
  });

  it.each(["amanta", "purnimanta"] as const)("keeps %s month boundaries in a range", (monthConvention) => {
    constructedSource();
    const result = ok(panchangRange({ ...input, from: "2024-03-30", to: "2024-04-01" }, { monthConvention }));
    for (const day of result.days) {
      expect(day.monthConvention).toBe(monthConvention);
      for (const segment of day.segments) expect(segment.month.convention).toBe(monthConvention);
    }
  });

  it("accepts an exactly sufficient global budget, then refuses with no partial days below it", () => {
    constructedSource();
    const complete = ok(panchangRange(input, options));
    expect(ok(panchangRange(input, { ...options, maxSamples: complete.samples })).samples).toBe(complete.samples);
    const refused = panchangRange(input, { ...options, maxSamples: complete.samples - 1 });
    expect(refused).toMatchObject({ status: "refused", reason: "sample-budget", stage: "snapshot",
      samples: complete.samples - 1, failedDate: input.to });
    expect(refused).not.toHaveProperty("days");
  });

  it("does not retain calculations across calls", () => {
    constructedSource();
    const first = ok(panchangRange(input, options));
    const second = ok(panchangRange(input, options));
    expect(first).toEqual(second);
    expect(first.days[0]!.sunrise.start.event).not.toBe(second.days[0]!.sunrise.start.event);
    expect(first.days[0]!.sunrise.start.snapshot).not.toBe(second.days[0]!.sunrise.start.snapshot);
    expect(sky.skyEvents).toHaveBeenCalledTimes(6);
  });
});

describe("range validation and whole-range refusals", () => {
  it.each([null, [], {}, { ...options, maxSamples: Infinity }, { ...options, maxSamples: 0 },
    { ...options, maxSamples: -1 }, { ...options, maxSamples: NaN }, { ...options, maxSamples: 1.5 },
    { ...options, maxSamples: Number.MAX_SAFE_INTEGER + 1 }, { ...options, maxSamples: null },
    { ...options, ayanamsa: "unknown" }, { ...options, monthMaxSamples: 0 },
    { ...options, extra: true }, { ...options, [Symbol("extra")]: 1 }])("rejects options before astronomical work: %j", (settings) => {
    const work = vi.spyOn(engine, "luminarySnapshot");
    expect(() => panchangRange(input, settings as PanchangRangeOptions)).toThrow(RangeError);
    expect(work).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { ...input, date: input.from }, { ...input, to: "2024-04-20" },
    { ...input, observer: { latitude: 91, longitude: 0 } }, { ...input, timeZone: "+05:30" },
    { ...input, [Symbol("extra")]: 1 }])("validates range inputs before preparation and calculation: %j", async (request) => {
    const work = vi.spyOn(engine, "luminarySnapshot");
    expect(() => panchangRange(request as PanchangRangeInput, options)).toThrow(RangeError);
    await expect(preparePanchangRange(request as PanchangRangeInput)).rejects.toThrow(RangeError);
    expect(work).not.toHaveBeenCalled();
  });
  it("rejects accessor fields without invoking them", () => {
    const getter = vi.fn(() => input.from);
    const request = Object.defineProperty({ ...input }, "from", { get: getter });
    expect(() => panchangRange(request, options)).toThrow(RangeError);
    expect(() => panchangRange(input, Object.defineProperty({ ...options }, "maxSamples", { get: getter }))).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
  });
  it("retains global sky-budget refusal diagnostics and never overspends", () => {
    const result = panchangRange(input, { ...options, maxSamples: 2 });
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", stage: "sunrise",
      failedDate: input.from, snapshotSamples: 1, skySamples: 0,
      search: { status: "refused", reason: "sample-budget" } });
    expect(result).not.toHaveProperty("days");
    expect(result.samples).toBeLessThanOrEqual(2);
  });
  it("retains no partial days if a later padded month span crosses a leap-second boundary", () => {
    constructedSource();
    const result = panchangRange({ ...input, from: "2016-10-27", to: "2016-10-29" }, options);
    expect(result).toMatchObject({ status: "refused", reason: "day-refused", failedDate: "2016-10-28",
      day: { reason: "months-refused", months: { reason: "time-basis-discontinuity" } } });
    expect(result).not.toHaveProperty("days");
    expect(result.skyCacheHits).toBe(1);
  });
  it.each([
    [{ sunriseMaxSamples: 1 }, "sunrise-refused"],
    [{ transitionMaxSamples: 1 }, "transitions-refused"],
    [{ monthMaxSamples: 1 }, "months-refused"]
  ] as const)("retains per-day budget refusals: %j", (limits, reason) => {
    const result = panchangRange(input, { ...options, ...limits });
    expect(result).toMatchObject({ status: "refused", reason: "day-refused", failedDate: input.from,
      day: { status: "refused", reason } });
    expect(result).not.toHaveProperty("days");
    expect(result.samples).toBeLessThanOrEqual(result.maxSamples);
  });
  it("propagates unexpected engine errors", () => {
    const error = new Error("Synthetic calculation failure");
    vi.spyOn(engine, "luminarySnapshot").mockImplementation(() => { throw error; });
    expect(() => panchangRange(input, options)).toThrow(error);
  });
});

describe("clock references reused from M2, with synthetic observers", () => {
  it.each([
    ["2024-03-09", "2024-03-11", [5, 5, 4]],
    ["2024-11-02", "2024-11-04", [4, 4, 5]]
  ] as const)("iterates every date across New York DST from %s", (from, to, utcHours) => {
    constructedSource();
    const result = ok(panchangRange({ ...input, from, to, timeZone: "America/New_York" }, options));
    expect(result.days).toHaveLength(3);
    for (const [i, day] of result.days.entries()) {
      expect(day.sunrise.civilDays[0].start.utc).toBe(`${day.date}T0${utcHours[i]}:00:00.000Z`);
      if (i > 0) expect(Date.parse(day.sunrise.start.utc)).toBeGreaterThan(Date.parse(result.days[i - 1]!.sunrise.start.utc));
    }
    const duration = Date.parse(result.days[1]!.sunrise.civilDays[0].end.utc) - Date.parse(result.days[1]!.sunrise.civilDays[0].start.utc);
    expect(duration).toBe(from.includes("03-") ? DAY - 3_600_000 : DAY + 3_600_000);
  });

  it("loads historical mean-time rules explicitly and retains offsets for every day", async () => {
    const request = { ...input, from: "1880-06-01", to: "1880-06-02", timeZone: "America/New_York",
      observer: { latitude: 40.25, longitude: -73.25 } };
    await preparePanchangRange(request);
    const result = ok(panchangRange(request, options));
    for (const day of result.days) {
      expect(day.sunrise.civilDays[0].start.utc).toBe(`${day.date}T04:53:00.000Z`);
      expect(day.sunrise.civilDays[0].start.resolution.zone.source).toBe("tzdb");
      expect(day.sunriseState.sun.tropical.receipt.engine.ephemeris.version).toBe("2.1.19");
    }
  });

  it("retains Kathmandu's offset change and missing midnight without stepping over its date", () => {
    constructedSource();
    const result = ok(panchangRange({ ...input, from: "1985-12-31", to: "1986-01-02", timeZone: "Asia/Kathmandu" }, options));
    expect(result.days.map((day) => day.sunrise.civilDays[0].start.utc)).toEqual([
      "1985-12-30T18:30:00.000Z", "1985-12-31T18:30:00.000Z", "1986-01-01T18:15:00.000Z"
    ]);
    expect(result.days[1]!.sunrise.civilDays[0].start.kind).toBe("gap-transition");
    expect(Date.parse(result.days[1]!.sunrise.civilDays[0].end.utc) -
      Date.parse(result.days[1]!.sunrise.civilDays[0].start.utc)).toBe(DAY - 15 * 60_000);
  });

  it("propagates the engine's unprepared historical-zone error", () => {
    const request = { ...input, from: "1880-06-01", to: "1880-06-02", timeZone: "Indian/Mauritius" };
    expect(() => panchangRange(request, options)).toThrow(/history.*not.*loaded|prepareLocalTime/iu);
  });

  it.each([
    ["2011-12-29", "2011-12-31", "Pacific/Apia", "2011-12-29", "civil-day-refused"],
    ["2011-12-30", "2011-12-31", "Pacific/Apia", "2011-12-30", "civil-day-refused"],
    ["1892-07-03", "1892-07-05", "Pacific/Apia", "1892-07-03", "civil-day-refused"],
    ["2024-06-21", "2024-06-22", "UTC", "2024-06-21", "missing-sunrise"]
  ])("does not skip missing, repeated or polar sunrise dates from %s", async (from, to, timeZone, failedDate, reason) => {
    const request = { ...input, from, to, timeZone, observer: { latitude: timeZone === "UTC" ? 89 : -13.25, longitude: -171.5 } };
    await preparePanchangRange(request);
    const result = panchangRange(request, options);
    expect(result).toMatchObject({ status: "refused", reason: "day-refused", failedDate,
      day: { reason: "sunrise-refused", sunrise: { reason } } });
    expect(result).not.toHaveProperty("days");
  });
});

describe("real engine integration, without independent physical accuracy claims", () => {
  it.each(["lahiri", "raman"] as const)("matches individual %s days and preserves caller inputs", (ayanamsa) => {
    const settings = { ...options, ayanamsa };
    const original = structuredClone(input);
    const result = ok(panchangRange(input, settings));
    expect(input).toEqual(original);
    expect(settings).toEqual({ ...options, ayanamsa });
    for (const day of result.days) {
      const standalone = panchangDay({ date: day.date, timeZone: input.timeZone, observer: input.observer }, settings);
      expect(day).toEqual(standalone);
      expect(day.ayanamsa).toBe(ayanamsa);
      expect(day.sunriseState.ayanamsa.name).toBe(ayanamsa);
    }
  });
});
