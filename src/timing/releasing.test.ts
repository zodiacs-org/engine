import { describe, expect, it } from "vitest";

import {
  SIGN_SLUGS,
  chartPoints,
  type ZodiacSign
} from "../index.js";
import {
  DEFAULT_RELEASING_YEARS,
  RELEASING_CYCLE_UNITS,
  RELEASING_UNIT_DAYS,
  RELEASING_YEAR_CONVENTIONS,
  TRADITIONAL_RULERS,
  VALENS_MINOR_YEARS,
  releasingAt,
  releasingPeriods,
  zodiacalReleasing,
  zodiacalReleasingAt,
  type ReleasingLevel,
  type ReleasingPeriod,
  type ReleasingYearConvention
} from "../timing.js";

const DAY = 86_400_000;
/** An arbitrary birth instant for sign-level examples: elapsed time is all that matters. */
const BIRTH = "2000-01-01T00:00:00Z";
const BIRTH_MS = Date.parse(BIRTH);
const afterDays = (days: number) => new Date(BIRTH_MS + days * DAY);

function level(periods: readonly ReleasingPeriod[], wanted: ReleasingLevel): ReleasingPeriod[] {
  return periods.filter((period) => period.level === wanted);
}

/** Sub-periods of the period that starts with `parent`, in the pre-order list. */
function childrenOf(periods: readonly ReleasingPeriod[], parent: ReleasingPeriod): ReleasingPeriod[] {
  const index = periods.indexOf(parent);
  const out: ReleasingPeriod[] = [];
  for (let next = index + 1; next < periods.length && periods[next]!.level > parent.level; next += 1) {
    if (periods[next]!.level === parent.level + 1) out.push(periods[next]!);
  }
  return out;
}

const months = (period: ReleasingPeriod) => (period.endDays - period.startDays) / 30;
const summary = (period: ReleasingPeriod) => [period.sign, period.ruler, months(period)];

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

describe("zodiacal releasing: Valens's worked examples", () => {
  // Vettius Valens, Anthologies, tr. Mark T. Riley (unpublished PDF, 2010),
  // Book IV, pp. 71–77; https://www.skyscript.co.uk/valens_riley.html (the copy
  // used is the csus.edu PDF archived by the Wayback Machine, 2016-02-17).

  it("IV.6 and IV.10: the years of each sign and their months, days and hours", () => {
    // IV.6 (p. 73): "Aquarius allots 30 years, Capricorn 27." The rest are the
    // minor years of the rulers (IV.1, p. 71).
    expect(VALENS_MINOR_YEARS).toEqual({
      aries: 15, taurus: 8, gemini: 20, cancer: 25, leo: 19, virgo: 20,
      libra: 8, scorpio: 15, sagittarius: 12, capricorn: 27, aquarius: 30, pisces: 12
    });
    expect(Object.values(VALENS_MINOR_YEARS).reduce((total, years) => total + years, 0)).toBe(RELEASING_CYCLE_UNITS);
    // IV.10 (p. 76): "Star Years Months Days Days+Hours": Sun 19 19 47½ "3 days
    // 23 hours"; Moon 25 25 62½ "5 days 5 hours"; Saturn 30 30 75 "6 days 6
    // hours"; Capricorn 27 27 67½ "5 days 15 hours"; Jupiter 12 12 30 "2 days
    // 12 hours"; Mars 15 15 37½ "3 days 3 hours"; Venus 8 8 20 "1 day 16
    // hours"; Mercury 20 20 50 "4 days 4 hours".
    const table: [ZodiacSign, number, number, number][] = [
      ["leo", 19, 47.5, 3 * 24 + 23], ["cancer", 25, 62.5, 5 * 24 + 5], ["aquarius", 30, 75, 6 * 24 + 6],
      ["capricorn", 27, 67.5, 5 * 24 + 15], ["sagittarius", 12, 30, 2 * 24 + 12], ["aries", 15, 37.5, 3 * 24 + 3],
      ["taurus", 8, 20, 24 + 16], ["gemini", 20, 50, 4 * 24 + 4]
    ];
    const [year, month, day, hour] = RELEASING_UNIT_DAYS["valens-360"];
    for (const [sign, years, days, hours] of table) {
      expect(VALENS_MINOR_YEARS[sign] * year).toBe(years * 360);
      expect(VALENS_MINOR_YEARS[sign] * month).toBe(years * 30);
      expect(VALENS_MINOR_YEARS[sign] * day).toBe(days);
      expect(VALENS_MINOR_YEARS[sign] * hour * 24).toBeCloseTo(hours, 9);
    }
  });

  it("IV.4: Aries allots 15 years and fills them with months, Aquarius taking the remaining 11", () => {
    // IV.4 (p. 72): "Mars itself allots 15 years first, and from this period it
    // assigns itself 15 months. Next (because of Taurus) it assigns 8 months to
    // Venus, next (because of Gemini) 20 months to Mercury, next (because of
    // Cancer) 25 months to the moon, next (because of Leo) 19 months to the
    // sun, next 20 months to Mercury, next 8 months to Venus, next (because of
    // Scorpio) Mars assigns itself 15, next (because of Sagittarius) 12 to
    // Jupiter, next (because of Capricorn) 2 years 3 months to Saturn. Next it
    // assigns to Aquarius the remaining 11 months to fill out the 15 years.
    // Now Venus receives from Mars the overall chronocratorship for 8 years
    // ... Mercury receives 20 years ... the moon with its 25 years, then the
    // sun with its 19."
    const { periods } = releasingPeriods("aries", BIRTH, BIRTH, afterDays(89 * 360), { levels: 2 });
    expect(level(periods, 1).map((period) => [period.sign, period.ruler, period.endDays / 360])).toEqual([
      ["aries", "Mars", 15], ["taurus", "Venus", 23], ["gemini", "Mercury", 43], ["cancer", "Moon", 68], ["leo", "Sun", 87], ["virgo", "Mercury", 107]
    ]);
    const aries = childrenOf(periods, level(periods, 1)[0]!);
    expect(aries.map(summary)).toEqual([
      ["aries", "Mars", 15], ["taurus", "Venus", 8], ["gemini", "Mercury", 20], ["cancer", "Moon", 25],
      ["leo", "Sun", 19], ["virgo", "Mercury", 20], ["libra", "Venus", 8], ["scorpio", "Mars", 15],
      ["sagittarius", "Jupiter", 12], ["capricorn", "Saturn", 27], ["aquarius", "Saturn", 11]
    ]);
    expect(aries.at(-1)).toMatchObject({ truncated: true, units: 30, endDays: 15 * 360 });
    expect(aries.slice(0, -1).every((period) => !period.truncated && !period.loosingOfTheBond)).toBe(true);
  });

  it("IV.4: after 17 years 7 months of Gemini's 20 the months continue from the opposite sign", () => {
    // IV.4 (p. 72): "since the circle of the 12 signs has comprised 17 years 7
    // months, we will allot the remaining time using the signs in opposition:
    // since Gemini allots 20 years, if the vital sector begins there and if 17
    // years 7 months have been assigned, the remaining 2 years 5 months are
    // allotted beginning with Sagittarius, giving Sagittarius itself 1 year
    // <=12 months>, the rest to Capricorn to complete the 20 years."
    const { periods } = releasingPeriods("gemini", BIRTH, BIRTH, afterDays(19 * 360), { levels: 2 });
    const gemini = childrenOf(periods, level(periods, 1)[0]!);
    expect(gemini.map((period) => period.sign)).toEqual([
      "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces", "aries", "taurus",
      "sagittarius", "capricorn"
    ]);
    expect(gemini[12]).toMatchObject({ sign: "sagittarius", loosingOfTheBond: true, startDays: 211 * 30, endDays: 223 * 30 });
    expect(gemini[13]).toMatchObject({ sign: "capricorn", truncated: true, loosingOfTheBond: false, endDays: 240 * 30 });
    expect(months(gemini[13]!)).toBe(17);
    // "In a similar manner, if we find the vital sector beginning with Cancer,
    // Leo, Virgo, Capricorn, or Aquarius ... beginning with the sign in
    // opposition": only periods longer than 211 months loosen.
    const loosening = SIGN_SLUGS.filter((sign) => {
      const all = releasingPeriods(sign, BIRTH, BIRTH, afterDays(VALENS_MINOR_YEARS[sign] * 360 - 1), { levels: 2 }).periods;
      return all.some((period) => period.loosingOfTheBond);
    });
    expect(loosening).toEqual(["gemini", "cancer", "leo", "virgo", "capricorn", "aquarius"]);
  });

  it("IV.8: 'A Compelling Example' from Fortune in Leo and Daimon (Spirit) in Scorpio", () => {
    // IV.8 (p. 75): "the Lot of Fortune in Leo, Daimon in Scorpio. ... I count
    // the chronocratorships relevant to health from Leo ..., first giving Leo
    // 19 years, then Virgo 20, then Libra 8, then Scorpio 15. The total is 62
    // years. ... I count off the remaining 8 years in Sagittarius ... He gave
    // Sagittarius 1 year, Capricorn 2 years 3 months, Aquarius 2 years 6
    // months, Pisces 1 year, then Aries ... Mars, the current ruler of the
    // chronocratorship for health, brings death".
    const fortune = releasingPeriods("leo", BIRTH, BIRTH, afterDays(70 * 360), { levels: 2 }).periods;
    expect(level(fortune, 1).map((period) => [period.sign, period.startDays / 360])).toEqual([
      ["leo", 0], ["virgo", 19], ["libra", 39], ["scorpio", 47], ["sagittarius", 62]
    ]);
    const sagittarius = childrenOf(fortune, level(fortune, 1)[4]!);
    expect(sagittarius.slice(0, 5).map(summary)).toEqual([
      ["sagittarius", "Jupiter", 12], ["capricorn", "Saturn", 27], ["aquarius", "Saturn", 30], ["pisces", "Jupiter", 12], ["aries", "Mars", 15]
    ]);
    // Riley's gloss gives Aries "<2 years 3 months>"; Aries allots 15 months,
    // from 68 years 9 months to 70. The death at 69 years 4 months falls in it.
    expect(sagittarius[4]).toMatchObject({ startDays: (68 * 12 + 9) * 30, endDays: 70 * 360 });
    expect(releasingAt("leo", BIRTH, afterDays((69 * 12 + 4) * 30)).periods[1]).toMatchObject({ sign: "aries", ruler: "Mars" });
    // "I considered the chronocratorships for occupations, beginning with
    // Scorpio <=Daimon>, giving Mars ... 15 years, then Sagittarius 12 years
    // ... Until age 27 ... Next Capricorn received the distribution of 27 years
    // ... Aquarius received the distribution of the chronocratorship <at age
    // 54> ... Aquarius took 2 years 6 months, then Jupiter 1 year, then Mars 1
    // year 3 months, then Venus 8 months, then Mercury 1 year 8 months. ...
    // Next the moon received 2 years 1 month. ... Next the sun received 1 year
    // 7 months in Leo, and Mercury 1 year 8 months in Virgo. ... Venus received
    // 8 months, then Mars 1 years 3 months, then Sagittarius 1 year. This was
    // the end <69 years 4 months>."
    const spirit = releasingPeriods("scorpio", BIRTH, BIRTH, afterDays((69 * 12 + 4) * 30 - 1), { levels: 2 }).periods;
    expect(level(spirit, 1).map((period) => [period.sign, period.startDays / 360, period.endDays / 360])).toEqual([
      ["scorpio", 0, 15], ["sagittarius", 15, 27], ["capricorn", 27, 54], ["aquarius", 54, 84]
    ]);
    const aquarius = childrenOf(spirit, level(spirit, 1)[3]!);
    expect(aquarius.map(summary)).toEqual([
      ["aquarius", "Saturn", 30], ["pisces", "Jupiter", 12], ["aries", "Mars", 15], ["taurus", "Venus", 8],
      ["gemini", "Mercury", 20], ["cancer", "Moon", 25], ["leo", "Sun", 19], ["virgo", "Mercury", 20],
      ["libra", "Venus", 8], ["scorpio", "Mars", 15], ["sagittarius", "Jupiter", 12]
    ]);
    expect(aquarius.at(-1)!.endDays).toBe((69 * 12 + 4) * 30);
  });

  it("IV.9: a native 32 Alexandrian years and 215 days old is 33 releasing years and 23 days old", () => {
    // IV.9 (pp. 75–76): "the universal year has 365 1/4 days, while the year
    // with respect to the distribution has 360 ... a person in his 33rd year
    // was born on Tybi 15; we are investigating Mesori 20 of his 33rd year.
    // ... the nativity will be in its 33rd full year with respect to the
    // distribution, plus 23 days." 32 Alexandrian years are 32 × 365 + 8 days.
    const elapsed = 32 * 365 + 8 + 215;
    const found = releasingAt("aries", BIRTH, afterDays(elapsed));
    expect(found.elapsedDays).toBe(11_903);
    expect(Math.floor(found.elapsedYears)).toBe(33);
    expect(found.elapsedDays - 33 * 360).toBe(23);
  });

  it("IV.10: four levels from Fortune in Pisces at 2 years 11 months plus 255 days", () => {
    // IV.10 (p. 76): "Let the vital sector start at the Lot of Fortune in
    // Pisces. ... I have assigned 1 year <=12 months> to Pisces, 1 year 3 month
    // to Aries, 8 months to Taurus. The total so far is 2 years 11 months.
    // Then the allotment passes to Mercury, 1 year 8 months ... so let Mercury
    // be the chronocrator for a period of 8 months 15 days, a total of 255
    // days. ... First Mercury gives to itself (i.e. to Gemini) 50 days, then to
    // Cancer 62 1/2 days, then to Leo 47 1/2 days, then to Virgo 50 days, then
    // to Libra 20 days. The total so far is 230 days, with 25 remaining. Now
    // Mars will have these 25 days in Scorpio ... First it allots to itself 3
    // days 3 hours, then to Sagittarius 2 1/2 days, then to Capricorn 5 days 15
    // hours, then to Aquarius 6 days 6 hours, then to Pisces 2 1/2 days, then
    // to Aries 3 days 3 hours, and to Taurus the rest <1 day 21 hours> to
    // complete the 25 days. The overall chronocrator is Jupiter <Pisces>; the
    // second is Mercury <Gemini> ...; the third is Mars <Scorpio> ...; the
    // fourth is Venus <Taurus>".
    const target = 35 * 30 + 255;
    const found = releasingAt("pisces", BIRTH, afterDays(target));
    expect(found.periods.map((period) => [period.sign, period.ruler, period.startDays])).toEqual([
      ["pisces", "Jupiter", 0],
      ["gemini", "Mercury", 35 * 30],
      ["scorpio", "Mars", 35 * 30 + 230],
      // Valens counts whole days. Taurus allots 1 day 16 hours at the fourth
      // level (his own table): from 253 d 3 h to 254 d 19 h into Mercury's
      // period. Through the first 19 hours of the 255th day the fourth
      // chronocrator is Venus <Taurus>, as he says; at 255 days complete it
      // has been Mercury <Gemini> for 5 hours. See the evidence README.
      ["gemini", "Mercury", 35 * 30 + 230 + 25 - 5 / 24]
    ]);
    expect(releasingAt("pisces", BIRTH, afterDays(target - 0.5)).periods[3])
      .toMatchObject({ sign: "taurus", ruler: "Venus", startDays: 35 * 30 + 230 + 23.125 });
    const window = releasingPeriods("pisces", BIRTH, BIRTH, afterDays(target), { levels: 4 }).periods;
    expect(childrenOf(window, level(window, 1)[0]!).map((period) => [period.sign, months(period)])).toEqual([
      ["pisces", 12], ["aries", 15], ["taurus", 8], ["gemini", 20]
    ]);
    const gemini = level(window, 2).find((period) => period.sign === "gemini")!;
    const days = childrenOf(window, gemini);
    expect(days.map((period) => [period.sign, period.endDays - period.startDays])).toEqual([
      ["gemini", 50], ["cancer", 62.5], ["leo", 47.5], ["virgo", 50], ["libra", 20], ["scorpio", 37.5]
    ]);
    const scorpio = days.at(-1)!;
    expect(childrenOf(window, scorpio).map((period) => [period.sign, Math.round((period.endDays - period.startDays) * 24 * 1e6) / 1e6])).toEqual([
      ["scorpio", 75], ["sagittarius", 60], ["capricorn", 135], ["aquarius", 150], ["pisces", 60], ["aries", 75], ["taurus", 40], ["gemini", 100]
    ]);
  });

  it("IV.10: days and hours loosen after their own rounds of 527½ days and 1,055 hours", () => {
    // IV.10 (p. 77): "when you have completed the whole cycle of days (=528),
    // it is necessary to begin the remaining days starting with the sign in
    // opposition. In the same way for the lesser time-periods ... after the
    // completion of the cycle of days and hours (=44), count off the remaining
    // days and hours in the order of the signs from the sign in opposition."
    const periods = releasingPeriods("capricorn", BIRTH, BIRTH, afterDays(27 * 30), { levels: 4 }).periods;
    const capricornMonths = level(periods, 2)[0]!;
    const days = childrenOf(periods, capricornMonths);
    expect(days.map((period) => period.sign)).toEqual([
      "capricorn", "aquarius", "pisces", "aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius",
      "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn"
    ]);
    expect(days[12]).toMatchObject({ loosingOfTheBond: true, startDays: 527.5 });
    expect(days.at(-1)).toMatchObject({ truncated: true, endDays: 810 });
    const hours = childrenOf(periods, days[0]!);
    expect(hours[12]).toMatchObject({ sign: "cancer", loosingOfTheBond: true });
    expect(hours[12]!.startDays * 24).toBeCloseTo(1055, 9);
    expect(hours.at(-1)).toMatchObject({ sign: "capricorn", truncated: true, endDays: 67.5 });
  });
});

describe("zodiacal releasing: Brennan and Schaim's conventions, on invented charts", () => {
  // Chris Brennan and Leisa Schaim, "Zodiacal Releasing: An Ancient Timing
  // Technique", The Astrology Podcast ep. 192 (released 2019-02-11),
  // transcript by Teresa "Peri" Lardo (2021-06-16, updated 2024-02-21):
  // https://theastrologypodcast.com/transcripts/ep-192-transcript-zodiacal-releasing-an-ancient-timing-technique/
  // The episode dates its examples on living people's charts, which the tests
  // do not use (CONTRIBUTING.md, "Birth data is synthetic by default"). The
  // births below are invented, and their dates are counted by hand in
  // 360-day years and 30-day months.

  it("an invented birth with Spirit in Scorpio: Capricorn from 27 years, its loosing of the bond to Cancer", () => {
    // Born 1961-08-17 (invented; any hour of that UT day gives the same
    // dates). Level 1: Scorpio 15 years (5,400 days) to 1976-05-30,
    // Sagittarius 12 (4,320) to 1988-03-28, Capricorn 27 (9,720) to
    // 2014-11-07. Within Capricorn, level 2 starts with Capricorn's 27 months
    // (810 days) to 1990-06-16, and after the twelve signs' 211 months (6,330
    // days, to 2005-07-27) jumps to Cancer, the sign opposite, for its 25
    // months (750 days) to 2007-08-16.
    const { periods } = releasingPeriods("scorpio", "1961-08-17", "1961-08-17", "2008-12-31", { levels: 2 });
    const day = (date: Date) => date.toISOString().slice(0, 10);
    expect(level(periods, 1).map((period) => [period.sign, day(period.start), day(period.end)])).toEqual([
      ["scorpio", "1961-08-17", "1976-05-30"],
      ["sagittarius", "1976-05-30", "1988-03-28"],
      ["capricorn", "1988-03-28", "2014-11-07"]
    ]);
    const capricorn = childrenOf(periods, level(periods, 1)[2]!);
    expect([capricorn[0]!.sign, day(capricorn[0]!.start), day(capricorn[0]!.end)]).toEqual(["capricorn", "1988-03-28", "1990-06-16"]);
    const loosing = capricorn.find((period) => period.loosingOfTheBond)!;
    expect([loosing.sign, day(loosing.start), day(loosing.end)]).toEqual(["cancer", "2005-07-27", "2007-08-16"]);
    expect(capricorn.indexOf(loosing)).toBe(12);
  });

  it("an invented birth with Spirit in Virgo and Fortune in Aquarius: both loosen 211 months in, 17.3 years", () => {
    // "it’s always about 17-and-a-half years into the general period": the
    // twelve signs' 211 months, 6,330 days, are 17 7/12 years of 360 days and
    // 17.33 of 365.25. Virgo's 20 years and Aquarius's 30 both outlast them.
    // Born 1970-02-09 (invented).
    for (const [lot, opposite] of [["virgo", "pisces"], ["aquarius", "leo"]] as const) {
      const { periods } = releasingPeriods(lot, "1970-02-09", "1970-02-09", "1990-01-01", { levels: 2 });
      const loosing = periods.find((period) => period.loosingOfTheBond)!;
      expect(loosing).toMatchObject({ level: 2, sign: opposite, startDays: 211 * 30 });
      expect(loosing.start.toISOString()).toBe("1987-06-10T00:00:00.000Z");
      const age = loosing.startDays / 365.25;
      expect(age).toBeGreaterThan(17);
      expect(age).toBeLessThan(18);
      expect(loosing.startDays / 360).toBeCloseTo(17 + 7 / 12, 12);
    }
  });

  it("uses 360-day years and 30-day months by default ('360-day years and 30-day months')", () => {
    expect(DEFAULT_RELEASING_YEARS).toBe("valens-360");
    expect(RELEASING_UNIT_DAYS["valens-360"]).toEqual([360, 30, 2.5, 5 / 24]);
    const first = releasingAt("cancer", BIRTH, BIRTH).periods;
    expect(first.map((period) => period.endDays)).toEqual([25 * 360, 25 * 30, 25 * 2.5, first[3]!.endDays]);
    expect(first[3]!.endDays * 24).toBeCloseTo(125, 9);
  });
});

describe("zodiacal releasing from a chart's lots", () => {
  // Hamish Saunders, "Solar Arc Directions" (Astrology House, 1996), prints
  // each chart's Lot of Fortune: Christopher Reeve (1952-2004) 8°42' Gemini
  // (p. 3, Figure 1), Coretta Scott King (1927-2006) 15°46' Leo (p. 4,
  // Figure 2).
  const REEVE = { utc: "1952-09-25T07:12:00Z", latitude: 40 + 46 / 60, longitude: -(73 + 59 / 60) } as const;
  const KING = { utc: "1927-04-27T22:00:00Z", latitude: 32 + 37 / 60 + 56 / 3600, longitude: -(87 + 19 / 60 + 9 / 3600) } as const;

  it("starts from chartPoints' lot, which matches the published Fortune", () => {
    for (const [birth, sign, longitude] of [[REEVE, "gemini", 60 + 8 + 42 / 60], [KING, "leo", 120 + 15 + 46 / 60]] as const) {
      const result = zodiacalReleasing(birth, "Lot of Fortune", birth.utc, birth.utc, { levels: 1 });
      const lot = chartPoints(birth).points.find((point) => point.point === "Lot of Fortune")!;
      expect(result.origin).toEqual({ point: "Lot of Fortune", lon: lot.lon, sign });
      expect(Math.abs(lot.lon - longitude) * 60).toBeLessThan(1.5);
      expect(result.periods[0]).toMatchObject({ level: 1, sign, startDays: 0, endDays: VALENS_MINOR_YEARS[sign] * 360 });
      expect(result.birth.toISOString()).toBe(new Date(birth.utc).toISOString());
    }
    const spirit = chartPoints(REEVE).points.find((point) => point.point === "Lot of Spirit")!;
    const at = zodiacalReleasingAt(REEVE, "Lot of Spirit", "1995-05-26T06:02:46Z");
    expect(at.origin).toEqual({ point: "Lot of Spirit", lon: spirit.lon, sign: "libra" });
    expect(at.periods).toEqual(releasingAt(spirit.lon, REEVE.utc, "1995-05-26T06:02:46Z").periods);
  });
});

describe("zodiacal releasing invariants", () => {
  it("tile every period exactly with its sub-periods, loosening at most once and only after a full round", () => {
    const next = random(20260928);
    const whole = [0, 0, 0, 0];
    const loosenedAt = [0, 0, 0, 0];
    // Windows sized so that whole periods of each parent level fall inside them.
    const shapes: { levels: ReleasingLevel; spanDays: number }[] = [
      { levels: 2, spanDays: 90 * 365 },
      { levels: 3, spanDays: 12 * 365 },
      { levels: 4, spanDays: 400 }
    ];
    for (let trial = 0; trial < 90; trial += 1) {
      const sign = SIGN_SLUGS[Math.floor(next() * 12)]!;
      const years = RELEASING_YEAR_CONVENTIONS[trial % 2]!;
      const unit = RELEASING_UNIT_DAYS[years];
      const { levels, spanDays } = shapes[trial % 3]!;
      const fromDays = next() * 60 * 365;
      const fromMs = BIRTH_MS + fromDays * DAY;
      const { periods } = releasingPeriods(sign, BIRTH, afterDays(fromDays), afterDays(fromDays + spanDays * (0.5 + next() / 2)), { levels, years });
      for (const parent of periods) {
        if (parent.level === levels) continue;
        const children = childrenOf(periods, parent);
        // Only parents wholly inside the window list all their sub-periods.
        if (parent.start.getTime() < fromMs || children.at(-1)?.end.getTime() !== parent.end.getTime()) continue;
        whole[parent.level - 1]! += 1;
        expect(children[0]!.start).toEqual(parent.start);
        expect(children[0]!.sign).toBe(parent.sign);
        let loosened = 0;
        children.forEach((child, index) => {
          expect(child.units).toBe(VALENS_MINOR_YEARS[child.sign]);
          expect(child.ruler).toBe(TRADITIONAL_RULERS[child.sign]);
          const length = child.endDays - child.startDays;
          if (index < children.length - 1) {
            expect(child.truncated).toBe(false);
            expect(length).toBeCloseTo(child.units * unit[child.level - 1]!, 9);
            expect(children[index + 1]!.start).toEqual(child.end);
          } else {
            expect(length).toBeLessThanOrEqual(child.units * unit[child.level - 1]! + 1e-9);
          }
          if (index === 0) return;
          const previous = SIGN_SLUGS.indexOf(children[index - 1]!.sign);
          if (child.loosingOfTheBond) {
            loosened += 1;
            expect(index).toBe(12);
            expect(child.sign).toBe(SIGN_SLUGS[(SIGN_SLUGS.indexOf(parent.sign) + 6) % 12]);
          } else {
            expect(child.sign).toBe(SIGN_SLUGS[(previous + 1) % 12]);
          }
        });
        // A parent loosens exactly when it outlasts one round of 211 sub-units.
        const childUnitDays = (unit as readonly number[])[parent.level]!;
        const parentUnits = (parent.endDays - parent.startDays) / childUnitDays;
        expect(loosened).toBe(parentUnits > RELEASING_CYCLE_UNITS + 1e-9 ? 1 : 0);
        loosenedAt[parent.level - 1]! += loosened;
        const total = children.reduce((sum, child) => sum + (child.end.getTime() - child.start.getTime()), 0);
        expect(total).toBe(parent.end.getTime() - parent.start.getTime());
      }
    }
    // Whole parents of levels 1 to 3 were checked, loosened ones at each level.
    expect(whole.slice(0, 3).every((count) => count > 10)).toBe(true);
    expect(loosenedAt.slice(0, 3).every((count) => count > 0)).toBe(true);
  });

  it("run level 1 on through the signs without loosening, a full round taking 211 years", () => {
    for (const years of RELEASING_YEAR_CONVENTIONS) {
      const unit = RELEASING_UNIT_DAYS[years][0];
      const { periods } = releasingPeriods("libra", BIRTH, BIRTH, afterDays(212 * unit), { levels: 1, years });
      expect(periods).toHaveLength(13);
      periods.forEach((period, index) => {
        expect(period.sign).toBe(SIGN_SLUGS[(6 + index) % 12]);
        expect(period.loosingOfTheBond || period.truncated).toBe(false);
        if (index > 0) expect(period.start).toEqual(periods[index - 1]!.end);
      });
      expect(periods[12]!.startDays).toBeCloseTo(211 * unit, 6);
    }
  });

  it("find the same four periods at an instant as in any window around it", () => {
    const next = random(7);
    for (let trial = 0; trial < 40; trial += 1) {
      const sign = SIGN_SLUGS[trial % 12]!;
      const years: ReleasingYearConvention = trial % 3 === 0 ? "julian-365.25" : "valens-360";
      const at = afterDays(next() * 90 * 365);
      const found = releasingAt(sign, BIRTH, at, { years });
      const window = releasingPeriods(sign, BIRTH, new Date(at.getTime() - 3 * DAY), new Date(at.getTime() + 3 * DAY), { levels: 4, years });
      const containing = window.periods.filter((period) => period.start.getTime() <= at.getTime() && at.getTime() < period.end.getTime());
      expect(found.periods).toEqual(containing);
      expect(found.elapsedYears).toBeCloseTo(found.elapsedDays / RELEASING_UNIT_DAYS[years][0], 12);
    }
  });

  it("scale every level by 365.25/360 in the Julian convention", () => {
    const julian = releasingAt("aries", BIRTH, BIRTH, { years: "julian-365.25" }).periods;
    julian.forEach((period, index) => expect(period.endDays).toBeCloseTo(15 * RELEASING_UNIT_DAYS["julian-365.25"][index]!, 9));
    expect(RELEASING_UNIT_DAYS["julian-365.25"][0]).toBe(365.25);
    const loosing = releasingPeriods("aquarius", BIRTH, BIRTH, afterDays(30 * 366), { levels: 2, years: "julian-365.25" }).periods
      .find((period) => period.loosingOfTheBond)!;
    expect(loosing).toMatchObject({ sign: "leo" });
    expect(loosing.startDays).toBeCloseTo(211 * 365.25 / 12, 9);
  });
});

describe("zodiacal releasing refusals and ownership", () => {
  it("refuse unknown starts, lots, conventions, levels, options and windows", () => {
    expect(() => releasingPeriods("Aries" as ZodiacSign, BIRTH, BIRTH, BIRTH)).toThrow(/origin must be/);
    expect(() => releasingPeriods(Number.NaN, BIRTH, BIRTH, BIRTH)).toThrow(RangeError);
    expect(() => releasingPeriods("aries", BIRTH, BIRTH, BIRTH, { years: "egyptian" as never })).toThrow(/years must be one of/);
    for (const levels of [0, 5, 2.5, "4"] as unknown[]) {
      expect(() => releasingPeriods("aries", BIRTH, BIRTH, BIRTH, { levels: levels as ReleasingLevel })).toThrow(RangeError);
    }
    expect(() => releasingPeriods("aries", BIRTH, BIRTH, BIRTH, { level: 2 } as never)).toThrow(/unknown option/);
    expect(() => releasingPeriods("aries", BIRTH, "2001-01-01", "2000-06-01")).toThrow(/to must not precede from/);
    expect(() => releasingPeriods("aries", BIRTH, "1990-01-01", "1999-12-31")).toThrow(/birth instant/);
    expect(() => releasingPeriods("aries", BIRTH, BIRTH, "2000-02-30")).toThrow(RangeError);
    expect(() => releasingAt("aries", BIRTH, "1999-12-31T23:59:59Z")).toThrow(/must not precede/);
    expect(() => releasingAt("aries", BIRTH, BIRTH, { levels: 2 } as never)).toThrow(/unknown option/);
    expect(() => releasingPeriods("aries", BIRTH, BIRTH, afterDays(5000 * 365), { levels: 4 })).toThrow(/more than 100000/);
    const chart = { utc: BIRTH, latitude: 40.77, longitude: -73.98 };
    expect(() => zodiacalReleasing(chart, "Lot of Eros" as never, chart.utc, chart.utc)).toThrow(/lot must be/);
    expect(() => zodiacalReleasing({ utc: chart.utc, timeKnown: false }, "Lot of Fortune", chart.utc, chart.utc)).toThrow(/birth time and place/);
  });

  it("clamp a window that begins before birth", () => {
    const result = releasingPeriods("aries", BIRTH, "1990-01-01", BIRTH);
    expect(result.from.toISOString()).toBe(new Date(BIRTH).toISOString());
    expect(result.periods.map((period) => period.level)).toEqual([1, 2]);
  });

  it("return frozen results", () => {
    const result = releasingPeriods("aries", BIRTH, BIRTH, afterDays(400), { levels: 3 });
    expect(Object.isFrozen(result) && Object.isFrozen(result.periods) && Object.isFrozen(result.periods[5])).toBe(true);
    expect(Object.isFrozen(result.origin) && Object.isFrozen(result.conventions) && Object.isFrozen(result.conventions.unitDays)).toBe(true);
    const at = releasingAt("aries", BIRTH, afterDays(400));
    expect(Object.isFrozen(at) && Object.isFrozen(at.periods[3])).toBe(true);
    expect(Object.isFrozen(VALENS_MINOR_YEARS) && Object.isFrozen(RELEASING_UNIT_DAYS["valens-360"])).toBe(true);
  });
});
