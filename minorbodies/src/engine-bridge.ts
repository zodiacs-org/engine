import { apply, frameMatrix, sphericalRates, toSpherical, transpose } from "../../src/calc-frames.js";
import type { Mat3 } from "../../src/calc-frames.js";
import { dateFrom } from "../../src/date-input.js";
import { timeBasis } from "../../src/time-scale.js";
import type { TimeBasis, TimeScaleName } from "../../src/time-scale.js";
import type { DateInput } from "../../src/types.js";
import { CHEBYSHEV_LIMITS } from "./chebyshev.ts";
import type { CartesianTriple } from "./chebyshev.ts";

/** Source imports are isolated here; this module never instantiates an ephemeris clock. */
export const ENGINE_BRIDGE_SETTINGS = Object.freeze({
  id: "minorbodies-engine-bridge-v1",
  frame: "ecliptic-true-of-date",
  inputFrame: "ICRF",
  frameDerivative: "symmetric-five-point",
  frameDerivativeStepDays: 0.01,
  maxAbsDeltaTSeconds: 1e10
} as const);

export type MinorBodyTimeInput =
  | { readonly jd: number; readonly scale: "tt" }
  | { readonly date: DateInput; readonly timeScale?: TimeScaleName; readonly deltaT?: number };

export type MinorBodyTimeRequest =
  | { readonly jd: number; readonly scale: "tt" }
  | { readonly date: string; readonly timeScale: TimeScaleName; readonly deltaT?: number };

export interface MinorBodyTimeReceipt {
  readonly request: MinorBodyTimeRequest;
  readonly jdTt: number;
  readonly source: "explicit-tt" | "engine-time-basis";
  /** Null for a TT Julian date, where no civil clock or Delta T model was used. */
  readonly engineTimeBasis: Readonly<TimeBasis> | null;
}

export interface ResolvedMinorBodyTime {
  readonly jdTt: number;
  readonly timeReceipt: MinorBodyTimeReceipt;
}

export interface IcrfState {
  readonly positionAu: CartesianTriple;
  /** Derivative of the corrected ICRF position, with respect to TT days. */
  readonly velocityAuPerDay: CartesianTriple;
}

export interface ReducedIcrfState {
  readonly positionAu: CartesianTriple;
  readonly velocityAuPerDay: CartesianTriple;
  readonly longitudeDeg: number;
  readonly latitudeDeg: number;
  readonly distanceAu: number;
  readonly longitudeSpeedDegPerDay: number;
  readonly latitudeSpeedDegPerDay: number;
  readonly distanceSpeedAuPerDay: number;
  readonly retrograde: boolean;
}

const J2000_JD = 2451545;

function fail(message: string): never {
  throw new RangeError(`Invalid minor-body engine bridge input: ${message}`);
}

function ownFields(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("expected an object.");
  const fields: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key)) fail("unexpected object field.");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) fail("expected own data fields.");
    fields[key] = descriptor.value as unknown;
  }
  return fields;
}

function epoch(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > CHEBYSHEV_LIMITS.maxJdTt) {
    fail("TT Julian date exceeds operational limits.");
  }
  return value;
}

function freezeBasis(basis: TimeBasis): Readonly<TimeBasis> {
  Object.freeze(basis.deltaT);
  if (basis.timeScale.ut1MinusUtc !== null) Object.freeze(basis.timeScale.ut1MinusUtc);
  if (basis.timeScale.leapSeconds !== null) Object.freeze(basis.timeScale.leapSeconds);
  Object.freeze(basis.timeScale);
  return Object.freeze(basis);
}

/** Calendar readings use the engine's parsing and time basis, without its ephemeris. */
export function resolveMinorBodyTime(input: MinorBodyTimeInput): ResolvedMinorBodyTime {
  const fields = ownFields(input, ["jd", "scale", "date", "timeScale", "deltaT"]);
  if (Object.hasOwn(fields, "jd")) {
    if (Object.keys(fields).length !== 2 || fields.scale !== "tt") fail("a Julian date requires only jd and scale: tt.");
    const jdTt = epoch(fields.jd);
    return Object.freeze({
      jdTt,
      timeReceipt: Object.freeze({
        request: Object.freeze({ jd: jdTt, scale: "tt" as const }),
        jdTt,
        source: "explicit-tt" as const,
        engineTimeBasis: null
      })
    });
  }
  if (!Object.hasOwn(fields, "date") || Object.hasOwn(fields, "scale")) fail("expected date, optional timeScale and deltaT.");
  const scale = fields.timeScale ?? "utc";
  if (fields.timeScale === null || (scale !== "utc" && scale !== "ut1" && scale !== "tt")) fail("timeScale must be utc, ut1 or tt.");
  const pin = fields.deltaT;
  if (pin !== undefined && (typeof pin !== "number" || !Number.isFinite(pin) || Math.abs(pin) > ENGINE_BRIDGE_SETTINGS.maxAbsDeltaTSeconds)) {
    fail("deltaT must be finite seconds within the engine's operational limit.");
  }
  const date = dateFrom(fields.date as DateInput, "minor-body date");
  const basis = timeBasis(date.getTime(), scale, pin as number | undefined);
  const jdTt = epoch(J2000_JD + basis.ttDays);
  if (![basis.utcMs, basis.ut1Days, basis.ttDays, basis.deltaT.seconds].every(Number.isFinite)) fail("time conversion is not finite.");
  const request: MinorBodyTimeRequest = Object.freeze({
    date: typeof fields.date === "string" ? fields.date : date.toISOString(),
    timeScale: scale,
    ...(pin === undefined ? {} : { deltaT: pin as number })
  });
  return Object.freeze({
    jdTt,
    timeReceipt: Object.freeze({ request, jdTt, source: "engine-time-basis", engineTimeBasis: freezeBasis(basis) })
  });
}

function product(a: Mat3, b: Mat3): Mat3 {
  const entry = (row: number, column: number): number =>
    a[3 * row]! * b[column]! + a[3 * row + 1]! * b[3 + column]! + a[3 * row + 2]! * b[6 + column]!;
  return [entry(0, 0), entry(0, 1), entry(0, 2), entry(1, 0), entry(1, 1), entry(1, 2), entry(2, 0), entry(2, 1), entry(2, 2)];
}

function matrixAtTtDays(tt: number): Mat3 {
  // The reused frameMatrix implementation reads only .tt. Avoid AstroTime's
  // constructor and its process-wide Delta T function, neither needed here.
  const at = { tt } as Parameters<typeof frameMatrix>[1];
  const icrfToEqj = transpose(frameMatrix("equatorial-icrs", at));
  return product(frameMatrix("ecliptic-true-of-date", at), icrfToEqj);
}

/** ICRF to the engine's true ecliptic/equinox of date, rows acting on columns. */
export function icrfToEclipticMatrix(jdTt: number): Mat3 {
  return Object.freeze(matrixAtTtDays(epoch(jdTt) - J2000_JD));
}

function frameDerivative(ttDays: number): Mat3 {
  const h = ENGINE_BRIDGE_SETTINGS.frameDerivativeStepDays;
  // Probe days from J2000, not large Julian dates, to retain subtraction precision.
  const before2 = matrixAtTtDays(ttDays - 2 * h);
  const before = matrixAtTtDays(ttDays - h);
  const after = matrixAtTtDays(ttDays + h);
  const after2 = matrixAtTtDays(ttDays + 2 * h);
  return before.map((_, i) => ((after[i]! - before[i]!) * 8 - (after2[i]! - before2[i]!)) / (12 * h)) as unknown as Mat3;
}

function triple(value: unknown): CartesianTriple {
  if (!Array.isArray(value) || value.length !== 3 || Reflect.ownKeys(value).length !== 4) fail("expected a Cartesian triple.");
  const components = [0, 1, 2].map((index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor) || typeof descriptor.value !== "number" || !Number.isFinite(descriptor.value)) {
      fail("Cartesian components must be finite own data fields.");
    }
    return descriptor.value as number;
  });
  return components as unknown as CartesianTriple;
}

/** Reduce a fitted corrected ICRF position and its derivative; no correction is added. */
export function reduceIcrfState(jdTt: number, state: IcrfState): ReducedIcrfState {
  const ttDays = epoch(jdTt) - J2000_JD;
  const fields = ownFields(state, ["positionAu", "velocityAuPerDay"]);
  const inputPosition = triple(fields.positionAu);
  const inputVelocity = triple(fields.velocityAuPerDay);
  const matrix = matrixAtTtDays(ttDays);
  const positionAu = Object.freeze(apply(matrix, inputPosition));
  const rotatedVelocity = apply(matrix, inputVelocity);
  const turningVelocity = apply(frameDerivative(ttDays), inputPosition);
  const velocityAuPerDay: CartesianTriple = Object.freeze([
    rotatedVelocity[0] + turningVelocity[0],
    rotatedVelocity[1] + turningVelocity[1],
    rotatedVelocity[2] + turningVelocity[2]
  ]);
  const distanceAu = Math.hypot(...positionAu);
  if (!(distanceAu > 0) || !Number.isFinite(distanceAu) || Math.hypot(positionAu[0], positionAu[1]) === 0) {
    fail("spherical position is undefined.");
  }
  const spherical = toSpherical(positionAu);
  const rates = sphericalRates(positionAu, velocityAuPerDay);
  if (![...positionAu, ...velocityAuPerDay, spherical.lon, spherical.lat, rates.lon, rates.lat, rates.dist].every(Number.isFinite)) {
    fail("spherical position or rate is not finite.");
  }
  return Object.freeze({
    positionAu,
    velocityAuPerDay,
    longitudeDeg: spherical.lon,
    latitudeDeg: spherical.lat,
    distanceAu,
    longitudeSpeedDegPerDay: rates.lon,
    latitudeSpeedDegPerDay: rates.lat,
    distanceSpeedAuPerDay: rates.dist,
    retrograde: rates.lon < 0
  });
}
