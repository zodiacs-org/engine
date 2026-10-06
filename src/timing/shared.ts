/**
 * Internal helpers for the timing techniques: option and sign validation, and
 * the natal longitudes a technique starts from. Only the types below are
 * re-exported, from the timing entry point.
 */
import { chartDeclinations, chartPoints, resolvedChart, utcOf } from "../api.js";
import type { NatalSource } from "../api.js";
import { outsideReferenceSpan } from "../reference-span.js";
import { SIGN_SLUGS, normalizeLongitude, signIndexForLongitude } from "../signs.js";
import type { BodyName, Chart, ChartPoints, HouseNumber, PointName, ZodiacSign } from "../types.js";

/** The four angles of a chart with a birth time and place. */
export type AngleName = "Ascendant" | "Midheaven" | "Descendant" | "Imum Coeli";

/** A natal longitude a technique can start from or direct: a body, an angle or a chart point. */
export type ChartLongitudeName = BodyName | AngleName | PointName;

/**
 * The natal sign or point a profection or a releasing sequence counts from.
 * Only its sign enters the count.
 */
export interface TimingOrigin {
  /** The chart longitude it was read from; null when a sign or longitude was passed. */
  readonly point: ChartLongitudeName | null;
  /** Degrees in [0, 360); null when a sign name was passed. */
  readonly lon: number | null;
  readonly sign: ZodiacSign;
}

/**
 * Marks a timing result, as `Chart.flags` marks a chart:
 * `"outside-reference-span"` when an instant the ephemeris was read at lies
 * outside `REFERENCE_SPAN`; `"sect-contradicts-altitude"` when the result
 * depends on a sect that the Sun's altitude at birth contradicts, which can
 * happen only inside the polar circles.
 */
export type TimingFlag = "outside-reference-span" | "sect-contradicts-altitude";

/** One natal longitude, from the chart's bodies, its angles or `chartPoints`. */
export interface ChartLongitude {
  readonly name: ChartLongitudeName;
  readonly kind: "body" | "angle" | "point";
  /** Degrees in [0, 360). */
  readonly lon: number;
}

export const DAY_MS = 86_400_000;
/** The largest magnitude of an ECMAScript Date's epoch-millisecond value. */
export const MAX_DATE_MS = 8_640_000_000_000_000;

export { readOptions } from "../read-options.js";

/** One of a fixed list of names, or the default when absent. */
export function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  label: string
): T {
  if (value === undefined) return fallback;
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new RangeError(`${label} must be one of ${allowed.map((name) => `"${name}"`).join(", ")}.`);
}

/** An integer in [minimum, maximum]. */
export function integerIn(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value === 0 ? 0 : value;
}

/**
 * A starting sign given as a lowercase sign name or as a finite ecliptic
 * longitude in degrees (any finite value; it is normalized).
 */
export function startSign(value: unknown, label: string): { index: number; lon: number | null } {
  if (typeof value === "string") {
    const index = (SIGN_SLUGS as readonly string[]).indexOf(value);
    if (index >= 0) return { index, lon: null };
  } else if (typeof value === "number" && Number.isFinite(value)) {
    const lon = normalizeLongitude(value);
    return { index: signIndexForLongitude(lon), lon };
  }
  throw new RangeError(`${label} must be a lowercase zodiac sign name or a finite longitude in degrees.`);
}

/** A frozen origin for a sign index, its longitude when known, and the point it came from. */
export function originOf<P extends ChartLongitudeName | null, L extends number | null>(
  index: number,
  lon: L,
  point: P
): { readonly point: P; readonly lon: L; readonly sign: ZodiacSign } {
  return Object.freeze({ point, lon, sign: signAt(index) });
}

export function signAt(index: number): ZodiacSign {
  const sign = SIGN_SLUGS[((index % 12) + 12) % 12];
  if (sign === undefined) throw new RangeError("Could not resolve zodiac sign.");
  return sign;
}

/** The whole-sign place `offset` signs on from a starting sign, counted inclusively. */
export function placeFrom(offset: number): HouseNumber {
  return ((((offset % 12) + 12) % 12) + 1) as HouseNumber;
}

/**
 * The chart a natal source names, and its points, both from the engine's own
 * APIs, with the birth as a UTC instant: a chart given on UT1 or TT is read at
 * the UTC instant of its time basis, as `saturnReturn` reads one.
 */
export function natalContext(source: NatalSource): { chart: Chart; points: ChartPoints; birth: Date } {
  return guarded(() => {
    const { chart } = resolvedChart(source);
    return { chart, points: chartPoints(chart), birth: utcOf(chart.input) };
  });
}

const DEG = Math.PI / 180;

/**
 * Whether the chart's sect says the opposite of the Sun's altitude at birth,
 * the Sun taken on the ecliptic, as `sectOf` takes it. The sect counts the
 * half of the ecliptic from the descendant through the midheaven to the
 * ascendant as above the horizon; inside the polar circles the midheaven can
 * be below it, and then that half is the lower one.
 */
export function sectContradictsAltitude(chart: Chart, points: ChartPoints): boolean {
  const latitude = chart.input.latitude;
  const sun = chart.bodies.find((body) => body.body === "Sun");
  if (points.sect === null || chart.angles === null || latitude === undefined || !sun) return false;
  const e = chartDeclinations(chart).trueObliquity * DEG;
  const mc = chart.angles.mc * DEG;
  const lon = sun.lon * DEG;
  // Right ascensions of the midheaven (the local sidereal time) and the Sun.
  const hourAngle = Math.atan2(Math.sin(mc) * Math.cos(e), Math.cos(mc)) -
    Math.atan2(Math.sin(lon) * Math.cos(e), Math.cos(lon));
  const dec = Math.asin(Math.sin(e) * Math.sin(lon));
  const phi = latitude * DEG;
  const sinAltitude = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle);
  return sinAltitude > 0 !== (points.sect === "day");
}

/** A result's flags, from the instants the ephemeris was read at and its dependence on a contradicted sect. */
export function timingFlags(instants: readonly number[], sectContradicted: boolean): readonly TimingFlag[] {
  const flags: TimingFlag[] = [];
  if (instants.some((milliseconds) => outsideReferenceSpan(new Date(milliseconds)))) {
    flags.push("outside-reference-span");
  }
  if (sectContradicted) flags.push("sect-contradicts-altitude");
  return Object.freeze(flags);
}

/**
 * Every natal longitude of a chart: its bodies, its four angles when it has
 * them, and its `chartPoints` (the lots, the Vertex and the East Point only
 * when it has angles).
 */
export function chartLongitudes(chart: Chart, points: ChartPoints): ChartLongitude[] {
  const rows: ChartLongitude[] = chart.bodies.map((body) => ({
    name: body.body,
    kind: "body",
    lon: normalizeLongitude(body.lon)
  }));
  if (chart.angles) {
    const { asc, mc, dsc, ic } = chart.angles;
    rows.push(
      { name: "Ascendant", kind: "angle", lon: normalizeLongitude(asc) },
      { name: "Midheaven", kind: "angle", lon: normalizeLongitude(mc) },
      { name: "Descendant", kind: "angle", lon: normalizeLongitude(dsc) },
      { name: "Imum Coeli", kind: "angle", lon: normalizeLongitude(ic) }
    );
  }
  for (const point of points.points) {
    rows.push({ name: point.point, kind: "point", lon: normalizeLongitude(point.lon) });
  }
  return rows;
}

/** Every name {@link chartLongitudes} can return, for checks made before a chart is computed. */
const LONGITUDE_NAMES: readonly string[] = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
  "North Node", "South Node", "Ascendant", "Midheaven", "Descendant", "Imum Coeli",
  "Mean Node", "Mean South Node", "Black Moon Lilith", "Vertex", "East Point",
  "Lot of Fortune", "Lot of Spirit", "Lot of Eros", "Lot of Necessity", "Lot of Courage",
  "Lot of Victory", "Lot of Nemesis"
] satisfies readonly ChartLongitudeName[];

/** A body, angle or chart point name, or a RangeError; needs no chart. */
export function longitudeName(value: unknown, label: string): ChartLongitudeName {
  if (typeof value === "string" && LONGITUDE_NAMES.includes(value)) return value as ChartLongitudeName;
  throw new RangeError(`${label} must name a body, an angle or a chart point.`);
}

/** A named natal longitude, or a RangeError when the chart has no birth time and place for it. */
export function chartLongitude(chart: Chart, points: ChartPoints, name: ChartLongitudeName, label: string): ChartLongitude {
  const row = chartLongitudes(chart, points).find((candidate) => candidate.name === name);
  if (row) return row;
  throw new RangeError(`${label} "${name}" needs a chart with a birth time and place.`);
}

/**
 * Runs an ephemeris-bound computation. astronomy-engine throws strings, not
 * Errors, when it fails (its light-time solver stops converging about 23,000
 * years from 2000); those become RangeError. Errors pass unchanged.
 */
export function guarded<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new RangeError(`The ephemeris failed: ${String(error)}`, { cause: error });
  }
}

/** A Date for an epoch-millisecond value, refusing values outside the Date range. */
export function dateAt(milliseconds: number, label: string): Date {
  if (!Number.isFinite(milliseconds) || Math.abs(milliseconds) > MAX_DATE_MS) {
    throw new RangeError(`${label} falls outside the range of a JavaScript Date.`);
  }
  return new Date(milliseconds);
}
