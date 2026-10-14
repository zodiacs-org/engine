// The coordinate rotation is a public engine helper in a pure source module.
import { eclipticToEquatorial } from "../../src/declination.js";
import { parseDirectionConvention } from "./conventions.js";
import type { DirectionConvention, DirectionMotionConvention } from "./conventions.js";
import { angleConjunctionArc, AngleDirectionError } from "./angles.js";
import type { AngleConjunctionArc, AngleDirectionErrorCode, DirectionAngle } from "./angles.js";
import { zodiacalBodyArc, ZodiacalDirectionError } from "./zodiacal.js";
import type {
  DirectionEclipticPoint, ZodiacalBodyArc, ZodiacalContact,
  ZodiacalDirectionErrorCode, ZodiacalGeometryInput
} from "./zodiacal.js";
import { mundaneBodyArc, MundaneDirectionError } from "./mundane.js";
import type {
  DirectionEquatorialPoint, MundaneBodyArc, MundaneContact,
  MundaneDirectionErrorCode, MundaneGeometryInput
} from "./mundane.js";
import { SphereGeometryError } from "./sphere.js";
import type { SphereGeometryErrorCode } from "./sphere.js";
import { directedAge, TimingError } from "./timing.js";
import type { DirectedAge, DirectionYearUnit, SolarEquatorialDay, TimingErrorCode } from "./timing.js";

export interface HitBody<Point> {
  readonly kind: "body";
  readonly id: string;
  readonly coordinates: Point;
}

export interface HitAngle {
  readonly kind: "angle";
  readonly angle: DirectionAngle;
}

type ModeInput =
  | {
    readonly convention: Extract<DirectionConvention, { mode: "zodiacal" }>;
    readonly geometry: ZodiacalGeometryInput;
    readonly significator: HitBody<DirectionEclipticPoint> | HitAngle;
    readonly promissor: HitBody<DirectionEclipticPoint>;
    readonly contact: ZodiacalContact;
  }
  | {
    readonly convention: Extract<DirectionConvention, { mode: "mundane" }>;
    readonly geometry: MundaneGeometryInput;
    readonly significator: HitBody<DirectionEquatorialPoint> | HitAngle;
    readonly promissor: HitBody<DirectionEquatorialPoint>;
    readonly contact: MundaneContact;
  };

/** All geometry, branches, motions, timing keys and year units are explicit. */
export type HitInput = ModeInput & { readonly yearUnit: DirectionYearUnit } & (
  | { readonly convention: { readonly key: "ptolemy" | "naibod" }; readonly solar?: never }
  | { readonly convention: { readonly key: "solar-equatorial-birth-day" }; readonly solar: SolarEquatorialDay }
);

export type HitGeometry =
  | { readonly solver: "zodiacal-body"; readonly calculation: ZodiacalBodyArc }
  | { readonly solver: "mundane-body"; readonly calculation: MundaneBodyArc }
  | ({
    readonly solver: "angle";
    readonly preparedPromissor: DirectionEquatorialPoint;
    readonly calculation: AngleConjunctionArc;
  } & (
    | { readonly preparation: "ecliptic-zero-latitude";
      readonly projection: "@zodiacs/engine:eclipticToEquatorial"; readonly trueObliquityDegrees: number }
    | { readonly preparation: "retained-equatorial"; readonly projection: null; readonly trueObliquityDegrees: null }
  ));

export interface DirectionHit {
  readonly status: "ok";
  readonly kind: "conjunction-to-body" | "aspect-to-body" | "conjunction-to-angle";
  readonly convention: DirectionConvention;
  /** Original labels and coordinates, including in a converse role exchange. */
  readonly significator: HitBody<DirectionEclipticPoint | DirectionEquatorialPoint> | HitAngle;
  readonly promissor: HitBody<DirectionEclipticPoint | DirectionEquatorialPoint>;
  readonly contact: ZodiacalContact | MundaneContact;
  readonly arcDegrees: number;
  readonly directedAgeYears: number;
  readonly timing: DirectedAge;
  /** Complete primitive result; no rounded or recomputed copy of its geometry. */
  readonly geometry: HitGeometry;
}

type Failure<Stage extends string, Code extends string> = {
  readonly status: "refused";
  readonly stage: Stage;
  readonly code: Code;
  readonly message: string;
};

export type HitRefusal =
  | Failure<"input", "invalid-input" | "inconsistent-body">
  | Failure<"convention", "invalid-input">
  | Failure<"angle", AngleDirectionErrorCode | "unsupported-angle-aspect">
  | Failure<"zodiacal", ZodiacalDirectionErrorCode>
  | Failure<"mundane", MundaneDirectionErrorCode>
  | Failure<"sphere", SphereGeometryErrorCode>
  | Failure<"timing", TimingErrorCode>;

export type HitResult = DirectionHit | HitRefusal;

class InputError extends RangeError {
  constructor(readonly code: "invalid-input" | "inconsistent-body", message: string) { super(message); }
}

function invalid(message: string): never { throw new InputError("invalid-input", message); }

function data(input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    return invalid("Hit input must consist of plain data objects.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (required.some(field => !Object.hasOwn(descriptors, field))
    || keys.some(key => typeof key !== "string" || ![...required, ...optional].includes(key))) {
    return invalid("Provide all required hit fields and no unknown fields.");
  }
  const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor) || !descriptor.enumerable) {
      return invalid("Hit fields must be explicit enumerable data properties.");
    }
    values[key] = descriptor.value;
  }
  return values;
}

function degrees(value: unknown, min: number, max: number, exclusive = false): number {
  if (typeof value !== "number" || !Number.isFinite(value)
    || value < min || (exclusive ? value >= max : value > max)) {
    return invalid("Supply finite coordinates within the documented canonical degree intervals.");
  }
  return value === 0 ? 0 : value;
}

function body(input: unknown, mode: DirectionConvention["mode"]): HitBody<DirectionEclipticPoint | DirectionEquatorialPoint> {
  const values = data(input, ["kind", "id", "coordinates"]);
  if (values.kind !== "body" || typeof values.id !== "string"
    || values.id.length < 1 || values.id.length > 80 || values.id.trim() !== values.id
    || /[\u0000-\u001f\u007f]/.test(values.id)) {
    return invalid("A body needs kind: body and a nonempty, trimmed label without control characters, at most 80 code units.");
  }
  const fields = mode === "zodiacal"
    ? ["longitudeDegrees", "latitudeDegrees"] : ["rightAscensionDegrees", "declinationDegrees"];
  const point = data(values.coordinates, fields);
  const coordinates = mode === "zodiacal" ? Object.freeze({
    longitudeDegrees: degrees(point.longitudeDegrees, 0, 360, true),
    latitudeDegrees: degrees(point.latitudeDegrees, -90, 90)
  }) : Object.freeze({
    rightAscensionDegrees: degrees(point.rightAscensionDegrees, 0, 360, true),
    declinationDegrees: degrees(point.declinationDegrees, -90, 90)
  });
  return Object.freeze({ kind: "body", id: values.id, coordinates });
}

function significator(input: unknown, mode: DirectionConvention["mode"]): DirectionHit["significator"] {
  const values = data(input, ["kind"], ["id", "coordinates", "angle"]);
  if (values.kind === "body") return body(input, mode);
  if (values.kind !== "angle" || Object.keys(values).length !== 2
    || !["mc", "ic", "asc", "dsc"].includes(values.angle as string)) {
    return invalid("Select a named body or an explicit mc, ic, asc or dsc significator.");
  }
  return Object.freeze({ kind: "angle", angle: values.angle as DirectionAngle });
}

function contact(input: unknown, mode: DirectionConvention["mode"]): ZodiacalContact | MundaneContact {
  const values = data(input, ["kind"], ["aspect", "branch"]);
  const count = Object.keys(values).length;
  if (values.kind === "conjunction" && count === 1) return Object.freeze({ kind: "conjunction" });
  if (values.kind === "aspect" && values.aspect === "opposition" && count === 2) {
    return Object.freeze({ kind: "aspect", aspect: "opposition" });
  }
  if (values.kind !== "aspect" || count !== 3
    || (values.aspect !== "sextile" && values.aspect !== "square" && values.aspect !== "trine")) {
    return invalid("Select conjunction, opposition, or sextile/square/trine with an explicit mode-specific branch.");
  }
  if (mode === "zodiacal" && (values.branch === "dexter" || values.branch === "sinister")) {
    return Object.freeze({ kind: "aspect", aspect: values.aspect, branch: values.branch });
  }
  if (mode === "mundane" && (values.branch === "westward" || values.branch === "eastward")) {
    return Object.freeze({ kind: "aspect", aspect: values.aspect, branch: values.branch });
  }
  return invalid("The aspect branch must belong to the selected direction mode.");
}

function refusal<S extends string, C extends string>(stage: S, code: C, message: string): Failure<S, C> {
  return Object.freeze({ status: "refused", stage, code, message });
}

/** Validate JSON-shaped input and return a complete hit or a serializable refusal. */
export function parseHit(input: unknown): HitResult {
  try {
    const values = data(input,
      ["convention", "geometry", "significator", "promissor", "contact", "yearUnit"], ["solar"]);
    let convention: DirectionConvention;
    try { convention = parseDirectionConvention(values.convention); }
    catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return refusal("convention", "invalid-input", error.message);
    }
    if (convention.key !== "solar-equatorial-birth-day" && Object.hasOwn(values, "solar")) {
      return invalid("Fixed timing keys forbid the solar field, including an explicit undefined value.");
    }
    // Validate and copy the key and samples even if the requested geometry will
    // later refuse. The zero arc is only a validation probe, never a hit.
    const probe = directedAge(convention.key === "solar-equatorial-birth-day"
      ? { arcDegrees: 0, key: convention.key, yearUnit: values.yearUnit as DirectionYearUnit,
        solar: values.solar as SolarEquatorialDay }
      : { arcDegrees: 0, key: convention.key, yearUnit: values.yearUnit as DirectionYearUnit });
    const place = data(values.geometry, convention.mode === "zodiacal"
      ? ["ramcDegrees", "latitudeDegrees", "trueObliquityDegrees"] : ["ramcDegrees", "latitudeDegrees"]);
    const commonGeometry = Object.freeze({
      ramcDegrees: degrees(place.ramcDegrees, 0, 360, true),
      latitudeDegrees: degrees(place.latitudeDegrees, -90, 90)
    });
    const obliquity = convention.mode === "zodiacal" ? degrees(place.trueObliquityDegrees, 0, 90, true) : null;
    const s = significator(values.significator, convention.mode);
    const p = body(values.promissor, convention.mode);
    const c = contact(values.contact, convention.mode);
    if (s.kind === "body" && s.id === p.id
      && JSON.stringify(s.coordinates) !== JSON.stringify(p.coordinates)) {
      throw new InputError("inconsistent-body", "One body label cannot name different coordinates within a hit.");
    }
    const motion: DirectionMotionConvention = convention.motion === "direct" ? { motion: "direct" }
      : { motion: "converse", converseConstruction: convention.converseConstruction };
    let geometry: HitGeometry;
    if (s.kind === "angle") {
      if (c.kind !== "conjunction") {
        return refusal("angle", "unsupported-angle-aspect", "Angle aspects are outside this implementation; no angle-as-body substitution is applied.");
      }
      let preparedPromissor: DirectionEquatorialPoint;
      if (convention.mode === "zodiacal") {
        const point = p.coordinates as DirectionEclipticPoint;
        const projected = eclipticToEquatorial(point.longitudeDegrees, 0, obliquity!);
        if (projected.ra === null
          || (point.longitudeDegrees > 0 && point.longitudeDegrees < 180 && projected.ra === 0)) {
          throw new ZodiacalDirectionError("numerical-degeneracy", "The projected angle promissor has no resolved right ascension.");
        }
        preparedPromissor = Object.freeze({ rightAscensionDegrees: projected.ra, declinationDegrees: projected.dec });
      } else preparedPromissor = p.coordinates as DirectionEquatorialPoint;
      const preparation = convention.mode === "zodiacal"
        ? { preparation: "ecliptic-zero-latitude", projection: "@zodiacs/engine:eclipticToEquatorial", trueObliquityDegrees: obliquity! } as const
        : { preparation: "retained-equatorial", projection: null, trueObliquityDegrees: null } as const;
      geometry = Object.freeze({
        solver: "angle", ...preparation,
        preparedPromissor,
        calculation: angleConjunctionArc({ ...motion, angle: s.angle, coordinates: { ...commonGeometry, ...preparedPromissor } })
      });
    } else if (convention.mode === "zodiacal") {
      geometry = Object.freeze({ solver: "zodiacal-body", calculation: zodiacalBodyArc({
        system: convention.system, mode: convention.mode, latitude: convention.latitude, ...motion,
        geometry: { ...commonGeometry, trueObliquityDegrees: obliquity! },
        significator: s.coordinates as DirectionEclipticPoint, promissor: p.coordinates as DirectionEclipticPoint,
        contact: c as ZodiacalContact
      }) });
    } else {
      geometry = Object.freeze({ solver: "mundane-body", calculation: mundaneBodyArc({
        system: convention.system, mode: convention.mode, latitude: convention.latitude, ...motion,
        geometry: commonGeometry, significator: s.coordinates as DirectionEquatorialPoint,
        promissor: p.coordinates as DirectionEquatorialPoint, contact: c as MundaneContact
      }) });
    }
    const arcDegrees = geometry.calculation.arcDegrees;
    const timing = directedAge(probe.audit.kind === "solar-birth-day"
      ? { arcDegrees, key: "solar-equatorial-birth-day", yearUnit: probe.yearUnit, solar: probe.audit.samples }
      : { arcDegrees, key: convention.key as "ptolemy" | "naibod", yearUnit: probe.yearUnit });
    return Object.freeze({
      status: "ok", kind: geometry.calculation.kind, convention, significator: s, promissor: p, contact: c,
      arcDegrees, directedAgeYears: timing.directedAgeYears, timing, geometry
    });
  } catch (error) {
    if (error instanceof InputError) return refusal("input", error.code, error.message);
    if (error instanceof AngleDirectionError) return refusal("angle", error.code, error.message);
    if (error instanceof ZodiacalDirectionError) return refusal("zodiacal", error.code, error.message);
    if (error instanceof MundaneDirectionError) return refusal("mundane", error.code, error.message);
    if (error instanceof SphereGeometryError) return refusal("sphere", error.code, error.message);
    if (error instanceof TimingError) return refusal("timing", error.code, error.message);
    throw error;
  }
}

/** Pure typed API. No natal calculation, clock sampling, file access or network. */
export function hit(input: HitInput): HitResult { return parseHit(input); }
