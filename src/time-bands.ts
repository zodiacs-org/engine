/**
 * The bands of the time basis (docs/time.md, "The time bands"): from the ΔT
 * band and the UT1 − UTC band an instant records, the 1-σ bands of the TT and
 * the UT1 the engine used, by the scale the instant was given on and the basis
 * that gave UT1 and TT. `@zodiacs/engine/time` exports them. This module
 * imports types only, so that the entries that use it can share it.
 */
import type { DeltaT } from "./deltat.js";
import type { TimeScale } from "./time-scale.js";

/** The 1-σ bands, in seconds, of the TT and the UT1 a time basis gave an instant. They are not bounds (docs/time.md, "The time bands"). */
export interface TimeBands {
  readonly tt: number;
  readonly ut1: number;
}

/** Whether a recorded band is a number of seconds from 0 to 1e10. */
const isBand = (value: unknown): value is number => typeof value === "number" && value >= 0 && value <= 1e10;

/**
 * The bands of a recorded instant, from its `deltaT` and `timeScale`: a
 * `TimeBasis`, a root `Chart`, a calc receipt's instant, or a natal
 * envelope's result from the time-basis conventions set on. With d the ΔT
 * band (`deltaT.sigma`, 0 for a pin) and u the UT1 − UTC band
 * (`timeScale.ut1MinusUtc.sigma`, 0 where there is none), the bands are
 * `{ tt: 0, ut1: d }` on TT input, `{ tt: d, ut1: 0 }` on UT1 input, and on
 * UTC input `{ tt: 0, ut1: u }` on the IERS basis, `{ tt: u, ut1: u }` with a
 * pin, and `{ tt: √(u² + d²), ut1: u }` on the ΔT model, where u is 0 before
 * 1972. It reads those fields only and recomputes no σ. Throws RangeError for
 * a record without a `deltaT` or a `timeScale`, or with a scale, a basis or a
 * band it does not know.
 */
export function timeBands(record: { readonly deltaT: DeltaT; readonly timeScale: TimeScale }): TimeBands {
  const { deltaT, timeScale } = Object(record) as Partial<typeof record>;
  const { input, basis, ut1MinusUtc } = Object(timeScale) as Partial<TimeScale>;
  const d = deltaT?.sigma === null ? 0 : deltaT?.sigma;
  const u = ut1MinusUtc === null ? 0 : ut1MinusUtc?.sigma;
  if (!isBand(d) || !isBand(u) || !["utc", "ut1", "tt"].includes(input!) || !["iers", "delta-t", "pinned"].includes(basis!)) {
    throw new RangeError("timeBands takes the deltaT and timeScale that a time basis, a chart or a calc instant records.");
  }
  if (input === "tt") return { tt: 0, ut1: d };
  if (input === "ut1") return { tt: d, ut1: 0 };
  return { tt: basis === "iers" ? 0 : basis === "pinned" ? u : Math.hypot(u, d), ut1: u };
}
