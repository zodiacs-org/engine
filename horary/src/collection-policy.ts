import { CLASSICAL_PLANETS } from "./engine.js";
import type { ClassicalPlanet, EssentialDignity } from "./engine.js";
import type { RuleSource } from "./policy.js";
import { TRANSLATION_WEIGHT_ORDER } from "./translation-policy.js";

export const COLLECTION_WEIGHT_ORDER = TRANSLATION_WEIGHT_ORDER;
export const COLLECTION_SOURCE: RuleSource = Object.freeze({
  id: "lilly-collection;project-converging-contacts",
  tradition: "Lilly's collection of light, with explicit project reception and eligibility choices",
  reference: "William Lilly, Christian Astrology (first published 1647; linked edition 1659)",
  url: "https://pdfcoffee.com/william-lilly-christian-astrology-volume-1-pdf-free.html",
  locator: "Printed p. 126, Collection; p. 113, planetary weight"
});
export type CollectionReceptionDirection = "principals-receive-collector" | "collector-receives-principals";
export interface CollectionPolicyInput {
  readonly collectionOfLight?: boolean;
  readonly collectors?: readonly ClassicalPlanet[];
  readonly heavierPlanet?: boolean;
  /** Absolute question-time speed proxy; not implied by sphere order. */
  readonly slowerPlanet?: boolean;
  /** Project reading of not beholding: no current enabled in-orb major aspect. */
  readonly principalsNotAspecting?: boolean;
  readonly receptionDirection?: CollectionReceptionDirection;
  /** Empty disables reception requirements. Both directions remain evidence. */
  readonly receptionDignities?: readonly EssentialDignity[];
  /** Global longitude-provider-call budget, two per relative sample. */
  readonly maxSamples?: number;
}
export interface HoraryCollectionPolicy {
  readonly schema: "horary.collection-policy/v1";
  readonly collectionOfLight: boolean;
  readonly collectors: readonly ClassicalPlanet[];
  readonly heavierPlanet: boolean;
  readonly slowerPlanet: boolean;
  readonly principalsNotAspecting: boolean;
  readonly receptionDirection: CollectionReceptionDirection;
  readonly receptionDignities: readonly EssentialDignity[];
  readonly maxSamples: number;
}
const KEYS = ["collectionOfLight", "collectors", "heavierPlanet", "slowerPlanet", "principalsNotAspecting",
  "receptionDirection", "receptionDignities", "maxSamples"] as const;
const DIGNITIES: readonly EssentialDignity[] = ["domicile", "exaltation", "triplicity", "term", "face"];
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value) as typeof Object.prototype)) {
    throw new RangeError("Collection policy requires ordinary objects.");
  }
  for (const key of Reflect.ownKeys(value)) {
    const slot = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !keys.includes(key) || !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError("Collection policy has unsupported fields or non-data slots.");
    }
  }
  return value as Record<string, unknown>;
}
function list<T extends string>(value: unknown, allowed: readonly T[]): readonly T[] {
  if (!Array.isArray(value) || value.length > allowed.length) throw new RangeError("Invalid collection policy list.");
  for (let i = 0; i < value.length; i++) {
    const slot = Object.getOwnPropertyDescriptor(value, String(i));
    if (!slot || !("value" in slot) || !allowed.includes(slot.value as T)) throw new RangeError("Invalid collection policy list entry.");
  }
  return Object.freeze(allowed.filter(item => value.includes(item)));
}
export function createCollectionPolicy(input: CollectionPolicyInput = {}): HoraryCollectionPolicy {
  const options = object(input, KEYS);
  const toggle = (key: string) => {
    const value = options[key] === undefined ? true : options[key];
    if (typeof value !== "boolean") throw new RangeError("Collection toggles must be boolean.");
    return value;
  };
  const direction = options.receptionDirection === undefined ? "principals-receive-collector" : options.receptionDirection;
  if (direction !== "principals-receive-collector" && direction !== "collector-receives-principals") {
    throw new RangeError("Unsupported collection reception direction.");
  }
  const maxSamples = options.maxSamples === undefined ? 200_000 : options.maxSamples;
  if (typeof maxSamples !== "number" || !Number.isInteger(maxSamples) || maxSamples < 1 || maxSamples > 1_000_000) {
    throw new RangeError("Collection budget must be a positive integer at most 1,000,000.");
  }
  return Object.freeze({ schema: "horary.collection-policy/v1", collectionOfLight: toggle("collectionOfLight"),
    collectors: list(options.collectors === undefined ? CLASSICAL_PLANETS : options.collectors, CLASSICAL_PLANETS),
    heavierPlanet: toggle("heavierPlanet"), slowerPlanet: toggle("slowerPlanet"),
    principalsNotAspecting: toggle("principalsNotAspecting"), receptionDirection: direction,
    receptionDignities: list(options.receptionDignities === undefined ? DIGNITIES : options.receptionDignities, DIGNITIES), maxSamples });
}
export function validateCollectionPolicy(input: HoraryCollectionPolicy): HoraryCollectionPolicy {
  const options = object(input, ["schema", ...KEYS]);
  if (options.schema !== "horary.collection-policy/v1" || KEYS.some(key => !Object.hasOwn(options, key) || options[key] === undefined)) {
    throw new RangeError("Unsupported or incomplete collection policy snapshot.");
  }
  const { schema: _schema, ...rest } = options;
  return createCollectionPolicy(rest as CollectionPolicyInput);
}
