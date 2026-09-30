import {
  AstroTime,
  Body,
  GeoMoon,
  GeoMoonState,
  GeoVector,
  MakeTime,
  SetDeltaTFunction
} from "astronomy-engine";

import { findAspects } from "./aspects.js";
import { chartBodyDeclinations } from "./declination.js";
import type { ChartDeclinations } from "./declination.js";
import { deltaT } from "./deltat.js";
import { eclipticFrame, eclipticOfDate, meanEcliptic } from "./frame.js";
import { computeAngles, computeHouses, eastPointOf, vertexOf } from "./houses.js";
import { tilt } from "./nutation.js";
import { hellenisticLots, meanApogee, meanNodeLongitude, sectOf } from "./points.js";
import { EPHEMERIS_SPAN, outsideReferenceSpan } from "./reference-span.js";
import { degreeInSign, normalizeLongitude, signForLongitude } from "./signs.js";
import { elapsedDays, timeBasis } from "./time-scale.js";
import type { TimeBasis, TimeScaleName } from "./time-scale.js";
import type {
  BodyName,
  BodyPosition,
  Chart,
  ChartInput,
  ChartPoints,
  PointName,
  PointPosition
} from "./types.js";
import { ENGINE_VERSION } from "./types.js";

const RAD = 180 / Math.PI;
const DAY = 86_400_000;

/**
 * An instant as the ephemeris reads it: milliseconds on a time scale, and a
 * caller's ΔT when one is pinned. Every sample of a calculation, speed samples
 * included, is taken on the same scale and pin.
 */
interface Clock {
  scale: TimeScaleName;
  pin: number | undefined;
}

const UTC_CLOCK: Clock = { scale: "utc", pin: undefined };

/**
 * astronomy-engine keeps one ΔT function for its whole module, and every time
 * it builds (in the light-time loop, for one) reads it. So each sample
 * installs its own ΔT (TT − UT1) as a constant and is built on its UT1, which
 * gives it exactly the basis's UT1 and TT (src/time-scale.ts). Each entry
 * point below restores the engine's model when it returns, so astronomy-engine
 * is left with `deltaT` after any call. Code that calls astronomy-engine
 * directly should install `deltaT` itself.
 */
function timeOf(basis: TimeBasis): AstroTime {
  const { from, to } = EPHEMERIS_SPAN.daysFromJ2000;
  // Refused outside EPHEMERIS_SPAN: every evaluation below takes its time from
  // here, so the instant and each speed sample are checked, on a pinned clock
  // as on the basis. A NaN (an instant past JavaScript's Date range) fails too.
  if (!(basis.ttDays >= from && basis.ttDays <= to)) {
    throw new RangeError(
      "The instant is outside the ephemeris span: its Terrestrial Time, and that of each speed sample, " +
        "must lie between 0001-04-30T12:00 and 3998-09-03T12:00 TT, the years astronomy-engine tabulates (EPHEMERIS_SPAN)."
    );
  }
  const seconds = basis.deltaT.seconds;
  SetDeltaTFunction(() => seconds);
  return MakeTime(basis.ut1Days);
}

/** A speed sample stepDays from ms; timeOf refuses it outside EPHEMERIS_SPAN. */
function sample(ms: number, stepDays: number): number {
  return ms + stepDays * DAY;
}

const basisAt = (ms: number, clock: Clock): TimeBasis => timeBasis(ms, clock.scale, clock.pin);
const timeAt = (ms: number, clock: Clock): AstroTime => timeOf(basisAt(ms, clock));

/**
 * astronomy-engine reports an input it cannot evaluate by throwing a string,
 * not an Error. Every entry point below turns such a throw into a RangeError
 * that keeps the original value as its cause; Error objects pass unchanged.
 * It also restores the engine's ΔT model, whatever happened.
 */
function evaluated<T>(run: () => T): T {
  try {
    return run();
  } catch (thrown) {
    if (thrown instanceof Error) throw thrown;
    throw new RangeError(`The ephemeris could not evaluate this instant: ${String(thrown)}`, { cause: thrown });
  } finally {
    SetDeltaTFunction(deltaT);
  }
}

/**
 * Greenwich apparent sidereal time, hours: astronomy-engine 2.1.19's own
 * sidereal_time, term for term (the Earth rotation angle from UT1 and the IAU
 * 2006 polynomial on TT), with the engine's equation of the equinoxes on TT
 * (src/nutation.ts), and without its cache, which is keyed by TT alone and so
 * cannot tell two UT1s at one TT apart.
 */
export function gastHours(time: AstroTime): number {
  const t = time.tt / 36525;
  const eqeq = tilt(time.tt).ee;
  const thet1 = 0.779057273264 + 0.00273781191135448 * time.ut;
  const thet3 = time.ut % 1;
  let theta = 360 * ((thet1 + thet3) % 1);
  if (theta < 0) theta += 360;
  const st =
    eqeq +
    0.014506 +
    ((((-0.0000000368 * t - 0.000029956) * t - 0.00000044) * t + 1.3915817) * t + 4612.156534) * t;
  let gst = ((st / 3600 + theta) % 360) / 15;
  if (gst < 0) gst += 24;
  return gst;
}

/**
 * Run `fn` on astronomy-engine's time for an instant read as a chart reads
 * its own: on `scale` (UTC unless given) and the engine's time basis, or a
 * caller's pinned ΔT, refused outside EPHEMERIS_SPAN. A string astronomy-engine
 * throws becomes a RangeError, and the engine's ΔT model is restored when `fn`
 * returns. For modules that call astronomy-engine directly and must agree
 * with a chart's instant.
 */
export function onChartClock<T>(
  ms: number,
  scale: TimeScaleName,
  pin: number | undefined,
  fn: (time: AstroTime, basis: TimeBasis) => T
): T {
  return evaluated(() => {
    const basis = timeBasis(ms, scale, pin);
    return fn(timeOf(basis), basis);
  });
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

/** A planet's apparent geocentric vector on the ecliptic and equinox of date (src/frame.ts). */
function planetOfDate(body: Body, time: AstroTime): { lon: number; lat: number } {
  const equatorial = GeoVector(body, time, true);
  return eclipticOfDate(equatorial.x, equatorial.y, equatorial.z, time.tt);
}

/**
 * The Moon on the ecliptic of date: astronomy-engine's lunar series, which
 * GeoMoon turns from the mean ecliptic of date to EQJ with its own precession.
 */
function moonOfDate(time: AstroTime): { lon: number; lat: number } {
  const equatorial = GeoMoon(time);
  return eclipticOfDate(equatorial.x, equatorial.y, equatorial.z, time.tt);
}

/** Ascending node of the Moon's instantaneous geocentric orbit plane. */
function trueNodeLongitude(time: AstroTime): number {
  const state = GeoMoonState(time);
  const frame = eclipticFrame(time.tt);
  // The orbit's angular momentum on the mean ecliptic of date, whose
  // longitudes gain Δψ on the true equinox.
  const [x, y] = meanEcliptic(
    frame,
    state.y * state.vz - state.z * state.vy,
    state.z * state.vx - state.x * state.vz,
    state.x * state.vy - state.y * state.vx
  );
  return normalizeLongitude(Math.atan2(x, -y) * RAD + frame.tilt.dpsi / 3600);
}

function longitudeAt(body: BodyName, ms: number, clock: Clock): number {
  return longitudeOn(body, basisAt(ms, clock));
}

function longitudeOn(body: BodyName, basis: TimeBasis): number {
  const time = timeOf(basis);
  if (body === "Moon") return moonOfDate(time).lon;
  if (body === "North Node") return trueNodeLongitude(time);
  if (body === "South Node") {
    return normalizeLongitude(trueNodeLongitude(time) + 180);
  }
  const planet = PLANETS.find((candidate) => candidate.name === body);
  if (!planet) throw new RangeError(`Unknown body: ${body}`);
  return planetOfDate(planet.body, time).lon;
}

/** Apparent longitude at a UTC instant, on the engine's time basis. */
export function bodyLongitude(body: BodyName, date: Date): number {
  return evaluated(() => longitudeAt(body, date.getTime(), UTC_CLOCK));
}

/**
 * Longitude speed in degrees per day: the derivative of the longitude this
 * engine reports, by a central difference over plus/minus 0.001 day (86.4 s).
 * The true node keeps plus/minus six hours, where its short-period noise
 * would otherwise dominate. Both samples must lie in EPHEMERIS_SPAN, so
 * positions need an instant at least six hours inside it. The difference is
 * divided by the time between the samples: twice the step on the input's
 * scale, or their TT interval where a leap second or a change of the time
 * basis lies between them (`elapsedDays` in src/time-scale.ts).
 */
export const SPEED_STEP_DAYS = 0.001;
export const NODE_SPEED_STEP_DAYS = 0.25;

export function longitudeSpeed(body: BodyName, date: Date): number {
  return evaluated(() => speedAt(body, date.getTime(), UTC_CLOCK));
}

/** A central difference of `longitudeOf` over plus/minus `stepDays` about `ms`, per day elapsed between the samples. */
function centralDifference(
  longitudeOf: (basis: TimeBasis) => number,
  ms: number,
  clock: Clock,
  stepDays: number
): number {
  const before = basisAt(sample(ms, -stepDays), clock);
  const lonBefore = longitudeOf(before);
  const after = basisAt(sample(ms, stepDays), clock);
  let difference = longitudeOf(after) - lonBefore;
  if (difference > 180) difference -= 360;
  if (difference < -180) difference += 360;
  return difference / elapsedDays(before, after, 2 * stepDays);
}

function speedAt(body: BodyName, ms: number, clock: Clock): number {
  const stepDays =
    body === "North Node" || body === "South Node" ? NODE_SPEED_STEP_DAYS : SPEED_STEP_DAYS;
  return centralDifference((basis) => longitudeOn(body, basis), ms, clock, stepDays);
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
  return evaluated(() => bodiesAt(date.getTime(), UTC_CLOCK));
}

function bodiesAt(ms: number, clock: Clock): BodyPosition[] {
  const bodies: BodyPosition[] = [];
  for (const planet of PLANETS) {
    const coordinates = planetOfDate(planet.body, timeAt(ms, clock));
    bodies.push(
      position(planet.name, coordinates.lon, coordinates.lat, speedAt(planet.name, ms, clock))
    );
  }

  const moon = moonOfDate(timeAt(ms, clock));
  bodies.splice(1, 0, position("Moon", moon.lon, moon.lat, speedAt("Moon", ms, clock)));

  const northNode = trueNodeLongitude(timeAt(ms, clock));
  const nodeSpeed = speedAt("North Node", ms, clock);
  bodies.push(
    position("North Node", northNode, 0, nodeSpeed),
    position("South Node", normalizeLongitude(northNode + 180), 0, nodeSpeed)
  );
  return bodies;
}

const clockOf = (input: Pick<ChartInput, "timeScale" | "deltaT">): Clock => ({
  scale: input.timeScale ?? "utc",
  pin: input.deltaT
});

export function computeChart(input: ChartInput): Chart {
  return evaluated(() => chartAt(input));
}

function chartAt(input: ChartInput): Chart {
  const flags = [...(input.flags ?? [])];
  const ms = input.utc.getTime();
  const clock = clockOf(input);
  const bodies = bodiesAt(ms, clock);
  const basis = timeBasis(ms, clock.scale, clock.pin);
  let angles = null;
  let houses = null;

  if (input.timeKnown && input.latitude !== undefined && input.longitude !== undefined) {
    // Apparent sidereal time already carries the nutation in longitude, so the
    // ecliptic it is projected onto must be the true one of date: the mean
    // obliquity plus the nutation in obliquity, from the same model and on TT.
    // The Earth's rotation is read from UT1.
    const time = timeOf(basis);
    const angleInput = {
      gastHours: gastHours(time),
      latitude: input.latitude,
      longitude: input.longitude,
      obliquity: tilt(time.tt).tobl
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
    deltaT: basis.deltaT,
    timeScale: basis.timeScale,
    engineVersion: ENGINE_VERSION
  };
}

/** The mean node and the mean apogee at an instant's time basis, on the chart's clock. */
function meanLunarPoints(basis: TimeBasis): { node: number; apogee: { lon: number; lat: number } } {
  const time = timeOf(basis);
  const centuries = time.tt / 36525;
  const nutation = tilt(time.tt).dpsi / 3600;
  return { node: meanNodeLongitude(centuries, nutation), apogee: meanApogee(centuries, nutation) };
}

function pointPosition(point: PointName, lon: number, lat: number, speed: number | null): PointPosition {
  const longitude = normalizeLongitude(lon);
  return {
    point,
    lon: longitude,
    lat,
    speed,
    sign: signForLongitude(longitude).slug,
    degree: degreeInSign(longitude)
  };
}

/**
 * The chart's points, computed on the same clock as the chart: its time
 * scale and its pinned ΔT when it has one. The mean node and Black Moon
 * Lilith depend on the instant alone; the Vertex and the East Point on the
 * instant and the place; the lots on the chart's own ascendant and bodies.
 */
export function computePoints(chart: Chart): ChartPoints {
  return evaluated(() => pointsAt(chart));
}

/**
 * Derive equatorial coordinates and declination aspects from the chart's full
 * ecliptic positions, using the engine's true obliquity on the chart's clock
 * (its time scale and any pinned ΔT). This adds no claim to the natal receipt.
 */
export function computeChartDeclinations(chart: Chart): ChartDeclinations {
  const input = chart?.input;
  const sourceDate = input?.utc;
  const pin = input?.deltaT;
  const bodies = chart?.bodies;
  if (!(sourceDate instanceof Date) || !Number.isFinite(Date.prototype.getTime.call(sourceDate))) {
    throw new RangeError("declination chart must contain a valid input utc Date.");
  }
  const date = new Date(Date.prototype.getTime.call(sourceDate));
  if (pin !== undefined && (!Number.isFinite(pin) || typeof pin !== "number" || Math.abs(pin) > 1e10)) {
    throw new RangeError("declination chart deltaT must be finite and at most 1e10 seconds in size.");
  }
  const scale = input.timeScale ?? "utc";
  return evaluated(() => {
    const basis = timeBasis(date.getTime(), scale, pin);
    return {
      ...chartBodyDeclinations(bodies, tilt(timeOf(basis).tt).tobl),
      utc: date.toISOString(),
      deltaT: basis.deltaT
    };
  });
}

function pointsAt(chart: Chart): ChartPoints {
  const { utc, latitude, longitude } = chart.input;
  const ms = utc.getTime();
  const clock = clockOf(chart.input);
  const mean = meanLunarPoints(basisAt(ms, clock));
  const nodeSpeed = centralDifference((basis) => meanLunarPoints(basis).node, ms, clock, SPEED_STEP_DAYS);
  const apogeeSpeed = centralDifference((basis) => meanLunarPoints(basis).apogee.lon, ms, clock, SPEED_STEP_DAYS);
  const points: PointPosition[] = [
    pointPosition("Mean Node", mean.node, 0, nodeSpeed),
    pointPosition("Mean South Node", mean.node + 180, 0, nodeSpeed),
    pointPosition("Black Moon Lilith", mean.apogee.lon, mean.apogee.lat, apogeeSpeed)
  ];
  if (chart.angles === null || latitude === undefined || longitude === undefined) {
    return { sect: null, points };
  }
  const time = timeAt(ms, clock);
  const angleInput = {
    gastHours: gastHours(time),
    latitude,
    longitude,
    obliquity: tilt(time.tt).tobl
  };
  points.push(
    pointPosition("Vertex", vertexOf(angleInput, computeAngles(angleInput)), 0, null),
    pointPosition("East Point", eastPointOf(angleInput), 0, null)
  );
  const lon = (body: BodyName): number => {
    const found = chart.bodies.find((candidate) => candidate.body === body);
    if (!found) throw new RangeError(`chart has no ${body}.`);
    return found.lon;
  };
  const sect = sectOf(chart.angles.asc, lon("Sun"));
  const lots = hellenisticLots(
    {
      ascendant: chart.angles.asc,
      sun: lon("Sun"),
      moon: lon("Moon"),
      mercury: lon("Mercury"),
      venus: lon("Venus"),
      mars: lon("Mars"),
      jupiter: lon("Jupiter"),
      saturn: lon("Saturn")
    },
    sect
  );
  for (const lot of lots) points.push(pointPosition(lot.point, lot.lon, 0, null));
  return { sect, points };
}
