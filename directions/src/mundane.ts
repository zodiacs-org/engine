import type { DirectionMotionConvention } from "./conventions.js";
import { spherePosition } from "./sphere.js";
import type { SphereBoundary, SpherePosition, SphereQuadrant } from "./sphere.js";

/** Full bodily coordinates in the same equator/equinox frame as RAMC. */
export interface DirectionEquatorialPoint {
  readonly rightAscensionDegrees: number;
  readonly declinationDegrees: number;
}

export interface MundaneGeometryInput {
  readonly ramcDegrees: number;
  readonly latitudeDegrees: number;
}

/** Branch is the proportional-position direction from original promissor to significator. */
export type MundaneContact =
  | { readonly kind: "conjunction" }
  | { readonly kind: "aspect"; readonly aspect: "opposition" }
  | {
    readonly kind: "aspect";
    readonly aspect: "sextile" | "square" | "trine";
    readonly branch: "westward" | "eastward";
  };

export type MundaneBodyInput = DirectionMotionConvention & {
  readonly system: "placidus-semiarc";
  readonly mode: "mundane";
  readonly latitude: "retain-both";
  readonly geometry: MundaneGeometryInput;
  readonly significator: DirectionEquatorialPoint;
  readonly promissor: DirectionEquatorialPoint;
  readonly contact: MundaneContact;
};

export type MundaneBodyArc = DirectionMotionConvention & {
  readonly kind: "conjunction-to-body" | "aspect-to-body";
  readonly system: "placidus-semiarc";
  readonly mode: "mundane";
  readonly latitude: "retain-both";
  readonly construction: "placidus-direct" | "placidus-role-swap";
  readonly significator: DirectionEquatorialPoint;
  readonly promissor: DirectionEquatorialPoint;
  readonly contact: MundaneContact;
  /** First nonnegative westward equatorial rotation in [0, 360). */
  readonly arcDegrees: number;
  readonly geometry: MundaneGeometryInput & {
    readonly positionDefinition: "placidus-proportional-semiarc";
    readonly branchReference: "original-promissor-to-significator";
    readonly significator: SpherePosition;
    readonly promissor: SpherePosition;
    readonly movingRole: "promissor" | "significator";
    readonly fixedRole: "significator" | "promissor";
    /** q_significator = q_promissor + offset (modulo a turn). */
    readonly aspectOffsetDegrees: number;
    /** Offset applied to the fixed position to obtain the moving body's target. */
    readonly targetOffsetDegrees: number;
    /** Operative fixed q; uses the exact H identity on equal quarter circles. */
    readonly fixedSemiArcPositionDegrees: number;
    readonly targetSemiArcPositionDegrees: number;
    /** Residual of offset addition only, not a bound on sphere-coordinate error. */
    readonly targetPositionRoundingDegrees: number;
    readonly targetQuadrant: SphereQuadrant | null;
    readonly targetBoundary: SphereBoundary | null;
    readonly targetMeridianFraction: number | null;
    readonly targetSemiArcDegrees: number | null;
    readonly targetHourAngleDegrees: number;
    readonly unreducedArcDegrees: number;
    readonly wholeTurnsAdded: 0 | 1;
    readonly coincident: boolean;
    readonly rotation: "westward";
  };
};

export type MundaneDirectionErrorCode = "invalid-input" | "numerical-degeneracy";

export class MundaneDirectionError extends RangeError {
  constructor(readonly code: MundaneDirectionErrorCode, message: string) {
    super(message);
    this.name = "MundaneDirectionError";
  }
}

function invalid(message: string): never {
  throw new MundaneDirectionError("invalid-input", message);
}

function degenerate(message: string): never {
  throw new MundaneDirectionError("numerical-degeneracy", message);
}

function data(input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    return invalid("Mundane inputs must be plain data objects.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (required.some(key => !Object.hasOwn(descriptors, key)) || keys.some(key =>
    typeof key !== "string" || ![...required, ...optional].includes(key))) {
    return invalid("Provide every required mundane field and no unknown fields.");
  }
  const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor) || !descriptor.enumerable) {
      return invalid("Mundane fields must be explicit enumerable data properties.");
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

function point(input: unknown): DirectionEquatorialPoint {
  const values = data(input, ["rightAscensionDegrees", "declinationDegrees"]);
  return Object.freeze({
    rightAscensionDegrees: degrees(values.rightAscensionDegrees, "Right ascension", 0, 360, true),
    declinationDegrees: degrees(values.declinationDegrees, "Declination", -90, 90)
  });
}

function contact(input: unknown): MundaneContact {
  const values = data(input, ["kind"], ["aspect", "branch"]);
  const count = Object.keys(values).length;
  if (values.kind === "conjunction" && count === 1) return Object.freeze({ kind: "conjunction" });
  if (values.kind !== "aspect") return invalid("Select conjunction or an explicit mundane aspect.");
  if (values.aspect === "opposition" && count === 2) return Object.freeze({ kind: "aspect", aspect: "opposition" });
  if ((values.aspect === "sextile" || values.aspect === "square" || values.aspect === "trine")
    && (values.branch === "westward" || values.branch === "eastward") && count === 3) {
    return Object.freeze({ kind: "aspect", aspect: values.aspect, branch: values.branch });
  }
  return invalid("Sextile, square and trine require westward or eastward; opposition has no branch field.");
}

function readInput(input: MundaneBodyInput): MundaneBodyInput {
  const values = data(input, ["system", "mode", "latitude", "motion", "geometry", "significator", "promissor", "contact"],
    ["converseConstruction"]);
  if (values.system !== "placidus-semiarc" || values.mode !== "mundane" || values.latitude !== "retain-both") {
    return invalid("This solver requires explicit placidus-semiarc, mundane and retain-both choices.");
  }
  let motion: DirectionMotionConvention;
  if (values.motion === "direct" && !Object.hasOwn(values, "converseConstruction")) {
    motion = { motion: "direct" };
  } else if (values.motion === "converse" && values.converseConstruction === "placidus-role-swap") {
    motion = { motion: "converse", converseConstruction: "placidus-role-swap" };
  } else return invalid("Select direct, or converse with the explicit placidus-role-swap construction.");
  const geometry = data(values.geometry, ["ramcDegrees", "latitudeDegrees"]);
  return {
    system: "placidus-semiarc", mode: "mundane", latitude: "retain-both", ...motion,
    geometry: Object.freeze({
      ramcDegrees: degrees(geometry.ramcDegrees, "RAMC", 0, 360, true),
      latitudeDegrees: degrees(geometry.latitudeDegrees, "Observer latitude", -90, 90)
    }),
    significator: point(values.significator), promissor: point(values.promissor), contact: contact(values.contact)
  };
}

function offset(contact: MundaneContact): number {
  if (contact.kind === "conjunction") return 0;
  if (contact.aspect === "opposition") return 180;
  const magnitude = { sextile: 60, square: 90, trine: 120 }[contact.aspect];
  return contact.branch === "westward" ? magnitude : -magnitude;
}

type Target = {
  targetSemiArcPositionDegrees: number;
  targetPositionRoundingDegrees: number;
  targetQuadrant: SphereQuadrant | null;
  targetBoundary: SphereBoundary | null;
  targetMeridianFraction: number | null;
  targetSemiArcDegrees: number | null;
  targetHourAngleDegrees: number;
};

function boundaryTarget(boundary: SphereBoundary, q: number, moving: SpherePosition): Target {
  const d = moving.semiArcs.diurnalSemiArcDegrees;
  return {
    targetSemiArcPositionDegrees: q, targetPositionRoundingDegrees: 0,
    targetQuadrant: null, targetBoundary: boundary,
    targetMeridianFraction: null, targetSemiArcDegrees: null,
    targetHourAngleDegrees: boundary === "upper-meridian" ? 0
      : boundary === "lower-meridian" ? -180 : boundary === "rising" ? -d : d
  };
}

function interiorTarget(quadrant: SphereQuadrant, fraction: number, q: number,
  residual: number, moving: SpherePosition, unchangedHourAngle?: number, proportionalDistance?: number): Target {
  const above = quadrant === "above-west" || quadrant === "above-east";
  const west = quadrant === "above-west" || quadrant === "below-west";
  const d = moving.semiArcs.diurnalSemiArcDegrees;
  const arc = above ? d : moving.semiArcs.nocturnalSemiArcDegrees;
  // The aspect inverse is distance * (SA/90), keeping the exact identity
  // when SA=90. Conjunctions use the original meridian fraction instead.
  const distance = proportionalDistance === undefined ? fraction * arc : proportionalDistance * (arc / 90);
  const h = unchangedHourAngle ?? (west ? 1 : -1) * (above ? distance : 180 - distance);
  const magnitude = Math.abs(h);
  if (!(above ? magnitude > 0 && magnitude < d : magnitude > d && magnitude < 180)) {
    return degenerate("The transferred interior position rounds onto a quadrant boundary.");
  }
  return {
    targetSemiArcPositionDegrees: q, targetPositionRoundingDegrees: residual,
    targetQuadrant: quadrant, targetBoundary: null, targetMeridianFraction: fraction,
    targetSemiArcDegrees: arc, targetHourAngleDegrees: h
  };
}

function conjunctionTarget(fixed: SpherePosition, moving: SpherePosition): Target {
  const q = fixed.semiArcPositionDegrees;
  if (fixed.kind === "boundary") return boundaryTarget(fixed.boundary, q, moving);
  const above = fixed.quadrant === "above-west" || fixed.quadrant === "above-east";
  const arc = above ? moving.semiArcs.diurnalSemiArcDegrees : moving.semiArcs.nocturnalSemiArcDegrees;
  // Keep conjunctions out of the rounded q roundtrip. Equal circles transfer
  // H exactly, including coincident interior points and very small distances.
  return interiorTarget(fixed.quadrant, fixed.meridianDistanceDegrees / fixed.semiArcDegrees,
    q, 0, moving, arc === fixed.semiArcDegrees ? fixed.hourAngleDegrees : undefined);
}

/** Error-free sum of two finite angles, used to detect false shifted axes. */
function twoSum(a: number, b: number): { sum: number; residual: number } {
  const sum = a + b;
  const bv = sum - a;
  return { sum, residual: (a - (sum - bv)) + (b - bv) };
}

function operativePosition(point: SpherePosition): number {
  if (point.semiArcs.diurnalSemiArcDegrees === 90 && point.semiArcs.nocturnalSemiArcDegrees === 90) {
    return point.hourAngleDegrees < 0 ? 360 + point.hourAngleDegrees : point.hourAngleDegrees;
  }
  return point.semiArcPositionDegrees;
}

function aspectTarget(fixed: SpherePosition, moving: SpherePosition, shift: number): Target {
  const q = operativePosition(fixed);
  // spherePosition deliberately retains quadrant information when its rounded
  // coordinate hits an axis. That coordinate cannot safely seed an aspect.
  if (fixed.kind === "quadrant") {
    const start = { "above-west": 0, "below-west": 90, "below-east": 180, "above-east": 270 }[fixed.quadrant];
    if (!(q > start && q < start + 90)) {
      return degenerate("The fixed mundane coordinate rounds onto an axis.");
    }
  }
  // Select the wrap before addition, then use one compensated addition. This
  // avoids turning a value just below 360 into a false zero-degree target.
  const adjustment = shift > 0 && q >= 360 - shift ? shift - 360
    : shift < 0 && q < -shift ? shift + 360 : shift;
  const { sum: t, residual } = twoSum(q, adjustment);
  if (!(t >= 0 && t < 360)) return degenerate("The shifted mundane position is outside the canonical interval.");
  const boundary = t === 0 ? "upper-meridian" : t === 90 ? "setting"
    : t === 180 ? "lower-meridian" : t === 270 ? "rising" : null;
  if (boundary !== null) {
    if (residual !== 0) return degenerate("The shifted mundane position rounds onto an axis.");
    return boundaryTarget(boundary, t, moving);
  }
  const quadrant = t < 90 ? "above-west" : t < 180 ? "below-west" : t < 270 ? "below-east" : "above-east";
  const meridianDistance = t < 90 ? t : t < 180 ? 180 - t : t < 270 ? t - 180 : 360 - t;
  return interiorTarget(quadrant, meridianDistance / 90, t, residual, moving, undefined, meridianDistance);
}

/**
 * Placidus proportional mundane positions, retaining both bodily declinations.
 * Canons XXX-XXXII and XXXVII, Primum Mobile (Cooper 1814), pp.87-91,104-105.
 * q_S = q_P + aspect offset, with branches relative to the original promissor.
 * Direct moves P westward; converse moves S westward. No orbital motion, Sun
 * crepuscular exception, latitude projection, angle target or age is inferred.
 */
export function mundaneBodyArc(input: MundaneBodyInput): MundaneBodyArc {
  const request = readInput(input);
  const significator = spherePosition({ ...request.geometry, ...request.significator });
  const promissor = spherePosition({ ...request.geometry, ...request.promissor });
  const direct = request.motion === "direct";
  const moving = direct ? promissor : significator;
  const fixed = direct ? significator : promissor;
  const aspectOffsetDegrees = offset(request.contact);
  const targetOffsetDegrees = aspectOffsetDegrees === 0 ? 0 : direct ? -aspectOffsetDegrees : aspectOffsetDegrees;
  const target = request.contact.kind === "conjunction"
    ? conjunctionTarget(fixed, moving) : aspectTarget(fixed, moving, targetOffsetDegrees);
  const h = moving.hourAngleDegrees;
  const t = target.targetHourAngleDegrees;
  if (t === h) {
    if (target.targetPositionRoundingDegrees !== 0) {
      return degenerate("The aspect offset loses a separation at the computed contact.");
    }
    if (request.contact.kind === "conjunction"
      && fixed.rightAscensionDegrees !== moving.rightAscensionDegrees
      && (fixed.semiArcs.diurnalSemiArcDegrees === moving.semiArcs.diurnalSemiArcDegrees
        || fixed.boundary === "upper-meridian" || fixed.boundary === "lower-meridian")) {
      return degenerate("Distinct points collapse to a contact that requires equal right ascensions.");
    }
    if (request.contact.kind === "aspect" && fixed.semiArcs.diurnalSemiArcDegrees === 90
      && moving.semiArcs.diurnalSemiArcDegrees === 90) {
      // On equal quarter circles q is H modulo a turn. At an initial aspect
      // the original RA difference must therefore equal minus the target
      // offset modulo a turn, exactly. Subtracting RAMC first may have erased
      // a tiny difference; test the original RAs with their sum residual.
      const separation = twoSum(moving.rightAscensionDegrees, -fixed.rightAscensionDegrees);
      const required = -targetOffsetDegrees;
      if (separation.residual !== 0 || ![required, required - 360, required + 360].includes(separation.sum)) {
        return degenerate("Distinct equatorial aspect positions collapse to a coincident hour angle.");
      }
    }
  }
  const difference = t - h;
  const unreducedArcDegrees = difference === 0 ? 0 : difference;
  const wholeTurnsAdded = t < h ? 1 : 0;
  const arcDegrees = wholeTurnsAdded
    ? unreducedArcDegrees > -180 ? 360 + unreducedArcDegrees : (180 - h) + (t + 180)
    : unreducedArcDegrees;
  if (!(arcDegrees >= 0 && arcDegrees < 360)) return degenerate("The rotation cannot be resolved in the first-turn interval.");
  const motion: DirectionMotionConvention = direct ? { motion: "direct" }
    : { motion: "converse", converseConstruction: "placidus-role-swap" };
  return Object.freeze({
    kind: request.contact.kind === "conjunction" ? "conjunction-to-body" : "aspect-to-body",
    system: "placidus-semiarc", mode: "mundane", latitude: "retain-both", ...motion,
    construction: direct ? "placidus-direct" : "placidus-role-swap",
    significator: request.significator, promissor: request.promissor, contact: request.contact, arcDegrees,
    geometry: Object.freeze({
      ...request.geometry, positionDefinition: "placidus-proportional-semiarc",
      branchReference: "original-promissor-to-significator", significator, promissor,
      movingRole: direct ? "promissor" : "significator", fixedRole: direct ? "significator" : "promissor",
      aspectOffsetDegrees, targetOffsetDegrees,
      fixedSemiArcPositionDegrees: request.contact.kind === "conjunction" ? fixed.semiArcPositionDegrees : operativePosition(fixed),
      ...target, unreducedArcDegrees, wholeTurnsAdded,
      coincident: t === h, rotation: "westward"
    })
  });
}
