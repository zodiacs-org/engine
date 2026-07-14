import type { Aspect, AspectType, BodyPosition } from "./types.js";

export interface AspectDefinition {
  type: AspectType;
  angle: number;
  orb: number;
  luminaryOrb: number;
}

export const ASPECT_TYPES = [
  "conjunction",
  "sextile",
  "square",
  "trine",
  "opposition"
] as const satisfies readonly AspectType[];

export const ASPECTS = [
  { type: "conjunction", angle: 0, orb: 8, luminaryOrb: 10 },
  { type: "sextile", angle: 60, orb: 4, luminaryOrb: 5 },
  { type: "square", angle: 90, orb: 7, luminaryOrb: 8 },
  { type: "trine", angle: 120, orb: 7, luminaryOrb: 8 },
  { type: "opposition", angle: 180, orb: 8, luminaryOrb: 10 }
] as const satisfies readonly AspectDefinition[];

const LUMINARIES = new Set(["Sun", "Moon"]);
export const ASPECT_BODIES = new Set([
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto"
]);

/** Unsigned angular separation in [0, 180]. */
export function separation(a: number, b: number): number {
  const difference = Math.abs((((a - b) % 360) + 360) % 360);
  return difference > 180 ? 360 - difference : difference;
}

export function matchAspect(
  aBody: string,
  aLongitude: number,
  bBody: string,
  bLongitude: number
): { definition: AspectDefinition; orb: number } | null {
  const distance = separation(aLongitude, bLongitude);
  const hasLuminary = LUMINARIES.has(aBody) || LUMINARIES.has(bBody);
  let best: { definition: AspectDefinition; orb: number } | null = null;

  for (const definition of ASPECTS) {
    const orb = Math.abs(distance - definition.angle);
    const maximum = hasLuminary ? definition.luminaryOrb : definition.orb;
    if (orb <= maximum && (!best || orb < best.orb)) {
      best = { definition, orb };
    }
  }
  return best;
}

export function findAspects(bodies: readonly BodyPosition[]): Aspect[] {
  const candidates = bodies.filter((body) => ASPECT_BODIES.has(body.body));
  const aspects: Aspect[] = [];

  for (let first = 0; first < candidates.length; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      const a = candidates[first];
      const b = candidates[second];
      if (!a || !b) continue;
      const match = matchAspect(a.body, a.lon, b.body, b.lon);
      if (!match) continue;

      const stepDays = 0.02;
      const nextSeparation = separation(a.lon + a.speed * stepDays, b.lon + b.speed * stepDays);
      aspects.push({
        a: a.body,
        b: b.body,
        type: match.definition.type,
        orb: match.orb,
        applying: Math.abs(nextSeparation - match.definition.angle) < match.orb
      });
    }
  }

  return aspects.sort((a, b) => a.orb - b.orb);
}
