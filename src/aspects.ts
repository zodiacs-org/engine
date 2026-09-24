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

/** Whether an aspect's orb is shrinking, growing, or neither, at an instant. */
export type AspectMotion = "applying" | "separating" | "stationary";

/**
 * Below this relative speed, in degrees per day, two bodies are treated as
 * not moving against each other, and the aspect as neither applying nor
 * separating.
 */
export const STATIONARY_RELATIVE_SPEED = 1e-9;

/**
 * The motion of an aspect at the chart instant, from the two longitudes and
 * their speeds (degrees per day). It is applying when the orb is strictly
 * decreasing: the sign of the orb's rate of change, not a step forward in
 * time, decides. An exact aspect (orb 0) can only separate.
 */
export function aspectMotion(
  a: { lon: number; speed: number },
  b: { lon: number; speed: number },
  angle: number
): AspectMotion {
  const relative = a.speed - b.speed;
  if (!(Math.abs(relative) >= STATIONARY_RELATIVE_SPEED)) return "stationary";
  // Signed a − b in (−180, 180]; its magnitude is separation(a.lon, b.lon).
  const wrapped = (((a.lon - b.lon) % 360) + 360) % 360;
  const signed = wrapped > 180 ? wrapped - 360 : wrapped;
  const deviation = Math.abs(signed) - angle;
  if (deviation === 0) return "separating";
  // d|signed|/dt = sign(signed) × relative; the orb |deviation| follows it.
  return Math.sign(deviation) * Math.sign(signed) * relative < 0 ? "applying" : "separating";
}

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

      aspects.push({
        a: a.body,
        b: b.body,
        type: match.definition.type,
        orb: match.orb,
        applying: aspectMotion(a, b, match.definition.angle) === "applying"
      });
    }
  }

  return aspects.sort((a, b) => a.orb - b.orb);
}
