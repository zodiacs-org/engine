import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import * as reference from "../../src/civil-calendar.js";
import type { CalendarName, CivilDate } from "../../src/civil-calendar.js";
import * as rust from "../ts/index.js";
import { expectSameNumber, randomUint32 } from "./parity-helpers.js";

beforeAll(() => {
  rust.initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url)));
});

const calendars: readonly CalendarName[] = ["gregorian", "julian"];

function expectCivilDate(actual: CivilDate | null, expected: CivilDate | null, context: string): void {
  if (expected === null) {
    expect(actual, context).toBeNull();
    return;
  }
  expect(actual, context).not.toBeNull();
  for (const field of ["year", "month", "day"] as const) {
    expectSameNumber(actual![field], expected[field], `${context}, ${field}`);
  }
}

function compareCalendarString(value: unknown, calendar: CalendarName): void {
  const parsed = reference.parseCalendarDate(value, calendar);
  const actual = rust.parseCalendarDate(value, calendar);
  const context = `${calendar}: ${typeof value === "string" ? value : typeof value}`;
  expectCivilDate(actual, parsed, context);
  if (parsed !== null) {
    const jdn = reference.julianDayNumber(parsed, calendar);
    expectSameNumber(rust.julianDayNumber(parsed, calendar), jdn, context);
    expectCivilDate(rust.civilDateOf(jdn, calendar), reference.civilDateOf(jdn, calendar), context);
    expect(rust.format(parsed), context).toBe(reference.format(parsed));
  }
}

describe("Julian and Gregorian civil helpers through WASM", () => {
  it("retains the TypeScript function signatures", () => {
    expectTypeOf(rust.parseCalendarDate).toEqualTypeOf<typeof reference.parseCalendarDate>();
    expectTypeOf(rust.julianDayNumber).toEqualTypeOf<typeof reference.julianDayNumber>();
    expectTypeOf(rust.civilDateOf).toEqualTypeOf<typeof reference.civilDateOf>();
    expectTypeOf(rust.format).toEqualTypeOf<typeof reference.format>();
    expectTypeOf(rust.julianToGregorian).toEqualTypeOf<typeof reference.julianToGregorian>();
    expectTypeOf(rust.gregorianToJulian).toEqualTypeOf<typeof reference.gregorianToJulian>();
  });

  it("matches monthly dates and calendar-specific leap rules in 1800 through 2200", () => {
    for (let year = 1800; year <= 2200; year++) {
      for (let month = 1; month <= 12; month++) {
        for (const day of [1, 28, 29, 30, 31]) {
          const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          for (const calendar of calendars) compareCalendarString(value, calendar);
          expect(rust.julianToGregorian(value), value).toBe(reference.julianToGregorian(value));
          expect(rust.gregorianToJulian(value), value).toBe(reference.gregorianToJulian(value));
        }
      }
    }
  }, 30_000);

  it("matches strict parsing, rejection to null and representable calendar string edges", () => {
    const values: unknown[] = [
      "0000-01-01", "0000-02-29", "0000-12-31", "0001-01-01", "0004-02-29",
      "0099-12-31", "0100-02-29", "0400-02-29", "1582-10-04", "1582-10-15",
      "9999-01-01", "9999-12-31", "", "2000", "2000-01", "2000-1-01", "2000-01-1",
      "2000-00-01", "2000-13-01", "2000-01-00", "2000-01-32", "2000-04-31",
      "-0001-01-01", "+002000-01-01", "10000-01-01", "2000/01/01", "２０００-01-01",
      "2000-01-01\n", "2000-01-01\r\n", "2000-01-01\0", " 2000-01-01", "2000-01-01 ",
      "2000-01-01T00:00:00Z", "2000-01-01Z", null, undefined, 20000101, 0n, NaN, Infinity,
      true, false, [], {}, new String("2000-01-01"), Symbol("synthetic"),
      { toString() { throw new Error("Calendar parsing must not coerce"); } }
    ];
    for (const value of values) {
      for (const calendar of calendars) compareCalendarString(value, calendar);
      expect(rust.julianToGregorian(value as string)).toBe(reference.julianToGregorian(value as string));
      expect(rust.gregorianToJulian(value as string)).toBe(reference.gregorianToJulian(value as string));
    }
  });

  it("preserves exact day-number arithmetic around zero and century boundaries", () => {
    const dates: CivilDate[] = [];
    for (const year of [-4800, -4713, -4712, -400, -100, -4, -1, 0, 1, 4, 99, 100, 400, 1800, 1900, 2000, 2100, 2200, 9999, 10000]) {
      for (const [month, day] of [[1, 1], [2, 28], [2, 29], [3, 1], [12, 31]] as const)
        dates.push({ year, month, day });
    }
    for (const calendar of calendars) {
      for (const date of dates) {
        const context = `${calendar}: ${JSON.stringify(date)}`;
        const jdn = reference.julianDayNumber(date, calendar);
        expectSameNumber(rust.julianDayNumber(date, calendar), jdn, context);
        for (const delta of [-1, 0, 1])
          expectCivilDate(rust.civilDateOf(jdn + delta, calendar), reference.civilDateOf(jdn + delta, calendar), context);
      }
      for (const jdn of [-1, -0, 0, 1, 1_721_060, 2_451_545, 5_373_484])
        expectCivilDate(rust.civilDateOf(jdn, calendar), reference.civilDateOf(jdn, calendar), `${calendar}: jdn=${jdn}`);
    }
  });

  it("matches seeded day numbers throughout the parser's calendar range", () => {
    const next = randomUint32(0x63697669);
    for (const calendar of calendars) {
      const start = reference.julianDayNumber({ year: 0, month: 1, day: 1 }, calendar);
      const end = reference.julianDayNumber({ year: 9999, month: 12, day: 31 }, calendar);
      for (let index = 0; index < 2048; index++) {
        const jdn = start + Math.floor((next() / 0x1_0000_0000) * (end - start + 1));
        const expected = reference.civilDateOf(jdn, calendar);
        const actual = rust.civilDateOf(jdn, calendar);
        expectCivilDate(actual, expected, `${calendar}: jdn=${jdn}`);
        expectSameNumber(rust.julianDayNumber(expected, calendar), reference.julianDayNumber(expected, calendar), `${calendar}: jdn=${jdn}`);
        expect(rust.format(actual)).toBe(reference.format(expected));
      }
    }
  });

  it("preserves unchecked numeric fields and fractional day-number behavior", () => {
    const values = [-Infinity, -1e100, -1, -0, 0, Number.MIN_VALUE, 0.25, 1.5, 9999, 10000, 1e100, Infinity, NaN];
    for (const calendar of calendars) {
      for (const value of values) {
        expectCivilDate(rust.civilDateOf(value, calendar), reference.civilDateOf(value, calendar), `${calendar}: ${value}`);
        for (const field of ["year", "month", "day"] as const) {
          const date = { year: 2000, month: 3, day: 1, [field]: value };
          const context = `${calendar}: ${field}=${value}`;
          expectSameNumber(rust.julianDayNumber(date, calendar), reference.julianDayNumber(date, calendar), context);
          expect(rust.format(date), context).toBe(reference.format(date));
        }
      }
    }
  });
});
