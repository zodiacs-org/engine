import type { GeographicPoint } from "./chart.js";
import { wrapLongitude } from "./geography.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Internal directed spherical arc. Inputs are validated by the line planner. */
export function azimuthArc(origin: GeographicPoint, bearing: number, lengthDegrees: number) {
  const phi = origin.latitude * DEG;
  const lambda = wrapLongitude(origin.longitude) * DEG;
  const north = [-Math.sin(phi) * Math.cos(lambda), -Math.sin(phi) * Math.sin(lambda), Math.cos(phi)];
  const east = [-Math.sin(lambda), Math.cos(lambda), 0];
  const start = [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
  // Exact meridional bearings must not acquire sin(pi)'s spurious east component.
  const cosBearing = bearing === 0 ? 1 : bearing === 180 ? -1 : Math.cos(bearing * DEG);
  const sinBearing = bearing === 0 || bearing === 180 ? 0 : Math.sin(bearing * DEG);
  const tangent = north.map((n, i) => n * cosBearing + east[i]! * sinBearing);
  const poleLatitude = bearing === 0 ? 90 : bearing === 180 ? -90 : null;
  const poleDistance = poleLatitude === null ? null : Math.abs(poleLatitude - origin.latitude);
  const interiorPole = poleDistance !== null && poleDistance > 0 && poleDistance < lengthDegrees ? poleDistance : null;
  const at = (distanceDegrees: number): GeographicPoint => {
    if (distanceDegrees === 0) return { ...origin };
    if (distanceDegrees === poleDistance) return { latitude: poleLatitude!, longitude: 0 };
    // The bearing determines the route even when the endpoint is antipodal.
    if (distanceDegrees === 180) return { latitude: -origin.latitude, longitude: wrapLongitude(origin.longitude + 180) };
    if (poleLatitude !== null) {
      return distanceDegrees < poleDistance!
        ? { latitude: origin.latitude + Math.sign(poleLatitude) * distanceDegrees, longitude: origin.longitude }
        : { latitude: Math.sign(poleLatitude) * (180 - distanceDegrees) - origin.latitude,
          longitude: wrapLongitude(origin.longitude + 180) };
    }
    const s = distanceDegrees * DEG;
    const [x, y, z] = start.map((n, i) => n * Math.cos(s) + tangent[i]! * Math.sin(s));
    if (x === start[0] && y === start[1] && z === start[2]) {
      throw new RangeError("Local-space displacement cannot be resolved at floating-point precision.");
    }
    return { latitude: Math.atan2(z!, Math.hypot(x!, y!)) * RAD,
      longitude: wrapLongitude(Math.atan2(y!, x!) * RAD) };
  };
  const courseAt = (distanceDegrees: number, point: GeographicPoint): number | null => {
    if (Math.abs(point.latitude) === 90) return null;
    if (distanceDegrees === 0) return bearing;
    const s = distanceDegrees * DEG;
    const direction = start.map((n, i) => -n * Math.sin(s) + tangent[i]! * Math.cos(s));
    const p = point.latitude * DEG;
    const l = point.longitude * DEG;
    const e = -direction[0]! * Math.sin(l) + direction[1]! * Math.cos(l);
    const n = -Math.sin(p) * (direction[0]! * Math.cos(l) + direction[1]! * Math.sin(l))
      + Math.cos(p) * direction[2]!;
    const angle = Math.atan2(e, n) * RAD;
    return angle < 0 ? angle + 360 : angle;
  };
  return { interiorPole, at, courseAt };
}
