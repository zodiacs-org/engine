/**
 * `@zodiacs/engine/time`: the clock and the frame of date a chart is computed
 * on, for code that calls astronomy-engine itself. Each function here is the
 * one the engine computes with (`src/time-scale.ts`, `src/nutation.ts`,
 * `src/frame.ts`), behind a check that throws `RangeError` for an argument it
 * refuses; for every argument it accepts it gives what that function gives,
 * value for value. Nothing in this entry's graph imports astronomy-engine, and
 * the root entry does not import this file (`scripts/root-isolation.mjs`). It
 * keeps no state of its own; the state its graph holds is the engine's, shared
 * with the root. `timeBands`, the bands of a recorded instant's TT and UT1
 * (`src/time-bands.ts`), is the function `@zodiacs/engine/calc` computes its
 * bands with, and checks its own argument.
 */
import { eclipticFrame as frameAt, eclipticOfDate as placeOfDate, meanEcliptic as meanOf } from "./frame.js";
import type { EclipticFrame } from "./frame.js";
import { tilt as tiltAt } from "./nutation.js";
import type { Tilt } from "./nutation.js";
import { TIME_SCALE_NAMES, elapsedDays as elapsedOf, timeBasis as basisOf } from "./time-scale.js";
import type { TimeBasis, TimeScaleName } from "./time-scale.js";

export type { DeltaT, DeltaTSegment } from "./deltat.js";
export type { EclipticFrame } from "./frame.js";
export type { Tilt } from "./nutation.js";
export { EPHEMERIS_SPAN } from "./reference-span.js";
export { timeBands } from "./time-bands.js";
export type { TimeBands } from "./time-bands.js";
export { DELTA_T_IERS_MODEL, TIME_SCALE_NAMES } from "./time-scale.js";
export type { LeapSeconds, TimeBasis, TimeScale, TimeScaleName, Ut1MinusUtc } from "./time-scale.js";

/** Throws RangeError unless `value` is a finite number. */
function finite(value: number, name: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`${name} must be a finite number.`);
}

/**
 * An instant's UT1 and TT, days from 2000-01-01T12:00 on each scale, with the
 * `deltaT` and `timeScale` records a chart carries: the engine's own time
 * basis (docs/time.md). `ms` is the instant on `scale` (UTC unless given), in
 * milliseconds since 1970 as JavaScript counts them, within the range of a
 * `Date`; `pin`, when given, is a ΔT (TT − UT1) in seconds, at most 1e10 in
 * size, which replaces the engine's. Throws `RangeError` for any other value.
 */
export function timeBasis(ms: number, scale?: TimeScaleName, pin?: number): TimeBasis {
  if (typeof ms !== "number" || !(Math.abs(ms) <= 8.64e15)) throw new RangeError("ms must be an instant within the range of a Date.");
  if (scale !== undefined && !TIME_SCALE_NAMES.includes(scale)) throw new RangeError('scale must be "utc", "ut1" or "tt".');
  if (pin !== undefined && (typeof pin !== "number" || !(Math.abs(pin) <= 1e10))) {
    throw new RangeError("pin must be a finite number of seconds, at most 1e10 in size.");
  }
  return basisOf(ms, scale, pin);
}

/**
 * The time between two samples taken `days` apart on an input's scale, in
 * days: `days` where both lie in one piece of the time basis, and the TT
 * between them where a step of the basis lies between them (a leap second, a
 * change of basis). `before` and `after` are records `timeBasis` gave.
 */
export function elapsedDays(before: TimeBasis, after: TimeBasis, days: number): number {
  finite(days, "days");
  return elapsedOf(before, after, days);
}

/**
 * The nutation and obliquity at `tt`, days of TT from J2000.0 (astronomy-engine's
 * `time.tt`): IAU 2000B's Δψ and Δε, the IAU 2006 mean obliquity, the true
 * obliquity and the equation of the equinoxes. The result is frozen.
 */
export function tilt(tt: number): Tilt {
  finite(tt, "tt");
  return Object.freeze(tiltAt(tt));
}

/**
 * The rotation from astronomy-engine's EQJ (the J2000 mean equator and
 * equinox) to the mean ecliptic and equinox of date at `tt`, days of TT from
 * J2000.0, with that instant's tilt. The result, its rows and its tilt are a
 * frozen copy; the frame the engine keeps for its own next call is never
 * handed out.
 */
export function eclipticFrame(tt: number): EclipticFrame {
  finite(tt, "tt");
  const frame = frameAt(tt);
  return Object.freeze({ tt: frame.tt, rows: Object.freeze(frame.rows.slice()), tilt: Object.freeze({ ...frame.tilt }) });
}

/** An EQJ vector on the mean ecliptic and equinox of date, [x, y, z], in the frame `eclipticFrame` gave. */
export function meanEcliptic(frame: EclipticFrame, x: number, y: number, z: number): [number, number, number] {
  finite(x, "x");
  finite(y, "y");
  finite(z, "z");
  return meanOf(frame, x, y, z);
}

/**
 * An EQJ vector's longitude and latitude on the true ecliptic and equinox of
 * date at `tt`, degrees: the mean-ecliptic longitude plus Δψ, and the
 * latitude. A vector with no direction, such as the zero vector, throws
 * `RangeError`.
 */
export function eclipticOfDate(x: number, y: number, z: number, tt: number): { lon: number; lat: number } {
  finite(x, "x");
  finite(y, "y");
  finite(z, "z");
  finite(tt, "tt");
  const place = placeOfDate(x, y, z, tt);
  if (Number.isNaN(place.lat)) throw new RangeError("the vector has no direction.");
  return place;
}
