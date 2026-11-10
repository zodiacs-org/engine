import {
  EPHEMERIS,
  HOUSE_SYSTEMS,
  chartDeclinations,
  eclipticToEquatorial,
  natalChart
} from "../../src/index.js";
import type {
  Angles, BirthInput, Chart, ChartDeclinations, ChartInput, Houses, TimeScaleName
} from "../../src/index.js";

/** An explicitly timed and located natal input. No direction choices are applied here. */
export interface DirectionNatalInput extends BirthInput {
  timeScale: TimeScaleName;
  timeKnown: true;
  latitude: number;
  longitude: number;
  houseSystem: ChartInput["houseSystem"];
}

type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

type SnapshotChart = Omit<Chart, "input" | "angles" | "houses"> & {
  // The engine's input-scale label, not a conversion of TT or UT1 to UTC.
  input: Omit<ChartInput, "utc"> & { utc: string };
  angles: Angles;
  houses: Houses;
};

/** Frozen, Date-free engine geometry for later pure sphere calculations. */
export type NatalSnapshot = DeepReadonly<{
  chart: SnapshotChart;
  /** Full engine ecliptic latitudes remain intact, whatever a later direction mode selects. */
  equatorial: ChartDeclinations;
  geometry: {
    latitudeDegrees: number;
    longitudeDegrees: number;
    trueObliquityDegrees: number;
    /** RA of the engine's MC, degrees in [0, 360); recovered, not separately sampled GAST. */
    ramcDegrees: number;
  };
  provenance: {
    engineVersion: string;
    ephemeris: typeof EPHEMERIS;
    chart: "@zodiacs/engine:natalChart";
    equatorial: "@zodiacs/engine:chartDeclinations";
    ramc: "@zodiacs/engine:eclipticToEquatorial(mc,0,trueObliquity)";
    inputInstant: "chart.input.utc is an ISO label on chart.timeScale.input";
  };
}>;

export type NatalPreparationErrorCode =
  | "invalid-input" | "missing-time" | "missing-place"
  | "polar-geometry" | "unavailable-geometry";

export class NatalPreparationError extends RangeError {
  constructor(readonly code: NatalPreparationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NatalPreparationError";
  }
}

const FIELDS = ["utc", "timeScale", "timeKnown", "latitude", "longitude", "houseSystem", "deltaT", "flags"];

function readInput(input: unknown): DirectionNatalInput {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new NatalPreparationError("invalid-input", "Natal input must be a plain data object.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !FIELDS.includes(key)) {
      throw new NatalPreparationError("invalid-input", "Natal input contains an unsupported field.");
    }
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor) || !descriptor.enumerable) {
      throw new NatalPreparationError("invalid-input", "Natal fields must be explicit data properties.");
    }
    values[key] = descriptor.value;
  }
  if (values.utc === undefined || values.utc === null || values.timeKnown !== true) {
    throw new NatalPreparationError("missing-time", "Provide a resolved natal instant and timeKnown: true.");
  }
  if (typeof values.utc === "string" && /^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}$/.test(values.utc)) {
    throw new NatalPreparationError("missing-time", "A natal date alone does not specify a clock time; provide an explicit timestamp.");
  }
  if (values.latitude === undefined || values.longitude === undefined) {
    throw new NatalPreparationError("missing-place", "Provide both natal latitude and longitude.");
  }
  if (values.timeScale !== "utc" && values.timeScale !== "ut1" && values.timeScale !== "tt") {
    throw new NatalPreparationError("invalid-input", "Select timeScale explicitly: utc, ut1 or tt.");
  }
  if (!HOUSE_SYSTEMS.some(system => system === values.houseSystem)) {
    throw new NatalPreparationError("invalid-input", "Select an explicit engine houseSystem.");
  }
  // Engine validation checks the date, coordinates, pin and flags before calculation.
  // This copy prevents top-level accessors from changing an option between reads.
  return values as unknown as DirectionNatalInput;
}

// Only called on fresh, Date-free result data. Never freezes caller-owned input.
function freeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/**
 * Adapt a synthetic natal input using the engine's public source entry alone.
 * The ephemeris manages a shared delta-T provider; keep this adapter outside the
 * pure solver. The snapshot does not choose direction mode, motion or timing key.
 */
export function prepareNatal(input: DirectionNatalInput): NatalSnapshot {
  const birth = readInput(input);
  let computed: Chart;
  try {
    computed = natalChart(birth);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw new NatalPreparationError("invalid-input", error.message, { cause: error });
  }
  const { angles, houses } = computed;
  if (angles === null || houses === null) {
    throw new NatalPreparationError("unavailable-geometry", "The engine did not supply natal angles and houses.");
  }
  const equatorial = chartDeclinations(computed);
  const trueObliquityDegrees = equatorial.trueObliquity;
  // Current project domain: all ecliptic degrees must rise and set. Individual
  // bodies with latitude still need their own semi-arc check in the solver.
  if (computed.flags.includes("polar-fallback")
    || Math.abs(birth.latitude) >= 90 - trueObliquityDegrees) {
    throw new NatalPreparationError("polar-geometry", "Natal latitude is outside the complete-ecliptic semi-arc domain; no polar fallback is used.");
  }
  if (houses.system !== birth.houseSystem) {
    throw new NatalPreparationError("unavailable-geometry", "The engine did not retain the requested natal house system.");
  }
  const meridian = eclipticToEquatorial(angles.mc, 0, trueObliquityDegrees);
  if (meridian.ra === null || !meridian.raDefined) {
    throw new NatalPreparationError("unavailable-geometry", "The engine midheaven has no defined right ascension.");
  }
  // No Date remains: freezing a Date would still leave its setTime method usable.
  // The engine freshly allocates its chart and declination records for this call.
  return freeze({
    chart: { ...computed, input: { ...computed.input, utc: computed.input.utc.toISOString() }, angles, houses },
    equatorial,
    geometry: {
      latitudeDegrees: birth.latitude,
      longitudeDegrees: birth.longitude,
      trueObliquityDegrees,
      ramcDegrees: meridian.ra
    },
    provenance: {
      engineVersion: computed.engineVersion,
      ephemeris: { ...EPHEMERIS },
      chart: "@zodiacs/engine:natalChart",
      equatorial: "@zodiacs/engine:chartDeclinations",
      ramc: "@zodiacs/engine:eclipticToEquatorial(mc,0,trueObliquity)",
      inputInstant: "chart.input.utc is an ISO label on chart.timeScale.input"
    }
  });
}
