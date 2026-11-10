import type { TimingKey } from "./conventions.js";

/** Explicit fixed lengths for expressing the symbolic directed year as elapsed days. */
export type DirectionYearUnit = "tropical-365.2422-days" | "julian-365.25-days";

export interface SolarEquatorialSample {
  /** Julian date on TT. The pure API does not authenticate the sample's origin. */
  readonly jdTt: number;
  readonly rightAscensionDegrees: number;
}

/**
 * The modern realization of Lilly's birth-to-next-day Maginus key used here.
 * Both solar positions retain bodily latitude and use their own date's frame.
 * The two represented TT Julian dates must differ by exactly one day.
 */
export interface SolarEquatorialDay {
  readonly timeScale: "tt";
  readonly frame: "true-equator-equinox-of-date";
  readonly center: "geocentric";
  readonly correction: "apparent";
  readonly start: SolarEquatorialSample;
  readonly end: SolarEquatorialSample;
}

export type DirectedAgeInput = {
  /** First-turn nonnegative equatorial arc; motion belongs to the sphere solver. */
  readonly arcDegrees: number;
  readonly yearUnit: DirectionYearUnit;
} & (
  | { readonly key: "ptolemy" | "naibod"; readonly solar?: never }
  | { readonly key: "solar-equatorial-birth-day"; readonly solar: SolarEquatorialDay }
);

export interface FixedTimingAudit {
  readonly kind: "fixed";
  readonly source: "ptolemy-ashmand-iii14" | "kuehr-1936-naibod";
  /** Exact defining rational; rateDegreesPerYear is its binary64 approximation. */
  readonly rationalDegreesPerYear: { readonly numerator: number; readonly denominator: number };
}

export interface SolarTimingAudit {
  readonly kind: "solar-birth-day";
  readonly source: "lilly-1647-keys";
  readonly samples: SolarEquatorialDay;
  readonly intervalTtDays: 1;
  readonly wholeTurnsAdded: 0 | 1;
  readonly advanceDegrees: number;
}

export interface DirectedAge {
  readonly arcDegrees: number;
  readonly key: TimingKey;
  readonly yearUnit: DirectionYearUnit;
  readonly directedAgeYears: number;
  /** Fixed-unit elapsed days, not a calendar date or count of anniversaries. */
  readonly elapsedDays: number;
  readonly daysPerYear: number;
  readonly rateDegreesPerYear: number;
  readonly audit: FixedTimingAudit | SolarTimingAudit;
}

export type TimingErrorCode =
  | "invalid-input" | "invalid-solar-interval" | "invalid-solar-motion" | "numerical-degeneracy";

export class TimingError extends RangeError {
  constructor(readonly code: TimingErrorCode, message: string) {
    super(message);
    this.name = "TimingError";
  }
}

function fields(input: unknown, required: readonly string[]): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new TimingError("invalid-input", "Timing input must be a plain data object.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== required.length
    || keys.some(key => typeof key !== "string" || !required.includes(key))) {
    throw new TimingError("invalid-input", "Provide exactly the fields required by the selected timing key.");
  }
  const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const field of required) {
    const descriptor = descriptors[field];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new TimingError("invalid-input", "Timing fields must be explicit data properties.");
    }
    values[field] = descriptor.value;
  }
  return values;
}

function readInput(input: DirectedAgeInput): DirectedAgeInput {
  // Inspect the discriminator without running a getter, then validate every slot.
  const key: unknown = input !== null && typeof input === "object"
    ? Object.getOwnPropertyDescriptor(input, "key")?.value : undefined;
  const values = fields(input, key === "solar-equatorial-birth-day"
    ? ["arcDegrees", "yearUnit", "key", "solar"] : ["arcDegrees", "yearUnit", "key"]);
  if (values.key !== "ptolemy" && values.key !== "naibod" && values.key !== "solar-equatorial-birth-day") {
    throw new TimingError("invalid-input", "Select an explicit supported timing key.");
  }
  if (values.yearUnit !== "tropical-365.2422-days" && values.yearUnit !== "julian-365.25-days") {
    throw new TimingError("invalid-input", "Select an explicit directed-year unit.");
  }
  if (typeof values.arcDegrees !== "number" || !Number.isFinite(values.arcDegrees)
    || values.arcDegrees < 0 || values.arcDegrees >= 360) {
    throw new TimingError("invalid-input", "Supply a finite nonnegative first-turn arc in [0, 360) degrees.");
  }
  return values as unknown as DirectedAgeInput;
}

function readSample(input: unknown): SolarEquatorialSample {
  const values = fields(input, ["jdTt", "rightAscensionDegrees"]);
  if (typeof values.jdTt !== "number" || !Number.isFinite(values.jdTt)
    || typeof values.rightAscensionDegrees !== "number" || !Number.isFinite(values.rightAscensionDegrees)
    || values.rightAscensionDegrees < 0 || values.rightAscensionDegrees >= 360) {
    throw new TimingError("invalid-input", "Solar samples require a finite TT Julian date and canonical RA in [0, 360) degrees.");
  }
  return Object.freeze({
    jdTt: values.jdTt,
    rightAscensionDegrees: values.rightAscensionDegrees === 0 ? 0 : values.rightAscensionDegrees
  });
}

function solarAudit(input: SolarEquatorialDay): SolarTimingAudit {
  const values = fields(input, ["timeScale", "frame", "center", "correction", "start", "end"]);
  if (values.timeScale !== "tt" || values.frame !== "true-equator-equinox-of-date"
    || values.center !== "geocentric" || values.correction !== "apparent") {
    throw new TimingError("invalid-input", "The birth-day key requires apparent geocentric Sun RAs in the true frames of their dates, sampled on TT.");
  }
  const start = readSample(values.start);
  const end = readSample(values.end);
  // Error-free subtraction: a rounded difference of one alone can hide a
  // distinct interval (for example, start=Number.MIN_VALUE and end=1).
  const interval = end.jdTt - start.jdTt;
  const virtualStart = interval - end.jdTt;
  const remainder = (end.jdTt - (interval - virtualStart)) + (-start.jdTt - virtualStart);
  if (interval !== 1 || remainder !== 0) {
    throw new TimingError("invalid-solar-interval", "Solar samples must be exactly one represented TT day apart, in forward time.");
  }
  const wholeTurnsAdded = end.rightAscensionDegrees < start.rightAscensionDegrees ? 1 : 0;
  // Split at the seam so a small positive advance is not lost by adding 360
  // to an already rounded difference. Never use the absolute difference.
  const advanceDegrees = wholeTurnsAdded
    ? (360 - start.rightAscensionDegrees) + end.rightAscensionDegrees
    : end.rightAscensionDegrees - start.rightAscensionDegrees;
  if (!(advanceDegrees > 0 && advanceDegrees < 180)) {
    throw new TimingError("invalid-solar-motion", "Solar RA must advance by a positive arc below a half-turn; zero, backward and ambiguous samples are refused.");
  }
  return Object.freeze({
    kind: "solar-birth-day", source: "lilly-1647-keys", intervalTtDays: 1,
    wholeTurnsAdded, advanceDegrees,
    samples: Object.freeze({
      timeScale: "tt", frame: "true-equator-equinox-of-date", center: "geocentric",
      correction: "apparent", start, end
    })
  });
}

/**
 * Convert an already determined primary arc to age without sampling an ephemeris.
 * Ptolemy, Tetrabiblos III.XIV (Ashmand 1822), p. 94; Kuehr, Berechnung der
 * Ereigniszeiten (1936), pp. 62-63; Lilly, Christian Astrology III (1647),
 * pp. 709-710. See evidence/M7-derivations.md for units and exact source rates.
 * The key never selects motion, changes an arc, or computes a progression.
 */
export function directedAge(input: DirectedAgeInput): DirectedAge {
  const request = readInput(input);
  const arcDegrees = request.arcDegrees === 0 ? 0 : request.arcDegrees;
  let audit: FixedTimingAudit | SolarTimingAudit;
  let rateDegreesPerYear: number;
  if (request.key === "solar-equatorial-birth-day") {
    audit = solarAudit(request.solar);
    rateDegreesPerYear = audit.advanceDegrees;
  } else {
    const numerator = request.key === "ptolemy" ? 1 : 354833;
    const denominator = request.key === "ptolemy" ? 1 : 360000;
    audit = Object.freeze({
      kind: "fixed", source: request.key === "ptolemy" ? "ptolemy-ashmand-iii14" : "kuehr-1936-naibod",
      rationalDegreesPerYear: Object.freeze({ numerator, denominator })
    });
    rateDegreesPerYear = numerator / denominator;
  }
  const directedAgeYears = arcDegrees / rateDegreesPerYear;
  const daysPerYear = request.yearUnit === "tropical-365.2422-days" ? 365.2422 : 365.25;
  const elapsedDays = directedAgeYears * daysPerYear;
  if (!Number.isFinite(directedAgeYears) || !Number.isFinite(elapsedDays)
    || (arcDegrees > 0 && (directedAgeYears === 0 || elapsedDays === 0))) {
    throw new TimingError("numerical-degeneracy", "The selected key cannot represent a finite nonzero age and elapsed-day value for this positive arc.");
  }
  return Object.freeze({
    arcDegrees, key: request.key, yearUnit: request.yearUnit, directedAgeYears,
    elapsedDays, daysPerYear, rateDegreesPerYear, audit
  });
}
