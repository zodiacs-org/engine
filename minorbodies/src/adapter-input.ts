/** Input snapshots and time translation for the source-checkout adapter. */
import { dateFrom } from "../../src/date-input.js";
import { timeBasis } from "../../src/time-scale.js";
import type { TimeBasis } from "../../src/time-scale.js";
import type { CalcTime } from "../../src/calc.js";
import { resolveMinorBodyTime } from "./engine-bridge.ts";

export type AdapterTimeRequest = Exclude<CalcTime, string | Date>;
export interface AdapterTimeReceipt {
  readonly request: AdapterTimeRequest;
  readonly jdTt: number;
  readonly engineTimeBasis: Readonly<TimeBasis> | null;
}

/** Never evaluates accessors or serializes caller code; Dates become ISO readings. */
export function snapshot<T>(value: T): T {
  let remaining = 256;
  function copy(item: unknown, depth: number, path = ""): unknown {
    if (--remaining < 0 || depth > 12) throw new RangeError("Adapter input exceeds snapshot limits.");
    if (item === undefined || item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (item instanceof Date) {
      if (path !== "" && path !== "time" && path !== "zodiac.sidereal.epoch") {
        throw new RangeError("Dates are accepted only as time or ayanamsa epoch inputs.");
      }
      return dateFrom(item, "adapter date").toISOString();
    }
    if (typeof item !== "object" || Array.isArray(item)) throw new RangeError("Adapter input requires finite JSON data fields.");
    const result: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(item)) {
      const field = Object.getOwnPropertyDescriptor(item, key);
      if (typeof key !== "string" || key === "__proto__" || !field || !("value" in field)) {
        throw new RangeError("Adapter input requires own string data fields.");
      }
      // Keep undefined keys so a misspelled option cannot disappear before validation.
      result[key] = copy(field.value, depth + 1, path === "" ? key : `${path}.${key}`);
    }
    return Object.freeze(result);
  }
  return copy(value, 0) as T;
}

export function fields(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || value instanceof Date ||
      Object.keys(value).some(key => !allowed.includes(key))) throw new RangeError(`Invalid ${label} fields.`);
  return value as Record<string, unknown>;
}

export function deltaTPin(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e10) {
    throw new RangeError("deltaT must be finite seconds within the engine's operational limit.");
  }
  return value;
}

/** Match calc's input vocabulary; conversion itself stays in the engine time basis. */
export function readAdapterTime(input: CalcTime): AdapterTimeRequest {
  const value = snapshot(input);
  if (typeof value === "string") {
    dateFrom(value, "adapter time");
    return Object.freeze({ iso: value });
  }
  const given = fields(value, ["iso", "jd", "scale", "deltaT"], "adapter time");
  const pin = deltaTPin(given.deltaT);
  const pinned = pin === undefined ? {} : { deltaT: pin };
  if (given.iso !== undefined) {
    if (typeof given.iso !== "string" || given.jd !== undefined || given.scale !== undefined) {
      throw new RangeError("Adapter time takes iso, or jd and scale.");
    }
    dateFrom(given.iso, "adapter time");
    return Object.freeze({ iso: given.iso, ...pinned });
  }
  if (typeof given.jd !== "number" || !Number.isFinite(given.jd) ||
      (given.scale !== "utc" && given.scale !== "ut1" && given.scale !== "tt")) {
    throw new RangeError("Adapter Julian time requires finite jd and scale utc, ut1 or tt.");
  }
  return Object.freeze({ jd: given.jd, scale: given.scale, ...pinned });
}

function freezeBasis(basis: TimeBasis): Readonly<TimeBasis> {
  Object.freeze(basis.deltaT);
  if (basis.timeScale.ut1MinusUtc) Object.freeze(basis.timeScale.ut1MinusUtc);
  if (basis.timeScale.leapSeconds) Object.freeze(basis.timeScale.leapSeconds);
  Object.freeze(basis.timeScale);
  return Object.freeze(basis);
}

export function resolveAdapterTime(request: AdapterTimeRequest): AdapterTimeReceipt {
  if ("jd" in request && request.scale === "tt") {
    const { jdTt } = resolveMinorBodyTime({ jd: request.jd, scale: "tt" });
    // A Delta T pin changes inferred UT1, never an explicitly supplied TT epoch.
    return Object.freeze({ request, jdTt, engineTimeBasis: null });
  }
  const ms = "iso" in request ? dateFrom(request.iso, "adapter time").getTime()
    : Date.UTC(2000, 0, 1, 12) + (request.jd - 2451545) * 86_400_000;
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) throw new RangeError("Adapter time is outside the Date range.");
  const basis = timeBasis(ms, "iso" in request ? "utc" : request.scale, request.deltaT);
  const { jdTt } = resolveMinorBodyTime({ jd: 2451545 + basis.ttDays, scale: "tt" });
  return Object.freeze({ request, jdTt, engineTimeBasis: freezeBasis(basis) });
}
