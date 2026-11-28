import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as sky from "../../src/sky/riseset.js";
import type { SkyEvents } from "../../src/sky/riseset.js";
import { ZoneHistoryNotLoadedError } from "../../src/geo/timezone.js";
import {
  SUNRISE_CONVENTIONS, VARA_NAMES, luminarySnapshot, nextCivilDate, prepareSunriseDay,
  resolveSunriseDay, varaOfCivilDate
} from "../src/index.js";
import type { CivilDayInput, SunriseDayResult, SunriseDayWindow, SunriseOptions } from "../src/index.js";

// Invented coordinates. Zones specify clocks without claiming a real site.
const site = { latitude: 12.5, longitude: 75.25 };
const inputFor = (date = "2024-03-20", timeZone = "Asia/Kolkata", observer = site): CivilDayInput =>
  ({ date, timeZone, observer });
function windowOf(result: SunriseDayResult): SunriseDayWindow {
  if (result.status !== "ok") throw new Error(`${result.reason}: ${result.endpoint}`);
  return result;
}
function noWindow(result: SunriseDayResult, reason: string, endpoint: string): void {
  expect(result.status).toBe("refused");
  expect(result).toMatchObject({ reason, endpoint });
  for (const key of ["start", "end", "vara"]) expect(result).not.toHaveProperty(key);
}
afterEach(() => vi.restoreAllMocks());

describe("independent USNO sunrise labels for synthetic observers (SOURCES.md)", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/usno-sunrise-reference.json", import.meta.url), "utf8")) as {
    acceptanceSeconds: number;
    days: { date: string; observer: { latitude: number; longitude: number; height: number }; riseUT: string; weekday: string }[];
  };
  it.each([0, 2])("compares both ends of reference pair %i to the preregistered minute labels", (offset) => {
    expect(fixture.acceptanceSeconds).toBe(60);
    const rows = fixture.days.slice(offset, offset + 2);
    const first = rows[0]!;
    const timeZone = offset === 0 ? "Asia/Kolkata" : "Etc/GMT+4";
    const result = windowOf(resolveSunriseDay(inputFor(first.date, timeZone, first.observer)));
    for (const [index, boundary] of [result.start, result.end].entries()) {
      const reference = rows[index]!;
      expect(Math.abs(Date.parse(boundary.utc) - Date.parse(`${reference.date}T${reference.riseUT}:00Z`)))
        .toBeLessThanOrEqual(fixture.acceptanceSeconds * 1000);
      expect(boundary.civilDate).toBe(reference.date);
      expect(varaOfCivilDate(boundary.civilDate).weekday).toBe(reference.weekday);
    }
    expect(result.vara.weekday).toBe(first.weekday);
  });
});

describe("weekday arithmetic and sunrise ownership", () => {
  it("maps a complete Gregorian week from the independent Thursday epoch anchor", () => {
    // 1970-01-01 is Thursday; consecutive Gregorian dates advance modulo seven.
    const expected = [4, 5, 6, 0, 1, 2, 3];
    for (let i = 0; i < expected.length; i++) {
      const index = expected[i]!;
      expect(varaOfCivilDate(`1970-01-0${i + 1}`)).toMatchObject({ index, name: VARA_NAMES[index] });
    }
    expect(varaOfCivilDate("0099-12-31").index).toBe(4); // Gregorian congruence, not 1999.
    expect(() => varaOfCivilDate("2024-02-30")).toThrow(RangeError);
  });

  it("assigns vara by the local sunrise date even when the UTC date is earlier", () => {
    const result = windowOf(resolveSunriseDay(inputFor("2024-03-20", "Pacific/Kiritimati", { latitude: 0.25, longitude: -157.25 })));
    expect(result.start.utc.slice(0, 10)).toBe("2024-03-19");
    expect(result.start.civilDate).toBe("2024-03-20");
    expect(result.vara).toEqual({ index: 3, name: "Budhavara", weekday: "Wednesday" });
    expect(result.conventions.boundary).toBe("[start,end)");
  });

  it.each(["2024-03-09", "2024-11-02"])("joins adjacent sunrise days across the DST change after %s", (date) => {
    const input = inputFor(date, "America/New_York", { latitude: 40.25, longitude: -73.25 });
    const first = windowOf(resolveSunriseDay(input));
    const second = windowOf(resolveSunriseDay({ ...input, date: nextCivilDate(date) }));
    expect(first.end).toEqual(second.start);
    const civil = first.civilDays[1];
    expect(Date.parse(civil.end.utc) - Date.parse(civil.start.utc)).toBe((date.includes("03-") ? 23 : 25) * 3_600_000);
    expect(first.start.event.at.getTime()).toBeGreaterThanOrEqual(Date.parse(first.civilDays[0].start.utc));
    expect(first.start.event.at.getTime()).toBeLessThan(Date.parse(first.civilDays[0].end.utc));
  });
});

describe("engine rise/set, receipt and historical timezone integration", () => {
  it("keeps original search geometry, full boundary snapshots and selected ayanamsa", () => {
    const input = inputFor();
    const original = structuredClone(input);
    const result = windowOf(resolveSunriseDay(input, { ayanamsa: "raman" }));
    expect(input).toEqual(original);
    expect(result.ayanamsa).toBe("raman");
    expect(result.conventions).toBe(SUNRISE_CONVENTIONS);
    for (const [index, boundary] of [result.start, result.end].entries()) {
      expect(boundary.event).toBe(result.searches[index]!.events.find((event) => event.kind === "rise"));
      expect(boundary.snapshot).toEqual(luminarySnapshot(boundary.utc, { ayanamsa: "raman" }));
      expect(boundary.snapshot.sun.sidereal.receipt.engine.ephemeris.version).toBe("2.1.19");
      expect(boundary.snapshot.ayanamsa.name).toBe("raman");
      expect(result.searches[index]!.conventions).toEqual({ limb: "upper", refraction: "standard", refractionArcmin: 34 });
    }
    expect(result.samples).toBe(result.searches.reduce((sum, search) => sum + search.samples, 0));
    expect(result.samples).toBeLessThanOrEqual(result.maxSamples);
    expect(result.maxSamples).toBe(20_000);
  });

  it("loads all historical boundaries explicitly, including across the year end", async () => {
    const input = inputFor("1880-12-31", "Africa/Accra", { latitude: 5.25, longitude: -0.25 });
    expect(() => resolveSunriseDay(input)).toThrow(ZoneHistoryNotLoadedError);
    await prepareSunriseDay(input);
    const result = windowOf(resolveSunriseDay(input));
    expect(result.civilDays[1].end.resolution.localResolution.date).toBe("1881-01-02");
    expect(result.civilDays.every((civil) => civil.start.resolution.zone.source === "tzdb")).toBe(true);
    expect(result.start.snapshot.ayanamsa.name).toBe("lahiri");
  });

  it("does not require a sunset after the rise in the requested civil date", () => {
    // With the independent clock UTC, this synthetic eastern site rises near
    // midnight; set precedes rise. Only the two sunrise instants bound the day.
    const result = windowOf(resolveSunriseDay(inputFor("2024-06-21", "UTC", { latitude: 0.25, longitude: 90.25 })));
    expect(result.searches[0].events.find((event) => event.kind === "set")!.at.getTime()).toBeLessThan(Date.parse(result.start.utc));
    expect(Date.parse(result.end.utc)).toBeGreaterThan(Date.parse(result.start.utc));
  });
});

describe("whole-window refusals and bounded searches", () => {
  it.each(["2024-06-21", "2024-12-21"])("refuses a missing polar sunrise on %s", (date) => {
    const result = resolveSunriseDay(inputFor(date, "UTC", { latitude: 85.25, longitude: 11.5 }));
    noWindow(result, "missing-sunrise", "start");
    expect(result.searches[0]!.flags).toContain(date.includes("06-") ? "never-sets" : "never-rises");
  });

  it.each([
    ["2011-12-30", "start"], ["2011-12-29", "end"]
  ])("refuses a skipped requested/following local date for %s", (date, endpoint) => {
    const search = vi.spyOn(sky, "skyEvents");
    const result = resolveSunriseDay(inputFor(date, "Pacific/Apia"));
    noWindow(result, "civil-day-refused", endpoint);
    expect(result.civilDays.at(-1)).toMatchObject({ status: "refused", reason: "skipped-date" });
    expect(search).not.toHaveBeenCalled();
  });

  it("retains calc reference-span refusals before starting a sky search", () => {
    const search = vi.spyOn(sky, "skyEvents");
    const result = resolveSunriseDay(inputFor("1750-06-21", "UTC"));
    noWindow(result, "engine-refused", "start");
    if (result.status !== "refused") throw new Error("Expected refusal");
    expect(result.engine?.engine.status).toBe("refused");
    expect(search).not.toHaveBeenCalled();
  });

  it("retains an out-of-coverage following-date refusal without a partial window", () => {
    const result = resolveSunriseDay(inputFor("2199-12-31", "UTC"));
    noWindow(result, "engine-refused", "end");
    if (result.status !== "refused") throw new Error("Expected refusal");
    expect(result.engine?.engine.status).toBe("refused");
  });

  it("returns no partial day when a real search exhausts its budget", () => {
    const result = resolveSunriseDay(inputFor(), { maxSamples: 1 });
    noWindow(result, "sample-budget", "start");
    expect(result.samples).toBeLessThanOrEqual(1);
    expect(result.searches[0]).toMatchObject({ status: "refused", reason: "sample-budget", events: [] });
  });

  it("shares one budget across both real searches", () => {
    const unlimited = windowOf(resolveSunriseDay(inputFor()));
    const budget = unlimited.searches[0].samples + 1;
    const limited = resolveSunriseDay(inputFor(), { maxSamples: budget });
    noWindow(limited, "sample-budget", "end");
    expect(limited.samples).toBeLessThanOrEqual(budget);
    expect(limited.searches[1]).toMatchObject({ status: "refused", events: [] });
  });

  it.each([null, [], { ayanamsa: "unknown" }, { ayanamsa: null }, { maxSamples: 0 },
    { maxSamples: NaN }, { maxSamples: -1 }, { maxSamples: 2.5 }, { maxSamples: null },
    { limb: "centre" }, { refraction: "none" }])("rejects invalid sunrise options %j", (options) => {
    expect(() => resolveSunriseDay(inputFor(), options as SunriseOptions)).toThrow(RangeError);
  });

  it("rejects invalid input during preparation", async () => {
    await expect(prepareSunriseDay({ ...inputFor(), date: "2024-02-30" })).rejects.toThrow(RangeError);
  });
});

describe("constructed sunrise policies, not astronomical reference instants", () => {
  const fakeSearch = (from: string, rises: string[], samples = 10): SkyEvents => ({
    body: "Sun", observer: { ...site, height: 0 }, from: new Date(from), to: new Date(Date.parse(from) + 86_400_000),
    conventions: { limb: "upper", refraction: "standard", refractionArcmin: 34 }, flags: [],
    samples, status: "complete", events: rises.map((at) => ({ kind: "rise", at: new Date(at), altitude: -0.8, azimuth: 90 }))
  });
  it("accepts a rise at a civil boundary and joins it to the next date's sunrise", () => {
    vi.spyOn(sky, "skyEvents")
      .mockReturnValueOnce(fakeSearch("2024-03-20T00:00:00Z", ["2024-03-20T00:00:00Z"]))
      .mockReturnValueOnce(fakeSearch("2024-03-21T00:00:00Z", ["2024-03-21T00:00:00Z"]));
    const result = windowOf(resolveSunriseDay(inputFor("2024-03-20", "UTC")));
    expect(result.start.utc).toBe(result.civilDays[0].start.utc);
    expect(result.end.utc).toBe(result.civilDays[0].end.utc);
  });
  it("refuses multiple rises rather than selecting one", () => {
    vi.spyOn(sky, "skyEvents").mockReturnValueOnce(fakeSearch("2024-03-20T00:00:00Z",
      ["2024-03-20T00:00:00Z", "2024-03-20T23:59:00Z"]));
    noWindow(resolveSunriseDay(inputFor("2024-03-20", "UTC")), "multiple-sunrises", "start");
  });
  it("refuses a missing following-date sunrise with no usable partial day", () => {
    vi.spyOn(sky, "skyEvents")
      .mockReturnValueOnce(fakeSearch("2024-03-20T00:00:00Z", ["2024-03-20T06:00:00Z"]))
      .mockReturnValueOnce(fakeSearch("2024-03-21T00:00:00Z", []));
    noWindow(resolveSunriseDay(inputFor("2024-03-20", "UTC")), "missing-sunrise", "end");
  });
  it("does not start the second search after spending the entire budget", () => {
    const search = vi.spyOn(sky, "skyEvents").mockReturnValueOnce(fakeSearch("2024-03-20T00:00:00Z", ["2024-03-20T06:00:00Z"]));
    const result = resolveSunriseDay(inputFor("2024-03-20", "UTC"), { maxSamples: 10 });
    noWindow(result, "sample-budget", "end");
    expect(result.samples).toBe(10);
    expect(search).toHaveBeenCalledTimes(1);
  });
});
