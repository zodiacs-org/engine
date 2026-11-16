import { beforeAll, describe, expect, it } from "vitest";

import { natalChart } from "../index.js";
import { createNatalEnvelope, parseNatalEnvelope } from "../receipt.js";
import { GREGORIAN_ADOPTION, prepareLocalTime, resolveLocalBirth, resolveLocalToUtc } from "../geo.js";

// ZOD-97, T3: a date in the days a calendar changeover skipped. With a country the calendarNote says whether the
// date was in civil use there; with none, the resolution and the chart carry "calendar-unknown". Synthetic births.

/** Days the Julian calendar runs behind the Gregorian in a Gregorian year (the reform's rule: 10 in 1582). */
const behind = (year: number) => Math.floor(year / 100) - Math.floor(year / 400) - 2;

/** The next date in the Julian calendar, where every fourth year is a leap year, as YYYY-MM-DD. */
function nextJulian(date: string): string {
  let [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const length = [31, year % 4 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  if (++day > length) [day, month] = [1, month + 1];
  if (month > 12) [month, year] = [1, year + 1];
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

beforeAll(async () => {
  for (const [date, zone] of [
    ["1582-10-10", "Europe/Rome"],
    ["1752-09-08", "Europe/London"],
    ["1918-02-13", "Europe/Moscow"]
  ] as const)
    await prepareLocalTime(date, zone);
});

describe('"calendar-unknown"', () => {
  it("flags a skipped date given with no country, and leaves the note to a country", () => {
    for (const [date, zone, country, calendar] of [
      ["1582-10-10", "Europe/Rome", "IT", "gregorian"],
      ["1752-09-08", "Europe/London", "GB", "gregorian"],
      ["1752-09-08", "Europe/London", "GB", "julian"]
    ] as const) {
      const unknown = resolveLocalToUtc(date, "12:00", zone, { calendar });
      expect(unknown.flags).toContain("calendar-unknown");
      expect(unknown.calendarNote).toBeNull();
      const known = resolveLocalToUtc(date, "12:00", zone, { calendar, country });
      expect(known.flags).not.toContain("calendar-unknown");
      expect(known.calendarNote).not.toBeNull();
      // The flag changes no instant.
      expect(known.utc.getTime()).toBe(unknown.utc.getTime());
    }
  });

  it("leaves the days either side of a changeover unflagged", () => {
    for (const [date, zone, calendar] of [
      ["1582-10-04", "Europe/Rome", "julian"],
      ["1582-10-04", "Europe/Rome", "gregorian"],
      ["1582-10-15", "Europe/Rome", "gregorian"],
      ["1752-09-02", "Europe/London", "julian"],
      ["1752-09-14", "Europe/London", "gregorian"]
    ] as const)
      expect(resolveLocalToUtc(date, "12:00", zone, { calendar }).flags).not.toContain("calendar-unknown");
  });

  it("covers exactly the dates each row's changeover skipped, as many as the calendars' difference", () => {
    for (const row of GREGORIAN_ADOPTION) {
      // The dates written after the last Old Style day, in the Julian calendar's months, up to the first New Style day.
      const labels: string[] = [];
      for (let label = nextJulian(row.lastJulian); label < row.firstGregorian; label = nextJulian(label)) labels.push(label);
      // The reform dropped as many dates as the Julian calendar was behind (Sweden's 1753 change too).
      expect(labels.length, row.code).toBe(behind(Number(row.firstGregorian.slice(0, 4))));
      for (const date of labels)
        for (const calendar of ["gregorian", "julian"] as const) {
          // 1700-02-29 is a Julian date only: 1700 is not a Gregorian leap year.
          if (calendar === "gregorian" && date.endsWith("02-29") && Number(date.slice(0, 4)) % 400 !== 0) continue;
          expect(resolveLocalToUtc(date, "12:00", "Etc/UTC", { calendar }).flags, `${row.code} ${calendar} ${date}`).toContain("calendar-unknown");
        }
      for (const date of [row.lastJulian, row.firstGregorian])
        expect(resolveLocalToUtc(date, "12:00", "Etc/UTC", { calendar: date === row.lastJulian ? "julian" : "gregorian" }).flags, row.code).not.toContain("calendar-unknown");
    }
  });

  it("is carried by the birth onto the chart and through a receipt, at each end of the changeovers", () => {
    for (const [date, zone, calendar, latitude, longitude] of [
      ["1582-10-05", "Europe/Rome", "gregorian", 41.9, 12.5],
      ["1918-02-13", "Europe/Moscow", "julian", 55.75, 37.62]
    ] as const) {
      const { birth, resolution } = resolveLocalBirth({ date, time: "12:00", timeZone: zone, calendar, latitude, longitude });
      expect(birth.flags).toContain("calendar-unknown");
      const chart = natalChart(birth);
      expect(chart.input.flags).toContain("calendar-unknown");
      expect(chart.flags).toContain("calendar-unknown");
      const envelope = createNatalEnvelope(chart, { localResolution: resolution.localResolution });
      expect(envelope.receipt.inputFlags).toContain("calendar-unknown");
      expect(parseNatalEnvelope(JSON.stringify(envelope)).ok).toBe(true);
    }
  });

  it("is refused by a receipt whose date no changeover skipped", () => {
    for (const date of ["1582-10-04", "1918-02-27", "1990-05-03"]) {
      const resolved = resolveLocalToUtc(date, "12:00", "Etc/UTC");
      const chart = (flags: string[]) => natalChart({ utc: resolved.utc, flags: flags as never, latitude: 40, longitude: 0 });
      const context = { localResolution: resolved.localResolution };
      expect(() => createNatalEnvelope(chart([...resolved.flags]), context), date).not.toThrow();
      expect(() => createNatalEnvelope(chart([...resolved.flags, "calendar-unknown"]), context), date).toThrow();
    }
  });

  it("is a time flag a caller may assert, as lmt is", () => {
    expect(natalChart({ utc: "1700-01-01T12:00:00Z", flags: ["calendar-unknown"] }).flags).toContain("calendar-unknown");
  });
});
