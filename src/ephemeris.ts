import {
  Body,
  EclipticGeoMoon,
  GeoMoonState,
  GeoVector,
  MakeTime,
  RotateVector,
  Rotation_EQJ_ECT,
  SetDeltaTFunction,
  SiderealTime,
  Vector,
  e_tilt
} from "astronomy-engine";

import { findAspects } from "./aspects.js";
import { deltaT, deltaTAt } from "./deltat.js";
import type { DeltaT } from "./deltat.js";
import { computeAngles, computeHouses } from "./houses.js";
import { outsideReferenceSpan } from "./reference-span.js";
import { degreeInSign, normalizeLongitude, signForLongitude } from "./signs.js";
import type { BodyName, BodyPosition, Chart, ChartFlag, ChartInput } from "./types.js";
import { ENGINE_VERSION } from "./types.js";

const RAD = 180 / Math.PI;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

/**
 * astronomy-engine keeps one ΔT function for the whole module, and every time
 * it builds (in the light-time loop, for one) reads it. Each entry point below
 * therefore installs this engine's model, or a caller's pinned value for the
 * length of one computeChart call, before it computes anything. Code that
 * calls astronomy-engine directly should install `deltaT` itself.
 */
function clock(pin?: number): void {
  SetDeltaTFunction(pin === undefined ? deltaT : () => pin);
}

function deltaTFor(date: Date, pin: number | undefined): DeltaT {
  if (pin !== undefined) {
    return { seconds: pin, sigma: null, model: "pinned", table: null, tableDigest: null, segment: "pinned" };
  }
  return deltaTAt((date.getTime() - J2000_MS) / 86_400_000);
}

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
  clock();
  return longitudeAt(body, date);
}

/**
 * Longitude speed in degrees per day: the derivative of the longitude this
 * engine reports, by a central difference over plus/minus 0.001 day (86.4 s).
 * The true node keeps plus/minus six hours, where its short-period noise
 * would otherwise dominate.
 */
export const SPEED_STEP_DAYS = 0.001;
export const NODE_SPEED_STEP_DAYS = 0.25;

export function longitudeSpeed(body: BodyName, date: Date): number {
  clock();
  return speedAt(body, date);
}

function speedAt(body: BodyName, date: Date): number {
  const stepDays =
    body === "North Node" || body === "South Node" ? NODE_SPEED_STEP_DAYS : SPEED_STEP_DAYS;
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
  clock();
  return bodiesAt(date);
}

function bodiesAt(date: Date): BodyPosition[] {
  const bodies: BodyPosition[] = [];
  for (const planet of PLANETS) {
    const coordinates = eclipticOfDate(planet.body, date);
    bodies.push(
      position(planet.name, coordinates.lon, coordinates.lat, speedAt(planet.name, date))
    );
  }

  const moon = moonOfDate(date);
  bodies.splice(1, 0, position("Moon", moon.lon, moon.lat, speedAt("Moon", date)));

  const northNode = trueNodeLongitude(date);
  const nodeSpeed = speedAt("North Node", date);
  bodies.push(
    position("North Node", northNode, 0, nodeSpeed),
    position("South Node", normalizeLongitude(northNode + 180), 0, nodeSpeed)
  );
  return bodies;
}

export function computeChart(input: ChartInput): Chart {
  const pin = input.deltaT;
  clock(pin);
  try {
    return chartAt(input, pin);
  } finally {
    if (pin !== undefined) clock();
  }
}

function chartAt(input: ChartInput, pin: number | undefined): Chart {
  const flags = [...(input.flags ?? [])];
  const bodies = bodiesAt(input.utc);
  let angles = null;
  let houses = null;

  if (input.timeKnown && input.latitude !== undefined && input.longitude !== undefined) {
    // Apparent sidereal time already carries the nutation in longitude, so the
    // ecliptic it is projected onto must be the true one of date: the mean
    // obliquity plus the nutation in obliquity, from the same model and on TT.
    const time = MakeTime(input.utc);
    const angleInput = {
      gastHours: SiderealTime(time),
      latitude: input.latitude,
      longitude: input.longitude,
      obliquity: e_tilt(time).tobl
    };
    angles = computeAngles(angleInput);
    const result = computeHouses(input.houseSystem, angleInput, angles);
    houses = result.houses;
    if (result.fellBack) flags.push("polar-fallback");
  } else if (!input.timeKnown) {
    flags.push("no-time");
  }
  if (outsideReferenceSpan(input.utc)) flags.push("outside-reference-span");

  return {
    input,
    bodies,
    angles,
    houses,
    aspects: findAspects(bodies),
    flags,
    deltaT: deltaTFor(input.utc, pin),
    engineVersion: ENGINE_VERSION
  };
}
