import type { DirectionMotionConvention } from "./conventions.js";
import { spherePosition } from "./sphere.js";
import type { SphereBoundary, SphereInput, SpherePosition } from "./sphere.js";

export type DirectionAngle = "mc" | "ic" | "asc" | "dsc";

/**
 * A prepared equatorial promissor and a fixed angular significator.
 * No ecliptic projection, aspect ray or timing key is applied at this level.
 * Converse requests are expressible so the traditional restriction is explicit.
 */
export type AngleConjunctionInput = DirectionMotionConvention & {
  readonly coordinates: SphereInput;
  readonly angle: DirectionAngle;
};

export interface AngleConjunctionArc {
  readonly kind: "conjunction-to-angle";
  readonly angle: DirectionAngle;
  readonly motion: "direct";
  readonly construction: "placidus-direct";
  /** First nonnegative westward rotation in [0, 360), including natal contact. */
  readonly arcDegrees: number;
  readonly geometry: {
    readonly initial: SpherePosition;
    readonly targetBoundary: SphereBoundary;
    /** Target on this promissor's declination circle, west-positive degrees. */
    readonly targetHourAngleDegrees: number;
    /** Rounded subtraction; reducing this rounded value can lose a small arc. */
    readonly unreducedArcDegrees: number;
    readonly wholeTurnsAdded: 0 | 1;
    /** Equality to the computed target, without tolerance snapping. */
    readonly coincident: boolean;
    readonly rotation: "westward";
  };
}

export type AngleDirectionErrorCode =
  | "invalid-input" | "unsupported-converse-angle" | "numerical-degeneracy";

export class AngleDirectionError extends RangeError {
  constructor(readonly code: AngleDirectionErrorCode, message: string) {
    super(message);
    this.name = "AngleDirectionError";
  }
}

function readInput(input: AngleConjunctionInput): AngleConjunctionInput {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new AngleDirectionError("invalid-input", "Angle direction input must be a plain data object.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const fields = descriptors.motion?.value === "converse"
    ? ["coordinates", "angle", "motion", "converseConstruction"]
    : ["coordinates", "angle", "motion"];
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length || keys.some(key => typeof key !== "string" || !fields.includes(key))) {
    throw new AngleDirectionError("invalid-input", "Provide coordinates, angle and motion; converse also requires converseConstruction.");
  }
  const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new AngleDirectionError("invalid-input", "Angle direction fields must be explicit data properties.");
    }
    values[field] = descriptor.value;
  }
  if (!["mc", "ic", "asc", "dsc"].includes(values.angle as string)) {
    throw new AngleDirectionError("invalid-input", "Select mc, ic, asc or dsc explicitly.");
  }
  if (values.motion !== "direct" && values.motion !== "converse") {
    throw new AngleDirectionError("invalid-input", "Select direct or converse motion explicitly.");
  }
  if (values.motion === "converse" && values.converseConstruction !== "placidus-role-swap") {
    throw new AngleDirectionError("invalid-input", "Converse requires the explicit placidus-role-swap construction.");
  }
  return values as unknown as AngleConjunctionInput;
}

/**
 * Carry a frozen promissor westward to a fixed meridian or horizon.
 * Ptolemy, Tetrabiblos III.XIV (Ashmand 1822), p. 94; Placidus, Primum
 * Mobile (Cooper 1814), p. 57 and thesis 60. See M4-derivations.md.
 * The current subset requires crossing semi-arcs for every target, including
 * meridians. SphereGeometryError propagates on unsupported sphere geometry.
 */
export function angleConjunctionArc(input: AngleConjunctionInput): AngleConjunctionArc {
  const request = readInput(input);
  if (request.motion === "converse") {
    throw new AngleDirectionError("unsupported-converse-angle",
      "Placidus role-swap converse directions of angles are not admitted; no reverse-rotation arc is substituted.");
  }
  const initial = spherePosition(request.coordinates);
  const diurnal = initial.semiArcs.diurnalSemiArcDegrees;
  const targetHourAngleDegrees = request.angle === "mc" ? 0
    : request.angle === "ic" ? -180
    : request.angle === "asc" ? -diurnal : diurnal;
  const targetBoundary: SphereBoundary = request.angle === "mc" ? "upper-meridian"
    : request.angle === "ic" ? "lower-meridian"
    : request.angle === "asc" ? "rising" : "setting";
  const difference = targetHourAngleDegrees - initial.hourAngleDegrees;
  const unreducedArcDegrees = difference === 0 ? 0 : difference;
  const wholeTurnsAdded = targetHourAngleDegrees < initial.hourAngleDegrees ? 1 : 0;
  // Do not use (difference + 360) % 360: that loses small positive arcs and
  // can misreport a nearly full turn as zero. An unrepresentable turn refuses.
  // For a short wrapped contact, add the nonnegative distances through the
  // lower meridian. (-180 - H) + 360 could cancel to zero near +180.
  // For a long wrapped contact, add a turn directly: splitting a nearly full
  // turn at 180 could round twice and refuse an otherwise representable arc.
  const arcDegrees = wholeTurnsAdded
    ? unreducedArcDegrees > -180 ? 360 + unreducedArcDegrees
      : (180 - initial.hourAngleDegrees) + (targetHourAngleDegrees + 180)
    : unreducedArcDegrees;
  if (!(arcDegrees >= 0 && arcDegrees < 360)) {
    throw new AngleDirectionError("numerical-degeneracy",
      "The arc rounds outside the first-turn interval; it cannot be reported as a coincident contact.");
  }
  return Object.freeze({
    kind: "conjunction-to-angle", angle: request.angle,
    motion: "direct", construction: "placidus-direct", arcDegrees,
    geometry: Object.freeze({
      initial, targetBoundary, targetHourAngleDegrees, unreducedArcDegrees,
      wholeTurnsAdded, coincident: targetHourAngleDegrees === initial.hourAngleDegrees, rotation: "westward"
    })
  });
}
