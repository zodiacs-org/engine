import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";

import { MakeTime, SetDeltaTFunction, e_tilt } from "astronomy-engine";
import { describe, expect, it } from "vitest";

import { deltaT, natalChart } from "../index.js";
import { timeBasis } from "../time-scale.js";
import {
  AYANAMSAS,
  ayanamsa,
  siderealChart,
  siderealLongitude,
  userAyanamsa
} from "../vedic.js";
import type { AyanamsaDefinition, AyanamsaName, SiderealLongitude } from "../vedic.js";

/** Written by docs/evidence/vedic-2026-09-28/tools/reference_values.py from ERFA and the IAE; see there. */
interface Reference {
  lahiriDpsi1980Arcsec: number;
  j2000: Record<"lahiri" | "fagan-bradley" | "krishnamurti", number>;
  epoch: [AyanamsaName, number, number][];
  user: [string, number, number, "engine" | "newcomb" | "iau1976", number, number][];
  stars: [AyanamsaName, number, number][];
  iae2027: { meanArcsec: [number, number][]; true: [number, number, number][] };
}
const REFERENCE = JSON.parse(
  readFileSync(new URL("./fixtures/ayanamsa-reference.json", import.meta.url), "utf8")
) as Reference;

/** The instant whose TT is exactly the given Julian date: read as TT, with ΔT pinned to 0. */
const ttInstant = (jd: number) => ({
  at: new Date(Date.UTC(2000, 0, 1, 12) + (jd - 2_451_545) * 86_400_000),
  options: { timeScale: "tt", deltaT: 0 } as const
});
const arcsec = (degrees: number) => degrees * 3600;
const meanAtTT = (definition: AyanamsaName | AyanamsaDefinition, jd: number) => {
  const { at, options } = ttInstant(jd);
  return ayanamsa(definition, at, options).mean;
};

/**
 * Runs `fn` with a wall-clock limit: a synchronous hang is interrupted and
 * becomes a thrown error instead of stalling the test run.
 */
function withinMs<T>(ms: number, fn: () => T): T {
  const key = "__zodiacsTimeLimited";
  (globalThis as Record<string, unknown>)[key] = fn;
  try {
    return runInThisContext(`globalThis.${key}()`, { timeout: ms }) as T;
  } finally {
    delete (globalThis as Record<string, unknown>)[key];
    SetDeltaTFunction(deltaT); // an interrupted run never reaches the engine's own restore
  }
}

describe("ayanamsa definitions", () => {
  it("are nine frozen built-ins", () => {
    expect(Object.keys(AYANAMSAS)).toEqual([
      "lahiri", "fagan-bradley", "krishnamurti", "raman", "yukteswar",
      "true-chitra", "true-revati", "true-pushya", "galactic-center"
    ]);
    expect(Object.isFrozen(AYANAMSAS)).toBe(true);
    for (const definition of Object.values(AYANAMSAS)) {
      expect(Object.isFrozen(definition)).toBe(true);
      expect(definition.source.length).toBeGreaterThan(20);
    }
  });

  it("take Lahiri's true 23°15′00.658″ at 1956-03-21 0h TT less the IAU 1980 nutation (ERFA nut80)", () => {
    const lahiri = AYANAMSAS.lahiri;
    if (lahiri.kind !== "epoch") throw new Error("Lahiri is an epoch definition");
    expect(Math.abs(arcsec(lahiri.value) + REFERENCE.lahiriDpsi1980Arcsec - (23 * 3600 + 15 * 60 + 0.658))).toBeLessThan(1e-6);
    expect([lahiri.epochTT, lahiri.model]).toEqual([2_435_553.5, "iau1976"]);
  });

  it("hold the IAU 1976 and Newcomb zodiacs where their own models put them at J2000.0", () => {
    // ERFA pmat76/obl80 for Lahiri, Kinoshita (1975) table 3 for the others (reference_values.py).
    for (const [name, value] of Object.entries(REFERENCE.j2000)) {
      expect(Math.abs(arcsec(meanAtTT(name as AyanamsaName, 2_451_545) - value))).toBeLessThan(1e-5);
    }
  });

  it("carry them from J2000.0 with IAU 2006 precession, as ERFA computes it, 1800–2200", () => {
    expect(REFERENCE.epoch.length).toBe(36);
    for (const [name, jd, value] of REFERENCE.epoch) {
      expect(Math.abs(arcsec(meanAtTT(name, jd) - value))).toBeLessThan(1e-5);
    }
  });

  it("put the star-anchored zodiacs where ERFA's astrometry puts the star, away from the Sun", () => {
    // ERFA pmsafe, apcg13, atciq and ecm06 on the same catalogue values; instants with the star within 5° of the Sun excluded.
    expect(REFERENCE.stars.length).toBeGreaterThan(150);
    for (const [name, jd, value] of REFERENCE.stars) {
      expect(Math.abs(arcsec(meanAtTT(name, jd) - value))).toBeLessThan(0.001);
    }
  });

  it("reproduce the Indian Astronomical Ephemeris for 2027 for Lahiri", () => {
    // Mean ayanamsa for 2027.0 and 2028.0, printed to 0.01″.
    for (const [jd, value] of REFERENCE.iae2027.meanArcsec) {
      expect(Math.abs(arcsec(meanAtTT("lahiri", jd)) - value)).toBeLessThan(0.005 + 0.002);
    }
    // 161 true ayanamsas, printed to 0.1″; the edition's nutation is IAU 2000A (ERFA nut06a).
    expect(REFERENCE.iae2027.true.length).toBe(161);
    for (const [jd, trueValue, dpsi] of REFERENCE.iae2027.true) {
      expect(Math.abs(arcsec(meanAtTT("lahiri", jd)) + dpsi - trueValue)).toBeLessThan(0.05 + 0.003);
    }
  });

  it("reproduce Raman's worked examples and Sri Yukteswar's 1894 value", () => {
    // A Manual of Hindu Astrology §49: 1912 gives 76,255″ (21°10′55″), 1918 gives 76,557″.
    for (const [year, seconds] of [[1912, 76_255], [1918, 76_557]] as const) {
      expect(arcsec(meanAtTT("raman", 2_451_545 + (year - 2000) * 365.25))).toBeCloseTo(seconds, 6);
    }
    expect(arcsec(meanAtTT("yukteswar", 2_412_908.1244))).toBeCloseTo(20 * 3600 + 54 * 60 + 36, 6);
  });

  it("consistency: true is mean plus the engine's own nutation, on the engine's clock", () => {
    for (const instant of ["1850-06-01T00:00:00Z", "2024-03-20T03:06:00Z", "2150-12-31T23:59:59Z"]) {
      const value = ayanamsa("lahiri", instant);
      // The instant's UT1 and TT on the engine's time basis, as a chart reads it.
      const basis = timeBasis(Date.parse(instant), "utc");
      SetDeltaTFunction(() => basis.deltaT.seconds);
      const time = MakeTime(basis.ut1Days);
      const dpsi = e_tilt(time).dpsi;
      SetDeltaTFunction(deltaT);
      expect(value.nutation * 3600).toBeCloseTo(dpsi, 12);
      expect(value.true).toBeCloseTo(value.mean + value.nutation, 12);
      expect(value.julianDateTT).toBeCloseTo(2_451_545 + basis.ttDays, 9);
      const chart = natalChart({ utc: instant, timeKnown: false });
      expect(value.deltaT).toEqual(chart.deltaT);
      expect(value.timeScale).toEqual(chart.timeScale);
    }
  });

  it("put a star-anchored zodiac on the star's apparent place, aberration included", () => {
    // Relative to Lahiri, which moves smoothly, the True Chitra value carries Spica's
    // annual aberration (about ±20″ along the ecliptic) and a smaller parallax.
    const offsets = Array.from({ length: 48 }, (_, k) => {
      const at = new Date(Date.UTC(2020, 0, 1) + k * 7.61 * 86_400_000);
      return arcsec(ayanamsa("true-chitra", at).mean - ayanamsa("lahiri", at).mean);
    });
    const range = Math.max(...offsets) - Math.min(...offsets);
    expect(range).toBeGreaterThan(38);
    expect(range).toBeLessThan(44);
  });

  it("pins ΔT when asked and reports the clock it used", () => {
    // A pin fixes TT − UT1; UT1 still comes from the instant: on UTC in 2001
    // that is UTC + (UT1 − UTC), as for a chart.
    const pinned = ayanamsa("true-revati", "2001-01-01T00:00:00Z", { deltaT: 64 });
    expect(pinned.deltaT).toMatchObject({ model: "pinned", seconds: 64 });
    const ut1MinusUtc = pinned.timeScale.ut1MinusUtc!.seconds;
    expect(pinned.julianDateTT).toBeCloseTo(2_451_910.5 + (64 + ut1MinusUtc) / 86_400, 9);
    const onUt1 = ayanamsa("true-revati", "2001-01-01T00:00:00Z", { deltaT: 64, timeScale: "ut1" });
    expect(onUt1.julianDateTT).toBeCloseTo(2_451_910.5 + 64 / 86_400, 9);
    expect(onUt1.timeScale).toMatchObject({ input: "ut1", basis: "pinned" });
    expect(ayanamsa("true-revati", "2001-01-01T00:00:00Z").deltaT.model).toBe("iers-utc/1");
    expect(ayanamsa("true-revati", "1950-01-01T00:00:00Z").deltaT.model).toBe("zodiacs-deltat/1");
    expect(() => ayanamsa("lahiri", "2001-01-01", { timeScale: "tai" as never })).toThrow(RangeError);
    expect(() => ayanamsa("lahiri", "2001-01-01", { timeScale: null as never })).toThrow(RangeError);
    expect(Object.isFrozen(pinned) && Object.isFrozen(pinned.deltaT) && Object.isFrozen(pinned.flags)).toBe(true);
    expect(Object.isFrozen(pinned.timeScale) && Object.isFrozen(pinned.timeScale.ut1MinusUtc)).toBe(true);
  });

  it("return under every ΔT pin the engine accepts, for every kind of definition", () => {
    const definitions: (AyanamsaName | AyanamsaDefinition)[] = [
      ...(Object.keys(AYANAMSAS) as AyanamsaName[]),
      userAyanamsa({ name: "pin-engine", epoch: { julianDateTT: 2_433_282.5 }, value: 23.15 }),
      userAyanamsa({ name: "pin-newcomb", epoch: { julianDateTT: 2_415_020 }, value: 22.46, model: "newcomb" }),
      userAyanamsa({ name: "pin-iau1976", epoch: { julianDateTT: 2_435_553.5 }, value: 23.25, model: "iau1976" }),
      userAyanamsa({ name: "pin-linear", epoch: "1950-01-01", value: 23, rate: 50 })
    ];
    const pins = [1e10, -1e10, 1e9, -1e9, 1e8, 1e5, 0];
    const values = withinMs(10_000, () =>
      definitions.flatMap((definition) => pins.map((pin) => ayanamsa(definition, "2000-01-01T00:00:00Z", { deltaT: pin }))));
    expect(values.every((value) => Number.isFinite(value.mean) && Number.isFinite(value.true))).toBe(true);
    // UT1 is UTC + (UT1 − UTC) on 2000-01-01, and TT is UT1 plus the pin.
    expect(values[0]!.julianDateTT).toBeCloseTo(2_451_544.5 + (1e10 + values[0]!.timeScale.ut1MinusUtc!.seconds) / 86_400, 6);
    // The epoch frame depends on TT alone: an epoch definition's value moves only with the instant's TT.
    const lahiri = values.slice(0, pins.length);
    expect(arcsec(lahiri[5]!.mean - lahiri[6]!.mean)).toBeCloseTo((50.29 * 1e5) / (365.25 * 86_400), 2);
  }, 30_000);

  it("return siderealChart under ±1e10 s ΔT pins", () => {
    const charts = withinMs(10_000, () => [1e10, -1e10, 1e9].map((pin) =>
      siderealChart({ utc: "2000-01-01T00:00:00Z", latitude: 10, longitude: 10, deltaT: pin }, "lahiri")));
    for (const chart of charts) {
      expect(chart.ayanamsaValue.deltaT.model).toBe("pinned");
      expect(chart.bodies).toHaveLength(12);
      expect(chart.cusps).toHaveLength(12);
    }
  }, 30_000);

  it("flag values outside the reference span, and user epochs outside it, as charts are flagged", () => {
    expect(ayanamsa("lahiri", "2000-01-01").flags).toEqual([]);
    expect(ayanamsa("lahiri", "1799-12-31T23:59:59Z").flags).toEqual(["outside-reference-span"]);
    expect(natalChart({ utc: "1799-12-31T23:59:59Z", timeKnown: false }).flags).toContain("outside-reference-span");
    const early = userAyanamsa({ name: "early", epoch: { julianDateTT: 1_825_000.5 }, value: 0 });
    expect(ayanamsa(early, "2000-01-01").flags).toEqual(["outside-reference-span"]);
    const linear = userAyanamsa({ name: "early-linear", epoch: { julianDateTT: 1_825_000.5 }, value: 0, rate: 50 });
    expect(ayanamsa(linear, "2000-01-01").flags).toEqual([]);
  });

  it("refuse unknown names, look-alike definitions and bad options", () => {
    expect(() => ayanamsa("lahiri-icrc" as "lahiri", "2000-01-01")).toThrow(RangeError);
    expect(() => ayanamsa({ ...AYANAMSAS.lahiri } as AyanamsaDefinition, "2000-01-01")).toThrow(RangeError);
    expect(() => ayanamsa("lahiri", "2000-13-01")).toThrow(RangeError);
    expect(() => ayanamsa("lahiri", "2000-01-01", { deltaT: Number.NaN })).toThrow(RangeError);
    expect(() => ayanamsa("lahiri", "2000-01-01", { deltaT: 1.0000001e10 })).toThrow(RangeError);
  });
});

describe("user ayanamsas", () => {
  it("carry a value linearly at the given rate", () => {
    const linear = userAyanamsa({ name: "test-linear", epoch: { julianDateTT: 2_451_545 }, value: 23, rate: 50 });
    expect(meanAtTT(linear, 2_451_545 + 36_525)).toBeCloseTo(23 + 5000 / 3600, 12);
    expect(ayanamsa(linear, "2000-01-01").ayanamsa).toBe("test-linear");
  });

  it("match ERFA's values for each model: the value holds at the epoch only with the engine's", () => {
    for (const [name, epochTT, value, model] of new Map(REFERENCE.user.map((row) => [row[0], row])).values()) {
      const user = userAyanamsa({ name, epoch: { julianDateTT: epochTT }, value, model });
      for (const [, , , , jd, expected] of REFERENCE.user.filter((row) => row[0] === name)) {
        expect(Math.abs(arcsec(meanAtTT(user, jd) - expected))).toBeLessThan(1e-5);
      }
      const atEpoch = arcsec(meanAtTT(user, epochTT) - value);
      if (model === "engine") expect(Math.abs(atEpoch)).toBeLessThan(1e-7);
      else expect(Math.abs(atEpoch)).toBeGreaterThan(0.1); // 0.83″ (Newcomb from 1900), 0.13″ (IAU 1976 from 1956)
    }
  });

  it("read an instant epoch on the engine's ΔT model", () => {
    const user = userAyanamsa({ epoch: "1950-01-01T00:00:00Z", value: 1, rate: 50 });
    expect(ayanamsa(user, "1950-01-01T00:00:00Z").mean).toBeCloseTo(1, 12);
    // Pinning a ΔT 36 s larger at evaluation moves TT, and the value, by 36 s of 50″/yr.
    const pinned = ayanamsa(user, "1950-01-01T00:00:00Z", { deltaT: ayanamsa(user, "1950-01-01").deltaT.seconds + 36 });
    expect(arcsec(pinned.mean - 1)).toBeCloseTo((50 * 36) / (365.25 * 86_400), 9);
  });

  it("refuse built-in names, rates with models, and values or epochs out of range", () => {
    expect(() => userAyanamsa({ name: "lahiri", epoch: "2000-01-01", value: 1 })).toThrow(RangeError);
    expect(() => userAyanamsa({ name: "Bad Name", epoch: "2000-01-01", value: 1 })).toThrow(RangeError);
    expect(() => userAyanamsa({ epoch: "2000-01-01", value: 1, rate: 50, model: "newcomb" })).toThrow(RangeError);
    expect(() => userAyanamsa({ epoch: "2000-01-01", value: 400 })).toThrow(RangeError);
    expect(() => userAyanamsa({ epoch: { julianDateTT: Number.NaN }, value: 1 })).toThrow(RangeError);
    expect(() => userAyanamsa({ epoch: "2000-01-01", value: 1, model: "vondrak" as "engine" })).toThrow(RangeError);
    // Julian dates no engine instant can have (the Date range) are refused; the edges are accepted.
    expect(() => userAyanamsa({ epoch: { julianDateTT: -1e8 }, value: 1 })).toThrow(RangeError);
    expect(() => userAyanamsa({ epoch: { julianDateTT: 2_440_587.5 + 1e8 + 1 }, value: 1 })).toThrow(RangeError);
    expect(userAyanamsa({ epoch: { julianDateTT: 2_440_587.5 - 1e8 }, value: 1 }).kind).toBe("epoch");
  });
});

describe("sidereal charts", () => {
  const birth = { utc: "1990-05-17T08:30:00Z", latitude: 12.97, longitude: 77.59, deltaT: 57 };
  const houseOf = (lon: number, cusps: readonly SiderealLongitude[]) =>
    1 + cusps.findIndex((cusp, i) => ((lon - cusp.lon + 360) % 360) < ((cusps[(i + 1) % 12]!.lon - cusp.lon + 360) % 360));

  it("consistency: subtract the true ayanamsa from the engine's own tropical longitudes, on the chart's clock", () => {
    const chart = natalChart({ ...birth, houseSystem: "placidus" });
    const sidereal = siderealChart(chart, "lahiri");
    expect(sidereal.ayanamsa).toBe("lahiri");
    expect(sidereal.ayanamsaValue.deltaT).toMatchObject({ model: "pinned", seconds: 57 });
    expect(sidereal.bodies.map((b) => b.body)).toEqual(chart.bodies.map((b) => b.body));
    sidereal.bodies.forEach((row, i) => {
      const expected = (((chart.bodies[i]!.lon - sidereal.ayanamsaValue.true) % 360) + 360) % 360;
      expect(row.lon).toBeCloseTo(expected, 12);
      expect(row.tropical).toBe(chart.bodies[i]!.lon);
    });
    expect(sidereal.ascendant?.tropical).toBe(chart.angles?.asc);
    expect(sidereal.houseSystem).toBe("placidus");
    expect(sidereal.cusps?.map((cusp) => cusp.tropical)).toEqual(chart.houses?.cusps);
    expect(siderealChart({ ...birth, houseSystem: "placidus" }, "lahiri").bodies[1]!.lon).toBe(sidereal.bodies[1]!.lon);
    const timeless = siderealChart({ utc: birth.utc, timeKnown: false }, "raman");
    expect([timeless.ascendant, timeless.houseSystem, timeless.cusps, timeless.flags]).toEqual([null, null, null, ["no-time"]]);
  });

  it("read the ayanamsa on the chart's own time basis and scale", () => {
    for (const input of [
      { utc: "1990-05-17T08:30:00Z", latitude: 12.97, longitude: 77.59 },
      { utc: "1990-05-17T08:31:00Z", timeScale: "tt", latitude: 12.97, longitude: 77.59 },
      { utc: "1950-05-17T08:30:00Z", timeScale: "ut1", latitude: 12.97, longitude: 77.59 }
    ] as const) {
      const chart = natalChart(input);
      const value = siderealChart(chart, "true-chitra").ayanamsaValue;
      expect(value.deltaT).toEqual(chart.deltaT);
      expect(value.timeScale).toEqual(chart.timeScale);
      expect(value.utc).toBe(chart.input.utc.toISOString());
    }
  });

  it("build whole-sign houses from the sign of the sidereal ascendant", () => {
    // The docs' synthetic birth: the sidereal ascendant is Leo 26.25°, so house 1 is Leo from 120°.
    const sidereal = siderealChart({ ...birth, houseSystem: "whole" }, "lahiri");
    expect(Math.floor(sidereal.ascendant!.lon / 30)).toBe(4);
    expect(sidereal.ascendant!.lon - 120).toBeCloseTo(26.25, 1);
    expect(sidereal.houseSystem).toBe("whole");
    expect(sidereal.cusps!.map((cusp) => cusp.lon)).toEqual([120, 150, 180, 210, 240, 270, 300, 330, 0, 30, 60, 90]);
    for (const cusp of sidereal.cusps!) expect(cusp.lon + cusp.trueAyanamsa! - cusp.tropical!).toBeCloseTo(0, 9);
    const house = Object.fromEntries(sidereal.bodies.map((row) => [row.body, houseOf(row.lon, sidereal.cusps!)]));
    // The tropical cusps less the ayanamsa would put the Sun in house 9 and Saturn in house 5.
    expect([house.Sun, house.Saturn]).toEqual([10, 6]);
  });

  it("rebuild the polar fallback's whole-sign houses in the sidereal zodiac, and say so", () => {
    const polar = { utc: "2001-12-21T00:00:00Z", latitude: 78.2232, longitude: 15.6267, houseSystem: "placidus" as const };
    const chart = natalChart(polar);
    expect(chart.houses?.system).toBe("whole");
    const sidereal = siderealChart(chart, "lahiri");
    expect(sidereal.houseSystem).toBe("whole");
    expect(sidereal.flags).toContain("polar-fallback");
    const first = Math.floor(sidereal.ascendant!.lon / 30) * 30;
    expect(sidereal.cusps!.map((cusp) => cusp.lon)).toEqual(Array.from({ length: 12 }, (_, k) => (first + 30 * k) % 360));
  });

  it("check the ayanamsa before computing the chart", () => {
    expect(() => siderealChart({ utc: "not a date" } as never, "nope" as AyanamsaName)).toThrow(/Unknown ayanamsa/);
  });

  it("need an AyanamsaValue made by ayanamsa(), not a number or a copy", () => {
    const value = ayanamsa("lahiri", birth.utc);
    expect(siderealLongitude(100, value).trueAyanamsa).toBe(value.true);
    expect(() => siderealLongitude(100, { ...value })).toThrow(RangeError);
    expect(() => siderealLongitude(100, 23.8 as never)).toThrow(RangeError);
    expect(() => siderealLongitude(Number.POSITIVE_INFINITY, value)).toThrow(RangeError);
  });
});
