import { Refraction } from "astronomy-engine";
import { fromSpherical } from "../../src/calc-frames.js";
import type { Vec3 } from "../../src/calc-frames.js";
import { SKY_RADII_KM, STANDARD_REFRACTION_ARCMIN } from "../../src/sky.js";
import { add, cross, dot, scale, unit } from "./astrometry.js";

const RAD = Math.PI / 180;
const clamp = (value: number) => Math.max(-1, Math.min(1, value));
const wrap = (value: number) => ((value % 360) + 360) % 360;

/** Numerical degeneracy and reporting policies, not physical error bounds. */
export const CONTACT_SKY_MODEL = Object.freeze({
  directionTolerance: 1e-12,
  refractionMinimumAltitudeDegrees: -1,
  standardHorizonRefractionArcminutes: STANDARD_REFRACTION_ARCMIN,
  solarRadiusKm: SKY_RADII_KM.Sun
});

export interface HorizonFacts {
  readonly geometricAltitudeDegrees: number;
  /** Strictly above the local ellipsoid-normal plane; no dip or terrain. */
  readonly aboveGeometricHorizon: boolean;
  /** Normal sea-level model, null below its reporting cutoff. */
  readonly refractedAltitudeDegrees: number | null;
  /** Center altitude + semidiameter + engine standard horizon refraction. */
  readonly standardHorizonMarginDegrees: number;
  readonly aboveStandardHorizon: boolean;
}
export interface HorizontalFacts extends HorizonFacts {
  /** North through east; null at the zenith/nadir or a geographic pole. */
  readonly azimuthDegrees: number | null;
}
export interface LimbGeometry {
  readonly positionAngleDegrees: number | null;
  readonly brightLimbPositionAngleDegrees: number | null;
  readonly limb: "bright" | "dark" | "terminator" | "undefined";
  readonly solarAltitudeAtLimbDegrees: number | null;
  readonly solarSemidiameterAtLimbDegrees: number | null;
  readonly contactDirection: Vec3 | null;
}

export function equatorialDirection(input: { readonly lon: number; readonly lat: number }): Vec3 {
  if (!Number.isFinite(input.lon) || !Number.isFinite(input.lat) || Math.abs(input.lat) > 90) {
    throw new RangeError("Equatorial direction must have finite angles and a valid declination.");
  }
  return Math.abs(input.lat) === 90 ? [0, 0, Math.sign(input.lat)] : fromSpherical(input.lon, input.lat, 1);
}

function tangentToward(origin: Vec3, destination: Vec3): Vec3 | null {
  const tangent = cross(cross(origin, destination), origin);
  return Math.hypot(...tangent) <= CONTACT_SKY_MODEL.directionTolerance ? null : unit(tangent);
}

/** Celestial north through east at the first direction, on true-of-date axes. */
export function positionAngleDegrees(origin: Vec3, destination: Vec3): number | null {
  const u = unit(origin), v = unit(destination);
  const tangent = tangentToward(u, v);
  const east = cross([0, 0, 1], u);
  if (!tangent || Math.hypot(...east) <= CONTACT_SKY_MODEL.directionTolerance) return null;
  const e = unit(east), n = cross(u, e);
  return wrap(Math.atan2(dot(tangent, e), dot(tangent, n)) / RAD);
}

/** Rotate an already topocentric direction, without another observer subtraction. */
export function horizontalFacts(
  direction: Vec3, latitude: number, localSiderealDegrees: number, semidiameterDegrees: number
): HorizontalFacts {
  if (![latitude, localSiderealDegrees, semidiameterDegrees].every(Number.isFinite) ||
    Math.abs(latitude) > 90 || semidiameterDegrees < 0 || semidiameterDegrees >= 90) {
    throw new RangeError("Invalid horizontal geometry.");
  }
  const [x, y, z] = unit(direction);
  const theta = localSiderealDegrees * RAD, phi = latitude * RAD;
  const cosPhi = Math.abs(latitude) === 90 ? 0 : Math.cos(phi), sinPhi = Math.sin(phi);
  const east = -x * Math.sin(theta) + y * Math.cos(theta);
  const radial = x * Math.cos(theta) + y * Math.sin(theta);
  const north = -radial * sinPhi + z * cosPhi;
  const up = radial * cosPhi + z * sinPhi;
  const horizontal = Math.hypot(east, north);
  const geometricAltitudeDegrees = Math.atan2(up, horizontal) / RAD;
  // The imported formula becomes slightly negative near the zenith. Report
  // nonnegative lift only, with no below-cutoff extrapolation or height scaling.
  const refractedAltitudeDegrees = geometricAltitudeDegrees < CONTACT_SKY_MODEL.refractionMinimumAltitudeDegrees
    ? null : Math.min(90, geometricAltitudeDegrees + Math.max(0, Refraction("normal", geometricAltitudeDegrees)));
  const standardHorizonMarginDegrees = geometricAltitudeDegrees + semidiameterDegrees + STANDARD_REFRACTION_ARCMIN / 60;
  return {
    geometricAltitudeDegrees, aboveGeometricHorizon: geometricAltitudeDegrees > 0,
    refractedAltitudeDegrees, standardHorizonMarginDegrees,
    aboveStandardHorizon: standardHorizonMarginDegrees > 0,
    azimuthDegrees: horizontal <= CONTACT_SKY_MODEL.directionTolerance || Math.abs(latitude) === 90
      ? null : wrap(Math.atan2(east, north) / RAD)
  };
}

/** Sphere tangent on the target-facing lunar limb, for either disk contact boundary. */
export function limbGeometry(
  moon: Vec3, target: Vec3, sun: Vec3, moonDistanceKm: number, sunDistanceKm: number
): LimbGeometry {
  if (!Number.isFinite(moonDistanceKm) || !Number.isFinite(sunDistanceKm) ||
    moonDistanceKm <= SKY_RADII_KM.Moon || sunDistanceKm <= SKY_RADII_KM.Sun + moonDistanceKm) {
    throw new RangeError("Invalid Moon or Sun range for illumination geometry.");
  }
  const u = unit(moon), v = unit(target), s = unit(sun), t = tangentToward(u, v);
  const angles = { positionAngleDegrees: positionAngleDegrees(u, v),
    brightLimbPositionAngleDegrees: positionAngleDegrees(u, s) };
  if (!t) return { ...angles, limb: "undefined", solarAltitudeAtLimbDegrees: null,
    solarSemidiameterAtLimbDegrees: null, contactDirection: null };
  const sinM = SKY_RADII_KM.Moon / moonDistanceKm, cosM = Math.sqrt(1 - sinM * sinM);
  const contactDirection = add(scale(u, cosM), scale(t, sinM));
  const surfaceNormal = add(scale(u, -sinM), scale(t, cosM));
  const point = scale(contactDirection, moonDistanceKm * cosM);
  const toSun = add(scale(s, sunDistanceKm), scale(point, -1));
  const distance = Math.hypot(...toSun);
  const altitude = Math.asin(clamp(dot(surfaceNormal, unit(toSun)))) / RAD;
  const radius = Math.asin(SKY_RADII_KM.Sun / distance) / RAD;
  return { ...angles, contactDirection,
    solarAltitudeAtLimbDegrees: altitude, solarSemidiameterAtLimbDegrees: radius,
    limb: altitude > radius ? "bright" : altitude < -radius ? "dark" : "terminator" };
}
