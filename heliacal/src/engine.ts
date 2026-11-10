import { calc } from "../../src/calc.js";
import type { CalcPosition, CalcReceipt, CalcRefusal, CalcRequest } from "../../src/calc.js";
import { optionsOf, skyEvents } from "../../src/sky/riseset.js";
import type { SkyEvent, SkyEvents, SkyOptions } from "../../src/sky/riseset.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { dateRange, instant, observationBody, observer } from "./inputs.js";
import type { DateInput, ObservationBody, Observer } from "./inputs.js";

export type EnginePosition = CalcPosition | CalcRefusal;

export interface PositionOptions {
  readonly frame?: "ecliptic-true-of-date" | "equatorial-true-of-date";
  /** Omit for the geocentre. Heights use the common range accepted by sky. */
  readonly observer?: Observer;
}

/** Apparent tropical coordinates, degrees and au, with the engine's intact receipt. */
export function enginePosition(body: ObservationBody, at: DateInput, options?: PositionOptions): EnginePosition {
  const name = observationBody(body);
  const time = instant(at);
  const fields = optionsOf(options, ["frame", "observer"], "position options");
  const frame = fields.frame === undefined ? "ecliptic-true-of-date" : fields.frame;
  if (frame !== "ecliptic-true-of-date" && frame !== "equatorial-true-of-date") {
    throw new RangeError("frame must be ecliptic-true-of-date or equatorial-true-of-date.");
  }
  const center = fields.observer === undefined ? "geocentric" : { topocentric: observer(fields.observer) };
  return calc({
    body: name,
    time,
    frame,
    center,
    zodiac: "tropical",
    flags: { correction: "apparent", speeds: false, cartesian: true, units: "degrees", deflection: false }
  });
}

export interface ReceiptedSkyEvent extends SkyEvent {
  /** A position receipt is not an attestation of the horizon search or visibility. */
  readonly position: EnginePosition;
}

interface HorizonProvenance {
  readonly engine: CalcReceipt<CalcRequest>["engine"];
  readonly receiptScope: "event-positions";
}

export type HorizonEvents = HorizonProvenance & (
  | (Omit<Extract<SkyEvents, { status: "complete" }>, "events"> & { readonly events: readonly ReceiptedSkyEvent[] })
  | Extract<SkyEvents, { status: "refused" }>
);

const ENGINE = Object.freeze({ name: "@zodiacs/engine" as const, version: ENGINE_VERSION, ephemeris: EPHEMERIS });

/**
 * Delegate all horizon crossings and transits to the engine's sky solver.
 * Keep sky conventions, flags, sample counts and refusals. Additional position
 * calls are not charged to sky's maxSamples, which budgets its search alone.
 * Sky uses WGS84, while calc's topocentric receipts identify IERS 2003.
 */
export function horizonEvents(
  body: ObservationBody,
  site: Observer,
  from: DateInput,
  to: DateInput,
  options?: SkyOptions
): HorizonEvents {
  const name = observationBody(body);
  const place = observer(site);
  const window = dateRange(from, to);
  const result = skyEvents(name, place, window.from, window.to, options);
  const provenance: HorizonProvenance = { engine: ENGINE, receiptScope: "event-positions" };
  if (result.status === "refused") return Object.freeze({ ...result, ...provenance });
  const events = result.events.map((event): ReceiptedSkyEvent => Object.freeze({
    ...event,
    position: enginePosition(name, event.at, { frame: "equatorial-true-of-date", observer: place })
  }));
  return Object.freeze({ ...result, ...provenance, events: Object.freeze(events) });
}
