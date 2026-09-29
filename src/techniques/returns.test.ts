import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { natalChart } from "../api.js";
import { bodyLongitude } from "../ephemeris.js";
import { timeBasis } from "../time-scale.js";
import {
  LUNAR_RETURN_HORIZON_DAYS,
  LUNAR_RETURN_STEP_DAYS,
  SOLAR_RETURN_LOOKBACK_DAYS,
  SOLAR_RETURN_STEP_DAYS,
  SOLAR_RETURN_WINDOW_DAYS,
  lunarReturn,
  lunarReturnInstant,
  mostRecentSolarReturnInstant,
  solarReturn,
  solarReturnInstant
} from "./returns.js";

const DAY = 86_400_000;
const J2000_JD = 2451545.0;
const angle = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
/** Julian date (TT) of a UTC instant, on the engine's own time basis. */
const jdTT = (date: Date) => timeBasis(date.getTime(), "utc").ttDays + J2000_JD;

// Invented births: instants and places drawn for these tests, no one's birth.
const BIRTH = { utc: "1987-11-04T06:21:00Z", latitude: 48.21, longitude: 16.37, houseSystem: "placidus" as const };
const UNPLACED = { utc: "1962-03-15T17:40:00Z" };

describe("return windows", () => {
  it("are the site's constants", () => {
    expect([SOLAR_RETURN_WINDOW_DAYS, SOLAR_RETURN_LOOKBACK_DAYS, SOLAR_RETURN_STEP_DAYS]).toEqual([200, 370, 1]);
    expect([LUNAR_RETURN_HORIZON_DAYS, LUNAR_RETURN_STEP_DAYS]).toEqual([40, 0.25]);
  });
});

// G2 (PREREGISTRATION.md): USNO's equinoxes and solstices, published in UT to
// the minute, are the Sun's returns to 0°, 90°, 180° and 270°.
describe("solar returns against USNO season times", () => {
  const usno = JSON.parse(readFileSync(new URL("./fixtures/usno-seasons.json", import.meta.url), "utf8")) as {
    events: { published: string; longitude: number }[];
  };
  it.each(usno.events)("$published: the Sun at $longitude°", ({ published, longitude }) => {
    const found = solarReturnInstant(longitude, `${published.slice(0, 10)}T00:00:00Z`);
    expect(Math.abs(found.getTime() - Date.parse(published)) / 1000).toBeLessThanOrEqual(120);
  });
});

// G3: the conformance suite's L1 vectors give JPL Horizons's apparent
// longitude of the Sun and the Moon at 24 instants from 1851 to 2148. The
// return to that longitude, found from 10 days before, is compared in TT.
describe("returns against the JPL Horizons positions of the L1 vectors", () => {
  const vectors = (
    JSON.parse(readFileSync(new URL("../../conformance/vectors/L1-positions.json", import.meta.url), "utf8")) as {
      vectors: { id: string; input: { body: string; jd_tt: number }; expected: { lon: number } }[];
    }
  ).vectors.filter((vector) => vector.input.body === "Sun" || vector.input.body === "Moon");
  it("has 24 Sun and 24 Moon vectors", () => expect(vectors).toHaveLength(48));
  it.each(vectors)("$id ($input.body)", ({ input, expected }) => {
    // Roughly the vector's UTC instant; only the 10 days before it matter.
    const approximate = (input.jd_tt - 2440587.5) * DAY;
    const before = new Date(approximate - 10 * DAY);
    const found = input.body === "Sun" ? solarReturnInstant(expected.lon, before) : lunarReturnInstant(expected.lon, before);
    const seconds = Math.abs(jdTT(found) - input.jd_tt) * 86_400;
    expect(seconds).toBeLessThanOrEqual(input.body === "Sun" ? 60 : 15);
  });
});

describe("solar return instants", () => {
  it("picks the return nearest the date, and the latest at or before it", () => {
    const natal = bodyLongitude("Sun", new Date(BIRTH.utc));
    const nearest = solarReturnInstant(natal, "2031-05-01T00:00:00Z");
    expect(nearest.toISOString().slice(0, 7)).toBe("2030-11");
    expect(angle(bodyLongitude("Sun", nearest), natal)).toBeLessThan(1e-6);
    const recent = mostRecentSolarReturnInstant(natal, "2031-05-01T00:00:00Z");
    expect(recent.getTime()).toBe(nearest.getTime());
    const later = mostRecentSolarReturnInstant(natal, "2031-11-20T00:00:00Z");
    expect(later.getTime() - nearest.getTime()).toBeGreaterThan(364 * DAY);
    expect(solarReturnInstant(natal, "2031-11-20T00:00:00Z").getTime()).toBe(later.getTime());
  });

  it("refuses invalid input", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, "10" as unknown as number]) {
      expect(() => solarReturnInstant(bad, "2000-01-01")).toThrow(RangeError);
      expect(() => mostRecentSolarReturnInstant(bad, "2000-01-01")).toThrow(RangeError);
      expect(() => lunarReturnInstant(bad, "2000-01-01")).toThrow(RangeError);
    }
    expect(() => solarReturnInstant(10, "2000-13-01")).toThrow(RangeError);
    expect(() => lunarReturnInstant(10, new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe("lunar return instants", () => {
  it("is the first return after the date, strictly, and within 40 days", () => {
    const after = new Date("2024-02-10T00:00:00Z");
    const at = lunarReturnInstant(123.4, after);
    expect(at.getTime()).toBeGreaterThan(after.getTime());
    expect(at.getTime() - after.getTime()).toBeLessThan(28 * DAY);
    expect(angle(bodyLongitude("Moon", at), 123.4)).toBeLessThan(1e-6);
    // Starting exactly at a return finds the next one, about 27.3 days on.
    const next = lunarReturnInstant(123.4, at);
    expect((next.getTime() - at.getTime()) / DAY).toBeGreaterThan(26);
    // A longitude outside [0, 360) is the same longitude.
    expect(lunarReturnInstant(123.4 - 720, after).getTime()).toBe(at.getTime());
  });
});

describe("solarReturn", () => {
  it("casts the chart for the return at the natal place by default", () => {
    const result = solarReturn(BIRTH, "2031-05-01T00:00:00Z");
    const natal = natalChart(BIRTH);
    expect(result.body).toBe("Sun");
    expect(result.selection).toBe("nearest");
    expect(result.natalLongitude).toBe(natal.bodies[0]!.lon);
    expect(result.location).toEqual({ latitude: 48.21, longitude: 16.37 });
    expect(result.chart).toEqual(natalChart({ utc: result.instant, latitude: 48.21, longitude: 16.37, houseSystem: "placidus", timeKnown: true }));
    expect(angle(result.chart.bodies[0]!.lon, result.natalLongitude)).toBeLessThan(1e-6);
    expect(result.flags).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("casts elsewhere, without a place, and with another house system", () => {
    const moved = solarReturn(BIRTH, "2031-05-01T00:00:00Z", { location: { latitude: -33.9, longitude: 18.4 }, houseSystem: "whole" });
    const bare = solarReturn(BIRTH, "2031-05-01T00:00:00Z", { location: null });
    expect(moved.instant.getTime()).toBe(bare.instant.getTime());
    expect(moved.chart.houses?.system).toBe("whole");
    expect(moved.chart.bodies).toEqual(bare.chart.bodies);
    expect(bare.chart.angles).toBeNull();
    expect(bare.location).toBeNull();
    // A birth without a place gives a chart without angles unless a place is named.
    expect(solarReturn(UNPLACED, "2000-06-01").chart.angles).toBeNull();
    expect(solarReturn(UNPLACED, "2000-06-01", { location: { latitude: 10, longitude: 10 } }).chart.angles).not.toBeNull();
  });

  it("selects the year in progress", () => {
    const recent = solarReturn(BIRTH, "2031-10-01T00:00:00Z", { selection: "most-recent" });
    expect(recent.instant.toISOString().slice(0, 7)).toBe("2030-11");
    expect(solarReturn(BIRTH, "2031-10-01T00:00:00Z").instant.toISOString().slice(0, 7)).toBe("2031-11");
  });

  it("flags returns searched outside 1800–2200", () => {
    expect(solarReturn(UNPLACED, "1790-06-01").flags).toEqual(["outside-reference-span"]);
    expect(solarReturn({ utc: "1790-06-01T00:00:00Z" }, "1900-06-01").flags).toEqual(["outside-reference-span"]);
  });

  it("refuses unknown options and invalid values", () => {
    expect(() => solarReturn(BIRTH, "2031-05-01", { selection: "latest" as never })).toThrow(RangeError);
    expect(() => solarReturn(BIRTH, "2031-05-01", { houseSystem: "unknown" as never })).toThrow(RangeError);
    expect(() => solarReturn(BIRTH, "2031-05-01", { location: { latitude: 91, longitude: 0 } })).toThrow(RangeError);
    expect(() => solarReturn(BIRTH, "2031-05-01", { orb: 1 } as never)).toThrow(RangeError);
  });
});

describe("lunarReturn", () => {
  it("casts the next return after the date", () => {
    const result = lunarReturn(BIRTH, "2031-05-01T00:00:00Z");
    expect(result.body).toBe("Moon");
    expect(result.natalLongitude).toBe(natalChart(BIRTH).bodies[1]!.lon);
    expect(result.instant.getTime()).toBe(lunarReturnInstant(result.natalLongitude, "2031-05-01T00:00:00Z").getTime());
    expect(angle(result.chart.bodies[1]!.lon, result.natalLongitude)).toBeLessThan(1e-6);
    expect(result.chart.angles).not.toBeNull();
  });

  it("keeps the return instant when the chart is cast elsewhere", () => {
    const home = lunarReturn(BIRTH, "2031-05-01T00:00:00Z");
    const away = lunarReturn(BIRTH, "2031-05-01T00:00:00Z", { location: { latitude: 1.3, longitude: 103.8 } });
    expect(away.instant.getTime()).toBe(home.instant.getTime());
    expect(away.chart.bodies).toEqual(home.chart.bodies);
    expect(away.chart.angles).not.toEqual(home.chart.angles);
  });

  it("needs a known, unambiguous birth time no later than the date", () => {
    expect(() => lunarReturn({ ...BIRTH, timeKnown: false }, "2031-05-01")).toThrow("unambiguous birth time");
    expect(() => lunarReturn({ ...BIRTH, flags: ["dst-gap"] }, "2031-05-01")).toThrow("unambiguous birth time");
    expect(() => lunarReturn({ ...BIRTH, flags: ["dst-fold"] }, "2031-05-01")).toThrow("unambiguous birth time");
    expect(() => lunarReturn(BIRTH, "1980-01-01")).toThrow(RangeError);
    expect(() => lunarReturn(BIRTH, "2031-05-01", { selection: "nearest" } as never)).toThrow(RangeError);
  });
});
