// This documented public helper's source module is pure. Import it directly
// so the directions entry does not load the root's ephemeris or natal adapter.
import { eclipticToEquatorial } from "../../src/declination.js";
import type { DirectionMotionConvention } from "./conventions.js";
import { spherePosition } from "./sphere.js";
import type { SpherePosition } from "./sphere.js";

export interface DirectionEclipticPoint {
  readonly longitudeDegrees: number;
  /** Preserved as input metadata, then explicitly projected to zero. */
  readonly latitudeDegrees: number;
}

export interface ZodiacalGeometryInput {
  readonly ramcDegrees: number;
  readonly latitudeDegrees: number;
  readonly trueObliquityDegrees: number;
}

export type ZodiacalContact =
  | { readonly kind: "conjunction" }
  | { readonly kind: "aspect"; readonly aspect: "opposition" }
  | {
    readonly kind: "aspect";
    readonly aspect: "sextile" | "square" | "trine";
    readonly branch: "dexter" | "sinister";
  };

/** An explicit arc-only subset of the direction convention, without a key. */
export type ZodiacalBodyInput = DirectionMotionConvention & {
  readonly system: "placidus-semiarc";
  readonly mode: "zodiacal";
  readonly latitude: "zero-both";
  readonly geometry: ZodiacalGeometryInput;
  readonly significator: DirectionEclipticPoint;
  readonly promissor: DirectionEclipticPoint;
  readonly contact: ZodiacalContact;
};

export interface ZodiacalPreparedPoint {
  readonly longitudeDegrees: number;
  readonly latitudeDegrees: 0;
  readonly rightAscensionDegrees: number;
  readonly declinationDegrees: number;
  readonly position: SpherePosition;
}

export interface ZodiacalBodyArc {
  readonly kind: "conjunction-to-body" | "aspect-to-body";
  readonly system: "placidus-semiarc";
  readonly mode: "zodiacal";
  readonly latitude: "zero-both";
  readonly motion: "direct";
  readonly construction: "placidus-direct";
  readonly significator: DirectionEclipticPoint;
  readonly promissor: DirectionEclipticPoint;
  readonly contact: ZodiacalContact;
  /** First nonnegative westward equatorial rotation, in [0, 360). */
  readonly arcDegrees: number;
  readonly geometry: ZodiacalGeometryInput & {
    readonly projection: "@zodiacs/engine:eclipticToEquatorial";
    readonly movingRole: "promissor-ray";
    readonly fixedRole: "significator";
    readonly rayOffsetDegrees: number;
    readonly significator: ZodiacalPreparedPoint;
    /** The projected promissor conjunction or aspect ray, not its bodily RA. */
    readonly promissor: ZodiacalPreparedPoint;
    /** |MD_fixed| / selected semi-arc; null on an axis. */
    readonly fixedMeridianFraction: number | null;
    readonly targetSemiArcDegrees: number | null;
    readonly targetHourAngleDegrees: number;
    readonly unreducedArcDegrees: number;
    readonly wholeTurnsAdded: 0 | 1;
    readonly coincident: boolean;
    readonly rotation: "westward";
  };
}

export type ZodiacalDirectionErrorCode =
  | "invalid-input" | "unsupported-converse-zodiacal" | "numerical-degeneracy";

export class ZodiacalDirectionError extends RangeError {
  constructor(readonly code: ZodiacalDirectionErrorCode, message: string) {
    super(message);
    this.name = "ZodiacalDirectionError";
  }
}

function invalid(message: string): never {
  throw new ZodiacalDirectionError("invalid-input", message);
}

function data(input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    return invalid("Direction inputs must be plain data objects.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (required.some(key => !Object.hasOwn(descriptors, key)) || keys.some(key =>
    typeof key !== "string" || ![...required, ...optional].includes(key))) {
    return invalid("Provide every required direction field and no unknown fields.");
  }
  const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor) || !descriptor.enumerable) {
      return invalid("Direction fields must be explicit enumerable data properties.");
    }
    values[key] = descriptor.value;
  }
  return values;
}

function degrees(value: unknown, name: string, min: number, max: number, exclusive = false): number {
  if (typeof value !== "number" || !Number.isFinite(value)
    || value < min || (exclusive ? value >= max : value > max)) {
    return invalid(`${name} must be finite degrees in [${min}, ${max}${exclusive ? ")" : "]"}.`);
  }
  return value === 0 ? 0 : value;
}

function point(input: unknown): DirectionEclipticPoint {
  const values = data(input, ["longitudeDegrees", "latitudeDegrees"]);
  return Object.freeze({
    longitudeDegrees: degrees(values.longitudeDegrees, "Ecliptic longitude", 0, 360, true),
    latitudeDegrees: degrees(values.latitudeDegrees, "Ecliptic latitude", -90, 90)
  });
}

function contact(input: unknown): ZodiacalContact {
  const values = data(input, ["kind"], ["aspect", "branch"]);
  const keys = Object.keys(values);
  if (values.kind === "conjunction" && keys.length === 1) return Object.freeze({ kind: "conjunction" });
  if (values.kind !== "aspect") return invalid("Select a conjunction or an explicit supported aspect.");
  if (values.aspect === "opposition" && keys.length === 2) {
    return Object.freeze({ kind: "aspect", aspect: "opposition" });
  }
  if ((values.aspect === "sextile" || values.aspect === "square" || values.aspect === "trine")
    && (values.branch === "dexter" || values.branch === "sinister") && keys.length === 3) {
    return Object.freeze({ kind: "aspect", aspect: values.aspect, branch: values.branch });
  }
  return invalid("Sextile, square and trine require dexter or sinister; opposition has one ray and no branch field.");
}

function readInput(input: ZodiacalBodyInput): ZodiacalBodyInput {
  const values = data(input, ["system", "mode", "latitude", "motion", "geometry", "significator", "promissor", "contact"],
    ["converseConstruction"]);
  if (values.system !== "placidus-semiarc" || values.mode !== "zodiacal" || values.latitude !== "zero-both") {
    return invalid("This solver requires explicit placidus-semiarc, zodiacal and zero-both choices.");
  }
  let motion: DirectionMotionConvention;
  if (values.motion === "direct" && !Object.hasOwn(values, "converseConstruction")) {
    motion = { motion: "direct" };
  } else if (values.motion === "converse" && values.converseConstruction === "placidus-role-swap") {
    motion = { motion: "converse", converseConstruction: "placidus-role-swap" };
  } else return invalid("Select direct, or converse with the explicit placidus-role-swap construction.");
  const geometry = data(values.geometry, ["ramcDegrees", "latitudeDegrees", "trueObliquityDegrees"]);
  return {
    system: "placidus-semiarc", mode: "zodiacal", latitude: "zero-both", ...motion,
    geometry: Object.freeze({
      ramcDegrees: degrees(geometry.ramcDegrees, "RAMC", 0, 360, true),
      latitudeDegrees: degrees(geometry.latitudeDegrees, "Observer latitude", -90, 90),
      trueObliquityDegrees: degrees(geometry.trueObliquityDegrees, "Obliquity", 0, 90, true)
    }),
    significator: point(values.significator), promissor: point(values.promissor), contact: contact(values.contact)
  };
}

function offset(contact: ZodiacalContact): number {
  if (contact.kind === "conjunction") return 0;
  if (contact.aspect === "opposition") return 180;
  const magnitude = { sextile: 60, square: 90, trine: 120 }[contact.aspect];
  return contact.branch === "sinister" ? magnitude : -magnitude;
}

/** Error-free addition lets coincidence checks distinguish a rounded ray. */
function twoSum(a: number, b: number): { sum: number; residual: number } {
  const sum = a + b;
  const bv = sum - a;
  return { sum, residual: (a - (sum - bv)) + (b - bv) };
}

function rayLongitude(longitude: number, offset: number): {
  longitudeDegrees: number; roundingDegrees: number;
} {
  // Compare before addition so a ray just before the zero-longitude seam
  // cannot round to 360 and silently turn into a coincident zero-degree ray.
  const wrapsForward = offset > 0 && longitude >= 360 - offset;
  const addition = twoSum(longitude, wrapsForward ? offset - 360 : offset);
  let ray = addition.sum;
  let roundingDegrees = addition.residual;
  if (ray < 0) {
    const wrap = twoSum(ray, 360);
    ray = wrap.sum;
    roundingDegrees += wrap.residual;
  }
  if (!(ray >= 0 && ray < 360)) {
    throw new ZodiacalDirectionError("numerical-degeneracy", "The ecliptic ray rounds outside the canonical longitude interval.");
  }
  return { longitudeDegrees: ray === 0 ? 0 : ray, roundingDegrees };
}

function prepare(longitudeDegrees: number, geometry: ZodiacalGeometryInput): ZodiacalPreparedPoint {
  const equatorial = eclipticToEquatorial(longitudeDegrees, 0, geometry.trueObliquityDegrees);
  if (equatorial.ra === null || (longitudeDegrees > 0 && longitudeDegrees < 180 && equatorial.ra === 0)) {
    throw new ZodiacalDirectionError("numerical-degeneracy", "The projected point has no resolved right ascension.");
  }
  return Object.freeze({
    longitudeDegrees, latitudeDegrees: 0,
    rightAscensionDegrees: equatorial.ra, declinationDegrees: equatorial.dec,
    position: spherePosition({ ramcDegrees: geometry.ramcDegrees,
      latitudeDegrees: geometry.latitudeDegrees,
      rightAscensionDegrees: equatorial.ra, declinationDegrees: equatorial.dec })
  });
}

/** Transfer the fixed point's temporal-hour position to the moving circle. */
function target(fixed: SpherePosition, moving: SpherePosition): {
  targetHourAngleDegrees: number; fixedMeridianFraction: number | null; targetSemiArcDegrees: number | null;
} {
  const diurnal = moving.semiArcs.diurnalSemiArcDegrees;
  const nocturnal = moving.semiArcs.nocturnalSemiArcDegrees;
  if (fixed.kind === "boundary") {
    const targetHourAngleDegrees = fixed.boundary === "upper-meridian" ? 0
      : fixed.boundary === "lower-meridian" ? -180
      : fixed.boundary === "rising" ? -diurnal : diurnal;
    return { targetHourAngleDegrees, fixedMeridianFraction: null, targetSemiArcDegrees: null };
  }
  const above = fixed.quadrant === "above-west" || fixed.quadrant === "above-east";
  const west = fixed.quadrant === "above-west" || fixed.quadrant === "below-west";
  const targetSemiArcDegrees = above ? diurnal : nocturnal;
  const fixedMeridianFraction = fixed.meridianDistanceDegrees / fixed.semiArcDegrees;
  // Identical semi-arcs transfer H unchanged, avoiding a divide/multiply
  // round trip that could convert a genuine conjunction into almost a turn.
  const distance = fixedMeridianFraction * targetSemiArcDegrees;
  const h = targetSemiArcDegrees === fixed.semiArcDegrees ? fixed.hourAngleDegrees
    : (west ? 1 : -1) * (above ? distance : 180 - distance);
  const magnitude = Math.abs(h);
  if (!(above ? magnitude > 0 && magnitude < diurnal : magnitude > diurnal && magnitude < 180)) {
    throw new ZodiacalDirectionError("numerical-degeneracy", "The transferred interior position rounds onto a quadrant boundary.");
  }
  return { targetHourAngleDegrees: h, fixedMeridianFraction, targetSemiArcDegrees };
}

/**
 * Project both points to the ecliptic. Carry the promissor's ecliptic ray
 * westward to the fixed significator's proportional semi-arc position.
 * Placidus, Primum Mobile (Cooper 1814), canons XVII-XIX, XXIII; Lilly,
 * Christian Astrology I (1647), pp.108-109. See M5-derivations.md for the
 * restricted projection policy, Sun treatment and refused converse choice.
 */
export function zodiacalBodyArc(input: ZodiacalBodyInput): ZodiacalBodyArc {
  const request = readInput(input);
  if (request.motion === "converse") {
    throw new ZodiacalDirectionError("unsupported-converse-zodiacal",
      "Placidus role-swap is admitted only for mundane contacts; zodiacal converse is not enabled.");
  }
  const rayOffsetDegrees = offset(request.contact);
  const ray = rayLongitude(request.promissor.longitudeDegrees, rayOffsetDegrees);
  const significator = prepare(request.significator.longitudeDegrees, request.geometry);
  const promissor = prepare(ray.longitudeDegrees, request.geometry);
  const transfer = target(significator.position, promissor.position);
  const h = promissor.position.hourAngleDegrees;
  const t = transfer.targetHourAngleDegrees;
  // An inexact longitude-plus-aspect addition is ordinary rounding away
  // from contact. At apparent coincidence its residual can be the entire
  // separation, so do not assert a zero arc from the rounded ray alone.
  if (t === h && ray.roundingDegrees !== 0) {
    throw new ZodiacalDirectionError("numerical-degeneracy", "The ecliptic ray offset loses a separation at the computed contact.");
  }
  // Equal semi-arcs require equality of RAs for a zero rotation; a fixed
  // meridian does so even when the declination circles differ. Rounded
  // RAMC-minus-RA subtraction can collapse distinct projected points to the
  // same hour angle. Refuse that loss instead of inventing natal coincidence.
  if (t === h && significator.longitudeDegrees !== promissor.longitudeDegrees
    && (significator.position.semiArcs.diurnalSemiArcDegrees === promissor.position.semiArcs.diurnalSemiArcDegrees
      || significator.position.boundary === "upper-meridian" || significator.position.boundary === "lower-meridian")) {
    throw new ZodiacalDirectionError("numerical-degeneracy", "Distinct projected points collapse to a coincident hour angle.");
  }
  const difference = t - h;
  const unreducedArcDegrees = difference === 0 ? 0 : difference;
  const wholeTurnsAdded = t < h ? 1 : 0;
  const arcDegrees = wholeTurnsAdded
    ? unreducedArcDegrees > -180 ? 360 + unreducedArcDegrees : (180 - h) + (t + 180)
    : unreducedArcDegrees;
  if (!(arcDegrees >= 0 && arcDegrees < 360)) {
    throw new ZodiacalDirectionError("numerical-degeneracy", "The rotation cannot be resolved in the first-turn interval.");
  }
  return Object.freeze({
    kind: request.contact.kind === "conjunction" ? "conjunction-to-body" : "aspect-to-body",
    system: "placidus-semiarc", mode: "zodiacal", latitude: "zero-both", motion: "direct",
    construction: "placidus-direct", significator: request.significator, promissor: request.promissor,
    contact: request.contact, arcDegrees,
    geometry: Object.freeze({
      ...request.geometry, projection: "@zodiacs/engine:eclipticToEquatorial",
      movingRole: "promissor-ray", fixedRole: "significator", rayOffsetDegrees,
      significator, promissor, ...transfer, unreducedArcDegrees, wholeTurnsAdded,
      coincident: t === h, rotation: "westward"
    })
  });
}
