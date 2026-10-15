import type { CalcPosition, CalcRefusal, CalcTime } from "../../src/calc.js";
import { classifyLongitude } from "./classify.js";
import { siderealMoon, tropicalMoon } from "./engine.js";
import { getBoundaryTable } from "./tables.js";
import type { BoundaryTable, BoundaryTableId, MansionDefinition } from "./tables.js";
import { checkOptions, readZodiac } from "./zodiac.js";
import type { MansionZodiac } from "./zodiac.js";

export interface MansionAtRequest {
  readonly time: CalcTime;
  /** A full versioned identifier is required; no table is inferred. */
  readonly table: BoundaryTableId;
  /** Omitted means tropical; sidereal requires an explicit built-in name. */
  readonly zodiac?: MansionZodiac;
}

export interface MansionAtResult {
  readonly status: "ok";
  /** UTC label from the engine receipt, to the millisecond. */
  readonly at: string;
  readonly zodiac: MansionZodiac;
  /** Geocentric Moon longitude in the selected zodiac, degrees. */
  readonly longitude: number;
  /** Unmodified engine ayanamsa; its calculation is recorded by receipt. */
  readonly ayanamsa: CalcPosition["ayanamsa"];
  /** Tropical true-ecliptic-of-date sample at the same input time and clock. */
  readonly tropicalLongitude: number;
  readonly tropicalBounds: CalcPosition["bounds"];
  readonly tropicalReceipt: CalcPosition["receipt"];
  readonly table: BoundaryTable;
  readonly mansion: MansionDefinition;
  /** The engine's original bounds and receipt, without new accuracy claims. */
  readonly bounds: CalcPosition["bounds"];
  readonly receipt: CalcPosition["receipt"];
}

/**
 * Calculate a mansion at a resolved instant. Invalid requests throw
 * RangeError; unsupported coverage returns the engine's unmodified refusal.
 * This synchronous function performs no I/O and retains no caller state.
 */
export function mansionAt(request: MansionAtRequest): MansionAtResult | CalcRefusal {
  return calculateMansionAt(request, () => {});
}

/** Internal hook counts actual engine calls against the shared search budget. */
export function calculateMansionAt(request: MansionAtRequest, beforeEvaluation: () => void): MansionAtResult | CalcRefusal {
  checkOptions(request, ["time", "table", "zodiac"], "Mansion at request");
  const table = getBoundaryTable(request.table);
  const zodiac = readZodiac(request.zodiac);
  beforeEvaluation();
  const tropical = tropicalMoon(request.time);
  if (tropical.status === "refused") return tropical;
  let moon = tropical;
  if (zodiac !== "tropical") {
    beforeEvaluation();
    const sidereal = siderealMoon(request.time, zodiac.sidereal);
    if (sidereal.status === "refused") return sidereal;
    moon = sidereal;
  }

  const instant = moon.receipt.instants[0];
  if (instant === undefined) throw new Error("Moon calculation has no engine instant receipt.");
  const { mansion } = classifyLongitude(moon.lon, table.id);
  return {
    status: "ok",
    at: instant.utc,
    zodiac,
    longitude: moon.lon,
    ayanamsa: moon.ayanamsa,
    tropicalLongitude: tropical.lon,
    tropicalBounds: tropical.bounds,
    tropicalReceipt: tropical.receipt,
    table,
    mansion,
    bounds: moon.bounds,
    receipt: moon.receipt
  };
}
