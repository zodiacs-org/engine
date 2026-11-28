import { SKY_RADII_KM } from "../../src/sky.js";

export interface ContactGeometryInput {
  readonly separationDegrees: number;
  /** Topocentric model range in kilometres; the adapter uses its reported light path. */
  readonly moonDistanceKm: number;
  /** Null selects an infinite point source, not a measured stellar distance. */
  readonly targetDistanceKm: number | null;
  readonly targetRadiusKm: number;
}

export interface ContactGeometry {
  readonly moonSemidiameterDegrees: number;
  readonly targetSemidiameterDegrees: number;
  /** Negative when any of the target disk is covered by the lunar disk. */
  readonly externalClearanceDegrees: number;
  /** Negative when the whole target disk is covered by the lunar disk. */
  readonly internalClearanceDegrees: number;
}

function nonnegative(value: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and nonnegative.`);
  }
  return value;
}

/** Spherical-limb contact geometry for apparent directions at one observer. */
export function contactGeometry(input: ContactGeometryInput): ContactGeometry {
  const separation = nonnegative(input.separationDegrees, "separationDegrees");
  if (separation > 180) throw new RangeError("separationDegrees must not exceed 180.");
  const moonDistance = nonnegative(input.moonDistanceKm, "moonDistanceKm");
  const targetRadius = nonnegative(input.targetRadiusKm, "targetRadiusKm");
  const moonRadius = SKY_RADII_KM.Moon;
  if (!(moonDistance > moonRadius)) throw new RangeError("The observer must lie outside the lunar sphere.");

  const targetDistance = input.targetDistanceKm;
  if (targetDistance === null) {
    if (targetRadius !== 0) throw new RangeError("An infinite point source must have zero targetRadiusKm.");
  } else {
    nonnegative(targetDistance, "targetDistanceKm");
    // This sufficient distance ordering prevents reversing the occluder, even
    // when the target's angular radius is larger than the Moon's.
    if (!(targetDistance - targetRadius > moonDistance + moonRadius)) {
      throw new RangeError("The entire target must lie farther than the lunar sphere.");
    }
  }

  const degrees = 180 / Math.PI;
  const moonSemidiameterDegrees = Math.asin(moonRadius / moonDistance) * degrees;
  const targetSemidiameterDegrees = targetDistance === null ? 0 : Math.asin(targetRadius / targetDistance) * degrees;
  return {
    moonSemidiameterDegrees,
    targetSemidiameterDegrees,
    externalClearanceDegrees: separation - (moonSemidiameterDegrees + targetSemidiameterDegrees),
    // Do not take an absolute difference: a larger background disk cannot be
    // hidden completely by the Moon. Equal disks centered together only touch
    // this boundary and require the search's ambiguous-contact refusal.
    internalClearanceDegrees: separation - (moonSemidiameterDegrees - targetSemidiameterDegrees)
  };
}
