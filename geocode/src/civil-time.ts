import { gregorianToJulian } from "../../src/geo.js";

/** Reuse the public engine calendar validator; do not normalize invalid dates. */
export function assertCivilTime(date: string, time: string): void {
  if (typeof date !== "string" || gregorianToJulian(date) === null
      || typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(time)) {
    throw new RangeError("Expected a Gregorian date YYYY-MM-DD and an explicit time HH:MM.");
  }
}
