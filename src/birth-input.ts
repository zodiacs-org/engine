import type { BirthInput, ChartFlag } from "./types.js";

type BirthSettings = Pick<BirthInput, "latitude" | "longitude" | "houseSystem" | "timeKnown">;

/** Shared public/civil settings validation; no astronomy or timezone dependency. */
export function validateBirthSettings(birth: BirthSettings): BirthSettings {
  const { houseSystem, timeKnown, latitude, longitude } = birth;
  if (houseSystem !== undefined && houseSystem !== "whole" && houseSystem !== "placidus") {
    throw new RangeError('houseSystem must be "whole" or "placidus".');
  }
  if (timeKnown !== undefined && typeof timeKnown !== "boolean") {
    throw new RangeError("timeKnown must be a boolean.");
  }
  const hasLatitude = latitude !== undefined;
  const hasLongitude = longitude !== undefined;
  if (hasLatitude !== hasLongitude) {
    throw new RangeError("latitude and longitude must be supplied together.");
  }
  if (latitude !== undefined && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
    throw new RangeError("latitude must be between -90 and 90 degrees.");
  }
  if (
    longitude !== undefined &&
    (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
  ) {
    throw new RangeError("longitude must be between -180 and 180 degrees.");
  }
  return {
    ...(houseSystem === undefined ? {} : { houseSystem }),
    ...(timeKnown === undefined ? {} : { timeKnown }),
    ...(latitude === undefined ? {} : { latitude, longitude })
  };
}

const FLAGS: readonly ChartFlag[] = ["dst-gap", "dst-fold", "lmt", "no-time", "polar-fallback"];

export interface FlagSnapshot {
  values: ChartFlag[];
  hasDuplicates: boolean;
}

/** Bounded data snapshot. Do not coerce members or invoke array getters/iterators. */
export function snapshotFlags(value: unknown): FlagSnapshot {
  const length: unknown = Array.isArray(value)
    ? Object.getOwnPropertyDescriptor(value, "length")?.value
    : undefined;
  if (typeof length !== "number" || !Number.isInteger(length) || length < 0 || length > 64) {
    throw new RangeError("flags must be an array of at most 64 supported chart flags.");
  }
  const values: ChartFlag[] = [];
  for (let index = 0; index < length; index += 1) {
    const flag: unknown = Object.getOwnPropertyDescriptor(value, String(index))?.value;
    if (typeof flag !== "string" || !FLAGS.includes(flag as ChartFlag)) {
      throw new RangeError("flags must contain only supported chart flag strings.");
    }
    if (!values.includes(flag as ChartFlag)) values.push(flag as ChartFlag);
  }
  if (values.includes("dst-gap") && values.includes("dst-fold")) {
    throw new RangeError('flags cannot contain both "dst-gap" and "dst-fold".');
  }
  return { values, hasDuplicates: values.length !== length };
}

export function timeFlags(flags: readonly ChartFlag[]): ChartFlag[] {
  return flags.filter((flag) => flag !== "no-time" && flag !== "polar-fallback");
}

export function assertDerivedFlags(
  supplied: readonly ChartFlag[],
  actual: readonly ChartFlag[]
): void {
  for (const flag of ["no-time", "polar-fallback"] as const) {
    if (supplied.includes(flag) && !actual.includes(flag)) {
      throw new RangeError("flags contradict the birth time or house result.");
    }
  }
}
