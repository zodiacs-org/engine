/*
 * Two charts of a relationship.
 *
 * The composite chart takes the midpoint of each pair of like points: John
 * Townley, The Composite Chart (1973), and Robert Hand, Planets in
 * Composite (Para Research, 1975). Ported from the Zodiacs.org site
 * (src/lib/composite.ts), with its convention for exact oppositions.
 *
 * The Davison chart is an ordinary chart cast for the midpoint in time between
 * the two births and a place between the two birthplaces: Ronald C. Davison,
 * Synastry: Understanding Human Relations Through Astrology (New York: ASI
 * Publishers, 1977). New here. None of these books was read for this work;
 * the definitions come from secondary accounts, and the place conventions are
 * this package's. See docs/techniques.md.
 */
import { natalChart, resolvedChart, utcOf } from "../api.js";
import type { NatalSource } from "../api.js";
import { ASPECT_BODY_SET, matchAspect } from "../aspects.js";
import { HOUSE_SYSTEMS } from "../houses.js";
import { midpoint } from "../points.js";
import type { AspectType, BodyName, Chart, HouseSystem } from "../types.js";
import { bodyName, finiteDegrees, oneOf, placeOf, readOptions, techniqueFlags } from "./shared.js";
import type { GeoPlace, TechniqueFlag } from "./shared.js";

/** A body's composite longitude, degrees in [0, 360). */
export interface CompositePosition {
  readonly body: BodyName;
  readonly lon: number;
}

/** An aspect between composite positions: they have no speeds, so no motion. */
export interface CompositeAspect {
  readonly a: BodyName;
  readonly b: BodyName;
  readonly type: AspectType;
  readonly orb: number;
}

export interface CompositeChart {
  readonly bodies: readonly CompositePosition[];
  readonly aspects: readonly CompositeAspect[];
}

function positions(list: unknown, label: string): { body: BodyName; lon: number }[] {
  if (!Array.isArray(list)) throw new RangeError(`${label} must be an array of { body, lon }.`);
  const seen = new Set<string>();
  return list.map((row: { body?: unknown; lon?: unknown } | null) => {
    const body = bodyName(row?.body, `${label}'s body`);
    if (seen.has(body)) throw new RangeError(`${label} names ${body} twice.`);
    seen.add(body);
    return { body, lon: finiteDegrees(row?.lon, `${label}'s ${body}`) };
  });
}

/**
 * The composite positions of the bodies in both lists, in the first list's
 * order: each pair's midpoint on the shorter arc; for exact opposites, the one
 * 90° east of the first list's longitude.
 */
export function compositeMidpoints(
  first: readonly { body: BodyName; lon: number }[],
  second: readonly { body: BodyName; lon: number }[]
): readonly CompositePosition[] {
  const b = new Map(positions(second, "second").map((row) => [row.body, row.lon]));
  const out: CompositePosition[] = [];
  for (const row of positions(first, "first")) {
    const other = b.get(row.body);
    if (other !== undefined) out.push(Object.freeze({ body: row.body, lon: midpoint(row.lon, other) }));
  }
  return Object.freeze(out);
}

/** The major aspects among the composite Sun to Pluto, with the natal orbs of `ASPECTS`, by orb. */
export function compositeAspects(points: readonly CompositePosition[]): readonly CompositeAspect[] {
  const list = positions(points, "points").filter((point) => ASPECT_BODY_SET.has(point.body));
  const out: CompositeAspect[] = [];
  list.forEach((a, i) => {
    for (const b of list.slice(i + 1)) {
      const match = matchAspect(a.body, a.lon, b.body, b.lon);
      if (match) out.push(Object.freeze({ a: a.body, b: b.body, type: match.definition.type, orb: match.orb }));
    }
  });
  return Object.freeze(out.sort((x, y) => x.orb - y.orb));
}

/** The composite of two charts or births: every body's midpoint and their aspects. No angles or houses. */
export function compositeChart(first: NatalSource, second: NatalSource): CompositeChart {
  const bodies = compositeMidpoints(resolvedChart(first).chart.bodies, resolvedChart(second).chart.bodies);
  return Object.freeze({ bodies, aspects: compositeAspects(bodies) });
}

/**
 * `"coordinates"`: the mean latitude and the longitude halfway along the
 * shorter arc. `"great-circle"`: halfway along the great circle.
 *
 * @experimental The conventions of a Davison chart here (the place's default,
 * the house system, a known time only when both are known) may change in a
 * minor release.
 */
export type DavisonPlaceConvention = "coordinates" | "great-circle";

/**
 * Options for davisonChart.
 *
 * @experimental The conventions of a Davison chart here (the place's default,
 * the house system, a known time only when both are known) may change in a
 * minor release.
 */
export interface DavisonOptions {
  /** `"coordinates"` by default. */
  place?: DavisonPlaceConvention | undefined;
  /** The first chart's by default. */
  houseSystem?: HouseSystem | undefined;
}

/**
 * A Davison chart, with the instant and the place it was cast for.
 *
 * @experimental The conventions of a Davison chart here (the place's default,
 * the house system, a known time only when both are known) may change in a
 * minor release.
 */
export interface DavisonChart {
  /** The mean of the two births' UTC instants, rounded down to the millisecond. */
  readonly instant: Date;
  /** Null unless both births have a place. */
  readonly location: GeoPlace | null;
  readonly place: DavisonPlaceConvention;
  /** Its time is known only when both births' are. */
  readonly chart: Chart;
  readonly flags: readonly TechniqueFlag[];
}

const PLACES: readonly DavisonPlaceConvention[] = ["coordinates", "great-circle"];
const DEG = Math.PI / 180;

/** Longitude east in (−180, 180]. */
function wrapLongitude(value: number): number {
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/**
 * The midpoint of two places. A place outside latitudes −90 to 90 and
 * longitudes −180 to 180, or a convention not named, throws a RangeError, and
 * so do antipodes, which have no great-circle midpoint.
 *
 * @experimental The conventions of a Davison chart here (the place's default,
 * the house system, a known time only when both are known) may change in a
 * minor release.
 */
export function davisonPlace(first: GeoPlace, second: GeoPlace, convention: DavisonPlaceConvention = "coordinates"): GeoPlace {
  const kind = oneOf(convention, PLACES, "coordinates", "convention");
  const a = placeOf(first, "first");
  const b = placeOf(second, "second");
  if (kind === "coordinates") {
    const east = (((b.longitude - a.longitude) % 360) + 360) % 360;
    return Object.freeze({
      latitude: (a.latitude + b.latitude) / 2,
      longitude: wrapLongitude(a.longitude + (east > 180 ? east - 360 : east) / 2)
    });
  }
  const vector = ({ latitude, longitude }: GeoPlace) => [
    Math.cos(latitude * DEG) * Math.cos(longitude * DEG),
    Math.cos(latitude * DEG) * Math.sin(longitude * DEG),
    Math.sin(latitude * DEG)
  ];
  const [x1 = 0, y1 = 0, z1 = 0] = vector(a);
  const [x2 = 0, y2 = 0, z2 = 0] = vector(b);
  const [x, y, z] = [x1 + x2, y1 + y2, z1 + z2];
  const horizontal = Math.hypot(x, y);
  if (Math.hypot(horizontal, z) < 1e-12) throw new RangeError("Antipodal places have no single great-circle midpoint.");
  // At a pole the longitude is undefined; it is given as 0.
  return Object.freeze({ latitude: Math.atan2(z, horizontal) / DEG, longitude: horizontal < 1e-15 ? 0 : wrapLongitude(Math.atan2(y, x) / DEG) });
}

/**
 * The Davison chart of two charts or births (Davison, 1977): a chart for the
 * midpoint in time and the midpoint in space of the two births.
 *
 * @experimental The conventions of a Davison chart here (the place's default,
 * the house system, a known time only when both are known) may change in a
 * minor release.
 */
export function davisonChart(first: NatalSource, second: NatalSource, options?: DavisonOptions): DavisonChart {
  const read = readOptions(options, ["place", "houseSystem"], "davisonChart options");
  const place = oneOf(read.place, PLACES, "coordinates", "place");
  const houseSystem = read.houseSystem === undefined ? undefined : oneOf(read.houseSystem, HOUSE_SYSTEMS, "whole", "houseSystem");
  const a = resolvedChart(first).chart.input;
  const b = resolvedChart(second).chart.input;
  const t1 = utcOf(a).getTime();
  const t2 = utcOf(b).getTime();
  const instant = Math.floor((t1 + t2) / 2);
  const location =
    a.latitude === undefined || a.longitude === undefined || b.latitude === undefined || b.longitude === undefined
      ? null
      : davisonPlace({ latitude: a.latitude, longitude: a.longitude }, { latitude: b.latitude, longitude: b.longitude }, place);
  const chart = natalChart({ utc: instant, houseSystem: houseSystem ?? a.houseSystem, timeKnown: a.timeKnown && b.timeKnown, ...(location ?? {}) });
  return Object.freeze({ instant: new Date(instant), location, place, chart, flags: techniqueFlags([t1, t2, instant]) });
}
