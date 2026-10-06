// When each country took the New Style, and what that says about a date.
// Conversions live in ../civil-calendar.ts.
import { civilDateOf, format, julianDayNumber, parseCalendarDate } from "../civil-calendar.js";
import type { CalendarName } from "../civil-calendar.js";

export type { CalendarName } from "../civil-calendar.js";
export { gregorianToJulian, julianToGregorian } from "../civil-calendar.js";

/** A source of the adoption table; `GREGORIAN_ADOPTION_SOURCES` cites each. */
export type GregorianAdoptionSource = "tzdb" | "grotefend-1891" | "grotefend-1898";

/** The adoption table's sources, all in the public domain. */
export const GREGORIAN_ADOPTION_SOURCES: Readonly<Record<GregorianAdoptionSource, string>> = Object.freeze({
  tzdb: "IANA tzdata 2025c, file calendars, quoting H. Grotefend, Taschenbuch der Zeitrechnung, ed. O. Grotefend (1941), pp. 26-28",
  "grotefend-1891": "H. Grotefend, Zeitrechnung des deutschen Mittelalters und der Neuzeit, vol. 1 (1891), pp. 133-134",
  "grotefend-1898": "H. Grotefend, Taschenbuch der Zeitrechnung des deutschen Mittelalters und der Neuzeit (1898), pp. 23-24"
});

/** When a country's civil calendar became the Gregorian, in the region the dates belong to. */
export interface GregorianAdoption {
  /** ISO 3166-1 alpha-2. */
  code: string;
  /** The country's name in tzdata 2025c's iso3166.tab. */
  country: string;
  /** The region the dates are for, as the sources name it; null where they date the whole country. */
  region: string | null;
  /** The first New Style day, YYYY-MM-DD. */
  firstGregorian: string;
  /** The last Old Style (Julian) day before it. */
  lastJulian: string;
  /** The sources that give this date. */
  sources: readonly GregorianAdoptionSource[];
  /**
   * The other regions the sources date, by their first New Style days, and
   * where the sources disagree; a date is tzdb's unless another source is
   * named. "" when there is nothing to add.
   */
  note: string;
}

// One row per present-day country that the sources date, for the region of
// its present capital where they date it. Where they disagree, the row
// follows the calendars file of tzdata, which quotes Grotefend's 1941
// edition, the latest of the three; for Hungary all three give the legal
// change of 1587. Each line: code | iso3166.tab name | region ("-" for the
// whole country) | first New Style day | sources (t tzdb, 1 grotefend-1891,
// 8 grotefend-1898) | note, whose dates are tzdb's unless a source is named.
// src/fixtures/gregorian-adoption.json quotes the sources for every row and
// note, and src/geo/calendar.test.ts checks the table against it.
const ROWS = `AT|Austria|Austria|1584-01-17|t|Grotefend 1898: 1583-10-16, with Bavaria. Salzburg 1583-10-16; Styria 1583-12-25.
BE|Belgium|Brabant, Flanders, Hainaut|1583-01-01|t|Grotefend 1891, 1898: 1582-12-25. Bishopric of Liège 1583-02-21.
CH|Switzerland|Zürich, Bern, Basel, Schaffhausen|1701-01-12|t18|Also Geneva and Thurgau. Catholic cantons 1584-01-22 (Grotefend 1891: 1584-01-23); Unterwalden June 1584; Glarus, Appenzell, St. Gallen city 1724; Valais 1655 (Grotefend 1898: 1622); Graubünden 1760-1812 (Grotefend 1898: to 1811); bishopric of Basel 1583-10-31.
CZ|Czech Republic|Bohemia|1584-01-17|t18|Silesia 1584-01-23. Moravia is not dated.
DE|Germany|Protestant states|1700-03-01|t18|Catholic states from 1583: bishopric of Augsburg 1583-02-24, Bavaria 1583-10-16, the latest listed the bishopric of Hildesheim 1631-03-26.
DK|Denmark|-|1700-03-01|t18|
ES|Spain|-|1582-10-15|t18|
FI|Finland|-|1753-03-01|t|With Sweden; see Sweden. tzdb's list says the Russian empire, Finland included, kept the Julian calendar until 1917.
FR|France|France, Lorraine|1582-12-20|t18|City of Strasbourg 1682-02-16; bishopric of Strasbourg 1583-11-27 (Grotefend 1898: 1583-11-22); Austrian Upper Alsace 1583-10-24. Republican calendar 1793-11-24 to 1805-12-31, in Paris also 1871-05-06 to 1871-05-23: not converted.
GB|Britain (UK)|Great Britain|1752-09-14|t18|
HU|Hungary|-|1587-11-01|t18|The legal change. tzdb's list also gives 1584-02-02, "legally on 21 Oct 1587".
IT|Italy|Italy, with exceptions|1582-10-15|t18|Bishopric of Brixen (Bressanone) 1583-10-16.
NL|Netherlands|Holland|1583-01-01|t|Grotefend 1891, 1898: 1582-12-25. Gelderland 1700-07-12; Zutphen 1700-07-12 (Grotefend 1898: 1700-12-12); Utrecht, Overijssel 1700-12-12; Friesland, Groningen 1701-01-12; Grotefend 1891: 1700-12-12 for all six. Zeeland and Drenthe are not dated.
NO|Norway|-|1700-03-01|t|Grotefend 1891, 1898 name Denmark only.
PL|Poland|Roman Catholics, and Danzig|1582-10-15|t|Grotefend 1898: not everywhere, notably not among Protestants and the Greek Church; Grotefend 1891: 1586. Silesia 1584-01-23; duchy of Prussia 1612-09-02 (Grotefend 1898: 1612-09-01).
PT|Portugal|-|1582-10-15|t18|
RU|Russia|Soviet Russia|1918-02-14|t|Grotefend 1891, 1898: still Julian. Duchy of Prussia, now partly Kaliningrad, 1612-09-02 (Grotefend 1898: 1612-09-01).
SE|Sweden|-|1753-03-01|t18|From 1 March 1700 to 30 February 1712 Swedish dates are one day ahead of the Julian (Grotefend 1898).`;

const SOURCE_KEYS: Readonly<Record<string, GregorianAdoptionSource>> = { t: "tzdb", 1: "grotefend-1891", 8: "grotefend-1898" };

/** The adoption table, one row per country, sorted by code; docs/time.md describes it. */
export const GREGORIAN_ADOPTION: readonly Readonly<GregorianAdoption>[] = Object.freeze(
  ROWS.split("\n").map((line) => {
    const [code, country, region, firstGregorian, sources, note] = line.split("|") as [string, string, string, string, string, string];
    const day = julianDayNumber(parseCalendarDate(firstGregorian, "gregorian")!, "gregorian");
    return Object.freeze({
      code,
      country,
      region: region === "-" ? null : region,
      firstGregorian,
      lastJulian: format(civilDateOf(day - 1, "julian"))!,
      sources: Object.freeze([...sources].map((key) => SOURCE_KEYS[key]!)),
      note
    });
  })
);

/** The row for a country, by ISO 3166-1 alpha-2 code or its name in tzdata's iso3166.tab. */
export function gregorianAdoption(country: string): Readonly<GregorianAdoption> | undefined {
  return GREGORIAN_ADOPTION.find((row) => row.code === country || row.country === country);
}

/** Advice from a country's calendar history; see docs/time.md. */
export interface CalendarNote {
  kind: "old-style" | "new-style";
  adoption: Readonly<GregorianAdoption>;
}

/**
 * The note for a Gregorian date (as resolved, YYYY-MM-DD) written in
 * `calendar`, or null; null too for a country the table does not date. A date
 * that is not a valid Gregorian YYYY-MM-DD, a calendar other than "gregorian"
 * and "julian", or a country that is not a nonempty string throws a
 * RangeError.
 */
export function calendarNote(gregorianDate: string, calendar: CalendarName, country: string): CalendarNote | null {
  if (!parseCalendarDate(gregorianDate, "gregorian")) throw new RangeError("gregorianDate must be a valid Gregorian date, YYYY-MM-DD.");
  if (calendar !== "gregorian" && calendar !== "julian") throw new RangeError('calendar must be "gregorian" or "julian".');
  if (typeof country !== "string" || !country.trim()) throw new RangeError("country must be a nonempty string.");
  return noteFor(gregorianDate, calendar, country);
}

/** Internal: calendarNote for a date resolveLocalBirth has resolved, which may lie past the year 9999. */
export function noteFor(gregorianDate: string, calendar: CalendarName, country: string): CalendarNote | null {
  const adoption = gregorianAdoption(country);
  if (!adoption) return null;
  const julian = calendar === "julian";
  // A year past 9999 has five digits, and its date sorts as text before every adoption's.
  if (gregorianDate.length > 10 || gregorianDate >= adoption.firstGregorian) return julian ? { kind: "new-style", adoption } : null;
  return julian ? null : { kind: "old-style", adoption };
}
