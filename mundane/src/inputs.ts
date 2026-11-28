import { validateBirthSettings } from "../../src/birth-input.js";
import { dateFrom } from "../../src/date-input.js";
import type { DateInput, HouseSystem } from "../../src/types.js";

/** Coordinates in degrees, north and east positive; no geocoding is performed. */
export interface Place {
  readonly latitude: number;
  readonly longitude: number;
  readonly name?: string;
}

/** A UTC calendar year or a resolved instant window (from, to]. */
export type RangeSelection =
  | { readonly year: number; readonly from?: never; readonly to?: never }
  | { readonly from: DateInput; readonly to: DateInput; readonly year?: never };

export type MundaneRequest = RangeSelection & {
  readonly place: Place;
  readonly houseSystem?: HouseSystem;
};

/** ISO UTC strings keep normalized snapshots independent of mutable Dates. */
export interface NormalizedRange {
  readonly from: string;
  readonly to: string;
}

export interface NormalizedRequest {
  readonly place: Place;
  readonly houseSystem: HouseSystem;
  readonly range: NormalizedRange;
}

function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RangeError(`${label} must be an object.`);
  }
}

/** Reuse engine coordinate validation and exclude the undefined pole angles. */
export function normalizePlace(input: Place): Place {
  record(input, "place");
  const { latitude, longitude, name } = input;
  if (latitude === undefined || longitude === undefined) {
    throw new RangeError("place requires latitude and longitude.");
  }
  validateBirthSettings({ latitude, longitude });
  if (Math.abs(latitude) === 90) {
    throw new RangeError("place must be away from the geographic poles, where angles are undefined.");
  }
  if (name !== undefined && (
    typeof name !== "string" || name.trim() !== name || name.length === 0 ||
    /[\u0000-\u001f\u007f]/u.test(name)
  )) {
    throw new RangeError("place.name must be a nonempty label without surrounding whitespace or control characters.");
  }
  return Object.freeze({ latitude, longitude, ...(name === undefined ? {} : { name }) });
}

/** Calendar normalization only; calculation coverage is checked by the engine. */
export function normalizeRange(input: RangeSelection): NormalizedRange {
  record(input, "range");
  const { year, from, to } = input;
  let start: Date;
  let end: Date;
  if (year !== undefined) {
    if (!Number.isSafeInteger(year) || from !== undefined || to !== undefined) {
      throw new RangeError("supply either an integer UTC year or from and to.");
    }
    // setUTCFullYear preserves astronomical years below 100, unlike Date.UTC.
    start = new Date(0);
    start.setUTCFullYear(year, 0, 1);
    end = new Date(0);
    end.setUTCFullYear(year + 1, 0, 1);
    start = dateFrom(start, "year start");
    end = dateFrom(end, "year end");
  } else {
    if (from === undefined || to === undefined) {
      throw new RangeError("range requires a UTC year or both from and to.");
    }
    start = dateFrom(from, "from");
    end = dateFrom(to, "to");
  }
  if (start.getTime() >= end.getTime()) {
    throw new RangeError("from must be earlier than to.");
  }
  return Object.freeze({ from: start.toISOString(), to: end.toISOString() });
}

/** Validate once and capture scalar snapshots without mutating caller inputs. */
export function normalizeRequest(input: MundaneRequest): NormalizedRequest {
  record(input, "request");
  const { place, houseSystem, year, from, to } = input;
  const settings = validateBirthSettings(houseSystem === undefined ? {} : { houseSystem });
  const range = normalizeRange({ year, from, to } as RangeSelection);
  return Object.freeze({
    place: normalizePlace(place),
    houseSystem: settings.houseSystem ?? "whole",
    range
  });
}
