import { describe, expect, it } from "vitest";

import { chartDeclinations, chartPoints, natalChart } from "../index.js";
import {
  firdaria,
  firdariaAt,
  profectionAt,
  profectionYear,
  releasingAt,
  releasingPeriods,
  solarArc,
  solarArcDirections,
  zodiacalReleasing,
  zodiacalReleasingAt
} from "../timing.js";
import { guarded } from "./shared.js";

const DEG = Math.PI / 180;
const SPAN = "outside-reference-span";
const SECT = "sect-contradicts-altitude";

/** Deterministic pseudo-random numbers in [0, 1). */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A birth whose chart cannot be computed: any refusal naming something else came first. */
const UNCOMPUTABLE = { utc: "1990-02-30T12:00:00Z", latitude: 40, longitude: -74 } as const;

describe("timing checks that need no chart", () => {
  it("refuse names, options and dates before the chart is computed", () => {
    expect(() => natalChart(UNCOMPUTABLE)).toThrow(/utc/);
    const refusals: [() => unknown, RegExp][] = [
      [() => profectionYear(UNCOMPUTABLE, -1), /age must be/],
      [() => profectionYear(UNCOMPUTABLE, 1, { point: "Chiron" as never }), /point must name a body, an angle or a chart point/],
      [() => profectionAt(UNCOMPUTABLE, "2000-01-01", { months: "lunar" as never }), /months must be one of/],
      [() => profectionAt(UNCOMPUTABLE, "not a date"), /date must be/],
      [() => firdaria(UNCOMPUTABLE, { cycles: 5 }), /cycles must be/],
      [() => firdariaAt(UNCOMPUTABLE, "2000-01-01", { variant: "zoller" as never }), /variant must be one of/],
      [() => zodiacalReleasing(UNCOMPUTABLE, "Lot of Eros" as never, "2000-01-01", "2001-01-01"), /lot must be/],
      [() => zodiacalReleasing(UNCOMPUTABLE, "Lot of Spirit", "2001-01-01", "2000-01-01"), /to must not precede from/],
      [() => zodiacalReleasing(UNCOMPUTABLE, "Lot of Spirit", "2000-01-01", "2001-01-01", { levels: 5 as never }), /levels must be/],
      [() => zodiacalReleasingAt(UNCOMPUTABLE, "Lot of Spirit", "2000-01-01", { years: "egyptian" as never }), /years must be one of/],
      [() => solarArcDirections(UNCOMPUTABLE, "not a date"), /target must be/]
    ];
    for (const [call, message] of refusals) expect(call).toThrow(message);
  });

  it("know every name a chart can profect before computing it", () => {
    const birth = { utc: "1990-06-15T13:30:00Z", latitude: 51.5, longitude: -0.13 } as const;
    const names = solarArcDirections(birth, "2000-01-01").positions.map((row) => row.name);
    expect(names).toHaveLength(28);
    for (const point of names) expect(profectionYear(birth, 3, { point }).origin.point).toBe(point);
    // A known name the chart lacks is refused once the chart is known.
    expect(() => profectionYear({ utc: "1990-06-15", timeKnown: false }, 3, { point: "Vertex" }))
      .toThrow(/"Vertex" needs a chart with a birth time and place/);
  });
});

describe("ephemeris failures", () => {
  it("refuse instants outside EPHEMERIS_SPAN with the core's RangeError", () => {
    // At this date astronomy-engine's light-time solver fails for Saturn and
    // throws a string. Since 0.1.1-rc.14 the core refuses any instant outside
    // EPHEMERIS_SPAN before astronomy-engine sees it, so the timing functions
    // pass the core's RangeError on; `guarded` still turns a thrown string
    // into a RangeError (below).
    const far = { utc: "+275000-06-01T00:00:00Z", latitude: 40, longitude: -74 } as const;
    expect(() => natalChart(far)).toThrow(RangeError);
    expect(() => natalChart(far)).toThrow(/outside the ephemeris span/);
    for (const call of [
      () => profectionYear(far, 1),
      () => firdaria(far),
      () => zodiacalReleasingAt(far, "Lot of Spirit", "+275001-01-01T00:00:00Z"),
      () => solarArc(far.utc, "+275001-01-01T00:00:00Z"),
      () => solarArcDirections(far, "+275001-01-01T00:00:00Z")
    ]) {
      expect(call).toThrow(RangeError);
      expect(call).toThrow(/outside the ephemeris span/);
    }
  });

  it("pass Errors through unchanged and keep the string as the cause", () => {
    const error = new TypeError("unchanged");
    expect(() => guarded(() => { throw error; })).toThrow(error);
    try {
      guarded(() => { throw "Light-travel time solver did not converge"; });
    } catch (caught) {
      expect(caught).toBeInstanceOf(RangeError);
      expect((caught as RangeError).cause).toBe("Light-travel time solver did not converge");
    }
    expect(guarded(() => 42)).toBe(42);
  });
});

describe("timing flags", () => {
  // Saunders, "Solar Arc Directions" (1996), p. 3, Figure 1 and p. 4, Figure 2;
  // see firdaria.test.ts.
  const REEVE = { utc: "1952-09-25T07:12:00Z", latitude: 40 + 46 / 60, longitude: -(73 + 59 / 60) } as const;
  const KING = { utc: "1927-04-27T22:00:00Z", latitude: 32 + 37 / 60 + 56 / 3600, longitude: -(87 + 19 / 60 + 9 / 3600) } as const;
  const EARLY = { utc: "1790-03-01T12:00:00Z", latitude: 48.85, longitude: 2.35 } as const;
  const LATE = { utc: "2150-03-01T12:00:00Z", latitude: 48.85, longitude: 2.35 } as const;

  it("mark results that read the ephemeris outside the reference span", () => {
    expect(profectionYear(REEVE, 30).flags).toEqual([]);
    expect(profectionYear(LATE, 40).flags).toEqual([]);
    expect(profectionYear(LATE, 50).flags).toEqual([SPAN]);
    expect(profectionAt(EARLY, "1850-01-01").flags).toEqual([SPAN]);
    expect(firdaria(KING, { cycles: 3 }).flags).toEqual([]);
    expect(firdaria(KING, { cycles: 4 }).flags).toEqual([SPAN]);
    expect(firdariaAt(KING, "2150-01-01").flags).toEqual([]);
    expect(firdariaAt(KING, "2200-06-01").flags).toEqual([SPAN]);
    expect(zodiacalReleasing(EARLY, "Lot of Fortune", "1800-01-01", "1810-01-01").flags).toEqual([SPAN]);
    expect(zodiacalReleasingAt(REEVE, "Lot of Fortune", "2400-01-01").flags).toEqual([]);
    // Releasing from a sign reads no ephemeris.
    expect(releasingPeriods("aries", "1500-01-01", "1500-01-01", "1600-01-01").flags).toEqual([]);
    expect(releasingAt("aries", "2500-01-01", "2600-01-01").flags).toEqual([]);
    expect(solarArc("1790-01-01", "1850-01-01").flags).toEqual([SPAN]);
    // A target 99 years on is progressed about 99 days: past 2200 here.
    expect(solarArc("2199-12-01", "2299-01-01").flags).toEqual([SPAN]);
    expect(solarArc("2150-01-01", "2299-01-01").flags).toEqual([]);
    expect(solarArcDirections(REEVE, "2100-01-01").flags).toEqual([]);
    expect(Object.isFrozen(profectionYear(REEVE, 30).flags)).toBe(true);
  });

  it("mark results that depend on a sect the Sun's altitude contradicts: two polar charts", () => {
    // Svalbard's latitude in polar night (the Sun 11° below the horizon at
    // noon) and under the midnight sun. The midheaven is below the horizon in
    // both, so the half of the ecliptic the sect counts as day is below it.
    const polarNight = { utc: "1810-01-07T11:57:42.814Z", latitude: 78.2, longitude: 17.8405 } as const;
    const midnightSun = { utc: "2100-06-26T00:24:28.491Z", latitude: 78.2, longitude: -22.924 } as const;
    for (const [birth, sect] of [[polarNight, "day"], [midnightSun, "night"]] as const) {
      // The sect itself is unchanged: it is chartPoints' sect.
      expect(chartPoints(birth).sect).toBe(sect);
      const timeline = firdaria(birth);
      expect(timeline.sect).toBe(sect);
      expect(timeline.periods[0]!.lord).toBe(sect === "day" ? "Sun" : "Moon");
      expect(timeline.flags).toEqual([SECT]);
      expect(firdariaAt(birth, "2150-01-01").flags).toContain(SECT);
      expect(zodiacalReleasingAt(birth, "Lot of Spirit", "2150-01-01").flags).toEqual([SECT]);
      expect(profectionYear(birth, 3, { point: "Lot of Fortune" }).flags).toEqual([SECT]);
      expect(solarArcDirections(birth, "2150-01-01").flags).toEqual([SECT]);
      // What does not depend on the sect is not marked.
      expect(profectionYear(birth, 3).flags).toEqual([]);
      expect(profectionYear(birth, 3, { point: "Vertex" }).flags).toEqual([]);
    }
    expect(firdaria(REEVE).flags).toEqual([]);
  });

  it("mark the sect exactly when the Sun's altitude, found another way, disagrees with it", () => {
    // The altitude here uses the Sun's own right ascension and declination
    // (its ecliptic latitude included) and a sidereal time read from the East
    // Point, whose right ascension is the sidereal time plus 90°; the engine
    // takes the Sun on the ecliptic and the sidereal time from the midheaven.
    const next = random(66);
    let marked = 0;
    let unmarked = 0;
    for (let trial = 0; trial < 160; trial += 1) {
      const polar = trial % 4 !== 0;
      const size = polar ? 67 + next() * 18 : next() * 66;
      const latitude = next() < 0.5 ? -size : size;
      const birth = {
        utc: new Date(Date.UTC(1900, 0, 1) + next() * 200 * 365.25 * 86_400_000).toISOString(),
        latitude,
        longitude: next() * 360 - 180
      };
      const chart = natalChart(birth);
      const points = chartPoints(chart);
      const { trueObliquity, rows } = chartDeclinations(chart);
      const sun = rows.find((row) => row.body === "Sun")!;
      const east = points.points.find((point) => point.point === "East Point")!.lon * DEG;
      const e = trueObliquity * DEG;
      const siderealTime = Math.atan2(Math.sin(east) * Math.cos(e), Math.cos(east)) / DEG - 90;
      const phi = latitude * DEG;
      const altitude = Math.asin(
        Math.sin(phi) * Math.sin(sun.dec * DEG) + Math.cos(phi) * Math.cos(sun.dec * DEG) * Math.cos((siderealTime - sun.ra!) * DEG)
      ) / DEG;
      const flags = zodiacalReleasingAt(chart, "Lot of Spirit", chart.input.utc).flags;
      if (Math.abs(altitude) < 0.01) continue;
      const disagrees = (altitude > 0) !== (points.sect === "day");
      expect(flags.includes(SECT)).toBe(disagrees);
      if (!polar) expect(disagrees).toBe(false);
      if (disagrees) marked += 1;
      else unmarked += 1;
    }
    expect(marked).toBeGreaterThan(10);
    expect(unmarked).toBeGreaterThan(10);
  });
});
