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
import { shippedDe440Source } from "./de440-pack.js";
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
  PointPosition,
  PositionSource,
  SourceBody
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

/** The source `withEphemeris` installed, or null for the default source. */
let source: PositionSource | null = null;

/** What a call outside `withEphemeris` computes on. */
export type DefaultEphemerisName = "de440" | "astronomy-engine";
let defaultName: DefaultEphemerisName = "de440";
/** Above zero inside `onAstronomyEngine`. */
let astronomyEngineOnly = 0;

/**
 * The default source keeps a day inside each end of the shipped pack, so
 * that a position, its speed samples (six hours each side for the node) and
 * the light-time lookback (under seven hours for Pluto) all come from one
 * ephemeris.
 */
const DEFAULT_MARGIN_DAYS = 1;
const SECONDS_PER_DAY = 86_400;

interface ShippedDefault {
  readonly source: PositionSource;
  /** Days of TT from J2000.0 between which the default source is the pack, the ends included. */
  readonly fromTtDays: number;
  readonly toTtDays: number;
}
let shipped: ShippedDefault | null | undefined;
let shippedError: string | null = null;

/** The shipped pack as the default source, opened at the first use, or null when it cannot be opened. */
function shippedDefault(): ShippedDefault | null {
  if (shipped !== undefined) return shipped;
  try {
    const opened = shippedDe440Source();
    shipped = {
      source: opened,
      fromTtDays: opened.pack.startEtSecTdb / SECONDS_PER_DAY + DEFAULT_MARGIN_DAYS,
      toTtDays: opened.pack.stopEtSecTdb / SECONDS_PER_DAY - DEFAULT_MARGIN_DAYS
    };
  } catch (error) {
    shipped = null;
    shippedError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  return shipped;
}

/**
 * The source for a calculation at `ttDays` (TT days from J2000.0), decided
 * once for the instant and used for each of its speed samples: the one
 * `withEphemeris` installed; or the shipped DE440 pack, when the default is
 * "de440", the pack opened, and the instant is inside it by a day; or null,
 * for astronomy-engine.
 */
function sourceAt(ttDays: number): PositionSource | null {
  if (astronomyEngineOnly > 0) return null;
  if (source) return source;
  if (defaultName !== "de440") return null;
  const pack = shippedDefault();
  return pack !== null && ttDays >= pack.fromTtDays && ttDays <= pack.toTtDays ? pack.source : null;
}

/** What `defaultEphemeris` reports. */
export interface DefaultEphemeris {
  /**
   * `"de440"`: a call outside `withEphemeris` computes on the shipped DE440
   * pack where `de440` says it can, and on astronomy-engine elsewhere.
   * `"astronomy-engine"`: it computes on astronomy-engine always.
   */
  readonly name: DefaultEphemerisName;
  /** The shipped pack as the default source. */
  readonly de440: {
    /** Whether the pack opened. When false, every default call is astronomy-engine's. */
    readonly opened: boolean;
    /** The pack's SHA-256, a chart's `ephemeris.version`, or null when it did not open. */
    readonly version: string | null;
    /**
     * Days of TT from J2000.0 between which the default is the pack, the
     * ends included: a day inside each end of the pack's coverage. Null when
     * it did not open.
     */
    readonly fromTtDays: number | null;
    readonly toTtDays: number | null;
    /** Why the pack did not open, or null. */
    readonly error: string | null;
  };
}

/**
 * What a call outside `withEphemeris` computes on. The first call opens the
 * shipped pack if nothing has yet (which hashes its 2,489,664 bytes twice).
 * A chart says which ephemeris it came from: `chart.ephemeris` names the
 * pack, and is absent on a chart from astronomy-engine.
 */
export function defaultEphemeris(): DefaultEphemeris {
  const pack = shippedDefault();
  return Object.freeze({
    name: defaultName,
    de440: Object.freeze({
      opened: pack !== null,
      version: pack?.source.ephemeris.version ?? null,
      fromTtDays: pack?.fromTtDays ?? null,
      toTtDays: pack?.toTtDays ?? null,
      error: shippedError
    })
  });
}

/**
 * Choose what a call outside `withEphemeris` computes on, from now on:
 * `"de440"` (the package's default) or `"astronomy-engine"`, which gives the
 * positions 1.1.0-rc.7 and earlier gave at every instant. It is one setting
 * for the whole module, so set it once, before computing; `withEphemeris`
 * still overrides it for the calls inside.
 */
export function setDefaultEphemeris(name: DefaultEphemerisName): void {
  if (name !== "de440" && name !== "astronomy-engine") throw new TypeError('setDefaultEphemeris takes "de440" or "astronomy-engine"');
  defaultName = name;
}

/**
 * Run `run` on astronomy-engine whatever the default: for the modules that
 * compute on astronomy-engine themselves and call this file's functions
 * beside it (the calc and window entries), so that one result never mixes
 * two ephemerides. They refuse inside `withEphemeris` before they get here.
 */
export function onAstronomyEngine<T>(run: () => T): T {
  astronomyEngineOnly += 1;
  try {
    return run();
  } finally {
    astronomyEngineOnly -= 1;
  }
}

/**
 * Run `run` with every body position the engine computes taken from
 * `positionSource` (for example `@zodiacs/engine/de440`'s), in place of the
 * default source, then restore the one before, whatever happens. Charts computed inside name it
 * (`chart.ephemeris`), and so do their receipts. `run` must be synchronous:
 * a function that returns a promise would leave its later steps on another
 * source, so that throws TypeError (after `run` has returned). Calls nest.
 */
export function withEphemeris<T>(positionSource: PositionSource, run: () => T): T {
  const named = positionSource?.ephemeris;
  if (typeof positionSource?.place !== "function" || typeof positionSource.trueNode !== "function" || typeof named?.name !== "string" || typeof named.version !== "string" || typeof run !== "function")
    throw new TypeError("withEphemeris needs a position source and a function");
  const previous = source;
  source = positionSource;
  let result: T;
  try {
    result = run();
  } finally {
    source = previous;
  }
  // A promise or an iterator would compute its later steps after the source is restored.
  const later = result as { then?: unknown; next?: unknown } | null;
  if (typeof later?.then === "function" || typeof later?.next === "function") {
    if (typeof later.then === "function") (later as PromiseLike<unknown>).then(undefined, () => {});
    throw new TypeError("withEphemeris runs synchronous functions only");
  }
  return result;
}

/**
 * For code that computes positions from astronomy-engine itself, or whose
 * bounds were measured on it (the calc entry, the sky entry's rising and
 * setting, the vedic entry's star-anchored ayanamsas and varga timing, the
 * window entry): refuse inside withEphemeris rather than mix two ephemerides.
 */
export function refuseUnderSource(what: string): void {
  if (source) throw new TypeError(`${what} does not run inside withEphemeris: it is computed on astronomy-engine`);
}

/** A source's longitude in [0, 360): 360 becomes 0 and -0 becomes 0, every other value unchanged. */
const tidy = (lon: number): number => (lon === 360 ? 0 : lon + 0);

/** A body's longitude from a source: its place, or the true node and the point opposite. */
function sourceLongitude(from: PositionSource, body: BodyName, ttDays: number): number {
  if (body === "North Node") return tidy(from.trueNode(ttDays));
  return body === "South Node" ? normalizeLongitude(from.trueNode(ttDays) + 180) : tidy(from.place(body, ttDays).lon);
}

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
  const basis = basisAt(ms, clock);
  return longitudeOn(body, basis, sourceAt(basis.ttDays));
}

function longitudeOn(body: BodyName, basis: TimeBasis, from: PositionSource | null): number {
  if (from) return sourceLongitude(from, body, basis.ttDays);
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

function speedAt(body: BodyName, ms: number, clock: Clock, from: PositionSource | null = sourceAt(basisAt(ms, clock).ttDays)): number {
  const stepDays =
    body === "North Node" || body === "South Node" ? NODE_SPEED_STEP_DAYS : SPEED_STEP_DAYS;
  return centralDifference((basis) => longitudeOn(body, basis, from), ms, clock, stepDays);
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

function bodiesAt(ms: number, clock: Clock, from: PositionSource | null = sourceAt(basisAt(ms, clock).ttDays)): BodyPosition[] {
  if (from) return sourceBodiesAt(from, ms, clock);
  const bodies: BodyPosition[] = [];
  for (const planet of PLANETS) {
    const coordinates = planetOfDate(planet.body, timeAt(ms, clock));
    bodies.push(
      position(planet.name, coordinates.lon, coordinates.lat, speedAt(planet.name, ms, clock, null))
    );
  }

  const moon = moonOfDate(timeAt(ms, clock));
  bodies.splice(1, 0, position("Moon", moon.lon, moon.lat, speedAt("Moon", ms, clock, null)));

  const northNode = trueNodeLongitude(timeAt(ms, clock));
  const nodeSpeed = speedAt("North Node", ms, clock, null);
  bodies.push(
    position("North Node", northNode, 0, nodeSpeed),
    position("South Node", normalizeLongitude(northNode + 180), 0, nodeSpeed)
  );
  return bodies;
}

/** The bodies in the order bodiesAt gives them, from a source. */
function sourceBodiesAt(from: PositionSource, ms: number, clock: Clock): BodyPosition[] {
  const tt = basisAt(ms, clock).ttDays;
  return (["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "South Node"] as const).map(
    (body) => {
      const place = body === "North Node" || body === "South Node" ? { lon: sourceLongitude(from, body, tt), lat: 0 } : from.place(body as SourceBody, tt);
      return position(body, tidy(place.lon), place.lat, speedAt(body, ms, clock, from));
    }
  );
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
  const basis = timeBasis(ms, clock.scale, clock.pin);
  const from = sourceAt(basis.ttDays);
  const bodies = bodiesAt(ms, clock, from);
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
    engineVersion: ENGINE_VERSION,
    ...(from && { ephemeris: { name: from.ephemeris.name, version: from.ephemeris.version } })
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
