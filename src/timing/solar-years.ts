/**
 * Years of life counted by solar returns: year n of a nativity runs from the
 * n-th return of the Sun to its natal longitude to the next, year 0 starting
 * at the birth instant. Profections and firdaria both count years this way.
 *
 * Returns are found with the engine's own crossing solver on the apparent
 * geocentric Sun, read as UTC on the engine's time basis, bisected to about
 * 5 ms.
 */
import { bodyLongitude } from "../ephemeris.js";
import { PROGRESSION_DAYS_PER_YEAR } from "../progressions.js";
import { findLongitudeCrossings } from "../returns.js";
import { normalizeLongitude } from "../signs.js";
import { DAY_MS, MAX_DATE_MS, guarded } from "./shared.js";

/** Half-width of the window around each estimated crossing, in days. */
const RETURN_WINDOW_DAYS = 3;
/** Coarse step of the crossing scan; the Sun never stations, so one root per window. */
const STEP_DAYS = 1;

export interface SolarYears {
  readonly birthMs: number;
  /** The apparent longitude of the Sun at the birth instant, degrees in [0, 360). */
  readonly natalSun: number;
  /** Epoch milliseconds of the n-th solar return; the 0-th is the birth instant. */
  returnMs(n: number): number;
  /** The completed years at an instant, with the bounds of the year it falls in. */
  yearAt(milliseconds: number): { age: number; start: number; end: number };
  /** The instant of a fractional age: linear in time within its solar-return year. */
  instantOf(age: number): number;
  /** The one instant within ±halfWindowDays of `around` when the Sun reaches `longitude`. */
  sunReaches(longitude: number, around: number, halfWindowDays: number): number;
}

export function solarYears(birth: Date): SolarYears {
  const birthMs = birth.getTime();
  const natalSun = normalizeLongitude(guarded(() => bodyLongitude("Sun", birth)));
  const cache = new Map<number, number>([[0, birthMs]]);

  const sunReaches = (longitude: number, around: number, halfWindowDays: number): number => {
    const from = around - halfWindowDays * DAY_MS;
    const to = around + halfWindowDays * DAY_MS;
    if (!(Math.abs(from) <= MAX_DATE_MS && Math.abs(to) <= MAX_DATE_MS)) {
      throw new RangeError("A solar return falls outside the range of a JavaScript Date.");
    }
    const crossings = guarded(() => findLongitudeCrossings("Sun", longitude, new Date(from), new Date(to), STEP_DAYS));
    const first = crossings[0];
    if (crossings.length !== 1 || first === undefined) {
      throw new RangeError(`Could not isolate the Sun's passage through ${longitude}°.`);
    }
    return first.at.getTime();
  };

  const returnMs = (n: number): number => {
    const known = cache.get(n);
    if (known !== undefined) return known;
    if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("A solar return number must be a non-negative integer.");
    const found = sunReaches(natalSun, birthMs + n * PROGRESSION_DAYS_PER_YEAR * DAY_MS, RETURN_WINDOW_DAYS);
    cache.set(n, found);
    return found;
  };

  const yearAt = (milliseconds: number): { age: number; start: number; end: number } => {
    if (milliseconds < birthMs) throw new RangeError("The date must not precede the birth instant.");
    let age = Math.max(0, Math.floor((milliseconds - birthMs) / (PROGRESSION_DAYS_PER_YEAR * DAY_MS)));
    while (age > 0 && milliseconds < returnMs(age)) age -= 1;
    while (milliseconds >= returnMs(age + 1)) age += 1;
    return { age, start: returnMs(age), end: returnMs(age + 1) };
  };

  const instantOf = (age: number): number => {
    if (!Number.isFinite(age) || age < 0) throw new RangeError("An age must be finite and non-negative.");
    const whole = Math.floor(age);
    const fraction = age - whole;
    const start = returnMs(whole);
    if (fraction === 0) return start;
    return Math.round(start + fraction * (returnMs(whole + 1) - start));
  };

  return { birthMs, natalSun, returnMs, yearAt, instantOf, sunReaches };
}
