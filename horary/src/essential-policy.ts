import type { Debility, EssentialDignity } from "./engine.js";
import { CONSIDERATION_SOURCES } from "./policy.js";

export const ESSENTIAL_DIGNITIES = Object.freeze([
  "domicile", "exaltation", "triplicity", "term", "face"
] as const satisfies readonly EssentialDignity[]);
export const ESSENTIAL_SCORE_RULES = Object.freeze([
  ...ESSENTIAL_DIGNITIES, "detriment", "fall", "peregrine"
] as const);
export type EssentialScoreRule = EssentialDignity | Debility | "peregrine";
/** False disables a scoring rule; zero is an enabled weight with no contribution. */
export type EssentialWeight = number | false;

export const ESSENTIAL_SCORE_SOURCE = Object.freeze({
  ...CONSIDERATION_SOURCES["moon-void-of-course"],
  id: "lilly-essential-weights",
  tradition: "Lilly's essential weights applied to the engine's dignity tables",
  locator: "Printed p. 115; PDF p. 142; essential dignities and debilities columns"
});
export const RECEPTION_SOURCE = Object.freeze({
  ...CONSIDERATION_SOURCES["moon-void-of-course"],
  id: "lilly-reception",
  tradition: "Lilly's reception by essential dignity; directional host/guest convention",
  locator: "Printed p. 112; PDF p. 139; reception and peregrine definitions"
});
export const ESSENTIAL_TABLE_CONVENTION = Object.freeze({
  domicileExaltation: "Ptolemy, Tetrabiblos I.17 and I.19",
  detriment: "Opposite domicile, al-Biruni, Book of Instruction section 442",
  triplicity: "Dorothean; chart-sect lord only; participating lord excluded",
  term: "Egyptian, Ptolemy, Tetrabiblos I.20",
  face: "Chaldean, al-Biruni, Book of Instruction sections 449 and 451",
  peregrine: "No essential dignity at the planet's own longitude, Lilly p. 112",
  sect: "Engine sectOf: ecliptic Sun at descendant is day; at Ascendant is night",
  score: "Add own-position contributions; no reception bonus; peregrine may coexist with debility",
  reference: "horary/SOURCES.md; docs/techniques.md"
});

export const DEFAULT_ESSENTIAL_WEIGHTS: Readonly<Record<EssentialScoreRule, number>> = Object.freeze({
  domicile: 5, exaltation: 4, triplicity: 3, term: 2, face: 1,
  detriment: -5, fall: -4, peregrine: -5
});

export interface EssentialPolicyInput {
  readonly weights?: Readonly<Partial<Record<EssentialScoreRule, EssentialWeight>>>;
  /** Empty disables receptions. Default: all five dignities, in catalog order. */
  readonly receptionDignities?: readonly EssentialDignity[];
}
export interface HoraryEssentialPolicy {
  readonly schema: "horary.essential-policy/v1";
  readonly weights: Readonly<Record<EssentialScoreRule, EssentialWeight>>;
  readonly receptionDignities: readonly EssentialDignity[];
}

function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Reflect.ownKeys(value).some((key) => typeof key !== "string" || !keys.includes(key))) {
    throw new RangeError(`${label} must be an object with supported fields.`);
  }
  return value as Record<string, unknown>;
}

export function createEssentialPolicy(input: EssentialPolicyInput = {}): HoraryEssentialPolicy {
  const options = object(input, ["weights", "receptionDignities"], "Essential policy options");
  const supplied = options.weights === undefined ? {} : object(options.weights, ESSENTIAL_SCORE_RULES, "Essential weights");
  const weights = {} as Record<EssentialScoreRule, EssentialWeight>;
  for (const rule of ESSENTIAL_SCORE_RULES) {
    const value = Object.hasOwn(supplied, rule) ? supplied[rule] : DEFAULT_ESSENTIAL_WEIGHTS[rule];
    if (value !== false && (typeof value !== "number" || !Number.isFinite(value))) {
      throw new RangeError("Essential weights must be finite numbers or false.");
    }
    weights[rule] = value as EssentialWeight;
  }
  const requested = options.receptionDignities === undefined ? ESSENTIAL_DIGNITIES : options.receptionDignities;
  if (!Array.isArray(requested) || Array.from(requested).some((name) => !ESSENTIAL_DIGNITIES.includes(name))) {
    throw new RangeError("Reception dignities must be a list of supported essential dignities.");
  }
  // Canonical order, no duplicate tests of the same dignity.
  const receptionDignities = ESSENTIAL_DIGNITIES.filter((name) => requested.includes(name));
  return Object.freeze({ schema: "horary.essential-policy/v1", weights: Object.freeze(weights),
    receptionDignities: Object.freeze(receptionDignities) });
}

export function validateEssentialPolicy(input: HoraryEssentialPolicy): HoraryEssentialPolicy {
  const policy = object(input, ["schema", "weights", "receptionDignities"], "Essential policy");
  if (policy.schema !== "horary.essential-policy/v1" || !Object.hasOwn(policy, "receptionDignities")) {
    throw new RangeError("Unsupported or incomplete essential policy snapshot.");
  }
  const weights = object(policy.weights, ESSENTIAL_SCORE_RULES, "Essential weights");
  if (!ESSENTIAL_SCORE_RULES.every((rule) => Object.hasOwn(weights, rule)) || policy.receptionDignities === undefined) {
    throw new RangeError("Essential policy snapshots must contain all weights and reception dignities.");
  }
  return createEssentialPolicy({ weights: weights as HoraryEssentialPolicy["weights"],
    receptionDignities: policy.receptionDignities as HoraryEssentialPolicy["receptionDignities"] });
}
