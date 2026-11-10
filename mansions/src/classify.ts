import { getBoundaryTable } from "./tables.js";
import type { BoundaryTable, BoundaryTableId, MansionDefinition } from "./tables.js";

/** A mathematical classification, without a time, ephemeris or engine receipt. */
export interface LongitudeClassification {
  readonly table: BoundaryTable;
  readonly mansion: MansionDefinition;
}

// Decode the supplied finite binary64 value as an exact signed fraction.
// Keeping the remainder rational avoids rounding a value across Aries or a
// rational table boundary when normalizing or multiplying by the denominator.
function exactFraction(value: number): { numerator: bigint; denominator: bigint } {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  const bits = view.getBigUint64(0, false);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const significand = exponent === 0 ? fraction : (1n << 52n) + fraction;
  const power = exponent === 0 ? -1074 : exponent - 1023 - 52;
  const sign = (bits >> 63n) === 0n ? 1n : -1n;
  return power >= 0
    ? { numerator: sign * (significand << BigInt(power)), denominator: 1n }
    : { numerator: sign * significand, denominator: 1n << BigInt(-power) };
}

/**
 * Classify finite longitude in degrees with mandatory versioned table selection.
 * The number is taken as its exact binary64 value and reduced modulo a circle.
 * Compare with exact rational [start,end) boundaries, without an epsilon.
 * This function neither selects a zodiac nor calculates a Moon position.
 */
export function classifyLongitude(longitude: number, tableId: BoundaryTableId): LongitudeClassification {
  const table = getBoundaryTable(tableId);
  if (typeof longitude !== "number" || !Number.isFinite(longitude)) {
    throw new RangeError("Longitude must be a finite number of degrees.");
  }

  const { numerator, denominator } = exactFraction(longitude);
  const circle = 360n * denominator;
  const remainder = numerator % circle;
  const wrapped = remainder < 0n ? remainder + circle : remainder;
  const mansion = table.mansions.find(({ start, end }) =>
    wrapped * BigInt(start.denominator) >= BigInt(start.numerator) * denominator
    && wrapped * BigInt(end.denominator) < BigInt(end.numerator) * denominator);

  // Only the validated, immutable registry table is accepted above. A missing
  // match would be a programming error in that table, never an input fallback.
  if (mansion === undefined) throw new Error("Mansion table does not cover longitude.");
  return Object.freeze({ table, mansion });
}
