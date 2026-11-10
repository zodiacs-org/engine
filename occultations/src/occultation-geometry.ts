import { SKY_RADII_KM } from "../../src/sky.js";

export interface OccultationGeometryInput {
  readonly separationDegrees: number;
  readonly moonDistanceKm: number;
  /** Null selects an infinite point-source model, not a measured stellar distance. */
  readonly targetDistanceKm: number | null;
  readonly targetRadiusKm: number;
  /** Radius of a sphere enclosing every observer included in this calculation. */
  readonly observerRadiusKm: number;
}

export interface OccultationGeometry {
  readonly moonSemidiameterDegrees: number;
  readonly targetSemidiameterDegrees: number;
  readonly geocentricLimitDegrees: number;
  readonly observerEnvelopeDegrees: number;
  readonly geocentricClearanceDegrees: number;
  readonly envelopeClearanceDegrees: number;
}

const DEGREES = 180 / Math.PI;

function nonnegative(value: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and nonnegative.`);
  }
  return value;
}

/**
 * A conservative exclusion bound for rigidly translated spherical geometry.
 * Nonpositive envelope clearance is a candidate, not a confirmed occultation.
 * Apparent-place model differences and physical uncertainty are not bounded here.
 */
export function occultationGeometry(input: OccultationGeometryInput): OccultationGeometry {
  const separation = nonnegative(input.separationDegrees, "separationDegrees");
  if (separation > 180) throw new RangeError("separationDegrees must not exceed 180.");
  const moonDistance = nonnegative(input.moonDistanceKm, "moonDistanceKm");
  const targetRadius = nonnegative(input.targetRadiusKm, "targetRadiusKm");
  const observerRadius = nonnegative(input.observerRadiusKm, "observerRadiusKm");
  const moonRadius = SKY_RADII_KM.Moon;
  if (!(moonDistance - observerRadius > moonRadius)) {
    throw new RangeError("Every observer must lie outside the lunar sphere.");
  }

  const targetDistance = input.targetDistanceKm;
  if (targetDistance === null) {
    if (targetRadius !== 0) throw new RangeError("An infinite point source must have zero targetRadiusKm.");
  } else {
    nonnegative(targetDistance, "targetDistanceKm");
    // Reverse and direct triangle inequalities put every target surface point
    // beyond every lunar surface point for every permitted observer. This is
    // stronger than needed for one direction, but cannot reverse the occluder.
    if (!(targetDistance - observerRadius - targetRadius > moonDistance + observerRadius + moonRadius)) {
      throw new RangeError("The entire target must lie farther than the lunar sphere for every observer.");
    }
  }

  const angle = (radius: number, distance: number) => Math.asin(radius / distance) * DEGREES;
  const moonSemidiameterDegrees = angle(moonRadius, moonDistance);
  const targetSemidiameterDegrees = targetDistance === null ? 0 : angle(targetRadius, targetDistance);
  const geocentricLimitDegrees = moonSemidiameterDegrees + targetSemidiameterDegrees;
  // A translated center can move at most asin(R/D). The triangle inequality
  // bounds the change in their separation by the sum, even if the actual
  // lunar and target parallax largely cancel. Each apparent sphere is largest
  // at its closest possible range D-R; geocentric radii alone are insufficient.
  const observerEnvelopeDegrees = Math.min(180,
    angle(observerRadius, moonDistance) + angle(moonRadius, moonDistance - observerRadius) +
    (targetDistance === null ? 0 : angle(observerRadius, targetDistance) +
      angle(targetRadius, targetDistance - observerRadius)));

  return {
    moonSemidiameterDegrees, targetSemidiameterDegrees, geocentricLimitDegrees, observerEnvelopeDegrees,
    geocentricClearanceDegrees: separation - geocentricLimitDegrees,
    envelopeClearanceDegrees: separation - observerEnvelopeDegrees
  };
}
