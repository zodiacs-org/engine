/**
 * `@zodiacs/engine/minor-bodies`: the apparent geocentric places of 2060
 * Chiron, 1 Ceres, 2 Pallas, 3 Juno and 4 Vesta from 1800-01-01 to
 * 2200-01-01 TT, on the true ecliptic and equinox of date, from tables fitted
 * to NASA JPL Horizons's vectors (src/minor-bodies/pack-data.ts; LICENSING.md,
 * *Minor-body tables*).
 *
 * Each body's table is Chebyshev series of its heliocentric position in the
 * ICRF, which scripts/minor-bodies/fit.py fitted to Horizons's geometric
 * vectors (every 10 days for Chiron, 4 for the others) to within 206 km for
 * Chiron and 90 km for the others at those vectors. The place is reduced from
 * there with the Earth and the Sun of the source a position at the instant
 * comes from, by the root's rule: the source `withEphemeris` installed, which
 * must give their states (every DE440 source does); the shipped DE440 pack
 * after `useDe440()`; astronomy-engine otherwise, flagged
 * `"de440-unavailable"` or `"outside-de440-span"` where it stands in for the
 * pack (src/minor-bodies/reduce.ts says what the reduction applies). Outside
 * the tables' span a position is refused with a RangeError: the tables are
 * never extrapolated.
 *
 * Nothing in this entry's graph imports the DE440 pack or the root's
 * ephemeris, and the root imports nothing of it. Each body's table is a
 * constant of its own, so a bundle that uses one body's spec (`chiron`) and
 * none of the others, nor `MINOR_BODIES` or `minorBodyPositions`, which hold
 * all five, carries that body's table alone.
 */
import { AstroTime, BaryState, Body } from "astronomy-engine";

import type { De440Source } from "./de440.js";
import { dateFrom } from "./date-input.js";
import { defaultEphemerisName, installedSource, registeredDe440Source } from "./ephemeris-default.js";
import {
  CERES_LAYOUT,
  CERES_PACK,
  CHIRON_LAYOUT,
  CHIRON_PACK,
  JUNO_LAYOUT,
  JUNO_PACK,
  PALLAS_LAYOUT,
  PALLAS_PACK,
  PROVENANCE,
  VESTA_LAYOUT,
  VESTA_PACK
} from "./minor-bodies/pack-data.js";
import { apparentPlace } from "./minor-bodies/reduce.js";
import type { EarthAndSun, MinorBodyPlace } from "./minor-bodies/reduce.js";
import { table } from "./minor-bodies/table.js";
import type { MinorBodyTable, Table } from "./minor-bodies/table.js";
import { readOptions } from "./read-options.js";
import { degreeInSign, signForLongitude } from "./signs.js";
import { TIME_SCALE_NAMES, timeBasis } from "./time-scale.js";
import type { TimeScaleName } from "./time-scale.js";
import { EPHEMERIS } from "./types.js";
import type { DateInput, EphemerisFallback, ZodiacSign } from "./types.js";

export type { DateInput, EphemerisFallback, MinorBodyTable, TimeScaleName, ZodiacSign };

/** The bodies this entry places, in the order `MINOR_BODIES` holds them. */
export const MINOR_BODY_NAMES = /*#__PURE__*/ Object.freeze(["Chiron", "Ceres", "Pallas", "Juno", "Vesta"] as const);
export type MinorBodyName = (typeof MINOR_BODY_NAMES)[number];

/**
 * The span the tables cover, on TT: from 1800-01-01T00:00:00 TT (JD
 * 2378496.5) to 2200-01-01T00:00:00 TT (JD 2524593.5), the ends included.
 * `from` and `to` are those instants as the engine writes a TT instant, with
 * a Z; on UTC each end is earlier, by ΔT there.
 */
export const MINOR_BODIES_SPAN = /*#__PURE__*/ Object.freeze({
  from: "1800-01-01T00:00:00Z",
  to: "2200-01-01T00:00:00Z",
  fromJdTt: 2378496.5,
  toJdTt: 2524593.5
} as const);

/** One of the bodies this entry places. */
export interface MinorBodySpec {
  readonly name: MinorBodyName;
  /** The body as JPL Horizons names it. */
  readonly designation: string;
  /** The JPL orbit solution the fitted vectors come from, as Horizons names it: "JPL#171" for Chiron. */
  readonly solution: string;
  readonly table: MinorBodyTable;
}

/** Each spec's table reader; only the specs below have one. */
const READERS = /*#__PURE__*/ new WeakMap<MinorBodySpec, Table>();

function spec(name: MinorBodyName, designation: string, solution: string, layout: MinorBodyTable, base64: string): MinorBodySpec {
  const made: MinorBodySpec = Object.freeze({ name, designation, solution, table: Object.freeze({ ...layout }) });
  READERS.set(made, table(layout, base64));
  return made;
}

/** 2060 Chiron (1977 UB), from Horizons's solution JPL#171. */
export const chiron: MinorBodySpec = /*#__PURE__*/ spec("Chiron", "2060 Chiron (1977 UB)", "JPL#171", CHIRON_LAYOUT, CHIRON_PACK);
/** 1 Ceres (A801 AA), from Horizons's solution JPL#48. */
export const ceres: MinorBodySpec = /*#__PURE__*/ spec("Ceres", "1 Ceres (A801 AA)", "JPL#48", CERES_LAYOUT, CERES_PACK);
/** 2 Pallas (A802 FA), from Horizons's solution JPL#74. */
export const pallas: MinorBodySpec = /*#__PURE__*/ spec("Pallas", "2 Pallas (A802 FA)", "JPL#74", PALLAS_LAYOUT, PALLAS_PACK);
/** 3 Juno (A804 RA), from Horizons's solution JPL#144. */
export const juno: MinorBodySpec = /*#__PURE__*/ spec("Juno", "3 Juno (A804 RA)", "JPL#144", JUNO_LAYOUT, JUNO_PACK);
/** 4 Vesta (A807 FA), from Horizons's solution JPL#36. */
export const vesta: MinorBodySpec = /*#__PURE__*/ spec("Vesta", "4 Vesta (A807 FA)", "JPL#36", VESTA_LAYOUT, VESTA_PACK);

/** The five specs, in the order of MINOR_BODY_NAMES; it holds every table. */
export const MINOR_BODIES: readonly MinorBodySpec[] = /*#__PURE__*/ Object.freeze([chiron, ceres, pallas, juno, vesta]);

/** Where the tables come from; see MINOR_BODIES_PROVENANCE. */
export interface MinorBodiesProvenance {
  /** The Horizons API the vectors were fetched from. */
  readonly api: string;
  /** When, an ISO 8601 instant on UTC. */
  readonly fetchedAtUtc: string;
  /** The VECTORS query's parameters, each body's but its command and step. */
  readonly vectorParams: Readonly<Record<string, string>>;
  /**
   * For each body: the Horizons command and step; the response's rows, its
   * size in bytes and its SHA-256; the orbit solution ("JPL#171"), and the
   * record and target lines Horizons gave with it.
   */
  readonly bodies: Readonly<
    Record<
      MinorBodyName,
      {
        readonly command: string;
        readonly step: string;
        readonly rows: number;
        readonly bytes: number;
        readonly sha256: string;
        readonly solution: string;
        readonly record: string;
        readonly target: string;
      }
    >
  >;
}

/**
 * Where the tables come from (src/minor-bodies/provenance.json, which
 * scripts/minor-bodies/fetch-horizons.py wrote): the Horizons API and the
 * VECTORS query, when it was fetched, and for each body its command, step,
 * rows, the raw response's size and SHA-256, the solution and the record
 * Horizons names. Frozen.
 */
export const MINOR_BODIES_PROVENANCE: MinorBodiesProvenance = PROVENANCE;

/** How `minorBodyPosition` reads its instant. */
export interface MinorBodyOptions {
  /** The scale `date` is on: "utc" (the default), "ut1" or "tt", as BirthInput's `timeScale`. */
  readonly timeScale?: TimeScaleName;
}

/** A minor body's apparent geocentric place on the true ecliptic and equinox of date. */
export interface MinorBodyPosition {
  readonly body: MinorBodyName;
  /** Longitude, degrees in [0, 360). */
  readonly lon: number;
  /** Latitude, degrees. */
  readonly lat: number;
  /** Distance along the light path, au. */
  readonly dist: number;
  /**
   * Longitude speed in degrees a TT day: the derivative of `lon` by a central
   * difference over plus/minus MINOR_BODY_SPEED_STEP_DAYS of TT, both samples
   * taking the central instant's decision about whether the body is behind
   * the Sun's disc (from 3.0.0, as a planet's do); negative means retrograde.
   */
  readonly speed: number;
  readonly retrograde: boolean;
  readonly sign: ZodiacSign;
  /** Longitude inside `sign`, degrees in [0, 30). */
  readonly degree: number;
  /**
   * The Earth's and the Sun's ephemeris, as a chart names it (`"jpl-de440"`
   * with the pack's SHA-256, astronomy-engine with its version, or the name
   * of the source `withEphemeris` ran the call with), and the body's: its
   * table, fitted to JPL Horizons's vectors from the solution it names, with
   * its bytes' SHA-256.
   */
  readonly ephemeris: {
    readonly name: string;
    readonly version: string;
    readonly body: { readonly name: "jpl-horizons"; readonly solution: string; readonly sha256: string };
  };
  /** `"de440-unavailable"` or `"outside-de440-span"` where astronomy-engine stood in for the shipped pack, as on a chart; otherwise none. */
  readonly flags: readonly EphemerisFallback[];
}

/**
 * Half the span of a speed's central difference, TT days. A table's
 * consecutive intervals are separate fits, which meet to within 730 km for
 * Chiron and 240 km for the others (src/minor-bodies.test.ts), so a
 * difference that crosses from one interval to the next reads that offset as
 * motion, its angle divided by the difference's span: a quarter of a day
 * each side keeps that under an arcsecond a day, where the 0.001 day the
 * engine takes for the planets would read 250 times more.
 */
export const MINOR_BODY_SPEED_STEP_DAYS = 0.25;

/** The default source keeps a day inside each end of the shipped pack, as the root's does. */
const PACK_MARGIN_DAYS = 1;
const AU_KM = 149597870.7;
const AU_PER_DAY_KM_S = AU_KM / 86400;

interface Chosen {
  readonly statesAt: (ttDays: number) => EarthAndSun;
  readonly ephemeris: { readonly name: string; readonly version: string };
  readonly fallback: EphemerisFallback | null;
}

/** The Earth's and the Sun's barycentric states from astronomy-engine (BaryState, EQJ, au and au a day), km and km/s. */
function astronomyEngineStates(ttDays: number): EarthAndSun {
  const time = AstroTime.FromTerrestrialTime(ttDays);
  const state = (body: Body) => {
    const s = BaryState(body, time);
    return {
      position: [s.x * AU_KM, s.y * AU_KM, s.z * AU_KM] as const,
      velocity: [s.vx * AU_PER_DAY_KM_S, s.vy * AU_PER_DAY_KM_S, s.vz * AU_PER_DAY_KM_S] as const
    };
  };
  return { earth: state(Body.Earth), sun: state(Body.Sun) };
}

const ON_ASTRONOMY_ENGINE: Chosen = { statesAt: astronomyEngineStates, ephemeris: EPHEMERIS, fallback: null };

/**
 * The source of the Earth and the Sun for an instant, by the root's rule
 * (src/ephemeris.ts, chosenAt): the one `withEphemeris` installed; the shipped
 * DE440 pack where the default is "de440", the pack opened and the instant a
 * day inside it; astronomy-engine otherwise, with the reason where it is a
 * fallback.
 */
function chosenAt(ttDays: number): Chosen {
  const installed = installedSource();
  if (installed) {
    const states = (installed as Partial<De440Source>).earthAndSunState;
    if (typeof states !== "function") {
      throw new TypeError(
        "a minor body's position inside withEphemeris needs a source that gives the Earth's and the Sun's states (earthAndSunState), as every DE440 source does"
      );
    }
    return { statesAt: (tt) => states.call(installed, tt), ephemeris: installed.ephemeris, fallback: null };
  }
  if (defaultEphemerisName() !== "de440") return ON_ASTRONOMY_ENGINE;
  const loader = registeredDe440Source();
  let source: De440Source | null = null;
  try {
    source = loader === null ? null : loader();
  } catch {
    source = null;
  }
  if (source === null || typeof source.earthAndSunState !== "function") return { ...ON_ASTRONOMY_ENGINE, fallback: "de440-unavailable" };
  const from = source.pack.startEtSecTdb / 86400 + PACK_MARGIN_DAYS;
  const to = source.pack.stopEtSecTdb / 86400 - PACK_MARGIN_DAYS;
  if (!(ttDays >= from && ttDays <= to)) return { ...ON_ASTRONOMY_ENGINE, fallback: "outside-de440-span" };
  const opened = source;
  return { statesAt: (tt) => opened.earthAndSunState(tt), ephemeris: opened.ephemeris, fallback: null };
}

/** The spec a name names, or a RangeError. */
function named(name: string, label: string): MinorBodySpec {
  const found = MINOR_BODIES.find((candidate) => candidate.name === name);
  if (!found) throw new RangeError(`${label} must name one of ${MINOR_BODY_NAMES.join(", ")}`);
  return found;
}

/** The reader of an engine spec, or a TypeError. */
function readerOf(body: unknown, label: string): { spec: MinorBodySpec; reader: Table } {
  const reader = typeof body === "object" && body !== null ? READERS.get(body as MinorBodySpec) : undefined;
  if (!reader) throw new TypeError(`${label} must be one of this entry's specs: chiron, ceres, pallas, juno or vesta`);
  return { spec: body as MinorBodySpec, reader };
}

/** TT days from J2000.0 of `date` on `options`' scale, refused outside MINOR_BODIES_SPAN. */
function instantOf(date: DateInput, options: MinorBodyOptions | undefined, label: string): number {
  const read = readOptions(options, ["timeScale"], `${label} options`);
  const scale = read.timeScale ?? "utc";
  if (!TIME_SCALE_NAMES.includes(scale as TimeScaleName)) throw new RangeError(`${label} options.timeScale must be "utc", "ut1" or "tt".`);
  const ms = dateFrom(date, `${label} date`).getTime();
  const ttDays = timeBasis(ms, scale as TimeScaleName).ttDays;
  const jdTt = ttDays + 2451545.0;
  if (!(jdTt >= MINOR_BODIES_SPAN.fromJdTt && jdTt <= MINOR_BODIES_SPAN.toJdTt)) {
    throw new RangeError(
      `${label}: the instant is outside the span the minor-body tables cover, 1800-01-01 to 2200-01-01 TT (MINOR_BODIES_SPAN); they are not extrapolated.`
    );
  }
  return ttDays;
}

function positionOn(spec: MinorBodySpec, reader: Table, ttDays: number, chosen: Chosen): MinorBodyPosition {
  const heliocentric = (jdTdb: number) => reader.position(jdTdb);
  const placeAt = (tt: number, behind?: boolean): MinorBodyPlace => apparentPlace(heliocentric, tt, chosen.statesAt, behind);
  const place = placeAt(ttDays);
  // Both samples hold the central instant's decision about the Sun's disc, as a planet's speed does
  // (src/ephemeris.ts, src/calc.ts), so that the deflection's step at the limb is not read as motion.
  let turn =
    placeAt(ttDays + MINOR_BODY_SPEED_STEP_DAYS, place.behindDisc).lon - placeAt(ttDays - MINOR_BODY_SPEED_STEP_DAYS, place.behindDisc).lon;
  if (turn > 180) turn -= 360;
  if (turn < -180) turn += 360;
  const speed = turn / (2 * MINOR_BODY_SPEED_STEP_DAYS);
  const lon = place.lon === 360 ? 0 : place.lon + 0;
  return {
    body: spec.name,
    lon,
    lat: place.lat,
    dist: place.distAu,
    speed,
    retrograde: speed < 0,
    sign: signForLongitude(lon).slug,
    degree: degreeInSign(lon),
    ephemeris: {
      name: chosen.ephemeris.name,
      version: chosen.ephemeris.version,
      body: { name: "jpl-horizons", solution: spec.solution, sha256: spec.table.sha256 }
    },
    flags: chosen.fallback === null ? [] : [chosen.fallback]
  };
}

/**
 * The apparent geocentric place of one body at `date` (a Date, an epoch
 * millisecond or an ISO string, read as UTC unless `options.timeScale` says
 * otherwise), on the true ecliptic and equinox of date. `body` is one of this
 * entry's specs, `chiron` to `vesta`; pass a name to `minorBodyPositions`.
 * A RangeError refuses an instant outside MINOR_BODIES_SPAN, on TT.
 */
export function minorBodyPosition(body: MinorBodySpec, date: DateInput, options?: MinorBodyOptions): MinorBodyPosition {
  const { spec, reader } = readerOf(body, "minorBodyPosition body");
  const ttDays = instantOf(date, options, "minorBodyPosition");
  return positionOn(spec, reader, ttDays, chosenAt(ttDays));
}

/**
 * The places of several bodies at one instant, on one source: `bodies`, specs
 * or names, all five (`MINOR_BODIES`) by default, in the order given.
 */
export function minorBodyPositions(
  date: DateInput,
  bodies: readonly (MinorBodySpec | MinorBodyName)[] = MINOR_BODIES,
  options?: MinorBodyOptions
): MinorBodyPosition[] {
  if (!Array.isArray(bodies)) throw new TypeError("minorBodyPositions bodies must be an array of specs or names");
  const read = bodies.map((body, index) => {
    const label = `minorBodyPositions bodies[${index}]`;
    return readerOf(typeof body === "string" ? named(body, label) : body, label);
  });
  const ttDays = instantOf(date, options, "minorBodyPositions");
  const chosen = chosenAt(ttDays);
  return read.map(({ spec, reader }) => positionOn(spec, reader, ttDays, chosen));
}
