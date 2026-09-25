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

const FROM = Date.UTC(1800, 0, 1);
const TO = Date.UTC(2200, 0, 1);

/** True when the instant lies outside REFERENCE_SPAN. */
export function outsideReferenceSpan(utc: Date): boolean {
  const time = Date.prototype.getTime.call(utc);
  return !(time >= FROM && time < TO);
}
