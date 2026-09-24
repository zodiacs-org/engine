import { ASPECT_BODIES, matchAspect } from "./aspects.js";
import { signForLongitude } from "./signs.js";
import type {
  AspectType,
  Element,
  InterAspect,
  MinimalBody,
  Modality,
  PairSummary
} from "./types.js";

export function findInterAspects(
  first: readonly MinimalBody[],
  second: readonly MinimalBody[]
): InterAspect[] {
  const aBodies = first.filter((body) => ASPECT_BODIES.has(body.body));
  const bBodies = second.filter((body) => ASPECT_BODIES.has(body.body));
  const aspects: InterAspect[] = [];

  for (const a of aBodies) {
    for (const b of bBodies) {
      const match = matchAspect(a.body, a.lon, b.body, b.lon);
      if (!match) continue;
      aspects.push({
        a: a.body,
        aLon: a.lon,
        b: b.body,
        bLon: b.lon,
        type: match.definition.type,
        orb: match.orb
      });
    }
  }
  return aspects.sort((a, b) => a.orb - b.orb);
}

export function elementBalance(bodies: readonly MinimalBody[]): Record<Element, number> {
  const balance: Record<Element, number> = {
    fire: 0,
    earth: 0,
    air: 0,
    water: 0
  };
  for (const body of bodies) {
    if (!ASPECT_BODIES.has(body.body)) continue;
    balance[signForLongitude(body.lon).element] += 1;
  }
  return balance;
}

export function modalityBalance(bodies: readonly MinimalBody[]): Record<Modality, number> {
  const balance: Record<Modality, number> = {
    cardinal: 0,
    fixed: 0,
    mutable: 0
  };
  for (const body of bodies) {
    if (!ASPECT_BODIES.has(body.body)) continue;
    balance[signForLongitude(body.lon).modality] += 1;
  }
  return balance;
}

export function summarizePair(
  first: readonly MinimalBody[],
  second: readonly MinimalBody[],
  topCount = 8
): PairSummary {
  if (!Number.isInteger(topCount) || topCount < 0) {
    throw new RangeError("topCount must be a non-negative integer.");
  }
  const aspects = findInterAspects(first, second);
  const counts: Record<AspectType, number> = {
    conjunction: 0,
    sextile: 0,
    square: 0,
    trine: 0,
    opposition: 0
  };
  for (const aspect of aspects) counts[aspect.type] += 1;

  return {
    aspects,
    top: aspects.slice(0, topCount),
    counts,
    easeful: counts.trine + counts.sextile,
    charged: counts.square + counts.opposition,
    elements: {
      a: elementBalance(first),
      b: elementBalance(second)
    },
    modalities: {
      a: modalityBalance(first),
      b: modalityBalance(second)
    }
  };
}
