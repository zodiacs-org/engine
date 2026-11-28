/** Reference-only position differences. Does not read fitted coefficients or source velocity columns. */
import type { IndependentEclipticRow } from "./pilot-validation.ts";

function fail(message: string): never { throw new Error(`Reference derivative: ${message}`); }
function angleOffset(value: number, center: number): number {
  const offset = ((value - center + 540) % 360 + 360) % 360 - 180;
  if (Math.abs(offset) === 180) fail("longitude unwrap is ambiguous.");
  return offset;
}

/**
 * Sixth-order centered derivative at the middle epoch. Pair differences avoid
 * subtracting weighted absolute ranges. The epochs must form an exactly uniform
 * grid in binary64; quarter- and half-day offsets satisfy this at the supported JDs.
 * The coefficients differentiate polynomials through degree six exactly in exact
 * arithmetic; the leading smooth-function error is h^6*f^(7)/140.
 */
export function sevenPointReferenceRate(rows: readonly IndependentEclipticRow[]) {
  if (rows.length !== 7) fail("expected seven reference positions.");
  const center = rows[3]!;
  const step = (rows[6]!.jdTt - rows[0]!.jdTt) / 6;
  if (!(step > 0) || !Number.isFinite(step)) fail("epochs must increase.");
  if (rows.some((row, index) => ![row.jdTt, row.longitudeDeg, row.latitudeDeg, row.distanceAu].every(Number.isFinite) ||
      row.jdTt !== center.jdTt + (index - 3) * step || row.longitudeDeg < 0 || row.longitudeDeg >= 360 ||
      Math.abs(row.latitudeDeg) > 90 || row.distanceAu <= 0)) {
    fail("invalid values or nonuniform actual epochs.");
  }
  const derivative = (values: readonly number[]) => (
    45 * (values[4]! - values[2]!) - 9 * (values[5]! - values[1]!) + (values[6]! - values[0]!)
  ) / (60 * step);
  return {
    longitudeSpeedDegPerDay: derivative(rows.map(row => angleOffset(row.longitudeDeg, center.longitudeDeg))),
    latitudeSpeedDegPerDay: derivative(rows.map(row => row.latitudeDeg)),
    distanceSpeedAuPerDay: derivative(rows.map(row => row.distanceAu))
  };
}
