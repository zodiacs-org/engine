import { calc } from "../../src/calc.js";
import type { CalcPosition, CalcRefusal } from "../../src/calc.js";
import { angularSeparation, sunBodyGeometry } from "./geometry.js";
import type { SunBodyGeometry, SunBodyPair } from "./geometry.js";
import type { DateInput, ObservationBody, Observer, VisibilityBody } from "./inputs.js";

const RAD = Math.PI / 180;

export type PhaseClassification = "morning-star" | "evening-star" | "conjunction" | "opposition";

export interface SynodicPhase {
  /** Apparent tropical target minus Sun longitude in (-180, 180] degrees. */
  readonly signedSynodicAngleDeg: number;
  /** Longitude convention only, not a visibility or horizon-event prediction. */
  readonly classification: PhaseClassification;
}

function finite(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number.`);
  }
}

/**
 * Extend the USNO apparent ecliptic longitude definition of lunar phase to
 * each target. East of the Sun is evening, west is morning; exact equal or
 * opposite longitudes have their own labels. No epsilon or visibility model.
 * Both longitudes must be in [0, 360), in the same frame and at the same origin.
 * See SOURCES.md, Phase geometry. This does not classify inferior/superior conjunction.
 */
export function synodicPhase(targetLongitudeDeg: number, sunLongitudeDeg: number): Readonly<SynodicPhase> {
  for (const [value, label] of [[targetLongitudeDeg, "targetLongitudeDeg"], [sunLongitudeDeg, "sunLongitudeDeg"]] as const) {
    finite(value, label);
    if (value < 0 || value >= 360) throw new RangeError(`${label} must be in [0, 360).`);
  }
  let angle = targetLongitudeDeg - sunLongitudeDeg;
  if (angle <= -180) angle += 360;
  if (angle > 180) angle -= 360;
  if (angle === 0) angle = 0; // Canonical positive zero, including caller -0.
  const classification: PhaseClassification = angle === 0 ? "conjunction"
    : angle === 180 ? "opposition" : angle > 0 ? "evening-star" : "morning-star";
  return Object.freeze({ signedSynodicAngleDeg: angle, classification });
}

export interface IlluminationGeometry {
  /** Sun-observer-target angle of this geometric triangle, in [0, 180]. */
  readonly geometricElongationDeg: number;
  /** Sun-target-observer angle at the body, in [0, 180] degrees. */
  readonly phaseAngleDeg: number;
  /** Lit fraction of the projected spherical disk, in [0, 1], not brightness. */
  readonly illuminatedFraction: number;
  readonly sunTargetDistanceAu: number;
}

/**
 * A simultaneous Sun/observer/target triangle. Distances must be positive au.
 * The phase angle follows elementary plane geometry; the disk fraction is
 * (1 + cos(phase))/2 (Smith et al., NASA TM 78558, 1979, p. 4).
 * The source supplies the spherical-disk definition, not this implementation.
 * No light time, aberration, refraction, eclipses, rings or surface relief.
 */
export function illuminationGeometry(
  elongationDeg: number, sunDistanceAu: number, targetDistanceAu: number
): Readonly<IlluminationGeometry> {
  finite(elongationDeg, "elongationDeg");
  finite(sunDistanceAu, "sunDistanceAu");
  finite(targetDistanceAu, "targetDistanceAu");
  if (elongationDeg < 0 || elongationDeg > 180) throw new RangeError("elongationDeg must be in [0, 180].");
  if (sunDistanceAu <= 0 || targetDistanceAu <= 0) throw new RangeError("Distances must be positive au.");

  // Equal ranges form an isosceles triangle. Compute its chord directly;
  // for subnormal half angles, multiply the range before converting to
  // radians so a representable chord is not lost to angular underflow.
  if (sunDistanceAu === targetDistanceAu) {
    const halfSin = Math.sin(elongationDeg * RAD / 2);
    const chord = halfSin < Number.MIN_VALUE / Number.EPSILON
      ? (sunDistanceAu * elongationDeg) * RAD : sunDistanceAu * (2 * halfSin);
    if (chord === 0 || !Number.isFinite(chord)) {
      throw new RangeError("The Sun-target distance is zero or not representable as positive finite au.");
    }
    return Object.freeze({
      geometricElongationDeg: elongationDeg,
      phaseAngleDeg: 90 - elongationDeg / 2,
      illuminatedFraction: (1 + halfSin) / 2,
      sunTargetDistanceAu: chord
    });
  }

  // Normalize first to avoid squaring large distances. In the triangle's
  // plane, the target-to-Sun components along/across target-to-observer are
  // delta - R*cos(elongation), R*sin(elongation). Half angles avoid loss in
  // the first component when the Sun and target have nearly equal ranges.
  const scale = Math.max(sunDistanceAu, targetDistanceAu);
  const r = sunDistanceAu / scale;
  const halfSin = Math.sin(elongationDeg * RAD / 2);
  // Subtract before scaling: separately rounded normalized ranges can lose
  // the difference that determines the phase of a near-coincident triangle.
  const along = (targetDistanceAu - sunDistanceAu) / scale + 2 * r * halfSin * halfSin;
  const across = elongationDeg === 0 || elongationDeg === 180 ? 0 : r * Math.sin(elongationDeg * RAD);
  const distance = Math.hypot(along, across);
  const sunTargetDistanceAu = distance * scale;
  if (distance === 0 || !Number.isFinite(sunTargetDistanceAu) || sunTargetDistanceAu === 0) {
    throw new RangeError("The Sun-target distance is zero or not representable as positive finite au.");
  }
  const phaseAngleDeg = Math.atan2(across, along) / RAD;
  const cosine = along / distance;
  // Algebraically (1 + cosine)/2, retaining tiny crescent fractions near pi.
  const fraction = along < 0 ? (across / distance) ** 2 / (2 * (1 - cosine)) : (1 + cosine) / 2;
  return Object.freeze({
    geometricElongationDeg: elongationDeg === 0 ? 0 : elongationDeg,
    phaseAngleDeg,
    illuminatedFraction: Math.max(0, Math.min(1, fraction)),
    sunTargetDistanceAu
  });
}

export interface ReceiptedIllumination extends IlluminationGeometry {
  /** Geometric positions at one epoch and origin; receipts remain intact. */
  readonly positions: Readonly<{ sun: CalcPosition; target: CalcPosition }>;
}

export interface PhaseAtOrigin extends SynodicPhase {
  /** Apparent true angular separation at the observer, including latitude. */
  readonly elongationDeg: number;
  readonly illumination: Readonly<ReceiptedIllumination>;
}

const UNITS = Object.freeze({ angles: "degrees", distances: "au", observerHeight: "metres", illuminatedFraction: "fraction" } as const);
const CONVENTIONS = Object.freeze({
  synodic: "apparent;tropical-ecliptic-true-of-date;target-minus-sun;(-180,180]",
  classification: "longitude-only;east-evening;west-morning;not-visibility",
  boundaries: "computed-longitude-equality;zero-conjunction;positive-180-opposition;no-epsilon",
  illumination: "simultaneous-geometric-sun-target-observer;spherical-disk;no-light-time;no-shadows",
  observerEllipsoid: "iers2003"
} as const);

export interface BodyPhase {
  readonly status: "ok";
  readonly body: VisibilityBody;
  readonly at: string;
  readonly observer: Readonly<Required<Observer>>;
  readonly units: typeof UNITS;
  readonly conventions: typeof CONVENTIONS;
  /** Receipts describe source positions, not the derived phase or visibility. */
  readonly receiptScope: "positions";
  readonly geometry: SunBodyGeometry;
  /** Conventional phase at Earth's centre, independent of the observer. */
  readonly geocentric: Readonly<PhaseAtOrigin>;
  /** Observer-dependent longitude phase, elongation and illumination. */
  readonly topocentric: Readonly<PhaseAtOrigin>;
}

export type PhaseResult = BodyPhase | CalcRefusal;

function geometricPosition(body: ObservationBody, at: string, site?: Readonly<Required<Observer>>): CalcPosition | CalcRefusal {
  return calc({
    body, time: at, frame: "ecliptic-true-of-date", center: site === undefined ? "geocentric" : { topocentric: site },
    zodiac: "tropical",
    flags: { correction: "geometric", speeds: false, cartesian: true, units: "degrees", deflection: false }
  });
}

function phaseAtOrigin(
  body: VisibilityBody, at: string, pair: SunBodyPair, site?: Readonly<Required<Observer>>
): Readonly<PhaseAtOrigin> | CalcRefusal {
  const sun = geometricPosition("Sun", at, site);
  if (sun.status === "refused") return sun;
  const target = geometricPosition(body, at, site);
  if (target.status === "refused") return target;
  // All selected bodies have distances. Refuse an unexpected engine contract
  // change instead of silently treating null as zero.
  if (sun.dist === null || target.dist === null) throw new RangeError("Engine phase positions require distances.");
  const separation = angularSeparation(
    { longitudeDeg: sun.lon, latitudeDeg: sun.lat }, { longitudeDeg: target.lon, latitudeDeg: target.lat }
  );
  const illumination = Object.freeze({
    ...illuminationGeometry(separation, sun.dist, target.dist),
    positions: Object.freeze({ sun, target })
  });
  return Object.freeze({
    ...synodicPhase(pair.target.ecliptic.lon, pair.sun.ecliptic.lon),
    elongationDeg: pair.elongationDeg,
    illumination
  });
}

/**
 * Phase at a resolved UTC input instant and observing site. The engine supplies
 * every position, frame and time scale. Apparent longitude and angular
 * elongation are distinct from simultaneous geometric disk illumination.
 * Returns an intact engine refusal if any required position is unavailable.
 */
export function phase(body: VisibilityBody, at: DateInput, site: Observer): PhaseResult {
  const geometry = sunBodyGeometry(body, at, site);
  if (geometry.status === "refused") return geometry;
  const geocentric = phaseAtOrigin(geometry.body, geometry.at, geometry.geocentric);
  if ("status" in geocentric) return geocentric;
  const topocentric = phaseAtOrigin(geometry.body, geometry.at, geometry.topocentric, geometry.observer);
  if ("status" in topocentric) return topocentric;
  return Object.freeze({
    status: "ok", body: geometry.body, at: geometry.at, observer: geometry.observer,
    units: UNITS, conventions: CONVENTIONS, receiptScope: "positions", geometry, geocentric, topocentric
  });
}
