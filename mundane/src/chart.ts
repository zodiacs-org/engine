import { natalChart } from "../../src/api.js";
import { validateBirthSettings } from "../../src/birth-input.js";
import { dateFrom } from "../../src/date-input.js";
import { createNatalEnvelope } from "../../src/receipt.js";
import type { NatalReceipt } from "../../src/receipt.js";
import type {
  Angles, Aspect, BodyPosition, ChartFlag, DateInput, DeltaT, HouseSystem, TimeScale
} from "../../src/types.js";
import { normalizePlace } from "./inputs.js";
import type { Place } from "./inputs.js";

/** Cast a supplied resolved UTC instant; this does not establish an event. */
export interface EventChartInput {
  readonly at: DateInput;
  readonly place: Place;
  readonly houseSystem?: HouseSystem;
}

type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

/** JSON-compatible chart snapshot, with the engine's numerical values intact. */
export type EventChart = DeepReadonly<{
  at: string;
  place: Place;
  angles: Angles;
  houses: {
    requested: HouseSystem;
    actual: HouseSystem;
    /** Ecliptic cusp longitudes in degrees; index zero is the first house. */
    cusps: number[];
  };
  bodies: BodyPosition[];
  aspects: Aspect[];
  flags: ChartFlag[];
  deltaT: DeltaT;
  timeScale: TimeScale;
  provenance: {
    /** Source imports are not an authenticated release artifact. */
    source: "relative-checkout";
    /** Original ISO spelling when supplied; null for numeric or Date inputs. */
    sourceInstant: string | null;
    engine: NatalReceipt["engine"];
    conventions: NatalReceipt["conventions"];
    coverage: NatalReceipt["coverage"];
  };
}>;

// Only called on fresh engine output and plain objects assembled here.
// There are no Dates, accessors, caller-owned objects, or cycles to freeze.
function freezeSnapshot<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/**
 * Reuse natalChart for bodies, angles, houses, aspects and the engine clock.
 * Preserve calculation flags and receipt metadata; never infer accuracy or
 * an ingress/lunation/eclipse identity from the caller's supplied instant.
 */
export function castEventChart(input: EventChartInput): EventChart {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new RangeError("event chart input must be an object.");
  }
  for (const key of Object.keys(input)) {
    if (key !== "at" && key !== "place" && key !== "houseSystem") {
      throw new RangeError("event chart input accepts only at, place and houseSystem.");
    }
  }
  const { at, place: suppliedPlace, houseSystem } = input;
  const place = normalizePlace(suppliedPlace);
  const settings = validateBirthSettings(houseSystem === undefined ? {} : { houseSystem });
  const instant = dateFrom(at, "at");
  const chart = natalChart({
    utc: instant,
    latitude: place.latitude,
    longitude: place.longitude,
    houseSystem: settings.houseSystem ?? "whole",
    timeKnown: true
  });
  if (chart.angles === null || chart.houses === null) {
    throw new Error("engine did not return angles and houses for a resolved event chart.");
  }
  const { receipt } = createNatalEnvelope(chart,
    typeof at === "string" ? { sourceInstant: at } : {}
  );
  return freezeSnapshot({
    at: chart.input.utc.toISOString(),
    place,
    angles: chart.angles,
    houses: {
      requested: chart.input.houseSystem,
      actual: chart.houses.system,
      cusps: chart.houses.cusps
    },
    bodies: chart.bodies,
    aspects: chart.aspects,
    flags: chart.flags,
    deltaT: chart.deltaT,
    timeScale: chart.timeScale,
    provenance: {
      source: "relative-checkout" as const,
      sourceInstant: receipt.sourceInstant,
      engine: receipt.engine,
      conventions: receipt.conventions,
      coverage: receipt.coverage
    }
  });
}
