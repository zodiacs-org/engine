import { describe, expect, it } from "vitest";

import { dateOfJulianDayNumber, julianDayNumber, localMeanTimeOffset } from "../geo.js";

type Calendar = "gregorian" | "julian";
interface Ymd {
  year: number;
  month: number;
  day: number;
}

/*
 * A second implementation, written from J. Meeus, Astronomical Algorithms,
 * 2nd ed. (1998), chapter 7, and never from the engine's code (which follows
 * C. Toendering's integer algorithm). Meeus works in Julian Dates at 0h; the
 * Julian Day Number of the civil day is that date plus one half. Meeus's INT
 * is applied as the floor, so that the Gregorian century terms hold for
 * negative years too; every other argument is positive over the years tested,
 * where the floor and INT agree. The Gregorian branch is the proleptic one
 * (B from A for every date), not Meeus's switch at 1582-10-15.
 */
const INT = Math.floor;

function meeusDayNumber({ year, month, day }: Ymd, calendar: Calendar): number {
  let Y = year;
  let M = month;
  if (M <= 2) {
    Y -= 1;
    M += 12;
  }
  let B = 0;
  if (calendar === "gregorian") {
    const A = INT(Y / 100);
    B = 2 - A + INT(A / 4);
  }
  const jd = INT(365.25 * (Y + 4716)) + INT(30.6001 * (M + 1)) + day + B - 1524.5;
  return jd + 0.5;
}

function meeusDate(jdn: number, calendar: Calendar): Ymd {
  const Z = jdn; // INT(JD + 0.5) of the noon that begins the day
  let A = Z;
  if (calendar === "gregorian") {
    const alpha = INT((Z - 1867216.25) / 36524.25);
    A = Z + 1 + alpha - INT(alpha / 4);
  }
  const B = A + 1524;
  const C = INT((B - 122.1) / 365.25);
  const D = INT(365.25 * C);
  const E = INT((B - D) / 30.6001);
  const day = B - D - INT(30.6001 * E);
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  return { year, month, day };
}

/** Days in a month, from each calendar's leap year rule. */
function monthLength(year: number, month: number, calendar: Calendar): number {
  if (month !== 2) return [4, 6, 9, 11].includes(month) ? 30 : 31;
  const mod = (a: number, n: number) => ((a % n) + n) % n;
  const leap = calendar === "julian" ? mod(year, 4) === 0 : mod(year, 4) === 0 && (mod(year, 100) !== 0 || mod(year, 400) === 0);
  return leap ? 29 : 28;
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomDates(count: number, seed: number, calendar: Calendar, from = -4712, to = 9999): Ymd[] {
  const random = seeded(seed);
  const dates: Ymd[] = [];
  for (let i = 0; i < count; i += 1) {
    const year = from + Math.floor(random() * (to - from + 1));
    const month = 1 + Math.floor(random() * 12);
    const day = 1 + Math.floor(random() * monthLength(year, month, calendar));
    dates.push({ year, month, day });
  }
  return dates;
}

const CALENDARS: Calendar[] = ["gregorian", "julian"];

describe("the second implementation (Meeus, ch. 7)", () => {
  it("gives the textbook values", () => {
    expect(meeusDayNumber({ year: 2000, month: 1, day: 1 }, "gregorian")).toBe(2451545);
    expect(meeusDayNumber({ year: 1582, month: 10, day: 15 }, "gregorian")).toBe(2299161);
    expect(meeusDayNumber({ year: 1582, month: 10, day: 4 }, "julian")).toBe(2299160);
    expect(meeusDayNumber({ year: -4712, month: 1, day: 1 }, "julian")).toBe(0);
    expect(meeusDayNumber({ year: -4713, month: 11, day: 24 }, "gregorian")).toBe(0);
    expect(meeusDate(0, "gregorian")).toEqual({ year: -4713, month: 11, day: 24 });
  });
});

describe("julianDayNumber", () => {
  it("gives the textbook values", () => {
    expect(julianDayNumber({ year: 2000, month: 1, day: 1 })).toBe(2451545);
    expect(julianDayNumber({ year: 1582, month: 10, day: 15 })).toBe(2299161);
    expect(julianDayNumber({ year: 1582, month: 10, day: 5 }, "julian")).toBe(2299161);
    expect(julianDayNumber({ year: -4712, month: 1, day: 1 }, "julian")).toBe(0);
  });

  it.each(CALENDARS)("agrees with Meeus on 10,000 random %s dates from -4712 to 9999", (calendar) => {
    for (const date of randomDates(10_000, calendar === "gregorian" ? 0x289a : 0x289b, calendar)) {
      expect(julianDayNumber(date, calendar), JSON.stringify(date)).toBe(meeusDayNumber(date, calendar));
    }
  });

  it("refuses a date the calendar does not have, and accepts it where it does", () => {
    expect(() => julianDayNumber({ year: 1900, month: 2, day: 29 })).toThrow(RangeError);
    expect(julianDayNumber({ year: 1900, month: 2, day: 29 }, "julian")).toBe(2415092);
    for (const bad of [
      { year: 2001, month: 2, day: 29 },
      { year: 2000, month: 4, day: 31 },
      { year: 2000, month: 13, day: 1 },
      { year: 2000, month: 0, day: 1 },
      { year: 2000, month: 1, day: 0 }
    ]) {
      expect(() => julianDayNumber(bad), JSON.stringify(bad)).toThrow(RangeError);
      expect(() => julianDayNumber(bad, "julian"), JSON.stringify(bad)).toThrow(RangeError);
    }
  });

  it("refuses what is not three integers within years -100000 to 100000, and an unknown calendar", () => {
    for (const bad of [
      { year: 2000.5, month: 1, day: 1 },
      { year: 2000, month: "1", day: 1 },
      { year: Number.NaN, month: 1, day: 1 },
      { year: 100001, month: 1, day: 1 },
      { year: -100001, month: 12, day: 31 },
      { month: 1, day: 1 },
      null,
      "2000-01-01"
    ]) {
      expect(() => julianDayNumber(bad as never), JSON.stringify(bad)).toThrow(RangeError);
    }
    expect(() => julianDayNumber({ year: 2000, month: 1, day: 1 }, "hebrew" as never)).toThrow(RangeError);
    expect(julianDayNumber({ year: 100000, month: 12, day: 31 }) - julianDayNumber({ year: -100000, month: 1, day: 1 })).toBe(
      200001 * 365 + 48500
    );
  });

  it("has year 0, one day after year -1", () => {
    for (const calendar of CALENDARS) {
      expect(julianDayNumber({ year: 0, month: 1, day: 1 }, calendar) - julianDayNumber({ year: -1, month: 12, day: 31 }, calendar)).toBe(1);
    }
  });

  it("does arithmetic in the proleptic Gregorian calendar, the changeover's skipped days included", () => {
    expect(julianDayNumber({ year: 1582, month: 10, day: 10 })).toBe(2299156);
  });

  it("is strictly increasing, one per day, and inverted by dateOfJulianDayNumber", () => {
    for (const calendar of CALENDARS) {
      for (const [from, to] of [
        [-4713, -4700],
        [1580, 1590],
        [1898, 1902],
        [9995, 9999],
        [-100000, -99996],
        [99996, 100000]
      ] as const) {
        let previous: number | null = null;
        for (let year = from; year <= to; year += 1) {
          for (let month = 1; month <= 12; month += 1) {
            for (let day = 1; day <= monthLength(year, month, calendar); day += 1) {
              const jdn = julianDayNumber({ year, month, day }, calendar);
              if (previous !== null) expect(jdn).toBe(previous + 1);
              previous = jdn;
            }
          }
        }
      }
    }
  });

  it.each(CALENDARS)("round-trips 5,000 random %s dates through dateOfJulianDayNumber", (calendar) => {
    for (const date of randomDates(5_000, calendar === "gregorian" ? 0x5eed : 0x5eee, calendar, -100000, 100000)) {
      expect(dateOfJulianDayNumber(julianDayNumber(date, calendar), calendar)).toEqual(date);
    }
  });
});

describe("dateOfJulianDayNumber", () => {
  it("gives the textbook values", () => {
    expect(dateOfJulianDayNumber(2299161)).toEqual({ year: 1582, month: 10, day: 15 });
    expect(dateOfJulianDayNumber(2299161, "julian")).toEqual({ year: 1582, month: 10, day: 5 });
    expect(dateOfJulianDayNumber(0, "julian")).toEqual({ year: -4712, month: 1, day: 1 });
  });

  it.each(CALENDARS)("agrees with Meeus on 10,000 random %s day numbers of years -4712 to 9999", (calendar) => {
    for (const date of randomDates(10_000, calendar === "gregorian" ? 0x7a1 : 0x7a2, calendar)) {
      const jdn = meeusDayNumber(date, calendar);
      expect(dateOfJulianDayNumber(jdn, calendar), String(jdn)).toEqual(meeusDate(jdn, calendar));
      expect(meeusDate(jdn, calendar)).toEqual(date);
    }
  });

  it("refuses what is not an integer day number of years -100000 to 100000", () => {
    for (const bad of [2451545.5, Number.NaN, Infinity, "2451545", Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
      expect(() => dateOfJulianDayNumber(bad as never), String(bad)).toThrow(RangeError);
    }
    for (const calendar of CALENDARS) {
      const first = julianDayNumber({ year: -100000, month: 1, day: 1 }, calendar);
      const last = julianDayNumber({ year: 100000, month: 12, day: 31 }, calendar);
      expect(dateOfJulianDayNumber(first, calendar)).toEqual({ year: -100000, month: 1, day: 1 });
      expect(dateOfJulianDayNumber(last, calendar)).toEqual({ year: 100000, month: 12, day: 31 });
      expect(() => dateOfJulianDayNumber(first - 1, calendar)).toThrow(RangeError);
      expect(() => dateOfJulianDayNumber(last + 1, calendar)).toThrow(RangeError);
    }
    expect(() => dateOfJulianDayNumber(0, "hebrew" as never)).toThrow(RangeError);
  });
});

describe("localMeanTimeOffset", () => {
  it("is four minutes of time per degree east, not rounded", () => {
    expect(localMeanTimeOffset(-0.125)).toBe(-30);
    expect(localMeanTimeOffset(180)).toBe(43200);
    expect(localMeanTimeOffset(-180)).toBe(-43200);
    expect(localMeanTimeOffset(-74.006)).toBeCloseTo(-17761.44, 9);
    expect(Math.abs(localMeanTimeOffset(-74.006) - -17761.44)).toBeLessThan(1e-9);
    expect(localMeanTimeOffset(2.3125)).toBe(555);
  });

  it("gives 0, not -0, for -0", () => {
    expect(Object.is(localMeanTimeOffset(-0), 0)).toBe(true);
  });

  it("refuses a longitude that is not a finite number within -180 to 180", () => {
    for (const bad of [Number.NaN, 181, -181, 180.0000001, Infinity, -Infinity, "10", null, undefined]) {
      expect(() => localMeanTimeOffset(bad as never), String(bad)).toThrow(RangeError);
    }
  });
});
