import { describe, expect, it } from "vitest";

import {
  SIGN_NAMES,
  chartPoints,
  natalChart,
  normalizeLongitude,
  positions,
  type ZodiacSign
} from "../index.js";
import {
  DEFAULT_PROFECTION_MONTHS,
  PROFECTION_MONTH_CONVENTIONS,
  TRADITIONAL_RULERS,
  annualProfection,
  profectionAt,
  profectionYear
} from "../timing.js";

const DAY = 86_400_000;

/** Shortest angular distance in degrees. */
function separation(a: number, b: number): number {
  const difference = Math.abs(normalizeLongitude(a - b));
  return difference > 180 ? 360 - difference : difference;
}

function sunAt(date: Date): number {
  return positions(date).find((row) => row.body === "Sun")!.lon;
}

/**
 * Christopher Reeve's chart (1952-2004) as Hamish Saunders publishes it
 * ("Solar Arc Directions", Astrology House, 1996, p. 3, Figure 1): 25 Sep
 * 1952, 3:12 AM EDT, Manhattan, 40n46'00 73w59'00. A published worked example
 * about a person who has died, used here only to exercise dated profections
 * on a timed chart.
 */
const REEVE = { utc: "1952-09-25T07:12:00Z", latitude: 40 + 46 / 60, longitude: -(73 + 59 / 60) } as const;

describe("annual profections: worked examples, published and invented", () => {
  it("Valens IV.11: the 35th year from Virgo reaches Cancer, and from Scorpio and Capricorn Virgo and Scorpio", () => {
    // Vettius Valens, Anthologies IV.11, tr. Mark T. Riley (2010 PDF), p. 78
    // (Kroll 174, Pingree 165): "sun, Mercury in Aquarius, moon in Scorpio,
    // Saturn in Cancer, Jupiter in Libra, Venus in Capricorn, Mars, Ascendant
    // in Virgo. We are investigating the 35th year. I divide <35> by 12, for a
    // result of 24, remainder 11. ... we find 11 signs from the Ascendant and
    // Mars <in Virgo> to Saturn in Cancer; additionally 11 signs from the moon
    // <in Scorpio> to Mars, or from Venus <in Capricorn> to the moon."
    // The 35th year is age 34; the 11th sign counted inclusively is house 11.
    expect(annualProfection("virgo", 34)).toEqual({ age: 34, origin: { point: null, lon: null, sign: "virgo" }, sign: "cancer", ruler: "Moon", house: 11 });
    expect(annualProfection("scorpio", 34)).toMatchObject({ sign: "virgo", ruler: "Mercury", house: 11 });
    expect(annualProfection("capricorn", 34)).toMatchObject({ sign: "scorpio", ruler: "Mars", house: 11 });
  });

  it("invented charts: the sign, lord and house of the year, counted by hand", () => {
    // Invented ascendants and ages (CONTRIBUTING.md, "Birth data is synthetic
    // by default"). One sign a year from the ascendant; the house is the count
    // inclusive, age mod 12 + 1. 37 = 3 × 12 + 1: one sign on from Taurus is
    // Gemini, Mercury's, house 2.
    expect(annualProfection("taurus", 37)).toEqual({ age: 37, origin: { point: null, lon: null, sign: "taurus" }, sign: "gemini", ruler: "Mercury", house: 2 });
    // 13 = 12 + 1: Scorpio to Sagittarius, Jupiter's, house 2.
    expect(annualProfection("scorpio", 13)).toEqual({ age: 13, origin: { point: null, lon: null, sign: "scorpio" }, sign: "sagittarius", ruler: "Jupiter", house: 2 });
    // 31 = 2 × 12 + 7: seven signs on from Sagittarius is Cancer, the Moon's,
    // house 8; from Capricorn it is Leo, the Sun's.
    expect(annualProfection("sagittarius", 31)).toEqual({ age: 31, origin: { point: null, lon: null, sign: "sagittarius" }, sign: "cancer", ruler: "Moon", house: 8 });
    expect(annualProfection("capricorn", 31)).toMatchObject({ sign: "leo", ruler: "Sun", house: 8 });
    // Two on from Scorpio is Capricorn, Saturn's; ten on from Gemini is Aries,
    // Mars's; 50 = 4 × 12 + 2, two on from Pisces, is Taurus, Venus's.
    expect(annualProfection("scorpio", 2)).toMatchObject({ sign: "capricorn", ruler: "Saturn", house: 3 });
    expect(annualProfection("gemini", 10)).toMatchObject({ sign: "aries", ruler: "Mars", house: 11 });
    expect(annualProfection("pisces", 50)).toMatchObject({ sign: "taurus", ruler: "Venus", house: 3 });
    // From Libra, ages 46 to 50 (46 = 3 × 12 + 10) run Leo to Sagittarius,
    // houses 11, 12, 1, 2 and 3, Scorpio's year under Mars.
    const libra = [46, 47, 48, 49, 50].map((age) => annualProfection("libra", age));
    expect(libra.map((year) => year.house)).toEqual([11, 12, 1, 2, 3]);
    expect(libra.map((year) => year.sign)).toEqual(["leo", "virgo", "libra", "scorpio", "sagittarius"]);
    expect(libra.map((year) => year.ruler)).toEqual(["Sun", "Mercury", "Venus", "Mars", "Jupiter"]);
  });

  it("Brennan ep. 153: the walk-through from a Cancer ascendant", () => {
    // Chris Brennan, "Annual Profections: A Basic Time-Lord Technique", The
    // Astrology Podcast ep. 153 (released 2018-04-24), transcript by Elizabeth
    // Ocean (2019-07-07): https://theastrologypodcast.com/transcripts/ep-153-annual-profections-an-ancient-time-lord-technique/
    // On an imagined chart ("Let’s imagine a chart that has the ascendant in
    // Cancer"): "if you have Cancer rising ... Cancer is activated for the
    // first year of your life ... the moon is also activated as the lord of
    // the year", then "Leo and the sun", "Virgo", "Libra and activating
    // Venus"; "at twelve years old ... comes back to the rising sign"; "12,
    // 24, 36, 48, 60" are first-house years, 18 "is always a seventh house
    // profection year" and 21 "is always a tenth house profection year".
    expect([0, 1, 2, 3].map((age) => [annualProfection("cancer", age).sign, annualProfection("cancer", age).ruler]))
      .toEqual([["cancer", "Moon"], ["leo", "Sun"], ["virgo", "Mercury"], ["libra", "Venus"]]);
    for (const age of [12, 24, 36, 48, 60]) expect(annualProfection("cancer", age)).toMatchObject({ sign: "cancer", house: 1 });
    for (const from of SIGN_NAMES) {
      expect(annualProfection(from, 18).house).toBe(7);
      expect(annualProfection(from, 21).house).toBe(10);
    }
  });
});

describe("dated profections", () => {
  it("turn at the solar return: invented untimed births, days either side of a birthday", () => {
    // Invented births with no time: counting from the Sun needs no birth time,
    // and the house count does not depend on the starting point. Born 11 June
    // 1933, 38 tropical years (13,879.2 days) later is 11 June 1971, so 13 June
    // 1971 is at age 38, a third-house year (38 = 3 × 12 + 2), and 9 June
    // still at 37, the second.
    const june = { utc: "1933-06-11", timeKnown: false } as const;
    const event = profectionAt(june, "1971-06-13T18:30:00Z", { point: "Sun" });
    expect(event.year).toMatchObject({ age: 38, house: 3 });
    expect(event.year.start.getTime()).toBeLessThan(Date.parse("1971-06-13T00:00:00Z"));
    expect(profectionAt(june, "1971-06-09T00:00:00Z", { point: "Sun" }).year).toMatchObject({ age: 37, house: 2 });
    // Born 3 April 1940: on 13 June 1971 age 31, an eighth-house year
    // (31 = 2 × 12 + 7).
    expect(profectionAt({ utc: "1940-04-03", timeKnown: false }, "1971-06-13T18:30:00Z", { point: "Sun" }).year)
      .toMatchObject({ age: 31, house: 8 });
    // Born 14 September 1950: age 25, a second-house year, from the return
    // about 14 September 1975.
    const september = { utc: "1950-09-14", timeKnown: false } as const;
    expect(profectionAt(september, "1975-09-15T12:00:00Z", { point: "Sun" }).year).toMatchObject({ age: 25, house: 2 });
    expect(profectionAt(september, "1975-09-12T12:00:00Z", { point: "Sun" }).year).toMatchObject({ age: 24, house: 1 });
  });

  it("begin each year when the Sun returns to its natal longitude (al-Bīrūnī §§522–524)", () => {
    // al-Bīrūnī, Book of Instruction, tr. R. Ramsay Wright (1934), §§522–524
    // (archive.org typescript p. 119): "Each year the ascendant is ascertained
    // when the sun comes round to the same minute of the ecliptic in which it
    // stood at the birth".
    const natalSun = sunAt(new Date(REEVE.utc));
    const year = profectionYear(REEVE, 42);
    expect(year).toMatchObject({ age: 42, sign: "aquarius", ruler: "Saturn", house: 7 });
    expect(year.origin).toMatchObject({ point: "Ascendant", sign: "leo" });
    expect(separation(sunAt(year.start), natalSun)).toBeLessThan(1e-5);
    expect(separation(sunAt(year.end), natalSun)).toBeLessThan(1e-5);
    // A return is within two hours of 42 tropical years of 365.2422 days.
    const tropical = Date.parse(REEVE.utc) + 42 * 365.2422 * DAY;
    expect(Math.abs(year.start.getTime() - tropical)).toBeLessThan(2 * 3_600_000);
    expect(profectionYear(REEVE, 0).start.toISOString()).toBe("1952-09-25T07:12:00.000Z");
  });

  it("solar months begin each time the Sun gains another 30° on its natal place (a consistency check)", () => {
    // The engine's convention, checked against its own ephemeris. The
    // boundaries are the instants al-Bīrūnī §§522–524 casts monthly
    // revolution charts at, "every month when the sun arrives at the same
    // degree and minute it occupied in the radical or revolutionary figure";
    // he profects by thirteenths. Valens IV.28 (Riley p. 91), in a method
    // quoted from Seuthos, counts "<for day births> ... the distance from the
    // sun at the moment in question to the sun at the nativity", and for night
    // births from the Moon; whether in 30° arcs, as here, or whole signs, it
    // does not say. See docs/timing-hellenistic.md.
    const natalSun = sunAt(new Date(REEVE.utc));
    const year = profectionYear(REEVE, 42, { months: "solar" });
    expect(year.months).toHaveLength(12);
    year.months.forEach((month, index) => {
      expect(separation(sunAt(month.start), natalSun + 30 * index)).toBeLessThan(1e-5);
      expect(month.sign).toBe(SIGN_NAMES[(SIGN_NAMES.indexOf("aquarius") + index) % 12]);
      const days = (month.end.getTime() - month.start.getTime()) / DAY;
      expect(days).toBeGreaterThan(29.3);
      expect(days).toBeLessThan(31.6);
    });
  });

  it("thirteenths: the signs of al-Bīrūnī's thirteen months, on thirteen equal parts of the solar-return year", () => {
    // al-Bīrūnī §§522–524: "each year is divided into (thirteen) months of 28 days
    // 1 hour 51 minutes and a sign to each given, so that the last month ...
    // has the same sign as the first, while the first month of the next year
    // has the same sign as the year". His signs are checked against the
    // engine below. His month length is not the engine's: it is 365/13 days
    // (arithmetic on his figure, not an engine result), and the engine divides
    // the solar-return year instead, so its months are longer by about 27
    // minutes. Ptolemy IV.10's "twenty-eight days to a sign", counted from
    // birth, is a third scheme. See docs/timing-hellenistic.md.
    const biruniMinutes = 28 * 24 * 60 + 60 + 51;
    expect(Math.round((365 / 13) * 24 * 60)).toBe(biruniMinutes);
    const year = profectionYear(REEVE, 42, { months: "thirteenths" });
    const next = profectionYear(REEVE, 43, { months: "thirteenths" });
    expect(year.months.map((month) => month.sign)).toEqual([
      "aquarius", "pisces", "aries", "taurus", "gemini", "cancer", "leo",
      "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius"
    ]);
    expect(next.months[0]!.sign).toBe("pisces");
    const length = year.end.getTime() - year.start.getTime();
    for (const month of year.months) {
      expect(Math.abs(month.end.getTime() - month.start.getTime() - length / 13)).toBeLessThanOrEqual(1);
    }
    // Year 42 of this chart is 365.2441 days, so its months are 28 d 2 h
    // 17.8 min: 26.8 minutes longer than al-Bīrūnī's.
    expect(length / DAY).toBeCloseTo(365.2441, 4);
    expect((length / 13 / 60_000 - biruniMinutes).toFixed(1)).toBe("26.8");
  });

  it("twelfths: twelve equal months of the solar-return year", () => {
    const year = profectionYear(REEVE, 42, { months: "twelfths" });
    const length = year.end.getTime() - year.start.getTime();
    expect(year.months).toHaveLength(12);
    for (const month of year.months) {
      expect(Math.abs(month.end.getTime() - month.start.getTime() - length / 12)).toBeLessThanOrEqual(1);
    }
  });

  it("profect any natal body, angle or chart point", () => {
    const chart = natalChart(REEVE);
    const lot = chartPoints(chart).points.find((point) => point.point === "Lot of Fortune")!;
    const moon = chart.bodies.find((body) => body.body === "Moon")!;
    const at = "1995-05-26T06:02:46Z";
    for (const [point, longitude] of [["Moon", moon.lon], ["Lot of Fortune", lot.lon], ["Midheaven", chart.angles!.mc]] as const) {
      const result = profectionAt(chart, at, { point });
      expect(result.origin).toEqual({ point, lon: normalizeLongitude(longitude), sign: SIGN_NAMES[Math.floor(normalizeLongitude(longitude) / 30)] });
      expect(result.year).toMatchObject({ age: 42, house: 7, sign: annualProfection(longitude, 42).sign });
    }
  });

  it("place a date in the same year and month profectionYear lists", () => {
    for (const months of PROFECTION_MONTH_CONVENTIONS) {
      const year = profectionYear(REEVE, 30, { months });
      for (const month of year.months) {
        const middle = new Date((month.start.getTime() + month.end.getTime()) / 2);
        for (const at of [month.start, middle, new Date(month.end.getTime() - 1)]) {
          const found = profectionAt(REEVE, at, { months });
          expect(found.year).toEqual({ age: 30, sign: year.sign, ruler: year.ruler, house: year.house, start: year.start, end: year.end });
          expect(found.month).toEqual(month);
          expect(found.conventions).toEqual({ year: "solar-return", months, rulers: "traditional-domicile" });
        }
      }
    }
    expect(DEFAULT_PROFECTION_MONTHS).toBe("solar");
    expect(profectionAt(REEVE, "1990-01-01").conventions.months).toBe("solar");
  });
});

describe("profection invariants", () => {
  it("repeat every twelve years and name the traditional ruler (Valens IV.11: 'every 12 years')", () => {
    // Valens IV.11 (Riley p. 79): "The same transmissions are indicated every 12 years."
    for (let from = 0; from < 360; from += 7.5) {
      for (let age = 0; age <= 120; age += 1) {
        const result = annualProfection(from, age);
        expect(annualProfection(from, age + 12).sign).toBe(result.sign);
        expect(result.house).toBe((age % 12) + 1);
        expect(result.ruler).toBe(TRADITIONAL_RULERS[result.sign]);
        expect(SIGN_NAMES.indexOf(result.sign)).toBe((Math.floor(from / 30) + age) % 12);
      }
    }
  });

  it("tile each year with contiguous months under every convention", () => {
    for (const months of PROFECTION_MONTH_CONVENTIONS) {
      for (const age of [0, 1, 17, 64]) {
        const year = profectionYear(REEVE, age, { months });
        expect(year.months).toHaveLength(months === "thirteenths" ? 13 : 12);
        expect(year.months[0]!.start).toEqual(year.start);
        expect(year.months.at(-1)!.end).toEqual(year.end);
        year.months.forEach((month, index) => {
          expect(month.index).toBe(index);
          expect(month.house).toBe(((age + index) % 12) + 1);
          if (index > 0) expect(month.start).toEqual(year.months[index - 1]!.end);
        });
        expect(profectionYear(REEVE, age + 1, { months }).start).toEqual(year.end);
      }
    }
  });

  it("have 12 solar-return years in 12 tropical years to within a few hours", () => {
    const first = profectionYear(REEVE, 12, { months: "twelfths" });
    const years = (first.start.getTime() - Date.parse(REEVE.utc)) / (365.2422 * DAY);
    expect(years).toBeCloseTo(12, 3);
  });
});

describe("profection refusals and ownership", () => {
  it("refuse invalid ages, signs and longitudes", () => {
    for (const age of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "3" as unknown as number]) {
      expect(() => annualProfection("aries", age)).toThrow(RangeError);
    }
    for (const from of ["Aries", "ARIES", "ophiuchus", "", Number.NaN, Number.NEGATIVE_INFINITY, null as unknown as number]) {
      expect(() => annualProfection(from as ZodiacSign, 1)).toThrow(RangeError);
    }
    expect(annualProfection(-30, 0).origin).toEqual({ point: null, lon: 330, sign: "pisces" });
    expect(annualProfection(725, 0).origin).toEqual({ point: null, lon: 5, sign: "aries" });
  });

  it("refuse unknown conventions, points, options and dates before birth", () => {
    expect(() => profectionAt(REEVE, "1990-01-01", { months: "lunar" as never })).toThrow(/months must be one of/);
    expect(() => profectionAt(REEVE, "1990-01-01", { point: "Chiron" as never })).toThrow(RangeError);
    expect(() => profectionAt(REEVE, "1990-01-01", { point: "ascendant" as never })).toThrow(RangeError);
    expect(() => profectionAt(REEVE, "1990-01-01", { month: "solar" } as never)).toThrow(/unknown option/);
    expect(() => profectionAt(REEVE, "1990-01-01", [] as never)).toThrow(RangeError);
    expect(() => profectionAt(REEVE, "1952-09-25T07:11:59Z")).toThrow(/must not precede/);
    expect(() => profectionAt(REEVE, "not a date")).toThrow(RangeError);
    expect(() => profectionYear(REEVE, -1)).toThrow(RangeError);
    expect(() => profectionYear(REEVE, 2.5)).toThrow(RangeError);
    // No birth time (Reeve's date, untimed): no Ascendant and no lots, but the
    // bodies remain.
    const untimed = { utc: "1952-09-25", timeKnown: false } as const;
    expect(() => profectionAt(untimed, "1990-01-01")).toThrow(/needs a chart with a birth time and place/);
    expect(() => profectionAt(untimed, "1990-01-01", { point: "Lot of Fortune" })).toThrow(/birth time and place/);
    expect(profectionAt(untimed, "1990-01-01", { point: "Moon" }).year.age).toBe(37);
  });

  it("return frozen results with fresh Dates", () => {
    const year = profectionYear(REEVE, 3);
    expect(Object.isFrozen(year)).toBe(true);
    expect(Object.isFrozen(year.origin)).toBe(true);
    expect(Object.isFrozen(year.months)).toBe(true);
    expect(Object.isFrozen(year.months[0])).toBe(true);
    expect(Object.isFrozen(year.conventions)).toBe(true);
    const at = profectionAt(REEVE, "1990-01-01");
    expect(Object.isFrozen(at) && Object.isFrozen(at.year) && Object.isFrozen(at.month)).toBe(true);
    expect(Object.isFrozen(annualProfection("aries", 1))).toBe(true);
    year.start.setTime(0);
    expect(profectionYear(REEVE, 3).start.getTime()).not.toBe(0);
    expect(Object.isFrozen(PROFECTION_MONTH_CONVENTIONS) && Object.isFrozen(TRADITIONAL_RULERS)).toBe(true);
  });
});
