import { calc } from "../../src/calc.js";
import type { CalcPosition, CalcReceipt, CalcRefusal, CalcRequest } from "../../src/calc.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { fields, normalizeInstant, normalizeObserver } from "./input.js";
import type { Instant, NormalizedObserver, Observer } from "./input.js";

export const SOLAR_SYSTEM_BODIES = Object.freeze([
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"
] as const);
export type SolarSystemBody = (typeof SOLAR_SYSTEM_BODIES)[number];
export type PositionFrame = "equatorial-true-of-date" | "ecliptic-true-of-date";

export interface PositionRequest {
  readonly body: SolarSystemBody;
  readonly time: Instant;
  readonly observer?: Observer;
  readonly frame?: PositionFrame;
}

export interface PositionReceipt {
  readonly schema: "zodiacs.occultations.position-receipt.v1";
  readonly implementation: "engine-adapter/1";
  readonly request: {
    readonly body: SolarSystemBody;
    readonly time: string;
    readonly observer: NormalizedObserver | null;
    readonly frame: PositionFrame;
  };
  readonly engine: CalcReceipt<CalcRequest>["engine"];
  readonly conventions: readonly string[];
  /** Null only for an engine refusal, which supplies no calculation receipt. */
  readonly calculation: CalcReceipt<CalcRequest> | null;
  readonly validation: "integration-only;occultation-accuracy-unmeasured";
}

export type PositionResult =
  | (Omit<CalcPosition, "receipt"> & { readonly receipt: PositionReceipt })
  | (CalcRefusal & { readonly receipt: PositionReceipt });

/** Freeze only newly allocated records; never freeze a caller's Date or observer. */
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** A position sample, not an occultation prediction. RA/longitude are degrees. */
export function positionAt(request: PositionRequest): PositionResult {
  const input = fields(request, "position request", ["body", "time", "observer", "frame"]);
  if (typeof input.body !== "string" || !(SOLAR_SYSTEM_BODIES as readonly string[]).includes(input.body)) {
    throw new RangeError("body must name a supported physical solar-system body.");
  }
  const body = input.body as SolarSystemBody;
  const time = normalizeInstant(input.time as Instant);
  const observer = input.observer === undefined ? null : normalizeObserver(input.observer as Observer);
  const frame = input.frame === undefined ? "equatorial-true-of-date" : input.frame;
  if (frame !== "equatorial-true-of-date" && frame !== "ecliptic-true-of-date") {
    throw new RangeError("frame must be equatorial-true-of-date or ecliptic-true-of-date.");
  }
  const result = calc({
    body, time, frame,
    center: observer === null ? "geocentric" : { topocentric: {
      latitude: observer.latitude, longitude: observer.longitude, height: observer.elevationMeters
    } },
    flags: { correction: "apparent", cartesian: true, speeds: false, units: "degrees", deflection: false }
  });
  const receipt: PositionReceipt = {
    schema: "zodiacs.occultations.position-receipt.v1",
    implementation: "engine-adapter/1",
    request: { body, time, observer, frame },
    engine: { name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: { ...EPHEMERIS } },
    conventions: [
      "time:engine-utc-basis", "angles:degrees", "distance:au", "correction:engine-apparent",
      "deflection:none", "refraction:none", `frame:${frame}`,
      observer === null ? "center:geocentric" : "observer:iers-2003-ellipsoid;elevation-metres"
    ],
    calculation: result.status === "ok" ? result.receipt : null,
    validation: "integration-only;occultation-accuracy-unmeasured"
  };
  // Clone engine objects so deep freezing cannot reach its shared span/constants.
  return freeze(structuredClone({ ...result, receipt }));
}
