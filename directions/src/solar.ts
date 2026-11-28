import { calc } from "../../src/calc.js";
import type { CalcBounds, CalcPosition, CalcReceipt, CalcRequest, CalcScale } from "../../src/calc.js";
import type { SolarEquatorialDay } from "./timing.js";

/** A resolved Julian date with an explicit engine input scale. */
export interface SolarEquatorialDayInput {
  readonly time: {
    readonly jd: number;
    readonly scale: CalcScale;
    readonly deltaT?: number;
  };
  /** The sampling interval is a TT day, regardless of the input clock. */
  readonly dayScale: "tt";
}

type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

export type PreparedSolarEquatorialDay = DeepReadonly<{
  samples: SolarEquatorialDay;
  provenance: {
    adapter: "@zodiacs/engine/calc:Sun";
    sampling: "resolve-input-to-jd-tt;resample-start-and-start-plus-one-tt-day";
    latitude: "retain-solar-ecliptic-latitude";
    resolutionReceipt: CalcReceipt<CalcRequest>;
    start: { receipt: CalcReceipt<CalcRequest>; bounds: CalcBounds; declinationDegrees: number };
    end: { receipt: CalcReceipt<CalcRequest>; bounds: CalcBounds; declinationDegrees: number };
  };
}>;

export type SolarPreparationErrorCode = "invalid-input" | "engine-refusal" | "invalid-engine-result";

export class SolarPreparationError extends RangeError {
  constructor(readonly code: SolarPreparationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SolarPreparationError";
  }
}

function data(input: unknown, fields: readonly string[]): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new SolarPreparationError("invalid-input", "Solar sample inputs must be plain data objects.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !fields.includes(key)) {
      throw new SolarPreparationError("invalid-input", "Solar sample input contains an unsupported field.");
    }
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor) || !descriptor.enumerable) {
      throw new SolarPreparationError("invalid-input", "Solar sample fields must be explicit data properties.");
    }
    values[key] = descriptor.value;
  }
  return values;
}

function readInput(input: SolarEquatorialDayInput): SolarEquatorialDayInput {
  const values = data(input, ["time", "dayScale"]);
  const time = data(values.time, ["jd", "scale", "deltaT"]);
  if (values.dayScale !== "tt") {
    throw new SolarPreparationError("invalid-input", "Select dayScale: tt explicitly.");
  }
  if (typeof time.jd !== "number" || !Number.isFinite(time.jd)
    || (time.scale !== "utc" && time.scale !== "ut1" && time.scale !== "tt")) {
    throw new SolarPreparationError("invalid-input", "Provide a finite Julian date and an explicit utc, ut1 or tt input scale.");
  }
  if (Object.hasOwn(time, "deltaT") && (typeof time.deltaT !== "number"
    || !Number.isFinite(time.deltaT) || Math.abs(time.deltaT) > 1e10)) {
    throw new SolarPreparationError("invalid-input", "A supplied deltaT must be finite seconds within the engine's allowed range.");
  }
  return { time: { jd: time.jd, scale: time.scale,
    ...(time.deltaT === undefined ? {} : { deltaT: time.deltaT as number }) }, dayScale: "tt" };
}

// Called only on fresh engine records and our own newly allocated data.
function freeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

function sample(time: SolarEquatorialDayInput["time"], stage: "resolution" | "start" | "end"): CalcPosition {
  let result;
  try {
    result = calc({
      body: "Sun", time, frame: "equatorial-true-of-date", center: "geocentric", zodiac: "tropical",
      flags: { correction: "apparent", speeds: false, cartesian: false, units: "degrees", deflection: false }
    });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw new SolarPreparationError("invalid-input", `Engine rejected the solar ${stage} request.`, { cause: error });
  }
  if (result.status !== "ok") {
    throw new SolarPreparationError("engine-refusal", `Engine refused the solar ${stage} sample: ${result.detail}`, {
      cause: freeze(result)
    });
  }
  if (!Number.isFinite(result.lon) || result.lon < 0 || result.lon >= 360
    || !Number.isFinite(result.receipt.instants[0]?.jdTt)) {
    throw new SolarPreparationError("invalid-engine-result", "Engine did not supply a finite solar RA and TT instant.");
  }
  return result;
}

/**
 * Opt-in ephemeris adapter for the fixed birth-day solar-equatorial key.
 * Resolve the input clock through the engine, then sample its represented TT
 * Julian date and exactly one TT day later. Both samples keep the Sun's full
 * latitude and use their own true equator and equinox of date. The engine's
 * calc reference-span refusals apply to the resolution and to both samples.
 * This module is separate from the pure directions entry point.
 */
export function prepareSolarEquatorialDay(input: SolarEquatorialDayInput): PreparedSolarEquatorialDay {
  const request = readInput(input);
  const resolution = sample(request.time, "resolution");
  const jdTt = resolution.receipt.instants[0]!.jdTt;
  const pin = request.time.deltaT === undefined ? {} : { deltaT: request.time.deltaT };
  const start = sample({ jd: jdTt, scale: "tt", ...pin }, "start");
  const end = sample({ jd: jdTt + 1, scale: "tt", ...pin }, "end");
  if (start.receipt.instants[0]!.jdTt !== jdTt || end.receipt.instants[0]!.jdTt !== jdTt + 1) {
    throw new SolarPreparationError("invalid-engine-result", "Engine did not preserve the requested TT Julian-day interval.");
  }
  return freeze({
    samples: {
      timeScale: "tt", frame: "true-equator-equinox-of-date", center: "geocentric", correction: "apparent",
      start: { jdTt, rightAscensionDegrees: start.lon },
      end: { jdTt: jdTt + 1, rightAscensionDegrees: end.lon }
    },
    provenance: {
      adapter: "@zodiacs/engine/calc:Sun",
      sampling: "resolve-input-to-jd-tt;resample-start-and-start-plus-one-tt-day",
      latitude: "retain-solar-ecliptic-latitude",
      resolutionReceipt: resolution.receipt,
      start: { receipt: start.receipt, bounds: start.bounds, declinationDegrees: start.lat },
      end: { receipt: end.receipt, bounds: end.bounds, declinationDegrees: end.lat }
    }
  });
}
