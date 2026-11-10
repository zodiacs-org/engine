import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as timezone from "../../src/geo/timezone.js";
import { resolveLocalToUtc, ZoneHistoryNotLoadedError } from "../../src/geo/timezone.js";
import {
  nextCivilDate, prepareCivilDay, resolveCivilDay, validateCivilDate,
  validateObserver, validateTimeZone
} from "../src/index.js";
import type { CivilDayInput, CivilDayWindow, PanchangObserver } from "../src/index.js";

// Invented sites; the zone identifiers name clocks, not real observer locations.
const syntheticObserver = { latitude: 12.5, longitude: 75.25 };
const inputFor = (date: string, timeZone: string): CivilDayInput => ({ date, timeZone, observer: syntheticObserver });
function windowFor(input: CivilDayInput): CivilDayWindow {
  const result = resolveCivilDay(input);
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
}

describe("Gregorian calendar arithmetic, independent of UTC duration", () => {
  it.each([
    ["0000-02-28", "0000-02-29"], ["0000-02-29", "0000-03-01"],
    ["0099-12-31", "0100-01-01"], ["1900-02-28", "1900-03-01"],
    ["2000-02-28", "2000-02-29"], ["2000-02-29", "2000-03-01"],
    ["2024-04-30", "2024-05-01"], ["2024-12-31", "2025-01-01"]
  ])("advances %s to %s by hand-derived calendar rules", (date, next) => {
    expect(nextCivilDate(date)).toBe(next);
    expect(validateCivilDate(date)).toEqual({
      year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10))
    });
  });

  it.each([null, undefined, 20240101, new Date(), "", "2024-2-01", "2024-02-30", "1900-02-29",
    "2024-04-31", "2024-00-10", "2024-13-01", "2024-01-00", "2024-01-01Z",
    "2024-01-01T00:00:00Z", " 2024-01-01", "+010000-01-01"])("rejects invalid civil date %j", (date) => {
    expect(() => validateCivilDate(date as string)).toThrow(RangeError);
  });

  it("refuses a successor outside the supported date syntax", () => {
    expect(validateCivilDate("9999-12-31")).toEqual({ year: 9999, month: 12, day: 31 });
    expect(() => nextCivilDate("9999-12-31")).toThrow(RangeError);
  });
});

describe("observer and explicit timezone validation", () => {
  it("copies and defaults height using the sky observer units and domain", () => {
    const observer = validateObserver(syntheticObserver);
    expect(observer).toEqual({ ...syntheticObserver, height: 0 });
    expect(observer).not.toBe(syntheticObserver);
    expect(Object.isFrozen(observer)).toBe(true);
    expect(validateObserver({ latitude: -90, longitude: -180, height: -10_000 }).height).toBe(-10_000);
    expect(validateObserver({ latitude: 90, longitude: 180, height: 100_000 }).height).toBe(100_000);
  });

  it.each([null, [], {}, { latitude: 0 }, { longitude: 0 },
    { latitude: NaN, longitude: 0 }, { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: Infinity }, { latitude: 0, longitude: -181 },
    { latitude: "1", longitude: 2 }, { latitude: 0, longitude: 0, height: null },
    { latitude: 0, longitude: 0, height: -10_001 }, { latitude: 0, longitude: 0, height: 100_001 },
    { latitude: 0, longitude: 0, elevation: 2 }])("rejects malformed observer %j", (observer) => {
    expect(() => validateObserver(observer as unknown as PanchangObserver)).toThrow(RangeError);
  });

  it.each(["UTC", "Etc/GMT+5", "Asia/Kolkata", "US/Eastern"])("retains supported zone spelling %s", (zone) => {
    expect(validateTimeZone(zone)).toBe(zone);
  });
  it.each([null, undefined, 5, "", " UTC", "UTC ", "+05:30", "-0530", "Mars/Olympus", "UTC+05:30"])(
    "rejects malformed or unsupported zone %j", (zone) => {
      expect(() => validateTimeZone(zone as string)).toThrow(RangeError);
    }
  );

  it.each([null, [], {}, { ...inputFor("2024-01-01", "UTC"), calendar: "julian" },
    { ...inputFor("2024-01-01", "UTC"), timeZone: null }])("rejects invalid day request %j before preparation", async (input) => {
    expect(() => resolveCivilDay(input as CivilDayInput)).toThrow(RangeError);
    await expect(prepareCivilDay(input as CivilDayInput)).rejects.toThrow(RangeError);
  });
});

describe("independent IANA rules and hand-derived boundary instants (SOURCES.md)", () => {
  it.each([
    ["2024-03-10", "America/New_York", "2024-03-10T05:00:00.000Z", "2024-03-11T04:00:00.000Z"],
    ["2024-11-03", "America/New_York", "2024-11-03T04:00:00.000Z", "2024-11-04T05:00:00.000Z"],
    ["1986-01-01", "Asia/Kathmandu", "1985-12-31T18:30:00.000Z", "1986-01-01T18:15:00.000Z"],
    ["2024-03-10", "America/Havana", "2024-03-10T05:00:00.000Z", "2024-03-11T04:00:00.000Z"],
    ["2024-11-03", "America/Havana", "2024-11-03T04:00:00.000Z", "2024-11-04T05:00:00.000Z"],
    ["2011-12-29", "Pacific/Apia", "2011-12-29T10:00:00.000Z", "2011-12-30T10:00:00.000Z"],
    ["2011-12-31", "Pacific/Apia", "2011-12-30T10:00:00.000Z", "2011-12-31T10:00:00.000Z"]
  ])("resolves %s in %s without adding a fixed UTC day", async (date, zone, start, end) => {
    const input = inputFor(date, zone);
    await prepareCivilDay(input);
    const result = windowFor(input);
    expect(result.start.utc).toBe(start);
    expect(result.end.utc).toBe(end);
    expect(result.date).toBe(date);
    expect(result.calendar).toBe("gregorian");
  });

  it("records a midnight gap and a repeated midnight with their actual policies", () => {
    const gap = windowFor(inputFor("2024-03-10", "America/Havana"));
    expect(gap.start.kind).toBe("gap-transition");
    expect(gap.start.resolution.jump).toEqual({ kind: "gap", cause: "dst" });
    const fold = windowFor(inputFor("2024-11-03", "America/Havana"));
    expect(fold.start.kind).toBe("earlier-midnight");
    expect(fold.start.resolution.localResolution.policy.fold).toBe("earlier");
  });

  it("refuses the skipped date with its engine resolutions and no partial window", () => {
    const result = resolveCivilDay(inputFor("2011-12-30", "Pacific/Apia"));
    expect(result.status).toBe("refused");
    if (result.status !== "refused") throw new Error("Expected refusal");
    expect(result.reason).toBe("skipped-date");
    expect(result.resolutions[0].jump).toEqual({ kind: "gap", cause: "date-line" });
    expect(result).not.toHaveProperty("start");
    expect(result).not.toHaveProperty("end");
  });

  it.each(["1988-10-29", "1988-10-30"])("refuses disjoint civil dates at the St Johns fold on %s", (date) => {
    const result = resolveCivilDay(inputFor(date, "America/St_Johns"));
    expect(result.status).toBe("refused");
    if (result.status !== "refused") throw new Error("Expected refusal");
    expect(result.reason).toBe("date-boundary-fold");
  });

  it("refuses a repeated date across the historical date line", async () => {
    const input = { ...inputFor("1892-07-04", "Pacific/Apia"), observer: { latitude: -13.25, longitude: -171.5 } };
    await prepareCivilDay(input);
    const result = resolveCivilDay(input);
    expect(result.status).toBe("refused");
    if (result.status !== "refused") throw new Error("Expected refusal");
    expect(result.reason).toBe("date-boundary-fold");
    expect(result.resolutions.some((resolution) => resolution.jump?.cause === "date-line")).toBe(true);
  });

  it("uses the committed zic arbiter's historical offset after explicit preparation", async () => {
    const input = inputFor("1880-12-31", "Africa/Banjul");
    // This zone is not prepared by another test in this file.
    expect(() => resolveCivilDay(input)).toThrow(ZoneHistoryNotLoadedError);
    await prepareCivilDay(input);
    const result = windowFor(input);
    const suite = JSON.parse(readFileSync(new URL("../../conformance/vectors/L3-time-calendars.json", import.meta.url), "utf8"));
    const vector = suite.vectors.find((row: { input: { zone?: string } }) => row.input.zone === "Africa/Banjul");
    expect(vector.arbiter).toBe("tzdb-2025c-backzone");
    const offset = vector.expected.utc_offset_s;
    expect(result.start.utc).toBe(new Date(Date.parse("1880-12-31T00:00:00Z") - offset * 1000).toISOString());
    expect(result.end.utc).toBe(new Date(Date.parse("1881-01-01T00:00:00Z") - offset * 1000).toISOString());
    expect(result.start.resolution.zone.source).toBe("tzdb");
    expect(result.start.resolution.zone.tzdbVersion).toBe("2025c");
  });

  it("uses the synthetic observer's own local mean time by independent longitude arithmetic", async () => {
    const input = { ...inputFor("1880-06-01", "America/New_York"), observer: { latitude: 40.25, longitude: -73.25 } };
    await prepareCivilDay(input);
    const result = windowFor(input);
    // -73.25 degrees * 240 seconds per degree = -17,580 seconds = -04:53.
    expect(result.start.utc).toBe("1880-06-01T04:53:00.000Z");
    expect(result.end.utc).toBe("1880-06-02T04:53:00.000Z");
    expect(result.start.resolution.localMeanTime?.longitude).toBe(-73.25);
    expect(result.start.resolution.flags).toContain("lmt");
  });
});

describe("engine timezone integration, not independent evidence", () => {
  it("keeps each complete midnight resolution and does not mutate inputs", () => {
    const input = inputFor("2024-01-15", "Asia/Kolkata");
    const original = structuredClone(input);
    const result = windowFor(input);
    expect(result.start.resolution).toEqual(resolveLocalToUtc(input.date, "00:00", input.timeZone, { longitude: input.observer.longitude }));
    expect(result.end.resolution).toEqual(resolveLocalToUtc(result.nextDate, "00:00", input.timeZone, { longitude: input.observer.longitude }));
    expect(input).toEqual(original);
  });

  it("does not shift years below 100 into the twentieth century", () => {
    const result = windowFor(inputFor("0099-12-31", "UTC"));
    expect(result.start.utc).toBe("0099-12-31T00:00:00.000Z");
    expect(result.end.utc).toBe("0100-01-01T00:00:00.000Z");
  });
});

describe("hand-constructed midnight-straddling gap policy", () => {
  it("starts at the jump rather than the shifted midnight and preserves the raw resolution", () => {
    // At 23:50 UTC, the clock jumps from Jan 1 23:50 to Jan 2 00:20.
    // Reading missing 00:00 by the engine's shift policy gives 00:00 UTC,
    // ten minutes after the civil date actually began. This is an invented clock.
    const start = resolveLocalToUtc("2024-01-02", "00:00", "UTC");
    const end = resolveLocalToUtc("2024-01-03", "00:00", "UTC");
    const transition = { at: "2024-01-01T23:50:00.000Z", offsetBeforeMinutes: 0,
      offsetAfterMinutes: 30, cause: "legal-change" as const };
    const gap = { ...start, offsetMinutes: 30, jump: { kind: "gap" as const, cause: "legal-change" as const }, transition,
      localResolution: { ...start.localResolution, offsetMinutes: 30, gapShiftMinutes: 30, transition } };
    const midnight = { ...end, utc: new Date("2024-01-02T23:30:00.000Z"), offsetMinutes: 30 };
    const mock = vi.spyOn(timezone, "resolveLocalToUtc").mockReturnValueOnce(gap).mockReturnValueOnce(midnight);
    try {
      const result = windowFor(inputFor("2024-01-02", "UTC"));
      expect(result.start.utc).toBe("2024-01-01T23:50:00.000Z");
      expect(result.start.resolution).toBe(gap);
      expect(result.start.resolution.utc.toISOString()).toBe("2024-01-02T00:00:00.000Z");
      expect(result.end.utc).toBe("2024-01-02T23:30:00.000Z");
    } finally {
      mock.mockRestore();
    }
  });
});
