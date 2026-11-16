import { beforeAll, describe, expect, it } from "vitest";

import { natalChart } from "../index.js";
import { createNatalEnvelope, parseNatalEnvelope } from "../receipt.js";
import { GREGORIAN_ADOPTION, gregorianToJulian, prepareLocalTime, resolveLocalBirth, resolveLocalToUtc } from "../geo.js";
import { zoneAdoption } from "./calendar.js";

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
    ["1918-02-13", "Europe/Moscow"],
    ["1752-09-08", "Europe/Rome"],
    ["1752-09-08", "Europe/Moscow"],
    ["1582-10-10", "Europe/London"],
    ["1752-09-08", "America/New_York"],
    ["1918-02-05", "America/New_York"],
    ["1918-02-05", "Asia/Tokyo"],
    ["1923-02-20", "Europe/Athens"],
    ["1701-01-05", "Europe/Amsterdam"],
    ["1584-01-14", "Europe/Zurich"],
    ["1584-01-14", "Europe/Warsaw"],
    ["1582-12-16", "Europe/Brussels"],
    ["1752-09-08", "Europe/Vatican"],
    ["1700-03-11", "Europe/Stockholm"],
    ["1700-03-11", "Europe/Helsinki"],
    ["1700-03-11", "Europe/Copenhagen"],
    ["1700-03-11", "Europe/Oslo"]
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

  it("reads the zone: a tabled country's capital zone follows its own changeover, and Russia's applies only in Europe or Asia", () => {
    // The order of the zones behind zoneAdoption is the table's: each row's country has that capital zone in
    // tzdata 2025c's zone.tab.
    const capitals: Record<string, string> = {
      AT: "Vienna", BE: "Brussels", CH: "Zurich", CZ: "Prague", DE: "Berlin", DK: "Copenhagen", ES: "Madrid",
      FI: "Helsinki", FR: "Paris", GB: "London", HU: "Budapest", IT: "Rome", NL: "Amsterdam", NO: "Oslo",
      PL: "Warsaw", PT: "Lisbon", RU: "Moscow", SE: "Stockholm"
    };
    expect(GREGORIAN_ADOPTION.map((row) => row.code)).toEqual(Object.keys(capitals));
    // Russia's is the only changeover after 1800, the one kept to zones under Europe/ and Asia/.
    expect(GREGORIAN_ADOPTION.filter((row) => row.firstGregorian >= "1800").map((row) => row.code)).toEqual(["RU"]);
    // Six capitals are not narrowed: their rows' notes date skipped days in another row's (see the next tests).
    const wide = ["BE", "CH", "FI", "NL", "PL", "SE"];
    for (const row of GREGORIAN_ADOPTION) {
      expect(zoneAdoption(`Europe/${capitals[row.code]}`), row.code).toBe(wide.includes(row.code) ? undefined : row);
      expect(zoneAdoption(`EUROPE/${capitals[row.code]!.toUpperCase()}`), row.code).toBe(wide.includes(row.code) ? undefined : row);
    }
    // Links are not followed (Europe/Bratislava links to Prague but was Hungarian), nor are other zones.
    for (const zone of ["Europe/Kaliningrad", "Europe/Vatican", "Europe/Bratislava", "America/New_York", "Etc/UTC", "Rome", "Europe/-"])
      expect(zoneAdoption(zone), zone).toBeUndefined();

    // Dates that certainly existed where they were written, unflagged: Rome and Moscow did not take Britain's
    // 1752 change (Italy was New Style from 1582, Russia Old Style to 1918), London took no change in 1582, and
    // Russia's 1918 change never reached New York.
    for (const [date, zone] of [
      ["1752-09-08", "Europe/Rome"],
      ["1752-09-08", "Europe/Moscow"],
      ["1582-10-10", "Europe/London"],
      ["1918-02-05", "America/New_York"]
    ] as const) {
      const resolved = resolveLocalToUtc(date, "12:00", zone);
      expect(resolved.flags, `${zone} ${date}`).not.toContain("calendar-unknown");
      expect(resolved.calendarNote).toBeNull();
    }
    expect(resolveLocalToUtc("1752-09-08", "12:00", "europe/rome").flags).not.toContain("calendar-unknown");
    // Still flagged where the zone does not rule a changeover out. New York names no tabled country, and the
    // British colonies there took Britain's change of 1752 (Gregorian 1752-09-03 to 1752-09-13 were never written
    // there), while other places in the zone's area followed Spain's or France's; Asia/ includes zones of the
    // Russian empire of 1918.
    for (const [date, zone] of [
      ["1752-09-08", "America/New_York"],
      ["1918-02-05", "Asia/Tokyo"],
      ["1918-02-05", "Etc/UTC"],
      // A link is not followed, so Rome's narrowing does not reach it.
      ["1752-09-08", "Europe/Vatican"],
      // Days another row skipped and a region of the zone skipped too, by its row's note: Friesland and Groningen
      // (1701-01-12, the NL note), the Catholic cantons (1584-01-22, the CH note), Silesia (1584-01-23, the PL
      // note) and Brabant by Grotefend (1582-12-25, the BE note).
      ["1701-01-05", "Europe/Amsterdam"],
      ["1584-01-14", "Europe/Zurich"],
      ["1584-01-14", "Europe/Warsaw"],
      ["1582-12-16", "Europe/Brussels"]
    ] as const)
      expect(resolveLocalToUtc(date, "12:00", zone).flags, `${zone} ${date}`).toContain("calendar-unknown");
    // Sweden dropped Julian 1700-02-29 (the SE note: from 1 March 1700 its dates ran one day ahead of the Julian),
    // a day Denmark and Norway skipped too, and Finland went "with Sweden" (the FI note).
    for (const zone of ["Europe/Stockholm", "Europe/Helsinki", "Europe/Copenhagen", "Europe/Oslo"])
      expect(resolveLocalToUtc("1700-02-29", "12:00", zone, { calendar: "julian" }).flags, zone).toContain("calendar-unknown");
  });

  it("narrows no zone whose row's note dates a changeover with skipped days in another row's and not its own", () => {
    /** The days a changeover whose first New Style day is `first` skipped, as an open range of written dates. */
    const skipped = (first: string): [string, string] => {
      const before = new Date(Date.parse(`${first}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      return [gregorianToJulian(before)!, first];
    };
    const capitals = ["Vienna", "Brussels", "Zurich", "Prague", "Berlin", "Copenhagen", "Madrid", "Helsinki", "Paris", "London", "Budapest", "Rome", "Amsterdam", "Oslo", "Warsaw", "Lisbon", "Moscow", "Stockholm"];
    const narrowed: string[] = [];
    GREGORIAN_ADOPTION.forEach((row, index) => {
      if (zoneAdoption(`Europe/${capitals[index]}`) !== row) return;
      narrowed.push(row.code);
      const own = skipped(row.firstGregorian);
      for (const date of row.note.match(/\d{4}-\d{2}-\d{2}/g) ?? []) {
        const theirs = skipped(date);
        for (const other of GREGORIAN_ADOPTION) {
          if (other === row) continue;
          const range = skipped(other.firstGregorian);
          const from = theirs[0] > range[0] ? theirs[0] : range[0];
          const to = theirs[1] < range[1] ? theirs[1] : range[1];
          // Days in both lie in the row's own skipped days, which the narrowed zone still flags.
          if (from < to) expect(own[0] <= from && to <= own[1], `${row.code} ${date} ${other.code}`).toBe(true);
        }
      }
    });
    expect(narrowed).toEqual(["AT", "CZ", "DE", "DK", "ES", "FR", "GB", "HU", "IT", "NO", "PT", "RU"]);
    // The check above reads only YYYY-MM-DD dates. A note that dates in words, as SE's does ("from 1 March 1700"),
    // has to be read by hand, so a narrowed row may hold none but HU's, the Julian date of its own change.
    const words = /\b(?:\d{1,2} )?(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.? \d{4}\b/g;
    expect(GREGORIAN_ADOPTION.filter((row) => narrowed.includes(row.code)).flatMap((row) => (row.note.match(words) ?? []).map((date) => `${row.code} ${date}`))).toEqual(["HU 21 Oct 1587"]);
    expect(GREGORIAN_ADOPTION.find((row) => row.code === "SE")!.note.match(words)).toEqual(["1 March 1700", "30 February 1712"]);
  });

  it("is silenced only by a country the table dates", () => {
    // A country the table does not date, or no country at all, gives no note, so the flag stays.
    for (const country of ["US", "IE", "ZZ", "gb"]) {
      const resolved = resolveLocalToUtc("1752-09-08", "12:00", "Europe/London", { country });
      expect(resolved.flags, country).toContain("calendar-unknown");
      expect(resolved.calendarNote, country).toBeNull();
    }
    for (const country of ["GB", "Britain (UK)"]) {
      const resolved = resolveLocalToUtc("1752-09-08", "12:00", "Europe/London", { country });
      expect(resolved.flags, country).not.toContain("calendar-unknown");
      expect(resolved.calendarNote?.kind, country).toBe("old-style");
    }
    // Greece is not in the table (none of its sources dates it), so its change of 1923 is neither flagged nor
    // noted, with or without the country.
    for (const country of [undefined, "GR"]) {
      const resolved = resolveLocalToUtc("1923-02-20", "12:00", "Europe/Athens", country ? { country } : {});
      expect(resolved.flags).not.toContain("calendar-unknown");
      expect(resolved.calendarNote).toBeNull();
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

  it("is refused by a receipt with no local record whose instant is not within a day of a skipped date", () => {
    const envelope = (utc: string) =>
      createNatalEnvelope(natalChart({ utc, flags: ["calendar-unknown"], latitude: 40, longitude: 0 }));
    for (const utc of ["1990-05-03T12:00:00Z", "1500-01-01T12:00:00Z", "1582-10-03T23:59:59Z", "1918-02-28T00:00:00Z"])
      expect(() => envelope(utc), utc).toThrow();
    for (const utc of ["1582-10-04T00:00:00Z", "1752-09-08T12:00:00Z", "1918-02-27T23:59:59Z"]) {
      const made = envelope(utc);
      expect(made.receipt.localResolution, utc).toBeNull();
      expect(parseNatalEnvelope(JSON.stringify(made)).ok, utc).toBe(true);
    }
  });

  it("is a time flag a caller may assert, as lmt is", () => {
    expect(natalChart({ utc: "1700-01-01T12:00:00Z", flags: ["calendar-unknown"] }).flags).toContain("calendar-unknown");
  });
});
