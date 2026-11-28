import { dateFrom } from "../../src/date-input.js";

export type Instant = string | Date;

export interface TimeWindow {
  readonly from: Instant;
  readonly to: Instant;
}

export interface NormalizedWindow {
  readonly from: string;
  readonly to: string;
}

/** Geodetic degrees, east-positive longitude, metres above the calc ellipsoid. */
export interface Observer {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevationMeters?: number;
}

export interface NormalizedObserver {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevationMeters: number;
}

export function fields(value: unknown, label: string, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || value instanceof Date) {
    throw new RangeError(`${label} must be an object.`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowed.includes(key))) {
    throw new RangeError(`${label} contains an unknown field.`);
  }
  // Capture each own field once so validation and calculation use the same value.
  return Object.fromEntries(keys.map((key) => [key, Reflect.get(value, key)]));
}

function within(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} must be a finite number from ${min} to ${max}.`);
  }
  return value;
}

/** Reuse the engine's calendar and UTC-offset validation; never parse local time. */
export function normalizeInstant(value: Instant): string {
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw new RangeError("time must be an ISO instant or Date.");
  }
  return dateFrom(value, "time").toISOString();
}

/** Searches will own (from, to], following the engine crossing solver. */
export function normalizeWindow(value: TimeWindow): NormalizedWindow {
  const input = fields(value, "window", ["from", "to"]);
  const from = normalizeInstant(input.from as Instant);
  const to = normalizeInstant(input.to as Instant);
  if (Date.parse(from) >= Date.parse(to)) throw new RangeError("window.from must precede window.to.");
  return Object.freeze({ from, to });
}

export function normalizeObserver(value: Observer): NormalizedObserver {
  const input = fields(value, "observer", ["latitude", "longitude", "elevationMeters"]);
  const latitude = within(input.latitude, "observer.latitude", -90, 90);
  const longitude = within(input.longitude, "observer.longitude", -180, 180);
  const elevationMeters = within(input.elevationMeters === undefined ? 0 : input.elevationMeters,
    "observer.elevationMeters", -10_000, 100_000);
  return Object.freeze({ latitude, longitude, elevationMeters });
}
