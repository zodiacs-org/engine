import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

import { natalChart } from "../api.js";
import { civilDateOf, julianDayNumber, parseCalendarDate } from "../civil-calendar.js";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "../receipt.js";
import { GREGORIAN_ADOPTION, calendarNote, gregorianAdoption, gregorianToJulian, julianToGregorian } from "./calendar.js";
import { prepareLocalTime, resolveBirth, resolveLocalBirth, resolveLocalToUtc } from "./timezone.js";

/*
 * Step 1.13 of the engine brief, ported from the Zodiacs site's
 * src/lib/time/calendar.test.ts and birth-calendar.test.ts. Julian dates are
 * converted exactly through the Julian Day Number; scripts/verify-jdn.py
 * checks the conversion on every day from -4712 to 3000 against an
 * independent implementation of Richards's algorithm.
 */
const iso = (d: { year: number; month: number; day: number }) =>
  `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

/** A day counter that knows only its own calendar's month lengths. */
function counter(start: { year: number; month: number; day: number }, leap: (year: number) => boolean) {
  const date = { ...start };
  const days = () => (date.month === 2 ? (leap(date.year) ? 29 : 28) : [4, 6, 9, 11].includes(date.month) ? 30 : 31);
  return {
    iso: () => iso(date),
    next() {
      date.day += 1;
      if (date.day > days()) {
        date.day = 1;
        date.month += 1;
      }
      if (date.month > 12) {
        date.month = 1;
        date.year += 1;
      }
    },
    previous() {
      date.day -= 1;
      if (date.day < 1) {
        date.month -= 1;
        if (date.month < 1) {
          date.month = 12;
          date.year -= 1;
        }
        date.day = days();
      }
    }
  };
}

describe("Julian and Gregorian calendar dates", () => {
  it("agrees, day by day from 1500 to 2199, with two counters walked from the 1582 changeover", () => {
    // Julian 1582-10-04 was followed by Gregorian 1582-10-15: the same day as Julian 1582-10-05.
    const julian = counter({ year: 1582, month: 10, day: 5 }, (y) => y % 4 === 0);
    const gregorian = counter({ year: 1582, month: 10, day: 15 }, (y) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0));
    let checked = 0;
    const wrong: string[] = [];
    const check = () => {
      if (julianToGregorian(julian.iso()) !== gregorian.iso()) wrong.push(`${julian.iso()} -> ${julianToGregorian(julian.iso())}`);
      if (gregorianToJulian(gregorian.iso()) !== julian.iso()) wrong.push(`${gregorian.iso()} <- ${gregorianToJulian(gregorian.iso())}`);
      checked += 1;
    };
    while (julian.iso() <= "2199-12-31") {
      check();
      julian.next();
      gregorian.next();
    }
    const back = [
      counter({ year: 1582, month: 10, day: 4 }, (y) => y % 4 === 0),
      counter({ year: 1582, month: 10, day: 14 }, (y) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))
    ] as const;
    Object.assign(julian, back[0]);
    Object.assign(gregorian, back[1]);
    while (julian.iso() >= "1500-01-01") {
      check();
      julian.previous();
      gregorian.previous();
    }
    expect(checked).toBeGreaterThan(255_000);
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it.each([
    ["1917-10-25", "1917-11-07"],
    ["1918-01-31", "1918-02-13"],
    ["1900-02-29", "1900-03-13"],
    ["1800-02-29", "1800-03-12"],
    ["2100-02-29", "2100-03-14"],
    ["1752-09-02", "1752-09-13"],
    ["1923-02-15", "1923-02-28"],
    ["1800-01-01", "1800-01-12"],
    ["2199-12-17", "2199-12-31"],
    // The proleptic Gregorian calendar runs two days behind the Julian in the first century.
    ["0004-02-29", "0004-02-27"],
    ["0200-03-01", "0200-03-01"]
  ])("reads Old Style %s as %s", (julian, gregorian) => {
    expect(julianToGregorian(julian)).toBe(gregorian);
    expect(gregorianToJulian(gregorian)).toBe(julian);
  });

  it("keeps each calendar's own leap rule", () => {
    expect(parseCalendarDate("1900-02-29", "julian")).toEqual({ year: 1900, month: 2, day: 29 });
    expect(parseCalendarDate("1900-02-30", "julian")).toBeNull();
    expect(parseCalendarDate("1900-02-29", "gregorian")).toBeNull();
    expect(gregorianToJulian("1900-02-29")).toBeNull();
    expect(julianToGregorian("1917-13-01")).toBeNull();
    expect(julianToGregorian(19171025 as unknown as string)).toBeNull();
  });

  it("counts Julian Day Numbers from -4712-01-01 Julian, 0", () => {
    expect(julianDayNumber({ year: -4712, month: 1, day: 1 }, "julian")).toBe(0);
    expect(julianDayNumber({ year: -4713, month: 11, day: 24 }, "gregorian")).toBe(0);
    expect(julianDayNumber({ year: 2000, month: 1, day: 1 }, "gregorian")).toBe(2_451_545);
    expect(civilDateOf(2_299_161, "gregorian")).toEqual({ year: 1582, month: 10, day: 15 });
    expect(civilDateOf(2_299_160, "julian")).toEqual({ year: 1582, month: 10, day: 4 });
  });
});

describe("an Old Style birth", () => {
  beforeAll(() => prepareLocalTime("1917-10-25", "Europe/Moscow"));

  it("gives the same chart in Petrograd as typing its Gregorian date, 1917-11-07", () => {
    const place = { latitude: 59.94, longitude: 30.31 };
    const oldStyle = resolveLocalToUtc("1917-10-25", "12:00", "Europe/Moscow", { longitude: place.longitude, calendar: "julian" });
    const newStyle = resolveLocalToUtc("1917-11-07", "12:00", "Europe/Moscow", { longitude: place.longitude });
    expect(oldStyle.utc.toISOString()).toBe(newStyle.utc.toISOString());
    expect(oldStyle.date).toBe("1917-11-07");
    expect(oldStyle.writtenDate).toBe("1917-10-25");
    expect(oldStyle.calendar).toBe("julian");
    const chart = natalChart({ utc: oldStyle.utc, ...place, houseSystem: "placidus", flags: oldStyle.flags });
    const sun = chart.bodies.find((row) => row.body === "Sun")!;
    // 14° of Scorpio; the Old Style date read as Gregorian puts the Sun 13 days, about 13°, back.
    expect(Math.floor(sun.lon / 30)).toBe(7);
    expect(Math.floor(sun.lon)).toBe(224);
    const typedAsGregorian = resolveLocalToUtc("1917-10-25", "12:00", "Europe/Moscow", { longitude: place.longitude });
    const wrong = natalChart({ utc: typedAsGregorian.utc, ...place }).bodies.find((row) => row.body === "Sun")!;
    expect(sun.lon - wrong.lon).toBeCloseTo(13, 0);
    expect(natalChart({ utc: newStyle.utc, ...place, houseSystem: "placidus", flags: newStyle.flags }).bodies).toEqual(chart.bodies);
  });

  it("records the calendar as written in a receipt that validates", () => {
    const { birth, resolution, reference } = resolveLocalBirth({
      date: "1917-10-25",
      time: "12:00",
      timeZone: "Europe/Moscow",
      latitude: 59.94,
      longitude: 30.31,
      calendar: "julian",
      country: "RU"
    });
    expect(resolution.calendarNote).toBeNull();
    const envelope = createNatalEnvelope(natalChart(birth), { reference, localResolution: resolution.localResolution });
    expect(envelope.receipt.localResolution).toMatchObject({ date: "1917-11-07", calendar: "julian", writtenDate: "1917-10-25" });
    expect(parseNatalEnvelope(serializeNatalEnvelope(envelope)).ok).toBe(true);
    const altered = JSON.parse(serializeNatalEnvelope(envelope));
    altered.receipt.localResolution.writtenDate = "1917-10-24";
    expect(parseNatalEnvelope(JSON.stringify(altered))).toEqual({ ok: false, code: "invalid_context" });
  });

  it("refuses a date that does not exist in the calendar chosen for it, and a calendar it does not know", () => {
    expect(() => resolveLocalToUtc("1900-02-29", "12:00", "Europe/Moscow")).toThrow(RangeError);
    expect(resolveLocalToUtc("1900-02-29", "12:00", "Europe/Moscow", { calendar: "julian" }).date).toBe("1900-03-13");
    expect(() => resolveLocalToUtc("1900-02-30", "12:00", "Europe/Moscow", { calendar: "julian" })).toThrow(RangeError);
    for (const calendar of ["Julian", "old-style", "", null, 1]) {
      expect(() => resolveLocalToUtc("1917-10-25", "12:00", "Europe/Moscow", { calendar } as never)).toThrow(RangeError);
      expect(() =>
        resolveBirth({ date: "1917-10-25", time: "12:00", timeZone: "Europe/Moscow", calendar } as never)
      ).toThrow(RangeError);
    }
    // Julian 0000-01-01 is Gregorian -0001-12-30, before the years this form takes.
    expect(() => resolveLocalToUtc("0000-01-01", "12:00", "UTC", { calendar: "julian" })).toThrow(RangeError);
  });

  it("refuses unknown keys instead of ignoring them (the site's F-36)", () => {
    expect(() =>
      resolveBirth({ date: "1917-10-25", time: "12:00", timeZone: "Europe/Moscow", calender: "julian" } as never)
    ).toThrow(/calender/);
    expect(() => resolveLocalToUtc("1917-10-25", "12:00", "Europe/Moscow", { calender: "julian" } as never)).toThrow(RangeError);
    expect(() => resolveLocalToUtc("1917-10-25", "12:00", "Europe/Moscow", "julian" as never)).toThrow(RangeError);
  });
});

describe("the Gregorian adoption table", () => {
  // Every row is checked against src/fixtures/gregorian-adoption.json, which
  // quotes the public-domain sources for each row and for each date in its
  // note: tzdata 2025c's calendars file (quoting Grotefend's 1941 edition) and
  // Grotefend's own tables of 1891 and 1898. The tzdb quotes are checked
  // against the file itself, and the names against tzdata's iso3166.tab.
  const fixture = JSON.parse(readFileSync(new URL("../fixtures/gregorian-adoption.json", import.meta.url), "utf8")) as AdoptionFixture;
  const calendars = readFileSync(new URL("../fixtures/tzdata-2025c-calendars", import.meta.url), "utf8");
  const iso3166 = readFileSync(new URL("../fixtures/tzdata-2025c-iso3166.tab", import.meta.url), "utf8");
  const nextDay = (julian: string) => {
    const next = new Date(`${julianToGregorian(julian)}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
  };

  it("uses the public-domain files it quotes, byte for byte", () => {
    const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
    expect(sha256(calendars)).toBe(fixture.sources.tzdb.sha256);
    expect(sha256(iso3166)).toBe(fixture.names.sha256);
    expect(calendars).toContain("This file is in the public domain, so clarified as of 2009-05-17 by\nArthur David Olson.");
    expect(iso3166).toContain("This file is in the public domain, so clarified as of\n# 2009-05-17 by Arthur David Olson.");
  });

  it("holds exactly the fixture's rows, sorted by code, each with its region, dates and sources", () => {
    expect(GREGORIAN_ADOPTION.map((row) => row.code)).toEqual(fixture.rows.map((row) => row.code));
    expect(fixture.rows.map((row) => row.code)).toEqual([...fixture.rows.map((row) => row.code)].sort());
    fixture.rows.forEach((expected, index) => {
      const row = GREGORIAN_ADOPTION[index]!;
      expect({ ...row, note: undefined }, expected.code).toEqual({
        code: expected.code,
        country: expected.country,
        region: expected.region,
        firstGregorian: expected.firstGregorian,
        lastJulian: gregorianToJulian(new Date(Date.parse(`${expected.firstGregorian}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)),
        sources: expected.sources,
        note: undefined
      });
      expect(nextDay(row.lastJulian), row.code).toBe(row.firstGregorian);
      expect(gregorianAdoption(row.code)).toBe(row);
      expect(gregorianAdoption(row.country)).toBe(row);
      expect(Object.isFrozen(row) && Object.isFrozen(row.sources)).toBe(true);
    });
  });

  it("names each country as tzdata's iso3166.tab does", () => {
    const names = new Map(iso3166.split("\n").filter((line) => /^[A-Z]{2}\t/.test(line)).map((line) => line.split("\t") as [string, string]));
    for (const row of GREGORIAN_ADOPTION) expect(row.country, row.code).toBe(names.get(row.code));
  });

  it("gives each row's date as each of its sources does, and records a source that differs", () => {
    for (const expected of fixture.rows) {
      const row = gregorianAdoption(expected.code)!;
      for (const quote of expected.evidence) {
        if (quote.source === "tzdb") expect(calendars, `${row.code}: ${quote.text}`).toContain(quote.text);
        expect(Object.keys(fixture.sources)).toContain(quote.source);
        // A quote's two days are consecutive: the last Old Style day, then the first New Style one.
        if (quote.lastJulian) expect(nextDay(quote.lastJulian), `${row.code}: ${quote.text}`).toBe(quote.firstGregorian);
        if (quote.noteSays) expect(row.note, row.code).toContain(quote.noteSays);
      }
      // Every source the row names gives its date; one that dates the region otherwise is in the note.
      const forRow = expected.evidence.filter((quote) => !quote.noteSays || quote.firstGregorian === row.firstGregorian);
      for (const source of row.sources) {
        expect(forRow.some((quote) => quote.source === source && quote.firstGregorian === row.firstGregorian), `${row.code} ${source}`).toBe(true);
      }
      for (const quote of expected.evidence.filter((quote) => !row.sources.includes(quote.source as never) && quote.firstGregorian !== null)) {
        if (quote.firstGregorian !== row.firstGregorian) expect(quote.noteSays, `${row.code}: ${quote.text}`).toMatch(/Grotefend|tzdb|\d{4}-\d{2}-\d{2}/);
      }
    }
  });

  it("names a region wherever the sources date the country's regions apart", () => {
    const whole = GREGORIAN_ADOPTION.filter((row) => row.region === null).map((row) => row.code);
    expect(whole).toEqual(["DK", "ES", "FI", "HU", "NO", "PT", "SE"]);
    for (const row of GREGORIAN_ADOPTION) {
      if (row.region !== null) expect(row.region.length).toBeGreaterThan(0);
      expect(row.note.trim()).toBe(row.note);
    }
    // The rows the rc.15 review found contradicting tzdb's list, now each region's own date.
    expect(gregorianAdoption("NL")).toMatchObject({ region: "Holland", firstGregorian: "1583-01-01", lastJulian: "1582-12-21" });
    expect(gregorianAdoption("CH")).toMatchObject({ region: "Zürich, Bern, Basel, Schaffhausen", firstGregorian: "1701-01-12" });
    expect(gregorianAdoption("CZ")).toMatchObject({ region: "Bohemia", firstGregorian: "1584-01-17", lastJulian: "1584-01-06" });
    expect(gregorianAdoption("BE")).toMatchObject({ region: "Brabant, Flanders, Hainaut", firstGregorian: "1583-01-01" });
    expect(gregorianAdoption("BE")!.note).toContain("Bishopric of Liège 1583-02-21");
  });

  it("dates only what its sources date, and knows no other country", () => {
    for (const unknown of ["US", "United States", "GR", "Greece", "JP", "LU", "United Kingdom", "Czechia", "The Netherlands", "gb", ""]) {
      expect(gregorianAdoption(unknown), unknown).toBeUndefined();
    }
    for (const row of GREGORIAN_ADOPTION) {
      expect(row.firstGregorian >= "1582-10-15" && row.firstGregorian < "1919-01-01", row.code).toBe(true);
      expect(row.sources.every((source) => source in fixture.sources)).toBe(true);
    }
  });
});

interface AdoptionFixture {
  sources: Record<string, { sha256?: string }> & { tzdb: { sha256: string } };
  names: { sha256: string };
  rows: {
    code: string;
    country: string;
    region: string | null;
    firstGregorian: string;
    sources: string[];
    evidence: { source: string; text: string; firstGregorian: string | null; lastJulian?: string; noteSays?: string }[];
  }[];
}

describe("the birthplace country's calendar note", () => {
  it("suggests the Old Style for a Russian date before 14 February 1918 left Gregorian", () => {
    expect(calendarNote("1917-10-25", "gregorian", "Russia")).toMatchObject({ kind: "old-style", adoption: { code: "RU" } });
    expect(calendarNote("1918-02-05", "gregorian", "RU")?.kind).toBe("old-style");
    expect(calendarNote("1918-02-14", "gregorian", "Russia")).toBeNull();
  });

  it("is silent when the calendar matches the country's", () => {
    expect(calendarNote("1917-11-07", "julian", "Russia")).toBeNull();
    expect(calendarNote("1918-03-01", "gregorian", "Russia")).toBeNull();
    expect(calendarNote("1850-06-01", "gregorian", "Britain (UK)")).toBeNull();
    expect(calendarNote("1850-06-01", "gregorian", "GB")).toBeNull();
    // From 1.0.0 a malformed date or calendar is refused, not answered.
    for (const date of ["1918-02-30", "1918-2-14", "garbage", "", "1918-02-14T00:00Z", 19180214 as unknown as string]) {
      expect(() => calendarNote(date, "gregorian", "RU"), String(date)).toThrow(RangeError);
    }
    expect(() => calendarNote("1918-02-14", "Julian" as never, "RU")).toThrow(RangeError);
    expect(() => calendarNote("1918-02-14", "klingon" as never, "GB")).toThrow(RangeError);
    // A Julian date late in 9999 resolves to the Gregorian year 10000, which the
    // check above would refuse; resolving it still gives its note.
    const late = resolveLocalBirth({ date: "9999-12-31", time: "12:00", timeZone: "Etc/GMT", calendar: "julian", country: "GB", latitude: 51.5, longitude: -0.1 });
    expect(late.resolution.date).toBe("10000-03-13");
    expect(() => calendarNote(late.resolution.date, "julian", "GB")).toThrow(RangeError);
  });

  it("notes an Old Style date that falls after the country took the New Style", () => {
    // Julian 1 February 1918 is Gregorian 14 February, Russia's first New Style day.
    expect(calendarNote(julianToGregorian("1918-01-31")!, "julian", "Russia")).toBeNull();
    expect(calendarNote(julianToGregorian("1918-02-01")!, "julian", "Russia")).toMatchObject({ kind: "new-style" });
    expect(calendarNote("1850-06-13", "julian", "GB")?.kind).toBe("new-style");
  });

  it("reads the row's region: Holland's New Year of 1583, not the eastern provinces' 1700", () => {
    expect(calendarNote("1582-12-31", "gregorian", "NL")).toMatchObject({ kind: "old-style", adoption: { region: "Holland" } });
    expect(calendarNote("1583-01-01", "gregorian", "Netherlands")).toBeNull();
    expect(calendarNote("1690-06-01", "julian", "NL")?.kind).toBe("new-style");
    expect(calendarNote("1690-06-01", "julian", "NL")?.adoption.note).toContain("Friesland, Groningen 1701-01-12");
  });

  it("knows nothing of the countries its sources do not date", () => {
    for (const country of ["Greece", "GR", "Japan", "Brazil", "United States", "Czechia"]) {
      expect(calendarNote("1900-06-01", "gregorian", country), country).toBeNull();
      expect(calendarNote("1900-06-01", "julian", country), country).toBeNull();
    }
  });

  it("comes with a resolved birth when a country is given", async () => {
    await prepareLocalTime("1917-10-25", "Europe/Moscow");
    const resolved = resolveLocalToUtc("1917-10-25", "12:00", "Europe/Moscow", { country: "Russia" });
    expect(resolved.calendarNote).toMatchObject({ kind: "old-style", adoption: { firstGregorian: "1918-02-14" } });
    expect(resolveLocalToUtc("1917-10-25", "12:00", "Europe/Moscow").calendarNote).toBeNull();
    expect(() => resolveLocalToUtc("1917-10-25", "12:00", "Europe/Moscow", { country: "" })).toThrow(RangeError);
  });
});
