import { ASPECT_TYPES, CLASSICAL_PLANETS } from "./engine.js";
import type { AspectType, ClassicalPlanet, EssentialDignity } from "./engine.js";
import type { RuleSource } from "./policy.js";

export const TRANSLATION_SOURCE: RuleSource = Object.freeze({
  id: "lilly-translation;project-contact-sequence",
  tradition: "Lilly's translation of light, with explicit project eligibility choices",
  reference: "William Lilly, Christian Astrology (first published 1647; linked edition 1659)",
  url: "https://pdfcoffee.com/william-lilly-christian-astrology-volume-1-pdf-free.html",
  locator: "Printed pp. 111 (definition), 113 (planetary weight) and 125-126 (translation as perfection)"
});

// Traditional geocentric sphere order, lightest first, not a table of measured speeds.
export const TRANSLATION_WEIGHT_ORDER: readonly ClassicalPlanet[] = Object.freeze([
  "Moon", "Mercury", "Venus", "Sun", "Mars", "Jupiter", "Saturn"
]);
export interface TranslationPolicyInput {
  readonly translationOfLight?: boolean;
  readonly carriers?: readonly ClassicalPlanet[];
  /** Require the carrier to be lighter in the traditional sphere order than both principals. */
  readonly lighterPlanet?: boolean;
  /** Require greater absolute question-time speed than each principal, an explicit project proxy. */
  readonly swifterPlanet?: boolean;
  readonly principalSeparation?: boolean;
  readonly principalAspects?: readonly AspectType[];
  /** Empty disables source-to-carrier reception checking; evaluated at the question instant. */
  readonly receptionDignities?: readonly EssentialDignity[];
  readonly uninterrupted?: boolean;
  /** Positive elapsed UTC days before the question, at most 366. */
  readonly lookbackDays?: number;
  /** Global longitude-provider-call budget, including two calls for each relative sample. */
  readonly maxSamples?: number;
}
export interface HoraryTranslationPolicy {
  readonly schema: "horary.translation-policy/v1";
  readonly translationOfLight: boolean;
  readonly carriers: readonly ClassicalPlanet[];
  readonly lighterPlanet: boolean;
  readonly swifterPlanet: boolean;
  readonly principalSeparation: boolean;
  readonly principalAspects: readonly AspectType[];
  readonly receptionDignities: readonly EssentialDignity[];
  readonly uninterrupted: boolean;
  readonly lookbackDays: number;
  readonly maxSamples: number;
}
const KEYS = ["translationOfLight", "carriers", "lighterPlanet", "swifterPlanet", "principalSeparation",
  "principalAspects", "receptionDignities", "uninterrupted", "lookbackDays", "maxSamples"] as const;
const DIGNITIES: readonly EssentialDignity[] = ["domicile", "exaltation", "triplicity", "term", "face"];
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value) as typeof Object.prototype)) {
    throw new RangeError("Translation policy requires ordinary objects.");
  }
  for (const key of Reflect.ownKeys(value)) {
    const slot = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !keys.includes(key) || !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError("Translation policy has unsupported fields or non-data slots.");
    }
  }
  return value as Record<string, unknown>;
}
function list<T extends string>(value: unknown, allowed: readonly T[]): readonly T[] {
  if (!Array.isArray(value) || value.length > allowed.length) throw new RangeError("Invalid translation policy list.");
  for (let i = 0; i < value.length; i++) {
    const slot = Object.getOwnPropertyDescriptor(value, String(i));
    if (!slot || !("value" in slot) || !allowed.includes(slot.value as T)) throw new RangeError("Invalid translation policy list entry.");
  }
  return Object.freeze(allowed.filter(item => value.includes(item)));
}
export function createTranslationPolicy(input: TranslationPolicyInput = {}): HoraryTranslationPolicy {
  const options = object(input, KEYS);
  const toggle = (key: string) => {
    const value = options[key] === undefined ? true : options[key];
    if (typeof value !== "boolean") throw new RangeError("Translation toggles must be boolean.");
    return value;
  };
  const lookbackDays = options.lookbackDays === undefined ? 7 : options.lookbackDays;
  const maxSamples = options.maxSamples === undefined ? 200_000 : options.maxSamples;
  if (typeof lookbackDays !== "number" || !Number.isFinite(lookbackDays) || lookbackDays < 1 / 86_400_000 || lookbackDays > 366) {
    throw new RangeError("Translation lookback must be from a millisecond to 366 UTC days.");
  }
  if (typeof maxSamples !== "number" || !Number.isInteger(maxSamples) || maxSamples < 1 || maxSamples > 1_000_000) {
    throw new RangeError("Translation budget must be a positive integer at most 1,000,000.");
  }
  return Object.freeze({ schema: "horary.translation-policy/v1", translationOfLight: toggle("translationOfLight"),
    carriers: list(options.carriers === undefined ? CLASSICAL_PLANETS : options.carriers, CLASSICAL_PLANETS),
    lighterPlanet: toggle("lighterPlanet"), swifterPlanet: toggle("swifterPlanet"),
    principalSeparation: toggle("principalSeparation"),
    principalAspects: list(options.principalAspects === undefined ? ["conjunction", "sextile", "trine"] : options.principalAspects, ASPECT_TYPES),
    receptionDignities: list(options.receptionDignities === undefined ? ["domicile", "triplicity", "term"] : options.receptionDignities, DIGNITIES),
    uninterrupted: toggle("uninterrupted"), lookbackDays, maxSamples });
}
export function validateTranslationPolicy(input: HoraryTranslationPolicy): HoraryTranslationPolicy {
  const options = object(input, ["schema", ...KEYS]);
  if (options.schema !== "horary.translation-policy/v1" || KEYS.some(key => !Object.hasOwn(options, key) || options[key] === undefined)) {
    throw new RangeError("Unsupported or incomplete translation policy snapshot.");
  }
  const { schema: _schema, ...rest } = options;
  return createTranslationPolicy(rest as TranslationPolicyInput);
}
