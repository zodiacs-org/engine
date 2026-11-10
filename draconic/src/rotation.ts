function requireLongitude(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 360) {
    throw new RangeError(`${label} must be a finite number in [0, 360) degrees.`);
  }
}

/**
 * Subtract a natal north-node longitude from a natal tropical longitude.
 * Both inputs and the result are degrees in [0, 360). Uses binary64 arithmetic.
 * This fixed chart rotation does not calculate a speed or a new ephemeris.
 */
export function rotateLongitude(longitude: number, northNodeLongitude: number): number {
  requireLongitude(longitude, "Longitude");
  requireLongitude(northNodeLongitude, "North-node longitude");

  const difference = longitude - northNodeLongitude;
  const rotated = difference < 0 ? difference + 360 : difference;
  // A tiny negative difference can round to 360 when wrapped. Canonicalize
  // that endpoint and signed zero so neither leaks outside the result domain.
  return rotated === 360 || rotated === 0 ? 0 : rotated;
}

/**
 * Signed shortest displacement from natal to draconic, in degrees (-180, 180].
 * Both longitudes must be in [0, 360). An exact half-circle tie is +180;
 * zero is positive zero. Uses binary64 subtraction and at most one wrap.
 */
export function signedLongitudeDelta(natalLongitude: number, draconicLongitude: number): number {
  requireLongitude(natalLongitude, "Natal longitude");
  requireLongitude(draconicLongitude, "Draconic longitude");
  const difference = draconicLongitude - natalLongitude;
  const delta = difference <= -180 ? difference + 360
    : difference > 180 ? difference - 360 : difference;
  return delta === 0 ? 0 : delta;
}
