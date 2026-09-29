import { dateFrom } from "./date-input.js";
import { computeBodies } from "./ephemeris.js";
import type { BodyPosition, DateInput } from "./types.js";

/** Fixed tropical-year convention for secondary progressions. */
export const PROGRESSION_DAYS_PER_YEAR = 365.2422;

const DAY_MS = 86_400_000;

/**
 * Map elapsed life to the instant whose positions are progressed: one
 * 365.2422-day tropical year advances one 86,400,000-millisecond day after
 * birth, both counted in UTC milliseconds as Date counts them (no leap
 * seconds), not in ephemeris days. This is elapsed-time arithmetic, not
 * calendar-year or local civil-time arithmetic. Targets before birth use the
 * same signed mapping, which is not a converse progression. Inputs are
 * resolved DateInput instants; they and the returned Date are independent objects.
 */
export function progressedInstant(birthUtc: DateInput, target: DateInput): Date {
  const birth = dateFrom(birthUtc, "birthUtc");
  const at = dateFrom(target, "target");
  // Preserve the site's original operation order, including Date's integer
  // millisecond truncation; algebraic cancellation can shift the result 1 ms.
  const yearsLived = (at.getTime() - birth.getTime()) / (PROGRESSION_DAYS_PER_YEAR * DAY_MS);
  return new Date(birth.getTime() + yearsLived * DAY_MS);
}

/**
 * The same twelve rows as positions(), at progressedInstant(birthUtc, target):
 * Sun, Moon, eight planets and the true north/south lunar nodes. Speed remains
 * the ephemeris rate in degrees per day at that instant, a central difference
 * over ±0.001 day (±0.25 day for the nodes); numerically it is also degrees
 * per tropical year of life, not degrees per lived day. An instant the
 * ephemeris cannot evaluate throws RangeError. No progressed angles, houses,
 * chart points or receipt are calculated.
 */
export function progressedBodies(birthUtc: DateInput, target: DateInput): BodyPosition[] {
  return computeBodies(progressedInstant(birthUtc, target));
}
