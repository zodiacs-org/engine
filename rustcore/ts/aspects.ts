// Aspect metadata and JavaScript result allocation. Numeric decisions are Rust's.
import * as wasm from "../pkg/zodiacs_rustcore.js";
import { ready } from "./runtime.js";
import { checkedAspectPositions, CONFIGURED_ASPECTS_SCHEMA } from "./aspect-policy.js";
import type { AspectPolicy, AspectPosition, ConfiguredAspect, ConfiguredAspectResult } from "./aspect-policy.js";
import type { AspectDefinition, AspectMotion } from "../../src/aspects.js";
import type { Aspect, AspectType, BodyPosition, InterAspect, MinimalBody } from "../../src/types.js";

export {
  ASPECT_POLICY_SCHEMA, CONFIGURED_ASPECTS_SCHEMA, CONFIGURED_ASPECT_ANGLES,
  DEFAULT_ASPECT_POLICY, createAspectPolicy
} from "./aspect-policy.js";
export type {
  AspectOrbLimits, AspectOrbInput, AspectRuleInput, ResolvedAspectRule, AspectPolicyInput,
  AspectPolicy, AspectPosition, ConfiguredAspect, ConfiguredAspectResult, ConfiguredAspectMotion
} from "./aspect-policy.js";
export type { AspectDefinition, AspectMotion, Aspect, AspectType, InterAspect, MinimalBody };

export const ASPECT_TYPES = Object.freeze([
  "conjunction", "sextile", "square", "trine", "opposition"
] as const) satisfies readonly AspectType[];
export const ASPECTS = Object.freeze([
  Object.freeze({ type: "conjunction", angle: 0, orb: 8, luminaryOrb: 10 } as const),
  Object.freeze({ type: "sextile", angle: 60, orb: 4, luminaryOrb: 5 } as const),
  Object.freeze({ type: "square", angle: 90, orb: 7, luminaryOrb: 8 } as const),
  Object.freeze({ type: "trine", angle: 120, orb: 7, luminaryOrb: 8 } as const),
  Object.freeze({ type: "opposition", angle: 180, orb: 8, luminaryOrb: 10 } as const)
] as const) satisfies readonly AspectDefinition[];
const PHYSICAL_BODIES = Object.freeze([
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"
] as const);
const BODY_SET: ReadonlySet<string> = new Set(PHYSICAL_BODIES);
export const ASPECT_BODIES: ReadonlySet<string> = new Set(PHYSICAL_BODIES);
export const STATIONARY_RELATIVE_SPEED = 1e-9;
const MOTIONS: readonly AspectMotion[] = ["applying", "separating", "stationary"];

export function aspectMotion(
  a: { lon: number; speed: number }, b: { lon: number; speed: number }, angle: number
): AspectMotion {
  ready();
  return MOTIONS[wasm.aspectMotion(a.lon, a.speed, b.lon, b.speed, angle)]!;
}

export function matchAspect(
  aBody: string, aLongitude: number, bBody: string, bLongitude: number
): { definition: AspectDefinition; orb: number } | null {
  ready();
  const match = wasm.matchAspect(
    aBody === "Sun" || aBody === "Moon", aLongitude,
    bBody === "Sun" || bBody === "Moon", bLongitude
  );
  return match ? { definition: ASPECTS[match[0]!]!, orb: match[1]! } : null;
}

function bodyIndex(body: string): number {
  return (PHYSICAL_BODIES as readonly string[]).indexOf(body);
}

export function findAspects(bodies: readonly BodyPosition[]): Aspect[] {
  ready();
  const candidates = bodies.filter(row => BODY_SET.has(row.body));
  const input = Float64Array.from(candidates.flatMap(row => [bodyIndex(row.body), row.lon, row.speed]));
  const values = wasm.findAspects(input);
  const aspects: Aspect[] = [];
  for (let i = 0; i < values.length; i += 5) {
    aspects.push({ a: PHYSICAL_BODIES[values[i]!]!, b: PHYSICAL_BODIES[values[i + 1]!]!,
      type: ASPECT_TYPES[values[i + 2]!]!, orb: values[i + 3]!, applying: values[i + 4] === 1 });
  }
  return aspects;
}

export function findInterAspects(first: readonly MinimalBody[], second: readonly MinimalBody[]): InterAspect[] {
  ready();
  const encode = (rows: readonly MinimalBody[]) => Float64Array.from(
    rows.filter(row => BODY_SET.has(row.body)).flatMap(row => [bodyIndex(row.body), row.lon])
  );
  const values = wasm.findInterAspects(encode(first), encode(second));
  const aspects: InterAspect[] = [];
  for (let i = 0; i < values.length; i += 6) {
    aspects.push({ a: PHYSICAL_BODIES[values[i]!]!, aLon: values[i + 1]!,
      b: PHYSICAL_BODIES[values[i + 2]!]!, bLon: values[i + 3]!,
      type: ASPECT_TYPES[values[i + 4]!]!, orb: values[i + 5]! });
  }
  return aspects;
}

export function findConfiguredAspects(positions: readonly AspectPosition[], policy: AspectPolicy): ConfiguredAspectResult {
  ready();
  const rows = checkedAspectPositions(positions, policy);
  // Encode identifiers by index, never UTF-8: JS labels may contain lone UTF-16
  // surrogates and must remain distinct from U+FFFD. Only Sun/Moon affect maths.
  const labels = ["Sun", "Moon"];
  const ids = new Map(labels.map((label, index) => [label, index]));
  const id = (label: string): number => {
    let value = ids.get(label);
    if (value === undefined) { value = labels.length; labels.push(label); ids.set(label, value); }
    return value;
  };
  const selected = Float64Array.from(policy.bodies.map(id));
  const input = Float64Array.from(rows.flatMap(row => [id(row.body), row.lon, row.speed]));
  const rules = Float64Array.from(policy.aspects.flatMap(rule => [
    rule.angle, rule.orb.applying, rule.orb.separating, rule.orb.stationary,
    rule.luminaryOrb === undefined ? 0 : 1,
    rule.luminaryOrb?.applying ?? 0, rule.luminaryOrb?.separating ?? 0, rule.luminaryOrb?.stationary ?? 0
  ]));
  const caps = Float64Array.from(Object.entries(policy.bodyOrbs).flatMap(([body, orb]) => [
    id(body), orb.applying, orb.separating, orb.stationary
  ]));
  const values = wasm.findConfiguredAspects(input, selected, rules, caps, policy.stationaryRelativeSpeed);
  const aspects: ConfiguredAspect[] = [];
  for (let i = 0; i < values.length; i += 7) {
    const definition = policy.aspects[values[i + 2]!]!;
    const motion = MOTIONS[values[i + 6]!]!;
    aspects.push(Object.freeze({ a: labels[values[i]!]!, b: labels[values[i + 1]!]!,
      type: definition.type, angle: values[i + 3]!, orb: values[i + 4]!, maximumOrb: values[i + 5]!,
      motion, applying: motion === "applying" }));
  }
  return Object.freeze({ schema: CONFIGURED_ASPECTS_SCHEMA, policy, aspects: Object.freeze(aspects) });
}
