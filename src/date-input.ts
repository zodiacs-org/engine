import type { DateInput } from "./types.js";

// Calendar dates use UTC midnight. Date-times must identify an instant; local
// wall times and implementation-dependent Date parsing formats are excluded.
const ISO_INSTANT =
  /^(\d{4}|[+-]\d{6})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-](\d{2}):(\d{2})))?$/;

function validIsoInput(input: string): boolean {
  const match = ISO_INSTANT.exec(input);
  // JavaScript's $ anchor also matches before a final newline.
  if (!match || match[0] !== input || match[1] === "-000000") return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > monthDays[month - 1]!) return false;

  return (
    Number(match[4] ?? 0) <= 23 &&
    Number(match[5] ?? 0) <= 59 &&
    Number(match[6] ?? 0) <= 59 &&
    Number(match[9] ?? 0) <= 23 &&
    Number(match[10] ?? 0) <= 59
  );
}

/** Validate a resolved instant before invoking any astronomical computation. */
export function dateFrom(input: DateInput, label: string): Date {
  const invalid = () =>
    new RangeError(
      `${label} must be a valid Date, finite epoch-millisecond timestamp, or ISO calendar date/date-time with an explicit UTC offset.`
    );
  let date: Date;
  if (input instanceof Date) {
    date = new Date(Date.prototype.getTime.call(input));
  } else if (typeof input === "number" && Number.isFinite(input)) {
    date = new Date(input);
  } else if (typeof input === "string" && validIsoInput(input)) {
    // The validated ISO grammar has specified parsing semantics, including
    // years 0000–0099 (unlike Date.UTC's special handling of those years).
    date = new Date(input);
  } else {
    throw invalid();
  }
  if (!Number.isFinite(date.getTime())) throw invalid();
  return date;
}
