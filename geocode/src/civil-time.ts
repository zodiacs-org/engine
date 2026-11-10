import { gregorianToJulian } from "../../src/geo.js";

/** Reuse the public engine calendar validator; do not normalize invalid dates. */
export function assertCivilDate(date: string): void {
  if (typeof date !== "string" || gregorianToJulian(date) === null) {
    throw new RangeError("Expected a Gregorian date YYYY-MM-DD.");
  }
}

export function assertCivilTime(date: string, time: string): void {
  assertCivilDate(date);
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(time)) {
    throw new RangeError("Expected a Gregorian date YYYY-MM-DD and an explicit time HH:MM.");
  }
}
