import { describe, expect, it } from "vitest";

import { natalChart } from "../index.js";
import { firdaria } from "../timing.js";
import {
  DASHA_YEAR_DAYS,
  YOGINIS,
  ashtottariDasha,
  dashaSubperiods,
  declareSiderealLongitude,
  siderealChart,
  vimshottariAt,
  vimshottariDasha,
  yoginiDasha
} from "../vedic.js";
import type { DashaPeriod } from "../vedic.js";

// Synthetic birth instant; no person's data.
const BIRTH = "2001-02-03T04:05:06.000Z";
const moonAt = (lon: number, at: string = BIRTH) => declareSiderealLongitude(lon, { ayanamsa: "synthetic", at });
const DAY = 86_400_000;
/** Years, months and days in the texts' reckoning: 12 months of 30 days to the year. */
const ymd = (years: number) => {
  const days = Math.round(years * 360 * 1e6) / 1e6;
  return [Math.floor(days / 360), Math.floor((days % 360) / 30), Math.round(days % 30)];
};

function contiguous(periods: readonly DashaPeriod[]) {
  for (let i = 1; i < periods.length; i += 1) expect(periods[i]!.startMs).toBe(periods[i - 1]!.endMs);
}

describe("Vimshottari", () => {
  it("gives Ketu's balance for the Moon at Sagittarius 13° as 2 months 3 days (BPHS 46, notes to v. 16)", () => {
    const dasha = vimshottariDasha(moonAt(253));
    expect(dasha.balance.lord).toBe("Ketu");
    expect(dasha.balance.years).toBeCloseTo(0.175, 12);
    expect(ymd(dasha.balance.years)).toEqual([0, 2, 3]);
  });

  it("runs nine mahadashas for 120 years from before birth, in Vimshottari order", () => {
    const birth = Date.parse(BIRTH);
    const dasha = vimshottariDasha(moonAt(253));
    const lords = dasha.mahadashas.map((p) => p.lord);
    expect(lords).toEqual(["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"]);
    contiguous(dasha.mahadashas);
    const first = dasha.mahadashas[0]!;
    expect(first.startMs).toBeLessThan(birth);
    expect((first.endMs - birth) / (365.25 * DAY)).toBeCloseTo(0.175, 9);
    expect(dasha.mahadashas.reduce((sum, p) => sum + p.years, 0)).toBe(120);
    expect((dasha.mahadashas[8]!.endMs - first.startMs) / (365.25 * DAY)).toBeCloseTo(120, 9);
    expect(dasha.mahadashas.every((p) => p.level === 1 && p.levelName === "mahadasha")).toBe(true);
    expect(Object.isFrozen(dasha) && Object.isFrozen(dasha.mahadashas) && Object.isFrozen(first)).toBe(true);
  });

  it("divides a period as BPHS 51.1–2 shows: Venus–Venus 3y 4m, Saturn–Mercury 2y 8m 9d, Venus³ 6m 20d", () => {
    const venus = vimshottariDasha(moonAt(40 / 3)).mahadashas[0]!;
    expect(venus.lord).toBe("Venus");
    const antar = dashaSubperiods(venus);
    expect(antar.map((p) => p.lord)).toEqual(["Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury", "Ketu"]);
    expect(ymd(antar[0]!.years)).toEqual([3, 4, 0]);
    expect(ymd(dashaSubperiods(antar[0]!)[0]!.years)).toEqual([0, 6, 20]);
    const saturn = vimshottariDasha(moonAt(7 * (40 / 3))).mahadashas[0]!;
    expect(saturn.lord).toBe("Saturn");
    expect(ymd(dashaSubperiods(saturn)[1]!.years)).toEqual([2, 8, 9]);
    expect(dashaSubperiods(saturn)[1]!.lords).toEqual(["Saturn", "Mercury"]);
  });

  it("nests five levels exactly, and stops at the fifth", () => {
    let period = vimshottariDasha(moonAt(123.456)).mahadashas[3]!;
    const names = ["mahadasha"];
    for (let level = 2; level <= 5; level += 1) {
      const children = dashaSubperiods(period);
      contiguous(children);
      expect(children[0]!.startMs).toBe(period.startMs);
      expect(children[8]!.endMs).toBeCloseTo(period.endMs, -1);
      expect(children.reduce((sum, p) => sum + p.years, 0)).toBeCloseTo(period.years, 12);
      period = children[4]!;
      names.push(period.levelName);
      expect(period.level).toBe(level);
    }
    expect(names).toEqual(["mahadasha", "antardasha", "pratyantardasha", "sookshmadasha", "pranadasha"]);
    expect(() => dashaSubperiods(period)).toThrow(/fifth level/);
  });

  it("finds the periods running at an instant", () => {
    const moon = moonAt(300.1);
    const at = "2031-07-04T12:00:00Z";
    const chain = vimshottariAt(moon, at);
    expect(chain).toHaveLength(5);
    chain.forEach((period, i) => {
      expect(period.level).toBe(i + 1);
      expect(period.startMs).toBeLessThanOrEqual(Date.parse(at));
      expect(period.endMs).toBeGreaterThan(Date.parse(at));
      if (i > 0) expect(period.lords.slice(0, i)).toEqual(chain[i - 1]!.lords);
    });
    expect(vimshottariAt(moon, at, { levels: 2 })).toHaveLength(2);
    expect(() => vimshottariAt(moon, "2300-01-01")).toThrow(RangeError);
    expect(() => vimshottariAt(moon, at, { levels: 6 } as never)).toThrow(RangeError);
    expect(() => vimshottariAt(moon, at, { level: 2 } as never)).toThrow(/unknown option: level/);
    expect(() => vimshottariDasha(moon, { yearlength: "savana" } as never)).toThrow(/unknown option: yearlength/);
    expect(() => yoginiDasha(moon, { cycle: 2 } as never)).toThrow(/unknown option: cycle/);
    expect(() => ashtottariDasha(moon, { levels: 2 } as never)).toThrow(/unknown option: levels/);
    expect(vimshottariAt(moon, at, { levels: undefined, yearLength: undefined })).toEqual(chain);
  });

  it("finds each period from its own start and end: boundaries round-trip through the ISO strings", () => {
    // Moon longitudes on and near nakshatra boundaries and in between, with every year length. The
    // cases include ones where the unrounded start lies either side of the rounded one.
    const moons = [0, 40 / 3 - 1e-9, 93 + 1 / 3, 123.456, 10.1, 200.2, 300.3, 359.999999];
    let checked = 0;
    const misses: string[] = [];
    const check = (moon: ReturnType<typeof moonAt>, period: DashaPeriod, yearLength: "julian" | "tropical" | "savana") => {
      const levels = period.level;
      const first = vimshottariAt(moon, period.start, { yearLength, levels }).at(-1)!;
      const last = vimshottariAt(moon, Date.parse(period.end) - 1, { yearLength, levels }).at(-1)!;
      if (first.startMs !== period.startMs || last.startMs !== period.startMs) misses.push(`${period.lords.join("/")} ${period.start}`);
      checked += 1;
    };
    for (const lon of moons) for (const yearLength of ["julian", "tropical", "savana"] as const) {
      const moon = moonAt(lon);
      const { mahadashas } = vimshottariDasha(moon, { yearLength });
      for (const maha of mahadashas) {
        check(moon, maha, yearLength);
        for (const antar of dashaSubperiods(maha)) check(moon, antar, yearLength);
      }
      for (const antar of dashaSubperiods(mahadashas[1]!)) for (const pratyantar of dashaSubperiods(antar)) check(moon, pratyantar, yearLength);
      for (const sookshma of dashaSubperiods(dashaSubperiods(dashaSubperiods(mahadashas[2]!)[4]!)[3]!)) {
        check(moon, sookshma, yearLength);
        for (const prana of dashaSubperiods(sookshma)) check(moon, prana, yearLength);
      }
      expect(() => vimshottariAt(moon, Date.parse(mahadashas[0]!.start) - 1, { yearLength })).toThrow(RangeError);
      expect(() => vimshottariAt(moon, mahadashas[8]!.end, { yearLength })).toThrow(RangeError);
    }
    expect(misses).toEqual([]);
    expect(checked).toBe(24 * (9 + 81 + 81 + 9 + 81));
  }, 30_000);

  it("ends a period's last sub-period exactly where the period ends", () => {
    let period = vimshottariDasha(moonAt(123.456)).mahadashas[3]!;
    for (let level = 2; level <= 5; level += 1) {
      const children = dashaSubperiods(period);
      expect(children[8]!.endMs).toBe(period.endMs);
      expect(children[8]!.end).toBe(period.end);
      period = children[6]!;
    }
  });

  it("measures years by the chosen length", () => {
    expect(DASHA_YEAR_DAYS).toEqual({ julian: 365.25, tropical: 365.2422, savana: 360 });
    for (const [name, days] of Object.entries(DASHA_YEAR_DAYS)) {
      const dasha = vimshottariDasha(moonAt(40 / 3), { yearLength: name as keyof typeof DASHA_YEAR_DAYS });
      expect(dasha.yearDays).toBe(days);
      expect((dasha.mahadashas[0]!.endMs - dasha.mahadashas[0]!.startMs) / DAY).toBeCloseTo(20 * days, 6);
    }
    expect(() => vimshottariDasha(moonAt(1), { yearLength: "sidereal" as "julian" })).toThrow(RangeError);
  });

  it("needs a Moon that carries its instant", () => {
    expect(() => vimshottariDasha(declareSiderealLongitude(10, { ayanamsa: "x" }))).toThrow(/instant/);
    expect(() => vimshottariDasha(10 as never)).toThrow(RangeError);
    expect(() => dashaSubperiods({ ...vimshottariDasha(moonAt(1)).mahadashas[0]! })).toThrow(RangeError);
  });
});

describe("Yogini", () => {
  it("starts from the nakshatra's number plus 3, remainder by 8 (BPHS 46.195–199)", () => {
    // BPHS's example: Mrigashira, the 5th, gives 8, remainder 0: Sankata.
    expect(yoginiDasha(moonAt(4 * (40 / 3) + 1)).balance.lord).toBe("Sankata");
    expect(yoginiDasha(moonAt(1)).balance.lord).toBe("Bhramari");
    expect(yoginiDasha(moonAt(5 * (40 / 3) + 1)).balance.lord).toBe("Mangala");
    expect(YOGINIS.map((y) => [y.name, y.planet, y.years])).toEqual([
      ["Mangala", "Moon", 1], ["Pingala", "Sun", 2], ["Dhanya", "Jupiter", 3], ["Bhramari", "Mars", 4],
      ["Bhadrika", "Mercury", 5], ["Ulka", "Saturn", 6], ["Siddha", "Venus", 7], ["Sankata", "Rahu", 8]
    ]);
  });

  it("runs 36-year cycles from the untraversed part of the birth yogini", () => {
    const dasha = yoginiDasha(moonAt(4 * (40 / 3) + 10), { cycles: 2 });
    expect(dasha.balance.years).toBeCloseTo((1 - 10 / (40 / 3)) * 8, 12);
    expect(dasha.mahadashas).toHaveLength(16);
    expect(dasha.mahadashas.slice(0, 3).map((p) => p.lord)).toEqual(["Sankata", "Mangala", "Pingala"]);
    contiguous(dasha.mahadashas);
    expect(dasha.mahadashas.slice(0, 8).reduce((s, p) => s + p.years, 0)).toBe(36);
    expect(() => dashaSubperiods(dasha.mahadashas[0]!)).toThrow(RangeError);
    expect(() => yoginiDasha(moonAt(1), { cycles: 0 })).toThrow(RangeError);
  });
});

describe("Ashtottari", () => {
  const balance = (lon: number) => ashtottariDasha(moonAt(lon)).balance;

  it("assigns groups from Ardra with Abhijit counted (BPHS 46.17–22)", () => {
    expect(balance(5 * (40 / 3)).lord).toBe("Sun");
    expect(balance(5 * (40 / 3)).years).toBeCloseTo(6, 12);
    expect(balance(9 * (40 / 3)).lord).toBe("Moon");
    expect(balance(12 * (40 / 3)).lord).toBe("Mars");
    expect(balance(16 * (40 / 3)).lord).toBe("Mercury");
    expect(balance(19 * (40 / 3)).lord).toBe("Saturn");
    expect(balance(22 * (40 / 3)).lord).toBe("Jupiter");
    expect(balance(25 * (40 / 3)).lord).toBe("Rahu");
    expect(balance(1).lord).toBe("Rahu");
    expect(balance(2 * (40 / 3)).lord).toBe("Venus");
  });

  it("gives each nakshatra an equal share of its lord's years (BPHS 46.21–22 and note 2)", () => {
    // Note 2: at the start of Mrigashira, Krittika and Rohini have run 14 of Venus's 21 years.
    expect(balance(4 * (40 / 3)).years).toBeCloseTo(7, 12);
    // Ashwini, third of Rahu's four: 1 − 0.075 of a 3-year share, then Bharani's share.
    expect(balance(1).years).toBeCloseTo((1 - 0.075) * 3 + 3, 12);
  });

  it("gives Uttara Ashadha three padas, Abhijit its last pada and Shravana's first fifteenth", () => {
    // Uttara Ashadha 2nd pada, half its three padas run: half a 2.5-year share, then Abhijit and Shravana.
    expect(balance(271 + 2 / 3).years).toBeCloseTo(1.25 + 5, 12);
    // Abhijit spans 276°40′ to 280°53′20″.
    const abhijit = (lon: number) => balance(lon).years;
    expect(abhijit(276 + 2 / 3)).toBeCloseTo(5, 12);
    expect(abhijit(278)).toBeCloseTo((1 - (278 - (276 + 2 / 3)) / (4 + 2 / 9)) * 2.5 + 2.5, 12);
    expect(abhijit(280.5)).toBeCloseTo((1 - (280.5 - (276 + 2 / 3)) / (4 + 2 / 9)) * 2.5 + 2.5, 12);
    expect(abhijit(281)).toBeCloseTo((1 - (281 - (280 + 8 / 9)) / (12 + 4 / 9)) * 2.5, 12);
  });

  it("runs the eight lords for 108 years", () => {
    const dasha = ashtottariDasha(moonAt(1), { yearLength: "savana" });
    expect(dasha.mahadashas.map((p) => p.lord)).toEqual(["Rahu", "Venus", "Sun", "Moon", "Mars", "Mercury", "Saturn", "Jupiter"]);
    expect(dasha.mahadashas.reduce((s, p) => s + p.years, 0)).toBe(108);
    contiguous(dasha.mahadashas);
    expect((Date.parse(BIRTH) - dasha.mahadashas[0]!.startMs) / (360 * DAY)).toBeCloseTo(12 - dasha.balance.years, 9);
  });
});

describe("dashas of a chart given on TT or UT1", () => {
  // docs/vedic.md: "start and end are ISO 8601 UTC". A Moon from a chart given
  // on TT or UT1 carries the UTC instant of the chart's time basis, as the
  // timing entry reads it (utcOf), not the TT or UT1 reading with "Z". In
  // 1990 TT − UTC is exactly 32.184 s + 25 s (TAI − UTC from 1990-01-01, IERS
  // Bulletin C), and UT1 − UTC is −0.01304 s, so these three synthetic inputs
  // are one instant, 1990-06-15T12:30:00.000Z UTC, to the millisecond.
  const place = { latitude: 12.97, longitude: 77.59 } as const;
  const inputs = [
    { utc: "1990-06-15T12:30:00.000Z", ...place },
    { utc: "1990-06-15T12:30:57.184Z", timeScale: "tt", ...place },
    { utc: "1990-06-15T12:29:59.987Z", timeScale: "ut1", ...place }
  ] as const;
  const moonOf = (chart: ReturnType<typeof natalChart>) => siderealChart(chart, "lahiri").bodies.find((row) => row.body === "Moon")!;

  it("start from the chart's UTC instant, as the timing entry does", () => {
    const utc = vimshottariDasha(moonOf(natalChart(inputs[0])));
    for (const input of inputs) {
      const chart = natalChart(input);
      const moon = moonOf(chart);
      expect(moon.utc).toBe("1990-06-15T12:30:00.000Z");
      const dasha = vimshottariDasha(moon);
      expect(dasha.birth).toBe("1990-06-15T12:30:00.000Z");
      expect(dasha.birth).toBe(firdaria(chart).periods[0]!.start.toISOString());
      // The boundaries follow. The TT input is the UTC instant exactly; the
      // UT1 input is 0.042 ms after it, which moves the Moon by 0.000023″ and
      // the boundaries by 0.244 s: a boundary is years × the Moon's
      // untraversed fraction of a nakshatra. Read on TT, as before this fix,
      // they would be 57.184 s late.
      dasha.mahadashas.forEach((period, index) => {
        expect(period.lord).toBe(utc.mahadashas[index]!.lord);
        expect(Math.abs(period.startMs - utc.mahadashas[index]!.startMs)).toBeLessThan(1_000);
      });
      for (const run of [yoginiDasha(moon), ashtottariDasha(moon)]) expect(run.birth).toBe("1990-06-15T12:30:00.000Z");
    }
  });

  it("before 1972 too, where UT1 is read as the civil instant and TT is UT1 + ΔT", () => {
    for (const input of [
      { utc: "1950-05-17T08:30:00Z", timeScale: "ut1", ...place },
      { utc: "1950-05-17T08:31:00Z", timeScale: "tt", ...place }
    ] as const) {
      const chart = natalChart(input);
      const moon = moonOf(chart);
      const birth = firdaria(chart).periods[0]!.start.toISOString();
      expect(moon.utc).toBe(birth);
      expect(vimshottariDasha(moon).birth).toBe(birth);
      if (input.timeScale === "ut1") expect(birth).toBe("1950-05-17T08:30:00.000Z");
      // TT is ahead of UT1 by ΔT, about 29 s in 1950.
      else expect(Date.parse(input.utc) - Date.parse(birth)).toBe(Math.round(chart.deltaT.seconds * 1000));
    }
  });
});
