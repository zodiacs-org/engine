import { ASPECTS, ASPECT_TYPES, STATIONARY_RELATIVE_SPEED } from "./engine.js";
import type { AspectType } from "./engine.js";
import type { RuleSource } from "./policy.js";

export const ASPECT_MOTION_SOURCE: RuleSource = Object.freeze({
  id: "lilly-application;engine-instantaneous-motion",
  tradition: "Lilly's longitude contacts, with engine instantaneous orb-rate semantics",
  reference: "William Lilly, Christian Astrology (1647), Book I",
  url: "https://pdfcoffee.com/william-lilly-christian-astrology-volume-1-pdf-free.html",
  locator: "Printed pp. 106-110; aspect, application and separation definitions"
});

export const ASPECT_SEARCH_METHOD = Object.freeze({
  engineClassification: "findConfiguredAspects;exact-binary64",
  engineSearch: "searchLongitudeCrossingsWith;relative-longitude-a-minus-b",
  interval: "(question-instant,horizon-end]",
  verification: "sampled;not-proven-complete",
  budgetUnit: "relative-longitude-evaluations;two-provider-calls-per-evaluation",
  limitations: Object.freeze([
    "The solver assumes smooth relative motion, at most one turn in two steps and offsets below 90 degrees around a root.",
    "Caller motion or engine clock discontinuities can violate those assumptions; a completed scan is not proof of completeness.",
    "The engine refines brackets by 24 bisections and merges roots less than one second apart within each directed branch.",
    "Search roots use rounded relative longitude and millisecond Dates; instantaneous classification uses exact binary arithmetic.",
    "No sign-exit, station, reception or intervening-contact eligibility is decided by this report.",
    "A missing contact applies only to this horizon and sampling method; it establishes no outcome.",
    "Current geometry is read from the supplied chart and is not authenticated against the search provider."
  ])
} as const);

export interface AspectSearchPolicyInput {
  /** Empty disables all aspect types. Only the engine's five major aspects are supported. */
  readonly aspects?: readonly AspectType[];
  /** Inclusive degrees. Defaults to the engine's aspect-specific orbs, not Lilly's moieties. */
  readonly orbs?: Readonly<Partial<Record<AspectType, number>>>;
  readonly luminaryOrbs?: Readonly<Partial<Record<AspectType, number>>>;
  readonly stationaryRelativeSpeed?: number;
  readonly search?: boolean;
  /** Elapsed UTC days, positive and at most 366. */
  readonly horizonDays?: number;
  /** Coarse step, at least a millisecond and at most one day. */
  readonly stepDays?: number;
  /** Global relative-evaluation budget for the whole report, at most 1,000,000. */
  readonly maxSamples?: number;
}

export interface HoraryAspectPolicy {
  readonly schema: "horary.aspect-policy/v1";
  readonly aspects: readonly AspectType[];
  readonly orbs: Readonly<Record<AspectType, number>>;
  readonly luminaryOrbs: Readonly<Record<AspectType, number>>;
  readonly stationaryRelativeSpeed: number;
  readonly search: boolean;
  readonly horizonDays: number;
  readonly stepDays: number;
  readonly maxSamples: number;
}

const KEYS = ["aspects", "orbs", "luminaryOrbs", "stationaryRelativeSpeed", "search", "horizonDays", "stepDays", "maxSamples"];
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value) as typeof Object.prototype)) {
    throw new RangeError("Aspect policy requires ordinary objects.");
  }
  for (const key of Reflect.ownKeys(value)) {
    const slot = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !keys.includes(key) || !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError("Aspect policy has unsupported fields or non-data slots.");
    }
  }
  return value as Record<string, unknown>;
}
function number(value: unknown, low: number, high: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) {
    throw new RangeError("Aspect policy number is outside its finite range.");
  }
  return value === 0 ? 0 : value;
}

/** Independent frozen snapshot; defaults are engine/project choices described in SOURCES.md. */
export function createAspectSearchPolicy(input: AspectSearchPolicyInput = {}): HoraryAspectPolicy {
  const options = object(input, KEYS);
  const requested = options.aspects === undefined ? ASPECT_TYPES : options.aspects;
  if (!Array.isArray(requested) || requested.length > ASPECT_TYPES.length) {
    throw new RangeError("Aspects must be a list of the five major aspect types.");
  }
  for (let i = 0; i < requested.length; i++) {
    const slot = Object.getOwnPropertyDescriptor(requested, String(i));
    if (!slot || !("value" in slot) || !ASPECT_TYPES.includes(slot.value as AspectType)) {
      throw new RangeError("Aspects must contain ordinary major aspect entries.");
    }
  }
  const supplied = options.orbs === undefined ? {} : object(options.orbs, ASPECT_TYPES);
  const luminary = options.luminaryOrbs === undefined ? {} : object(options.luminaryOrbs, ASPECT_TYPES);
  const orbs = {} as Record<AspectType, number>, luminaryOrbs = {} as Record<AspectType, number>;
  for (const definition of ASPECTS) {
    orbs[definition.type] = number(Object.hasOwn(supplied, definition.type) ? supplied[definition.type] : definition.orb, 0, 180);
    luminaryOrbs[definition.type] = number(Object.hasOwn(luminary, definition.type) ? luminary[definition.type] : definition.luminaryOrb, 0, 180);
  }
  const search = options.search === undefined ? true : options.search;
  if (typeof search !== "boolean") throw new RangeError("Aspect search toggle must be boolean.");
  const maxSamples = number(options.maxSamples === undefined ? 20_000 : options.maxSamples, 1, 1_000_000);
  if (!Number.isInteger(maxSamples)) throw new RangeError("Aspect sample budget must be an integer.");
  return Object.freeze({ schema: "horary.aspect-policy/v1",
    aspects: Object.freeze(ASPECT_TYPES.filter(type => requested.includes(type))),
    orbs: Object.freeze(orbs), luminaryOrbs: Object.freeze(luminaryOrbs), search,
    stationaryRelativeSpeed: number(options.stationaryRelativeSpeed === undefined ? STATIONARY_RELATIVE_SPEED : options.stationaryRelativeSpeed, 0, Number.MAX_VALUE),
    horizonDays: number(options.horizonDays === undefined ? 30 : options.horizonDays, 1 / 86_400_000, 366),
    stepDays: number(options.stepDays === undefined ? 0.25 : options.stepDays, 1 / 86_400_000, 1), maxSamples });
}

export function validateAspectSearchPolicy(input: HoraryAspectPolicy): HoraryAspectPolicy {
  const value = object(input, ["schema", ...KEYS]);
  if (value.schema !== "horary.aspect-policy/v1" || KEYS.some(key => !Object.hasOwn(value, key) || value[key] === undefined)) {
    throw new RangeError("Unsupported or incomplete aspect policy snapshot.");
  }
  for (const key of ["orbs", "luminaryOrbs"]) {
    const orbs = object(value[key], ASPECT_TYPES);
    if (ASPECT_TYPES.some(type => !Object.hasOwn(orbs, type))) throw new RangeError("Incomplete aspect orb snapshot.");
  }
  const { schema: _schema, ...options } = value;
  return createAspectSearchPolicy(options as AspectSearchPolicyInput);
}
