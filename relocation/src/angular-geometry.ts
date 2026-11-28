import { RA_POLE_TOLERANCE } from "@zodiacs/engine";
import { wrapLongitude } from "./geography.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Unit-vector singularity threshold, not an astronomical accuracy allowance. */
export const ANGULAR_DIRECTION_TOLERANCE = RA_POLE_TOLERANCE;

export interface ObserverAngles {
  /** West-positive ARMC minus right ascension, degrees in [-180, 180). */
  readonly hourAngle: number | null;
  /** Unrefracted altitude of the geocentric direction, degrees. */
  readonly altitude: number;
  /** Degrees north through east, or null at zenith/nadir. */
  readonly azimuth: number | null;
  readonly azimuthUndefined: "zenith-or-nadir" | null;
  /** Earth's rotation with the body's geocentric direction held fixed. */
  readonly horizonMotion: "rising" | "setting" | "stationary";
  readonly east: number;
  readonly north: number;
  readonly up: number;
  /** Signed residuals; horizon motion selects the ASC or DSC branch. */
  readonly residuals: {
    readonly MC: number | null;
    readonly IC: number | null;
    readonly ASC: number;
    readonly DSC: number;
  };
}

/** Internal spherical rotation of engine coordinates, with no ephemeris. */
export function observerAngles(ra: number | null, dec: number, armc: number, latitude: number): ObserverAngles {
  const phi = latitude * DEG;
  const delta = dec * DEG;
  const hourAngle = ra === null ? null : wrapLongitude(armc - ra);
  const h = (hourAngle ?? 0) * DEG;
  // At a numerical celestial pole RA is arbitrary. Remove its projection,
  // rather than using calc()'s arbitrary longitude to invent a meridian.
  const cosDec = ra === null ? 0 : Math.cos(delta);
  const east = -cosDec * Math.sin(h);
  const north = Math.cos(phi) * Math.sin(delta) - Math.sin(phi) * cosDec * Math.cos(h);
  const up = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * cosDec * Math.cos(h);
  const horizontal = Math.hypot(east, north);
  const altitude = Math.atan2(up, horizontal) * RAD;
  const azimuth = horizontal <= ANGULAR_DIRECTION_TOLERANCE
    ? null : ((Math.atan2(east, north) * RAD) % 360 + 360) % 360;
  const horizonMotion = Math.abs(east) <= ANGULAR_DIRECTION_TOLERANCE
    ? "stationary" : east > 0 ? "rising" : "setting";
  return { hourAngle, altitude, azimuth, azimuthUndefined: azimuth === null ? "zenith-or-nadir" : null,
    horizonMotion, east, north, up,
    residuals: { MC: hourAngle, IC: hourAngle === null ? null : wrapLongitude(hourAngle - 180),
      ASC: altitude, DSC: altitude } };
}

/** Ecliptic and horizon normals coincide, so no unique ASC/DSC exists. */
export function horizonCoincides(latitude: number, armc: number, obliquity: number): boolean {
  const phi = latitude * DEG;
  const theta = armc * DEG;
  const epsilon = obliquity * DEG;
  return Math.hypot(Math.cos(phi) * Math.cos(theta),
    Math.cos(phi) * Math.sin(theta) * Math.cos(epsilon) + Math.sin(phi) * Math.sin(epsilon))
    <= ANGULAR_DIRECTION_TOLERANCE;
}
