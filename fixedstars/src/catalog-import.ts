/** Import arithmetic only. Source-frame and licensing decisions live in sources/. */
import {
  apply, AstroTime, frameMatrix, fromSpherical, toSpherical, transpose
} from "./engine.js";
import type { Mat3, Vec3 } from "./engine.js";

export interface SourceAstrometry {
  readonly raHours: number;
  readonly decDeg: number;
  readonly motion: { readonly raCosDec: number; readonly dec: number } | null;
}

const DEG = Math.PI / 180;
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function tangentBases(ra: number, dec: number): readonly [Vec3, Vec3] {
  return [
    [-Math.sin(ra), Math.cos(ra), 0],
    [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)]
  ];
}

/** Rotate direction and angular tangent together, preserving mas/year units. */
export function rotateAstrometry(source: SourceAstrometry, matrix: Mat3) {
  if (!Number.isFinite(source.raHours) || source.raHours < 0 || source.raHours >= 24 ||
      !Number.isFinite(source.decDeg) || Math.abs(source.decDeg) >= 90 ||
      (source.motion !== null && (!Number.isFinite(source.motion.raCosDec) || !Number.isFinite(source.motion.dec)))) {
    throw new RangeError("Invalid source astrometry; celestial poles require a different RA tangent convention.");
  }
  const ra = source.raHours * 15;
  const direction = apply(matrix, fromSpherical(ra, source.decDeg, 1));
  const position = toSpherical(direction);
  if (source.motion === null) return { raDeg: position.lon, decDeg: position.lat, motion: null };
  const [east, north] = tangentBases(ra * DEG, source.decDeg * DEG);
  const tangent: Vec3 = [
    east[0] * source.motion.raCosDec + north[0] * source.motion.dec,
    east[1] * source.motion.raCosDec + north[1] * source.motion.dec,
    east[2] * source.motion.raCosDec + north[2] * source.motion.dec
  ];
  const movedTangent = apply(matrix, tangent);
  const [movedEast, movedNorth] = tangentBases(position.lon * DEG, position.lat * DEG);
  return {
    raDeg: position.lon, decDeg: position.lat,
    motion: { raCosDec: dot(movedTangent, movedEast), dec: dot(movedTangent, movedNorth) }
  };
}

/** Existing engine bias, inverse of its EQJ-to-ICRS matrix. No epoch shift. */
export function convertIcrsAstrometry(source: SourceAstrometry) {
  const matrix = transpose(frameMatrix("equatorial-icrs", AstroTime.FromTerrestrialTime(0)));
  return rotateAstrometry(source, matrix);
}
