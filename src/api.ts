import { computeBodies, computeChart, bodyLongitude } from "./ephemeris.js";
import { computeSaturnReturns } from "./returns.js";
import { normalizeLongitude } from "./signs.js";
import { findInterAspects, summarizePair } from "./synastry.js";
import type {
  BirthInput,
  BodyPosition,
  Chart,
  ChartInput,
  DateInput,
  MoonPhase,
  MoonPhaseName,
  SynastryResult,
  TransitResult
} from "./types.js";
import type { SaturnReturnResult } from "./returns.js";

export type NatalSource = Chart | BirthInput;
export type SaturnReturnSource = NatalSource | DateInput;

function dateFrom(input: DateInput, label: string): Date {
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError(`${label} must be a valid date or timestamp.`);
  }
  return date;
}

function isChart(value: unknown): value is Chart {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Chart>;
  return (
    Array.isArray(candidate.bodies) &&
    Array.isArray(candidate.aspects) &&
    candidate.input?.utc instanceof Date
  );
}

function isBirth(value: unknown): value is BirthInput {
  return Boolean(value && typeof value === "object" && "utc" in value);
}

function resolvedChart(source: NatalSource): Chart {
  return isChart(source) ? source : natalChart(source);
}

function validateCoordinates(birth: BirthInput): void {
  const hasLatitude = birth.latitude !== undefined;
  const hasLongitude = birth.longitude !== undefined;
  if (hasLatitude !== hasLongitude) {
    throw new RangeError("latitude and longitude must be supplied together.");
  }
  if (
    birth.latitude !== undefined &&
    (!Number.isFinite(birth.latitude) || birth.latitude < -90 || birth.latitude > 90)
  ) {
    throw new RangeError("latitude must be between -90 and 90 degrees.");
  }
  if (
    birth.longitude !== undefined &&
    (!Number.isFinite(birth.longitude) || birth.longitude < -180 || birth.longitude > 180)
  ) {
    throw new RangeError("longitude must be between -180 and 180 degrees.");
  }
}

/** Apparent geocentric tropical positions for an instant. */
export function positions(date: DateInput): BodyPosition[] {
  return computeBodies(dateFrom(date, "date"));
}

/** Build a natal chart from an already resolved UTC instant. */
export function natalChart(birth: BirthInput): Chart {
  validateCoordinates(birth);
  const input: ChartInput = {
    utc: dateFrom(birth.utc, "birth.utc"),
    houseSystem: birth.houseSystem ?? "whole",
    timeKnown: birth.timeKnown ?? true,
    ...(birth.latitude === undefined
      ? {}
      : { latitude: birth.latitude, longitude: birth.longitude }),
    ...(birth.flags === undefined ? {} : { flags: [...birth.flags] })
  };
  return computeChart(input);
}

/** Snapshot of current positions and their major aspects to a natal chart. */
export function transits(natal: NatalSource, date: DateInput): TransitResult {
  const chart = resolvedChart(natal);
  const at = dateFrom(date, "date");
  const current = computeBodies(at);
  return {
    natal: chart,
    at,
    positions: current,
    aspects: findInterAspects(current, chart.bodies)
  };
}

/** Major inter-chart aspects and element/modality balances. */
export function synastry(first: NatalSource, second: NatalSource): SynastryResult {
  const a = resolvedChart(first);
  const b = resolvedChart(second);
  return { a, b, ...summarizePair(a.bodies, b.bodies) };
}

function phaseName(angle: number): MoonPhaseName {
  if (angle < 22.5 || angle >= 337.5) return "New Moon";
  if (angle < 67.5) return "Waxing Crescent";
  if (angle < 112.5) return "First Quarter";
  if (angle < 157.5) return "Waxing Gibbous";
  if (angle < 202.5) return "Full Moon";
  if (angle < 247.5) return "Waning Gibbous";
  if (angle < 292.5) return "Last Quarter";
  return "Waning Crescent";
}

/** High-precision Moon phase derived from the same positions as charts. */
export function moonPhase(date: DateInput): MoonPhase {
  const at = dateFrom(date, "date");
  const angle = normalizeLongitude(bodyLongitude("Moon", at) - bodyLongitude("Sun", at));
  return {
    at,
    angle,
    illumination: (1 - Math.cos((angle * Math.PI) / 180)) / 2,
    name: phaseName(angle),
    waxing: angle < 180
  };
}

/** Natal Saturn and return seasons through approximately age 92. */
export function saturnReturn(birth: SaturnReturnSource): SaturnReturnResult {
  let utc: Date;
  if (isChart(birth)) utc = birth.input.utc;
  else if (isBirth(birth)) utc = dateFrom(birth.utc, "birth.utc");
  else utc = dateFrom(birth, "birth");
  return computeSaturnReturns(utc);
}
