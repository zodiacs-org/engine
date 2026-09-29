/*
 * Solar arc directions: every natal longitude advanced by the arc the
 * secondary-progressed Sun has travelled since birth.
 *
 * The progressed Sun comes from the engine's secondary progressions
 * (`progressedInstant`, `progressedBodies`: one 365.2422-day year of life per
 * ephemeris day). Worked examples: Hamish Saunders, "Solar Arc Directions"
 * (Astrology House, 1996). See docs/timing-hellenistic.md.
 */
import type { NatalSource } from "../api.js";
import { dateFrom } from "../date-input.js";
import { progressedBodies, progressedInstant } from "../progressions.js";
import { degreeInSign, normalizeLongitude, signForLongitude } from "../signs.js";
import type { BodyPosition, DateInput, ZodiacSign } from "../types.js";
import { DAY_MS, chartLongitudes, guarded, natalContext, sectContradictsAltitude, timingFlags } from "./shared.js";
import type { ChartLongitudeName, TimingFlag } from "./shared.js";

/** The Sun's mean motion in longitude, degrees per day; used only to count whole turns. */
const SUN_MEAN_MOTION = 0.98564736;
const MAX_ROWS = 256;

/** The solar arc between a birth and a target instant. */
export interface SolarArc {
  readonly birth: Date;
  readonly target: Date;
  /** `progressedInstant(birth, target)`. */
  readonly progressed: Date;
  /** Apparent longitudes of the Sun at birth and at the progressed instant. */
  readonly natalSun: number;
  readonly progressedSun: number;
  /** progressedSun − natalSun in degrees, counted on past 360° and negative before birth. */
  readonly arc: number;
  readonly flags: readonly TimingFlag[];
}

/** A longitude and its directed position (natal + arc), both in [0, 360). */
export interface DirectedLongitude {
  readonly name: string;
  readonly natal: number;
  readonly directed: number;
  /** The directed longitude's sign and degree within it. */
  readonly sign: ZodiacSign;
  readonly degree: number;
}

/** A chart longitude and its directed position. */
export interface DirectedPosition extends DirectedLongitude {
  readonly name: ChartLongitudeName;
  readonly kind: "body" | "angle" | "point";
}

/** Solar arc directions of a whole chart. */
export interface SolarArcDirections {
  readonly arc: SolarArc;
  /** The twelve bodies, the four angles when present, then `chartPoints`. */
  readonly positions: readonly DirectedPosition[];
  /** The arc's flags, and the sect's when the chart has lots. */
  readonly flags: readonly TimingFlag[];
}

function sunOf(rows: readonly BodyPosition[]): number {
  const sun = rows.find((row) => row.body === "Sun");
  if (!sun) throw new RangeError("The ephemeris returned no Sun.");
  return sun.lon;
}

/**
 * The solar arc at `target`: the Sun of `progressedBodies(birthUtc, target)`
 * minus the natal Sun, both read as UTC instants on the engine's time basis
 * (never on a chart's pinned ΔT).
 * Invalid instants throw RangeError. Frozen.
 */
export function solarArc(birthUtc: DateInput, target: DateInput): SolarArc {
  const birth = dateFrom(birthUtc, "birthUtc");
  const at = dateFrom(target, "target");
  const progressed = progressedInstant(birth, at);
  const natalSun = sunOf(guarded(() => progressedBodies(birth, birth)));
  const progressedSun = sunOf(guarded(() => progressedBodies(birth, at)));
  const days = (progressed.getTime() - birth.getTime()) / DAY_MS;
  const raw = progressedSun - natalSun;
  // The true Sun stays within about 2° of its mean motion, so the nearest
  // whole number of turns to the mean estimate is the right one.
  const arc = raw + 360 * Math.round((SUN_MEAN_MOTION * days - raw) / 360);
  const flags = timingFlags([birth.getTime(), progressed.getTime()], false);
  return Object.freeze({ birth, target: at, progressed, natalSun, progressedSun, arc: arc === 0 ? 0 : arc, flags });
}

function direct(name: string, longitude: number, arc: number): DirectedLongitude {
  const natal = normalizeLongitude(longitude);
  const directed = normalizeLongitude(natal + arc);
  return { name, natal, directed, sign: signForLongitude(directed).slug, degree: degreeInSign(directed) };
}

/**
 * Each `{ name, lon }` advanced by `arc` degrees, normalized to [0, 360). At
 * most 256 rows with unique nonempty names and finite longitudes, and a finite
 * arc; anything else throws RangeError. Frozen.
 */
export function directLongitudes(
  rows: readonly { readonly name: string; readonly lon: number }[],
  arc: number
): readonly DirectedLongitude[] {
  if (typeof arc !== "number" || !Number.isFinite(arc)) {
    throw new RangeError("arc must be a finite number of degrees.");
  }
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) {
    throw new RangeError(`rows must be an array of at most ${MAX_ROWS} longitudes.`);
  }
  const seen = new Set<string>();
  const out: DirectedLongitude[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row: unknown = rows[index];
    if (row === null || typeof row !== "object") {
      throw new RangeError("Each row must be an object with a name and a lon.");
    }
    const { name, lon } = row as { name?: unknown; lon?: unknown };
    if (typeof name !== "string" || name.length === 0) throw new RangeError("Each row needs a nonempty name.");
    if (seen.has(name)) throw new RangeError(`Row names must be unique; "${name}" repeats.`);
    if (typeof lon !== "number" || !Number.isFinite(lon)) {
      throw new RangeError(`Row "${name}" needs a finite lon.`);
    }
    seen.add(name);
    out.push(Object.freeze(direct(name, lon, arc)));
  }
  return Object.freeze(out);
}

/**
 * The {@link solarArc} from a chart's birth, and every body, angle and chart
 * point of the chart advanced by it. Invalid charts and instants throw
 * RangeError. Frozen.
 */
export function solarArcDirections(natal: NatalSource, target: DateInput): SolarArcDirections {
  const at = dateFrom(target, "target");
  const { chart, points, birth } = natalContext(natal);
  const arc = solarArc(birth, at);
  const positions = chartLongitudes(chart, points).map((row) =>
    Object.freeze({ ...direct(row.name, row.lon, arc.arc), name: row.name, kind: row.kind })
  );
  const flags = timingFlags([arc.birth.getTime(), arc.progressed.getTime()], sectContradictsAltitude(chart, points));
  return Object.freeze({ arc, positions: Object.freeze(positions), flags });
}
