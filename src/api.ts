import { computeBodies, computeChart, bodyLongitude } from "./ephemeris.js";
import { computeSaturnReturns } from "./returns.js";
import { normalizeLongitude } from "./signs.js";
import { findInterAspects, summarizePair } from "./synastry.js";
import { dateFrom } from "./date-input.js";
import {
  assertDerivedFlags,
  snapshotFlags,
  timeFlags,
  validateBirthSettings
} from "./birth-input.js";
import type { FlagSnapshot } from "./birth-input.js";
import type {
  BirthInput,
  BodyPosition,
  Chart,
  ChartInput,
  ChartFlag,
  DateInput,
  MoonPhase,
  MoonPhaseName,
  SynastryResult,
  TransitResult
} from "./types.js";
import type { SaturnReturnResult } from "./returns.js";

export type NatalSource = Chart | BirthInput;
export type SaturnReturnSource = NatalSource | DateInput;

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

function resolvedChart(source: NatalSource): { chart: Chart; utc: Date } {
  if (!isChart(source)) {
    const chart = natalChart(source);
    return { chart, utc: chart.input.utc };
  }
  const sourceInput = source.input;
  const { input, flags: inputFlags } = validateBirth(sourceInput);
  const resultFlags = snapshotFlags(source.flags);
  const expected = timeFlags(inputFlags?.values ?? []);
  const hasHouses = input.timeKnown && input.latitude !== undefined;
  const houses = source.houses;
  const angles = source.angles;
  const actualHouseSystem = houses?.system;
  if (
    (hasHouses
      ? !angles ||
        typeof angles !== "object" ||
        Array.isArray(angles) ||
        !houses ||
        typeof houses !== "object" ||
        Array.isArray(houses)
      : angles !== null || houses !== null) ||
    (houses !== null && actualHouseSystem !== "whole" && actualHouseSystem !== "placidus") ||
    (input.houseSystem === "whole" && actualHouseSystem === "placidus")
  ) {
    throw new RangeError("chart flags must agree with its input and supplied house result.");
  }
  if (!input.timeKnown) expected.push("no-time");
  if (input.houseSystem === "placidus" && actualHouseSystem === "whole") {
    expected.push("polar-fallback");
  }
  assertDerivedFlags(inputFlags?.values ?? [], expected);
  if (
    resultFlags.values.length !== expected.length ||
    !expected.every((flag) => resultFlags.values.includes(flag))
  ) {
    throw new RangeError("chart flags must agree with its input and supplied house result.");
  }
  const canonicalInputFlags = input.flags ?? [];
  const inputChanged =
    inputFlags !== undefined &&
    (inputFlags.hasDuplicates || inputFlags.values.length !== canonicalInputFlags.length);
  const resultChanged =
    resultFlags.hasDuplicates ||
    !expected.every((flag, index) => flag === resultFlags.values[index]);
  // A supplied Chart's numerical result remains a claim. Only flag metadata is
  // normalized; canonical Charts retain identity and no ephemeris is rerun.
  if (!inputChanged && !resultChanged) return { chart: source, utc: input.utc };
  return {
    chart: {
      ...source,
      input: inputChanged ? input : sourceInput,
      flags: expected
    },
    utc: input.utc
  };
}

interface ValidatedBirth {
  input: ChartInput;
  flags: FlagSnapshot | undefined;
}

function validateBirth(birth: BirthInput): ValidatedBirth {
  if (!birth || typeof birth !== "object" || Array.isArray(birth)) {
    throw new RangeError("birth must be an object containing a resolved utc instant.");
  }
  const settings = validateBirthSettings(birth);
  const supplied = birth.flags;
  const flags = supplied === undefined ? undefined : snapshotFlags(supplied);
  const possible: ChartFlag[] = [];
  if (settings.timeKnown === false) possible.push("no-time");
  else if (settings.houseSystem === "placidus" && settings.latitude !== undefined) {
    possible.push("polar-fallback");
  }
  assertDerivedFlags(flags?.values ?? [], possible);
  const input: ChartInput = {
    utc: dateFrom(birth.utc, "birth.utc"),
    houseSystem: settings.houseSystem ?? "whole",
    timeKnown: settings.timeKnown ?? true,
    ...(settings.latitude === undefined
      ? {}
      : { latitude: settings.latitude, longitude: settings.longitude }),
    ...(flags === undefined ? {} : { flags: timeFlags(flags.values) })
  };
  return { input, flags };
}

function computedBirth({ input, flags }: ValidatedBirth): Chart {
  const chart = computeChart(input);
  assertDerivedFlags(flags?.values ?? [], chart.flags);
  return chart;
}

/** Apparent geocentric tropical positions for an instant. */
export function positions(date: DateInput): BodyPosition[] {
  return computeBodies(dateFrom(date, "date"));
}

/** Build a natal chart from an already resolved UTC instant. */
export function natalChart(birth: BirthInput): Chart {
  return computedBirth(validateBirth(birth));
}

/** Snapshot of current positions and their major aspects to a natal chart. */
export function transits(natal: NatalSource, date: DateInput): TransitResult {
  const { chart } = resolvedChart(natal);
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
  const { chart: a } = resolvedChart(first);
  const { chart: b } = resolvedChart(second);
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
  if (isChart(birth)) {
    utc = resolvedChart(birth).utc;
  } else if (isBirth(birth)) {
    const validated = validateBirth(birth);
    // Only an explicit compatibility assertion needs a natal calculation to
    // establish actual Placidus fallback. Ordinary return inputs remain date-only.
    utc = validated.flags?.values.includes("polar-fallback")
      ? computedBirth(validated).input.utc
      : validated.input.utc;
  } else utc = dateFrom(birth, "birth");
  return computeSaturnReturns(utc);
}
