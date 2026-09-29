// Julian (Old Style) and proleptic Gregorian civil dates, converted exactly
// through the Julian Day Number. A civil day maps to the same civil day, so a
// birth time and zone carry over unchanged: convert an Old Style date, then
// resolve it as usual. Import-free, for the geo resolver and the receipt codec.

/** The calendar a local date is written in. */
export type CalendarName = "gregorian" | "julian";

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

const julianLeap = (year: number): boolean => year % 4 === 0;
const gregorianLeap = (year: number): boolean => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

/** Exactly YYYY-MM-DD with a four-digit year, valid in the calendar named. */
export function parseCalendarDate(value: unknown, calendar: CalendarName): CivilDate | null {
  if (typeof value !== "string" || value.length !== 10) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  const leap = calendar === "julian" ? julianLeap(year) : gregorianLeap(year);
  const days = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day <= days ? { year, month, day } : null;
}

// The integer day-number algorithm of C. Tøndering's Calendar FAQ (§2.16.1),
// with floor division, valid from Julian Day Number 0 (-4712-01-01 Julian).
// scripts/verify-jdn.py checks it on every day from -4712 to 3000 against an
// independent implementation of Richards's algorithm (Explanatory Supplement
// to the Astronomical Almanac, 3rd ed., 2013, ch. 15).
function shift(date: CivilDate): { y: number; m: number } {
  const a = Math.floor((14 - date.month) / 12);
  return { y: date.year + 4800 - a, m: date.month + 12 * a - 3 };
}

/** Julian Day Number of a civil date in the calendar named. */
export function julianDayNumber(date: CivilDate, calendar: CalendarName): number {
  const { y, m } = shift(date);
  const base = date.day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4);
  return calendar === "julian"
    ? base - 32083
    : base - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function fromDayNumber(c: number, centuries: number): CivilDate {
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * centuries + d - 4800 + Math.floor(m / 10)
  };
}

/** The civil date of a Julian Day Number in the calendar named. */
export function civilDateOf(jdn: number, calendar: CalendarName): CivilDate {
  if (calendar === "julian") return fromDayNumber(jdn + 32082, 0);
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  return fromDayNumber(a - Math.floor((146097 * b) / 4), b);
}

/** YYYY-MM-DD, or null outside years 0000–9999. */
export function format(date: CivilDate): string | null {
  if (date.year < 0 || date.year > 9999) return null;
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

/** The proleptic Gregorian date of a Julian calendar date (YYYY-MM-DD), or null when it is not one or leaves years 0000–9999. */
export function julianToGregorian(value: string): string | null {
  const date = parseCalendarDate(value, "julian");
  return date ? format(civilDateOf(julianDayNumber(date, "julian"), "gregorian")) : null;
}

/** The Julian calendar date of a proleptic Gregorian date (YYYY-MM-DD), or null. */
export function gregorianToJulian(value: string): string | null {
  const date = parseCalendarDate(value, "gregorian");
  return date ? format(civilDateOf(julianDayNumber(date, "gregorian"), "julian")) : null;
}
