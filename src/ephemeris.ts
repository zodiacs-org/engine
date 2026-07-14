import {
  Body,
  EclipticGeoMoon,
  GeoMoonState,
  GeoVector,
  MakeTime,
  RotateVector,
  Rotation_EQJ_ECT,
  SiderealTime,
  Vector
} from "astronomy-engine";

import { findAspects } from "./aspects.js";
import { computeAngles, computeHouses, meanObliquity } from "./houses.js";
import { degreeInSign, normalizeLongitude, signForLongitude } from "./signs.js";
import type { BodyName, BodyPosition, Chart, ChartFlag, ChartInput } from "./types.js";
import { ENGINE_VERSION } from "./types.js";

const RAD = 180 / Math.PI;

const PLANETS = [
  { name: "Sun", body: Body.Sun },
  { name: "Mercury", body: Body.Mercury },
  { name: "Venus", body: Body.Venus },
  { name: "Mars", body: Body.Mars },
  { name: "Jupiter", body: Body.Jupiter },
  { name: "Saturn", body: Body.Saturn },
  { name: "Uranus", body: Body.Uranus },
  { name: "Neptune", body: Body.Neptune },
  { name: "Pluto", body: Body.Pluto }
] as const satisfies readonly { name: BodyName; body: Body }[];

function eclipticOfDate(body: Body, date: Date): { lon: number; lat: number } {
  const time = MakeTime(date);
  const equatorial = GeoVector(body, time, true);
  const ecliptic = RotateVector(Rotation_EQJ_ECT(time), equatorial);
  const lon = normalizeLongitude(Math.atan2(ecliptic.y, ecliptic.x) * RAD);
  const lat = Math.asin(ecliptic.z / Math.hypot(ecliptic.x, ecliptic.y, ecliptic.z)) * RAD;
  return { lon, lat };
}

function moonOfDate(date: Date): { lon: number; lat: number } {
  const moon = EclipticGeoMoon(MakeTime(date));
  return { lon: normalizeLongitude(moon.lon), lat: moon.lat };
}

/** Ascending node of the Moon's instantaneous geocentric orbit plane. */
function trueNodeLongitude(date: Date): number {
  const time = MakeTime(date);
  const state = GeoMoonState(time);
  const angularMomentum = {
    x: state.y * state.vz - state.z * state.vy,
    y: state.z * state.vx - state.x * state.vz,
    z: state.x * state.vy - state.y * state.vx
  };
  const eclipticMomentum = RotateVector(
    Rotation_EQJ_ECT(time),
    new Vector(angularMomentum.x, angularMomentum.y, angularMomentum.z, time)
  );
  return normalizeLongitude(Math.atan2(eclipticMomentum.x, -eclipticMomentum.y) * RAD);
}

function longitudeAt(body: BodyName, date: Date): number {
  if (body === "Moon") return moonOfDate(date).lon;
  if (body === "North Node") return trueNodeLongitude(date);
  if (body === "South Node") {
    return normalizeLongitude(trueNodeLongitude(date) + 180);
  }
  const planet = PLANETS.find((candidate) => candidate.name === body);
  if (!planet) throw new RangeError(`Unknown body: ${body}`);
  return eclipticOfDate(planet.body, date).lon;
}

export function bodyLongitude(body: BodyName, date: Date): number {
  return longitudeAt(body, date);
}

/** Longitude speed by a central difference over plus/minus six hours. */
export function longitudeSpeed(body: BodyName, date: Date): number {
  const stepDays = 0.25;
  const before = longitudeAt(body, new Date(date.getTime() - stepDays * 86_400_000));
  const after = longitudeAt(body, new Date(date.getTime() + stepDays * 86_400_000));
  let difference = after - before;
  if (difference > 180) difference -= 360;
  if (difference < -180) difference += 360;
  return difference / (2 * stepDays);
}

function position(body: BodyName, lon: number, lat: number, speed: number): BodyPosition {
  return {
    body,
    lon,
    lat,
    speed,
    retrograde: speed < 0,
    sign: signForLongitude(lon).slug,
    degree: degreeInSign(lon)
  };
}

export function computeBodies(date: Date): BodyPosition[] {
  const bodies: BodyPosition[] = [];
  for (const planet of PLANETS) {
    const coordinates = eclipticOfDate(planet.body, date);
    bodies.push(
      position(planet.name, coordinates.lon, coordinates.lat, longitudeSpeed(planet.name, date))
    );
  }

  const moon = moonOfDate(date);
  bodies.splice(1, 0, position("Moon", moon.lon, moon.lat, longitudeSpeed("Moon", date)));

  const northNode = trueNodeLongitude(date);
  const nodeSpeed = longitudeSpeed("North Node", date);
  bodies.push(
    position("North Node", northNode, 0, nodeSpeed),
    position("South Node", normalizeLongitude(northNode + 180), 0, nodeSpeed)
  );
  return bodies;
}

function centuriesSinceJ2000(date: Date): number {
  return (date.getTime() - Date.UTC(2000, 0, 1, 12)) / (86_400_000 * 36_525);
}

export function computeChart(input: ChartInput): Chart {
  const flags = [...(input.flags ?? [])];
  const bodies = computeBodies(input.utc);
  let angles = null;
  let houses = null;

  if (input.timeKnown && input.latitude !== undefined && input.longitude !== undefined) {
    const angleInput = {
      gastHours: SiderealTime(MakeTime(input.utc)),
      latitude: input.latitude,
      longitude: input.longitude,
      obliquity: meanObliquity(centuriesSinceJ2000(input.utc))
    };
    angles = computeAngles(angleInput);
    const result = computeHouses(input.houseSystem, angleInput, angles);
    houses = result.houses;
    if (result.fellBack) flags.push("polar-fallback");
  } else if (!input.timeKnown) {
    flags.push("no-time");
  }

  return {
    input,
    bodies,
    angles,
    houses,
    aspects: findAspects(bodies),
    flags,
    engineVersion: ENGINE_VERSION
  };
}
