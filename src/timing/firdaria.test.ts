import { describe, expect, it } from "vitest";

import {
  chartPoints,
  normalizeLongitude,
  positions,
  type Sect
} from "../index.js";
import {
  CHALDEAN_ORDER,
  DEFAULT_FIRDARIA_VARIANT,
  FIRDARIA_CYCLE_YEARS,
  FIRDARIA_VARIANTS,
  FIRDARIA_YEARS,
  firdaria,
  firdariaAt,
  firdariaPeriods,
  firdariaSequence,
  profectionYear,
  type FirdariaLord,
  type FirdariaVariant
} from "../timing.js";

/**
 * Two charts Hamish Saunders publishes as worked examples ("Solar Arc
 * Directions", Astrology House, 1996): Christopher Reeve (1952-2004), a night
 * birth (p. 3, Figure 1), and Coretta Scott King (1927-2006), a day birth
 * (p. 4, Figure 2). Both have died. Used only to exercise the dated functions
 * on real sects.
 */
const REEVE = { utc: "1952-09-25T07:12:00Z", latitude: 40 + 46 / 60, longitude: -(73 + 59 / 60) } as const;
const KING = { utc: "1927-04-27T22:00:00Z", latitude: 32 + 37 / 60 + 56 / 3600, longitude: -(87 + 19 / 60 + 9 / 3600) } as const;

function separation(a: number, b: number): number {
  const difference = Math.abs(normalizeLongitude(a - b));
  return difference > 180 ? 360 - difference : difference;
}

function sunAt(date: Date): number {
  return positions(date).find((row) => row.body === "Sun")!.lon;
}

const lords = (sect: Sect, variant?: FirdariaVariant) =>
  firdariaPeriods(sect, variant ? { variant } : undefined).map((period) => period.lord);
const endAges = (sect: Sect, variant?: FirdariaVariant) =>
  firdariaPeriods(sect, variant ? { variant } : undefined).map((period) => period.endAge);
const subLords = (sect: Sect, lord: FirdariaLord) =>
  firdariaPeriods(sect).find((period) => period.lord === lord)!.subPeriods.map((share) => share.lord);

/** Years as al-Bīrūnī prints them: years, 30-day months, days and hours, to the hour. */
function biruni(years: number): string {
  let hours = Math.round(years * 360 * 24);
  const y = Math.floor(hours / (360 * 24));
  hours -= y * 360 * 24;
  const m = Math.floor(hours / (30 * 24));
  hours -= m * 30 * 24;
  const d = Math.floor(hours / 24);
  return `${y}y ${m}m ${d}d ${hours - d * 24}h`;
}

describe("firdaria: published tables", () => {
  // Steven Birchfield, "The Fardārāt in Nativities" (2005, revised 2020-07-13),
  // https://birchfieldastrology.com/wp-content/uploads/2020/07/firdar_revision-02-2020-07-13.pdf
  // Tables 1–3, pp. 8–13, with the end age of each period.

  it("Birchfield Table 1: the diurnal series and its end ages", () => {
    expect(lords("day")).toEqual(["Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter", "Mars", "North Node", "South Node"]);
    expect(endAges("day")).toEqual([10, 18, 31, 40, 51, 63, 70, 73, 75]);
    expect(lords("day", "bonatti")).toEqual(lords("day", "abu-mashar"));
    // The sub-periods of the first four rows, as printed.
    expect(subLords("day", "Sun")).toEqual(["Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter", "Mars"]);
    expect(subLords("day", "Venus")).toEqual(["Venus", "Mercury", "Moon", "Saturn", "Jupiter", "Mars", "Sun"]);
    expect(subLords("day", "Mercury")).toEqual(["Mercury", "Moon", "Saturn", "Jupiter", "Mars", "Sun", "Venus"]);
    expect(subLords("day", "Moon")).toEqual(["Moon", "Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury"]);
    // The Saturn, Jupiter and Mars rows of Tables 1–3 print Mercury before
    // Venus, against the rule the article quotes (the partner is "the planet
    // which is below it in the celestial circle", and Venus is below the Sun).
    // These fixtures keep the rule; the discrepancy is in the evidence README.
    expect(subLords("day", "Saturn")).toEqual(["Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon"]);
    expect(subLords("day", "Jupiter")).toEqual(["Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon", "Saturn"]);
    expect(subLords("day", "Mars")).toEqual(["Mars", "Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter"]);
  });

  it("Birchfield Table 2: the nocturnal series 'assumed from Bonatti', nodes after Mars", () => {
    expect(lords("night", "bonatti")).toEqual(["Moon", "Saturn", "Jupiter", "Mars", "North Node", "South Node", "Sun", "Venus", "Mercury"]);
    expect(endAges("night", "bonatti")).toEqual([9, 20, 32, 39, 42, 44, 54, 62, 75]);
  });

  it("Birchfield Table 3 and Abu Maʿshar IV.7.24: the nocturnal series with the nodes last", () => {
    expect(lords("night", "abu-mashar")).toEqual(["Moon", "Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "North Node", "South Node"]);
    expect(endAges("night", "abu-mashar")).toEqual([9, 20, 32, 39, 49, 57, 70, 73, 75]);
    // Abu Maʿshar, On the Revolutions of the Years of Nativities IV.7.24, tr.
    // Dykes (2019), quoted by Birchfield p. 3: "the Head and Tail distribute for
    // diurnal nativities after the years of Mars, and for nocturnal nativities
    // after the years of Mercury: and it is when the native enters year 71".
    for (const sect of ["day", "night"] as const) {
      const periods = firdariaPeriods(sect, { variant: "abu-mashar" });
      expect(periods[7]).toMatchObject({ lord: "North Node", startAge: 70, endAge: 73 });
      expect(periods[8]).toMatchObject({ lord: "South Node", startAge: 73, endAge: 75 });
    }
    expect(DEFAULT_FIRDARIA_VARIANT).toBe("abu-mashar");
    expect(lords("night")).toEqual(lords("night", "abu-mashar"));
  });

  it("al-Bīrūnī §§395, 438–439: the same order and years, and the sevenths as he prints them", () => {
    // al-Bīrūnī, The Book of Instruction in the Elements of the Art of
    // Astrology, tr. R. Ramsay Wright (London: Luzac, 1934), archive.org
    // typescript p. 48 (§438): "Dragon's head 3 years, Tail 2 years, whether
    // day or night"; "The Dragon's Head and Tail have no association times";
    // §395 (p. 32): "the first seventh belonging exclusively to the
    // chronocrator of the period, the second to it in partnership with the
    // planet next below it and so on".
    expect(lords("day")).toEqual(["Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter", "Mars", "North Node", "South Node"]);
    expect(lords("night")).toEqual(["Moon", "Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "North Node", "South Node"]);
    expect(firdariaPeriods("day").filter((period) => period.lord.endsWith("Node")).every((period) => period.subPeriods.length === 0)).toBe(true);
    // "Times of association in last six sevenths", in years, 30-day months,
    // days and hours. Printed values that equal one seventh of the period:
    const share = (lord: FirdariaLord) => biruni(FIRDARIA_YEARS[lord] / 7);
    expect(share("Sun")).toBe("1y 5m 4d 7h"); // "1y.5m.4d.7h." (rows 1 and 5)
    expect(share("Moon")).toBe("1y 3m 12d 21h"); // "1y.3m.12d.21h." (rows 1 and 4)
    expect(share("Saturn")).toBe("1y 6m 25d 17h"); // "1y.6m.25d.17h." (rows 2 and 5)
    expect(share("Jupiter")).toBe("1y 8m 17d 3h"); // "1y.8m.17d.3h." (row 6)
    expect(share("Mars")).toBe("1y 0m 0d 0h"); // "1y." (row 7)
    // Printed values that do not: Venus "1y.1m.21d.5h." (rows 2 and 6),
    // Mercury "1y.10m.8d.7h." (row 3) and "1y.10m.8d.17h." (row 7), Jupiter
    // "1y.8m.17d.7h." (row 3) and Mars "1y.10h." (row 4). One seventh is:
    expect(share("Venus")).toBe("1y 1m 21d 10h");
    expect(share("Mercury")).toBe("1y 10m 8d 14h");
  });
});

describe("firdaria invariants", () => {
  it("sum to 75 years, with every lord once and seven equal shares in descending order of the spheres", () => {
    expect(FIRDARIA_CYCLE_YEARS).toBe(75);
    expect(Object.values(FIRDARIA_YEARS).reduce((total, years) => total + years, 0)).toBe(75);
    for (const sect of ["day", "night"] as const) {
      for (const variant of FIRDARIA_VARIANTS) {
        const periods = firdariaPeriods(sect, { variant });
        expect(new Set(periods.map((period) => period.lord)).size).toBe(9);
        expect(periods[0]!.startAge).toBe(0);
        expect(periods.at(-1)!.endAge).toBe(75);
        periods.forEach((period, index) => {
          expect(period.endAge - period.startAge).toBe(FIRDARIA_YEARS[period.lord]);
          if (index > 0) expect(period.startAge).toBe(periods[index - 1]!.endAge);
          if (period.lord === "North Node" || period.lord === "South Node") {
            expect(period.subPeriods).toEqual([]);
            return;
          }
          expect(period.subPeriods).toHaveLength(7);
          expect(period.subPeriods[0]!.lord).toBe(period.lord);
          expect(period.subPeriods[0]!.startAge).toBe(period.startAge);
          expect(period.subPeriods.at(-1)!.endAge).toBe(period.endAge);
          period.subPeriods.forEach((share, position) => {
            expect(share.endAge - share.startAge).toBeCloseTo(period.years / 7, 12);
            if (position > 0) expect(share.startAge).toBe(period.subPeriods[position - 1]!.endAge);
            const expected = CHALDEAN_ORDER[(CHALDEAN_ORDER.indexOf(period.lord as never) + position) % 7];
            expect(share.lord).toBe(expected);
          });
        });
      }
    }
  });

  it("begin a night sequence with the Moon and a day sequence with the Sun, per the chart's sect", () => {
    expect(chartPoints(REEVE).sect).toBe("night");
    expect(chartPoints(KING).sect).toBe("day");
    expect(firdaria(REEVE).periods[0]).toMatchObject({ lord: "Moon", startAge: 0, endAge: 9 });
    expect(firdaria(KING).periods[0]).toMatchObject({ lord: "Sun", startAge: 0, endAge: 10 });
    expect(firdaria(REEVE, { variant: "bonatti" }).periods[4]).toMatchObject({ lord: "North Node", startAge: 39 });
  });

  it("date whole ages at the solar returns and fractional ages linearly within their year", () => {
    const timeline = firdaria(KING);
    const natalSun = sunAt(new Date(KING.utc));
    expect(timeline.periods[0]!.start.toISOString()).toBe("1927-04-27T22:00:00.000Z");
    for (const period of timeline.periods.slice(1)) expect(separation(sunAt(period.start), natalSun)).toBeLessThan(1e-5);
    // Whole ages fall on the same solar returns that begin the profection years.
    expect(timeline.periods[1]!.start).toEqual(profectionYear(KING, 10).start);
    expect(timeline.periods.at(-1)!.end).toEqual(profectionYear(KING, 75).start);
    // The Sun's first share ends 10/7 years in: 3/7 of the way through year 1.
    const first = timeline.periods[0]!.subPeriods[0]!;
    const year1 = profectionYear(KING, 1, { months: "twelfths" });
    const expected = year1.start.getTime() + (3 / 7) * (year1.end.getTime() - year1.start.getTime());
    expect(first.endAge).toBeCloseTo(10 / 7, 12);
    expect(Math.abs(first.end.getTime() - expected)).toBeLessThanOrEqual(1);
    for (const period of timeline.periods) {
      for (const share of period.subPeriods) {
        const middle = new Date((share.start.getTime() + share.end.getTime()) / 2);
        const found = firdariaAt(KING, middle);
        expect(found.period.lord).toBe(period.lord);
        expect(found.subPeriod?.lord).toBe(share.lord);
        expect(found.age).toBeGreaterThan(share.startAge);
        expect(found.age).toBeLessThan(share.endAge);
      }
    }
  });

  it("place boundary instants in the period that begins there, and nodes without a sub-period", () => {
    const timeline = firdaria(REEVE);
    for (const period of timeline.periods) {
      const found = firdariaAt(REEVE, period.start);
      expect(found.period).toEqual(period);
      expect(found.subPeriod).toEqual(period.subPeriods[0] ?? null);
      expect(firdariaAt(REEVE, new Date(period.end.getTime() - 1)).period.lord).toBe(period.lord);
    }
  });

  it("begin again after 75 years", () => {
    const timeline = firdaria(KING, { cycles: 2 });
    expect(timeline.periods).toHaveLength(18);
    expect(timeline.periods[9]).toMatchObject({ lord: "Sun", cycle: 1, startAge: 75, endAge: 85 });
    expect(timeline.periods[8]!.end).toEqual(timeline.periods[9]!.start);
    const later = firdariaAt(KING, new Date(timeline.periods[9]!.subPeriods[2]!.start.getTime() + 86_400_000));
    expect(later.period).toMatchObject({ lord: "Sun", cycle: 1 });
    expect(later.subPeriod?.lord).toBe("Mercury");
    expect(Math.floor(later.age / 75)).toBe(1);
  });
});

describe("firdaria refusals and ownership", () => {
  it("refuse unknown variants, sects, options and cycle counts", () => {
    for (const variant of ["Abu Mashar", "zoller", "", 1] as unknown[]) {
      expect(() => firdariaPeriods("night", { variant: variant as FirdariaVariant })).toThrow(RangeError);
      expect(() => firdariaSequence("day", { variant: variant as FirdariaVariant })).toThrow(/variant must be one of/);
    }
    expect(() => firdariaPeriods("dusk" as Sect)).toThrow(/sect must be/);
    expect(() => firdariaPeriods("day", { variants: "bonatti" } as never)).toThrow(/unknown option/);
    for (const cycles of [0, 5, 1.5, Number.NaN]) expect(() => firdaria(KING, { cycles })).toThrow(RangeError);
  });

  it("refuse charts without a sect and dates before birth", () => {
    expect(() => firdaria({ utc: KING.utc, timeKnown: false })).toThrow(/sect/);
    expect(() => firdariaAt({ utc: KING.utc }, "2000-01-01")).toThrow(/sect/);
    expect(() => firdariaAt(KING, "1927-04-27T21:59:59Z")).toThrow(/must not precede/);
    expect(() => firdariaAt(KING, "1927-02-30")).toThrow(RangeError);
  });

  it("return frozen results", () => {
    const periods = firdariaPeriods("day");
    expect(Object.isFrozen(periods) && Object.isFrozen(periods[0]) && Object.isFrozen(periods[0]!.subPeriods[0])).toBe(true);
    const timeline = firdaria(KING);
    expect(Object.isFrozen(timeline) && Object.isFrozen(timeline.periods) && Object.isFrozen(timeline.periods[3]!.subPeriods)).toBe(true);
    expect(Object.isFrozen(firdariaAt(KING, "1968-04-05T18:41:13Z"))).toBe(true);
    expect(Object.isFrozen(FIRDARIA_YEARS) && Object.isFrozen(FIRDARIA_VARIANTS) && Object.isFrozen(firdariaSequence("night"))).toBe(true);
  });
});
