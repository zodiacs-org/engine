/**
 * The span over which this engine's positions have been compared with an
 * independent ephemeris: from 1800-01-01T00:00Z up to, not including,
 * 2200-01-01T00:00Z. Charts outside it are still computed, and carry the
 * `outside-reference-span` flag.
 */
export const REFERENCE_SPAN = Object.freeze({
  from: "1800-01-01T00:00:00.000Z",
  to: "2200-01-01T00:00:00.000Z"
} as const);

/**
 * The span of Terrestrial Time over which the ephemeris is evaluated at all:
 * the years astronomy-engine 2.1.19 itself tabulates, J2000 ± 730,000 days of
 * TT (0001-04-30T12:00 to 3998-09-03T12:00 TT). That is the range of its Pluto
 * model's state table; for any other time its source says: "The target time is
 * outside the year range 0000..4000. Calculate it by crawling backward from 0000
 * or forward from 4000. ... This is super slow." Beyond the table its other
 * series diverge as well: on 30000-06-01 the Sun came out 29° off the ecliptic.
 *
 * Every instant a calculation evaluates, the instant and its speed samples, must
 * lie inside on the calculation's own ΔT clock, or the call throws RangeError.
 * With the model ΔT, instants from 0001-05-01T00:00Z to 3998-09-02T00:00Z are
 * always inside. Being inside is not an accuracy claim: see REFERENCE_SPAN.
 */
export const EPHEMERIS_SPAN = Object.freeze({
  /** The scale of the bounds, as a label, like `fromTT` and `toTT`: not a TimeScaleName, which is lowercase. */
  timeScale: "TT",
  /** Days of Terrestrial Time from J2000.0, 2000-01-01T12:00 TT, inclusive. */
  daysFromJ2000: Object.freeze({ from: -730000, to: 730000 } as const),
  /** The same bounds as Terrestrial Time labels (not UTC). */
  fromTT: "0001-04-30T12:00:00",
  toTT: "3998-09-03T12:00:00"
} as const);

const FROM = Date.UTC(1800, 0, 1);
const TO = Date.UTC(2200, 0, 1);

/** True when the instant lies outside REFERENCE_SPAN. */
export function outsideReferenceSpan(utc: Date): boolean {
  const time = Date.prototype.getTime.call(utc);
  return !(time >= FROM && time < TO);
}
