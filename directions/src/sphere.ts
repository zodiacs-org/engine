/** Coordinate geometry only: no natal calculation, direction motion or timing key. */
export interface SphereInput {
  readonly ramcDegrees: number;
  readonly rightAscensionDegrees: number;
  readonly latitudeDegrees: number;
  readonly declinationDegrees: number;
}

export interface SemiArcGeometry {
  readonly latitudeDegrees: number;
  readonly declinationDegrees: number;
  readonly ascensionalDifferenceDegrees: number;
  readonly diurnalSemiArcDegrees: number;
  readonly nocturnalSemiArcDegrees: number;
}

export type SphereQuadrant = "above-west" | "below-west" | "below-east" | "above-east";
export type SphereBoundary = "upper-meridian" | "setting" | "lower-meridian" | "rising";
export type SphereGeometryErrorCode =
  | "invalid-input" | "geographic-pole" | "celestial-pole"
  | "horizon-tangency" | "circumpolar-above" | "circumpolar-below"
  | "numerical-degeneracy";

export class SphereGeometryError extends RangeError {
  constructor(readonly code: SphereGeometryErrorCode, message: string) {
    super(message);
    this.name = "SphereGeometryError";
  }
}

interface SpherePositionBase {
  readonly ramcDegrees: number;
  readonly rightAscensionDegrees: number;
  /** West positive, in [-180, 180); the lower meridian is -180. */
  readonly hourAngleDegrees: number;
  readonly semiArcs: SemiArcGeometry;
  /** Westward proportional coordinate: upper=0, setting=90, lower=180, rising=270. */
  readonly semiArcPositionDegrees: number;
}

export type SpherePosition = SpherePositionBase & (
  | {
    readonly kind: "quadrant";
    readonly quadrant: SphereQuadrant;
    readonly boundary: null;
    /** Distance from the upper meridian above the horizon, lower meridian below. */
    readonly meridianDistanceDegrees: number;
    readonly semiArcDegrees: number;
    /** Fraction since the preceding axis in westward rotation; not a meridian fraction. */
    readonly quadrantFraction: number;
  }
  | {
    readonly kind: "boundary";
    readonly quadrant: null;
    readonly boundary: SphereBoundary;
    readonly meridianDistanceDegrees: null;
    readonly semiArcDegrees: null;
    readonly quadrantFraction: null;
  }
);

const RADIANS = Math.PI / 180;
const DEGREES = 180 / Math.PI;

function coordinate(value: number, name: string, minimum: number, maximum: number, exclusive = false): void {
  if (typeof value !== "number" || !Number.isFinite(value)
    || value < minimum || (exclusive ? value >= maximum : value > maximum)) {
    throw new SphereGeometryError("invalid-input", `${name} must be finite degrees in [${minimum}, ${maximum}${exclusive ? ")" : "]"}.`);
  }
}

function positiveZero(value: number): number {
  return value === 0 ? 0 : value;
}

/** Both input angles must already be canonical degrees in [0, 360). */
export function hourAngleDegrees(ramcDegrees: number, rightAscensionDegrees: number): number {
  coordinate(ramcDegrees, "RAMC", 0, 360, true);
  coordinate(rightAscensionDegrees, "Right ascension", 0, 360, true);
  let difference = ramcDegrees - rightAscensionDegrees;
  if (difference >= 180) difference -= 360;
  if (difference < -180) difference += 360;
  return positiveZero(difference);
}

/**
 * Geometric horizon, without refraction, parallax or a polar substitution.
 * AD = asin(tan(latitude) * tan(declination)); D = 90 + AD; N = 90 - AD.
 * The equivalent factored atan2 form below retains the short arc near tangency.
 * Derivation and independent examples: directions/evidence/M3-derivations.md.
 */
export function semiArcs(latitudeDegrees: number, declinationDegrees: number): SemiArcGeometry {
  coordinate(latitudeDegrees, "Latitude", -90, 90);
  coordinate(declinationDegrees, "Declination", -90, 90);
  const latitudeMagnitude = Math.abs(latitudeDegrees);
  const declinationMagnitude = Math.abs(declinationDegrees);
  if (latitudeMagnitude === 90) {
    throw new SphereGeometryError("geographic-pole", "At a geographic pole there is no rising or setting semi-arc.");
  }
  if (declinationMagnitude === 90) {
    throw new SphereGeometryError("celestial-pole", "At a celestial pole right ascension and semi-arc position are undefined.");
  }
  const larger = Math.max(latitudeMagnitude, declinationMagnitude);
  const smaller = Math.min(latitudeMagnitude, declinationMagnitude);
  const complement = 90 - larger;
  // Near the boundary larger >= 45, so this subtraction is exact for binary64
  // inputs. Adding the magnitudes first could round an interior point to 90.
  if (smaller === complement) {
    throw new SphereGeometryError("horizon-tangency", "The diurnal circle touches the horizon without crossing it.");
  }
  if (smaller > complement) {
    const above = (latitudeDegrees > 0) === (declinationDegrees > 0);
    throw new SphereGeometryError(above ? "circumpolar-above" : "circumpolar-below",
      above ? "The point stays above the geometric horizon." : "The point stays below the geometric horizon.");
  }

  const sineProduct = Math.sin(latitudeDegrees * RADIANS) * Math.sin(declinationDegrees * RADIANS);
  // R^2 = cos(phi + delta) cos(phi - delta). The positive factors below
  // avoid subtracting nearly equal products or taking acos/asin near +/-1.
  const gap = complement - smaller;
  const root = Math.sqrt(Math.sin(gap * RADIANS))
    * Math.sqrt(Math.sin((complement + smaller) * RADIANS));
  const ascensionalDifferenceDegrees = positiveZero(Math.atan2(sineProduct, root) * DEGREES);
  const shortArc = Math.atan2(root, Math.abs(sineProduct)) * DEGREES;
  const diurnalSemiArcDegrees = sineProduct >= 0 ? 180 - shortArc : shortArc;
  const nocturnalSemiArcDegrees = sineProduct >= 0 ? shortArc : 180 - shortArc;
  if (!(root > 0) || !Number.isFinite(ascensionalDifferenceDegrees)
    || !(diurnalSemiArcDegrees > 0 && diurnalSemiArcDegrees < 180)
    || !(nocturnalSemiArcDegrees > 0 && nocturnalSemiArcDegrees < 180)) {
    throw new SphereGeometryError("numerical-degeneracy", "The crossing semi-arcs cannot be resolved in floating-point arithmetic.");
  }
  return Object.freeze({
    latitudeDegrees: positiveZero(latitudeDegrees), declinationDegrees: positiveZero(declinationDegrees),
    ascensionalDifferenceDegrees, diurnalSemiArcDegrees, nocturnalSemiArcDegrees
  });
}

const FIELDS = ["ramcDegrees", "rightAscensionDegrees", "latitudeDegrees", "declinationDegrees"] as const;

function readInput(input: SphereInput): SphereInput {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new SphereGeometryError("invalid-input", "Sphere input must be a plain data object.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== FIELDS.length || keys.some(key => typeof key !== "string" || !FIELDS.some(field => field === key))) {
    throw new SphereGeometryError("invalid-input", "Provide exactly RAMC, right ascension, latitude and declination in degrees.");
  }
  const values: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const field of FIELDS) {
    const descriptor = descriptors[field];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new SphereGeometryError("invalid-input", "Sphere coordinates must be explicit data properties.");
    }
    values[field] = descriptor.value;
  }
  return values as unknown as SphereInput;
}

/**
 * Place an equatorial point between its own horizon crossings and meridians.
 * Axes use exact equality to the computed hour angle and semi-arc, with no
 * epsilon snapping. This is not a direction, an aspect or a house longitude.
 */
export function spherePosition(input: SphereInput): SpherePosition {
  const coordinates = readInput(input);
  const hourAngle = hourAngleDegrees(coordinates.ramcDegrees, coordinates.rightAscensionDegrees);
  const arcs = semiArcs(coordinates.latitudeDegrees, coordinates.declinationDegrees);
  const diurnal = arcs.diurnalSemiArcDegrees;
  const nocturnal = arcs.nocturnalSemiArcDegrees;
  const base = {
    ramcDegrees: positiveZero(coordinates.ramcDegrees),
    rightAscensionDegrees: positiveZero(coordinates.rightAscensionDegrees),
    hourAngleDegrees: hourAngle, semiArcs: arcs
  };
  const boundary: SphereBoundary | null = hourAngle === 0 ? "upper-meridian"
    : hourAngle === -180 ? "lower-meridian"
    : hourAngle === diurnal ? "setting"
    : hourAngle === -diurnal ? "rising" : null;
  if (boundary !== null) {
    const coordinateDegrees = { "upper-meridian": 0, setting: 90, "lower-meridian": 180, rising: 270 }[boundary];
    return Object.freeze({
      ...base, kind: "boundary", boundary, quadrant: null,
      meridianDistanceDegrees: null, semiArcDegrees: null, quadrantFraction: null,
      semiArcPositionDegrees: coordinateDegrees
    });
  }

  const above = Math.abs(hourAngle) < diurnal;
  const west = hourAngle > 0;
  const meridianDistanceDegrees = above ? Math.abs(hourAngle) : 180 - Math.abs(hourAngle);
  const semiArcDegrees = above ? diurnal : nocturnal;
  let quadrant: SphereQuadrant;
  let quadrantFraction: number;
  let startDegrees: number;
  if (above && west) {
    quadrant = "above-west";
    quadrantFraction = hourAngle / diurnal;
    startDegrees = 0;
  } else if (!above && west) {
    quadrant = "below-west";
    quadrantFraction = (hourAngle - diurnal) / nocturnal;
    startDegrees = 90;
  } else if (!above) {
    quadrant = "below-east";
    quadrantFraction = (hourAngle + 180) / nocturnal;
    startDegrees = 180;
  } else {
    quadrant = "above-east";
    quadrantFraction = (hourAngle + diurnal) / diurnal;
    startDegrees = 270;
  }
  // Rounding can put the numeric coordinate on an axis even for an interior
  // point. Keep the separately determined quadrant; do not snap the position.
  const semiArcPositionDegrees = (startDegrees + 90 * quadrantFraction) % 360;
  return Object.freeze({
    ...base, kind: "quadrant", boundary: null, quadrant, meridianDistanceDegrees,
    semiArcDegrees, quadrantFraction, semiArcPositionDegrees
  });
}
