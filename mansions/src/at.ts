import type { CalcPosition, CalcRefusal, CalcTime } from "../../src/calc.js";
import { classifyLongitude } from "./classify.js";
import { tropicalMoon } from "./engine.js";
import { getBoundaryTable } from "./tables.js";
import type { BoundaryTable, BoundaryTableId, MansionDefinition } from "./tables.js";

export interface MansionAtRequest {
  readonly time: CalcTime;
  /** A full versioned identifier is required; no table is inferred. */
  readonly table: BoundaryTableId;
}

export interface MansionAtResult {
  readonly status: "ok";
  /** UTC label from the engine receipt, to the millisecond. */
  readonly at: string;
  readonly zodiac: "tropical";
  /** Geocentric Moon longitude on the true ecliptic of date, degrees. */
  readonly longitude: number;
  readonly table: BoundaryTable;
  readonly mansion: MansionDefinition;
  /** The engine's original bounds and receipt, without new accuracy claims. */
  readonly bounds: CalcPosition["bounds"];
  readonly receipt: CalcPosition["receipt"];
}

/**
 * Calculate a tropical mansion at a resolved instant. Invalid requests throw
 * RangeError; unsupported coverage returns the engine's unmodified refusal.
 * This synchronous function performs no I/O and retains no caller state.
 */
export function mansionAt(request: MansionAtRequest): MansionAtResult | CalcRefusal {
  if (request === null || typeof request !== "object" || Array.isArray(request)
    || request instanceof Date
    || Object.keys(request).some((key) => key !== "time" && key !== "table")) {
    throw new RangeError("Mansion at request takes only time and a versioned table identifier.");
  }
  const table = getBoundaryTable(request.table);
  const moon = tropicalMoon(request.time);
  if (moon.status === "refused") return moon;

  const instant = moon.receipt.instants[0];
  if (instant === undefined) throw new Error("Moon calculation has no engine instant receipt.");
  const { mansion } = classifyLongitude(moon.lon, table.id);
  return {
    status: "ok",
    at: instant.utc,
    zodiac: "tropical",
    longitude: moon.lon,
    table,
    mansion,
    bounds: moon.bounds,
    receipt: moon.receipt
  };
}
