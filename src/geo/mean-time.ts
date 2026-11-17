// Local mean time from a longitude alone: four minutes of time per degree.

/**
 * The local mean time offset of a longitude, in seconds east of Greenwich:
 * `longitude × 240`, not rounded. Throws a RangeError unless the longitude is
 * a finite number of degrees between -180 and 180.
 */
export function localMeanTimeOffset(longitude: number): number {
  if (typeof longitude !== "number" || !(Math.abs(longitude) <= 180)) {
    throw new RangeError("longitude must be a number of degrees between -180 and 180.");
  }
  return longitude * 240 + 0;
}
