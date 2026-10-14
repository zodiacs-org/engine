import { CALC_AYANAMSAS, calc } from "../../src/calc.js";
import type {
  CalcAyanamsa, CalcAyanamsaValue, CalcPosition, CalcRefusal, CalcTime
} from "../../src/calc.js";
import { nakshatraOf } from "../../src/vedic/nakshatra.js";
import type { NakshatraPosition } from "../../src/vedic/nakshatra.js";
import { declareSiderealLongitude } from "../../src/vedic/sidereal.js";

export const PANCHANG_AYANAMSAS = CALC_AYANAMSAS;
export type PanchangAyanamsa = CalcAyanamsa;
export type PanchangInstant = CalcTime;

export interface SnapshotOptions {
  readonly ayanamsa?: PanchangAyanamsa;
}

export interface LuminaryPosition {
  readonly tropical: CalcPosition;
  readonly sidereal: CalcPosition;
}

export interface LuminarySnapshot {
  readonly status: "ok";
  readonly utc: string;
  readonly ayanamsa: CalcAyanamsaValue;
  readonly sun: LuminaryPosition;
  readonly moon: LuminaryPosition;
  readonly nakshatra: NakshatraPosition;
}

export interface SnapshotRefusal {
  readonly status: "refused";
  readonly body: "Sun" | "Moon";
  readonly zodiac: "tropical" | "sidereal";
  readonly ayanamsa: PanchangAyanamsa;
  readonly engine: CalcRefusal;
}

export type SnapshotResult = LuminarySnapshot | SnapshotRefusal;

function ayanamsaOf(options: SnapshotOptions): PanchangAyanamsa {
  if (options === null || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).some((key) => key !== "ayanamsa")) {
    throw new RangeError("Snapshot options accept only ayanamsa.");
  }
  const name = options.ayanamsa === undefined ? "lahiri" : options.ayanamsa;
  if (!PANCHANG_AYANAMSAS.includes(name)) {
    throw new RangeError("ayanamsa must be an engine built-in name.");
  }
  return name;
}

/** Engine geocentric longitudes in degrees, with complete original calc receipts. */
export function luminarySnapshot(at: PanchangInstant, options: SnapshotOptions = {}): SnapshotResult {
  const name = ayanamsaOf(options);
  const rows: CalcPosition[] = [];
  for (const body of ["Sun", "Moon"] as const) {
    for (const zodiac of ["tropical", "sidereal"] as const) {
      const result = calc({
        body,
        time: at,
        frame: "ecliptic-true-of-date",
        center: "geocentric",
        zodiac: zodiac === "tropical" ? "tropical" : { sidereal: name },
        flags: { correction: "apparent", units: "degrees", speeds: false }
      });
      if (result.status === "refused") {
        return Object.freeze({ status: "refused", body, zodiac, ayanamsa: name, engine: result });
      }
      rows.push(result);
    }
  }
  const [sunTropical, sunSidereal, moonTropical, moonSidereal] = rows as
    [CalcPosition, CalcPosition, CalcPosition, CalcPosition];
  const utc = sunTropical.receipt.instants[0]!.utc;
  // calc has already converted into the sidereal zodiac and records its ayanamsa.
  // Declare that result for the engine's branded nakshatra input; no conversion here.
  const moonLongitude = declareSiderealLongitude(moonSidereal.lon, { ayanamsa: name, at: utc });
  return Object.freeze({
    status: "ok",
    utc,
    ayanamsa: sunSidereal.ayanamsa!,
    sun: Object.freeze({ tropical: sunTropical, sidereal: sunSidereal }),
    moon: Object.freeze({ tropical: moonTropical, sidereal: moonSidereal }),
    nakshatra: nakshatraOf(moonLongitude)
  });
}
