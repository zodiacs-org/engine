/*
 * Composite positions and their aspects: the midpoint of each pair of like
 * points (John Townley, The Composite Chart, 1973; Robert Hand, Planets in
 * Composite, Para Research, 1975), ported from the Zodiacs.org site
 * (src/lib/composite.ts) with its convention for exact oppositions. Neither
 * book was read for this work; the definition comes from secondary accounts
 * (docs/techniques.md). Moved from relationship.ts, which re-exports these
 * names and casts compositeChart from them, so that they reach no module that
 * loads the ephemeris.
 */
import { ASPECT_BODY_SET, matchAspect } from "../aspects.js";
import { midpoint } from "../points.js";
import type { AspectType, BodyName } from "../types.js";
import { bodyName, finiteDegrees } from "./names.js";

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
