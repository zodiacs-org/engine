import { CLASSICAL_PLANETS } from "./engine.js";
import type { ClassicalPlanet } from "./engine.js";
import type { RuleSource } from "./policy.js";

export type ImpedimentRule = "prohibition" | "frustration" | "refranation";
const source = (rule: ImpedimentRule, locator: string): RuleSource => Object.freeze({
  id: `lilly-${rule};project-event-sequence`,
  tradition: `Lilly's ${rule}, with explicit project event and eligibility conventions`,
  reference: "William Lilly, Christian Astrology (first published 1647; linked edition 1659)",
  url: "https://pdfcoffee.com/william-lilly-christian-astrology-volume-1-pdf-free.html", locator
});
export const IMPEDIMENT_SOURCES = Object.freeze({
  prohibition: source("prohibition", "Printed pp. 109-110; definition and bodily/aspect intervention examples"),
  frustration: source("frustration", "Printed pp. 111-112; a heavier recipient joins another planet first"),
  refranation: source("refranation", "Printed p. 110; printed Refrenation, reversal before conjunction")
});
export interface ImpedimentPolicyInput {
  readonly prohibition?: boolean;
  readonly frustration?: boolean;
  readonly refranation?: boolean;
  readonly thirdPlanets?: readonly ClassicalPlanet[];
  /** General definition versus a stricter reading of the two-contact examples. */
  readonly prohibitionScope?: "either-principal" | "both-principals";
  /** Lilly's corporal definition versus a caller's broader aspect interpretation. */
  readonly frustrationScope?: "conjunction-only" | "enabled-aspects";
  /** Instantaneous absolute speed proxy for the lighter applicant's swiftness. */
  readonly swifterApplicant?: boolean;
  /** Third-contact and station-probe provider calls, independent of the aspect budget. */
  readonly maxSamples?: number;
  /** Separate budget passed to the existing station event scanner. */
  readonly stationMaxSamples?: number;
}
export interface HoraryImpedimentPolicy {
  readonly schema: "horary.impediment-policy/v1";
  readonly prohibition: boolean;
  readonly frustration: boolean;
  readonly refranation: boolean;
  readonly thirdPlanets: readonly ClassicalPlanet[];
  readonly prohibitionScope: "either-principal" | "both-principals";
  readonly frustrationScope: "conjunction-only" | "enabled-aspects";
  readonly swifterApplicant: boolean;
  readonly maxSamples: number;
  readonly stationMaxSamples: number;
}
const KEYS = ["prohibition", "frustration", "refranation", "thirdPlanets", "prohibitionScope",
  "frustrationScope", "swifterApplicant", "maxSamples", "stationMaxSamples"] as const;
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value) as typeof Object.prototype)) {
    throw new RangeError("Impediment policy requires ordinary objects.");
  }
  for (const key of Reflect.ownKeys(value)) {
    const slot = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !keys.includes(key) || !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError("Impediment policy has unsupported fields or non-data slots.");
    }
  }
  return value as Record<string, unknown>;
}
export function createImpedimentPolicy(input: ImpedimentPolicyInput = {}): HoraryImpedimentPolicy {
  const options = object(input, KEYS);
  const toggle = (key: string) => {
    const value = options[key] === undefined ? true : options[key];
    if (typeof value !== "boolean") throw new RangeError("Impediment toggles must be boolean.");
    return value;
  };
  const choice = <T extends string>(key: string, allowed: readonly T[]): T => {
    const value = options[key] === undefined ? allowed[0] : options[key];
    if (!allowed.includes(value as T)) throw new RangeError("Unsupported impediment interpretation.");
    return value as T;
  };
  const budget = (key: string, fallback: number) => {
    const value = options[key] === undefined ? fallback : options[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 1_000_000) {
      throw new RangeError("Impediment budgets must be positive integers at most 1,000,000.");
    }
    return value;
  };
  const requested = options.thirdPlanets === undefined ? CLASSICAL_PLANETS : options.thirdPlanets;
  if (!Array.isArray(requested) || requested.length > CLASSICAL_PLANETS.length) throw new RangeError("Invalid third planet list.");
  for (let i = 0; i < requested.length; i++) {
    const slot = Object.getOwnPropertyDescriptor(requested, String(i));
    if (!slot || !("value" in slot) || !CLASSICAL_PLANETS.includes(slot.value as ClassicalPlanet)) throw new RangeError("Invalid third planet entry.");
  }
  return Object.freeze({ schema: "horary.impediment-policy/v1", prohibition: toggle("prohibition"),
    frustration: toggle("frustration"), refranation: toggle("refranation"), swifterApplicant: toggle("swifterApplicant"),
    thirdPlanets: Object.freeze(CLASSICAL_PLANETS.filter(planet => requested.includes(planet))),
    prohibitionScope: choice("prohibitionScope", ["either-principal", "both-principals"]),
    frustrationScope: choice("frustrationScope", ["conjunction-only", "enabled-aspects"]),
    maxSamples: budget("maxSamples", 200_000), stationMaxSamples: budget("stationMaxSamples", 20_000) });
}
export function validateImpedimentPolicy(input: HoraryImpedimentPolicy): HoraryImpedimentPolicy {
  const options = object(input, ["schema", ...KEYS]);
  if (options.schema !== "horary.impediment-policy/v1" || KEYS.some(key => !Object.hasOwn(options, key) || options[key] === undefined)) {
    throw new RangeError("Unsupported or incomplete impediment policy snapshot.");
  }
  const { schema: _schema, ...rest } = options;
  return createImpedimentPolicy(rest as ImpedimentPolicyInput);
}
