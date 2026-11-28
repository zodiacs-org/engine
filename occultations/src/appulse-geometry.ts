import { fromSpherical } from "../../src/calc-frames.js";
import { cross, dot } from "./astrometry.js";

interface Direction { readonly lon: number; readonly lat: number }
export interface DirectionPair { readonly a: Direction; readonly b: Direction }
const RAD = Math.PI / 180;

// The haversine uses relative coordinates, avoiding subtraction of large
// Cartesian components for a slow passage at a nonzero declination offset.
const sinSquaredHalf = (x: number) => Math.sin(x / 2) ** 2;
const sinSquaredDifference = (x: number, y: number) => Math.sin((x + y) / 2) * Math.sin((x - y) / 2);
const cosineDifference = (x: number, y: number) => -2 * Math.sin((x + y) / 2) * Math.sin((x - y) / 2);
const cosineLatitude = (latitude: number) => Math.abs(latitude) === 90 ? 0 : Math.cos(latitude * RAD);
const signed = (angle: number) => {
  const reduced = angle % 360;
  return reduced > 180 ? reduced - 360 : reduced <= -180 ? reduced + 360 : reduced;
};

/** Squared unit-chord difference q(after)-q(before), factored before subtraction. */
export function chordDifference(before: DirectionPair, after: DirectionPair): number {
  const longitude0 = signed(before.a.lon - before.b.lon);
  const longitude1 = longitude0 + signed(signed(after.a.lon - after.b.lon) - longitude0);
  const x0 = longitude0 * RAD, x1 = longitude1 * RAD;
  const y0 = (before.a.lat - before.b.lat) * RAD, y1 = (after.a.lat - after.b.lat) * RAD;
  const a0 = cosineLatitude(before.a.lat), a1 = cosineLatitude(after.a.lat);
  const b0 = cosineLatitude(before.b.lat), b1 = cosineLatitude(after.b.lat);
  const ca = Math.abs(before.a.lat) === 90 || Math.abs(after.a.lat) === 90 ? a1 - a0 :
    cosineDifference(after.a.lat * RAD, before.a.lat * RAD);
  const cb = Math.abs(before.b.lat) === 90 || Math.abs(after.b.lat) === 90 ? b1 - b0 :
    cosineDifference(after.b.lat * RAD, before.b.lat * RAD);
  const productDifference = ((a1 + a0) * cb + (b1 + b0) * ca) / 2;
  return 4 * (sinSquaredDifference(y1, y0) +
    ((a1 * b1 + a0 * b0) * sinSquaredDifference(x1, x0) +
      (sinSquaredHalf(x1) + sinSquaredHalf(x0)) * productDifference) / 2);
}

/** Stable great-circle distance, including coincidence, poles and antipodes. */
export function separationDegrees({ a, b }: DirectionPair): number {
  const direction = ({ lon, lat }: Direction) => Math.abs(lat) === 90
    ? [0, 0, Math.sign(lat)] as const : fromSpherical(lon, lat, 1);
  const u = direction(a), v = direction(b);
  return Math.atan2(Math.hypot(...cross(u, v)), dot(u, v)) / RAD;
}
