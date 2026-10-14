import { CLASSICAL_PLANETS } from "./engine.js";
import type { ClassicalPlanet } from "./engine.js";
import { ESSENTIAL_SCORE_SOURCE } from "./essential-policy.js";
import type { RuleSource } from "./policy.js";

export const ACCIDENTAL_SCORE_RULES = Object.freeze([
  "house-1", "house-2", "house-3", "house-4", "house-5", "house-6",
  "house-7", "house-8", "house-9", "house-10", "house-11", "house-12",
  "direct", "retrograde", "swift", "slow", "in-sect", "out-of-sect"
] as const);
export type AccidentalScoreRule = typeof ACCIDENTAL_SCORE_RULES[number];
export type AccidentalWeight = number | false;

export const ACCIDENTAL_SCORE_SOURCE: RuleSource = Object.freeze({
  ...ESSENTIAL_SCORE_SOURCE, id: "lilly-accidental-weights",
  tradition: "Selected Lilly accidental fortitudes and debilities",
  locator: "Printed pp. 114-115; PDF pp. 141-142; motion definitions and accidental columns"
});
export const ACCIDENTAL_SECT_SOURCE: RuleSource = Object.freeze({
  id: "ptolemy-planetary-sect", tradition: "Ptolemy's planetary sect; optional caller-weighted chart-sect match",
  reference: "Ptolemy, Tetrabiblos I.7, translated by F. E. Robbins (1940)",
  url: "https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Ptolemy/Tetrabiblos/1B%2A.html#7",
  locator: "I.7, Of Diurnal and Nocturnal Planets; no numerical score supplied"
});
export const ACCIDENTAL_SPEED_SOURCE: RuleSource = Object.freeze({
  ...ACCIDENTAL_SCORE_SOURCE, id: "lilly-mean-motion",
  tradition: "Lilly's historical mean daily motions used as configurable comparison rates",
  locator: "Printed pp. 57, 61, 65, 69, 72, 76, 80; PDF pp. 81, 85, 89, 93, 96, 100, 104"
});
// Historical comparison rates, not an ephemeris model or measured accuracy bounds.
export const DEFAULT_MEAN_DAILY_MOTION: Readonly<Record<ClassicalPlanet, number>> = Object.freeze({
  Sun: (59 * 60 + 8) / 3600, Moon: (13 * 3600 + 10 * 60 + 36) / 3600,
  Mercury: (59 * 60 + 8) / 3600, Venus: (59 * 60 + 8) / 3600,
  Mars: (31 * 60 + 27) / 3600, Jupiter: (4 * 60 + 59) / 3600, Saturn: (2 * 60 + 1) / 3600
});
export const DEFAULT_ACCIDENTAL_WEIGHTS: Readonly<Record<AccidentalScoreRule, AccidentalWeight>> = Object.freeze({
  "house-1": 5, "house-2": 3, "house-3": 1, "house-4": 4, "house-5": 3, "house-6": -2,
  "house-7": 4, "house-8": -2, "house-9": 2, "house-10": 5, "house-11": 4, "house-12": -5,
  direct: 4, retrograde: -5, swift: 2, slow: -2, "in-sect": false, "out-of-sect": false
});
export const ACCIDENTAL_CONVENTIONS = Object.freeze({
  houses: "Engine houseOf on actual cusps; cusp belongs to the starting house; longitude only; no cusp anticipation",
  motion: "Use supplied engine chart speed in degrees/day; ignore retrograde annotation; absolute speed <= stationarySpeed is stationary",
  rate: "Compare absolute nonstationary speed strictly with configured mean motion; equality is neutral; direction and rate are separate conditions",
  luminaries: "Sun and Moon receive neither direct nor retrograde points, following Lilly's table",
  sect: "Engine sectOf on Ascendant and Sun; Mercury morning/evening proxy from longitude, indeterminate at conjunction/opposition",
  score: "One condition per physical planet; one house weight; no generic angular/cadent bonus; sect weights disabled by default",
  scope: "House, direction, rate and optional chart-sect match only; excludes solar proximity, phase, hayz, aspects, nodes, joys and fixed stars"
});

export interface AccidentalPolicyInput {
  readonly weights?: Readonly<Partial<Record<AccidentalScoreRule, AccidentalWeight>>>;
  /** Positive comparison rates in degrees/day. */
  readonly meanDailyMotion?: Readonly<Partial<Record<ClassicalPlanet, number>>>;
  /** Nonnegative tolerance in degrees/day; default zero. This does not search stations. */
  readonly stationarySpeed?: number;
}
export interface HoraryAccidentalPolicy {
  readonly schema: "horary.accidental-policy/v1";
  readonly weights: Readonly<Record<AccidentalScoreRule, AccidentalWeight>>;
  readonly meanDailyMotion: Readonly<Record<ClassicalPlanet, number>>;
  readonly stationarySpeed: number;
}

function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Reflect.ownKeys(value).some((key) => typeof key !== "string" || !keys.includes(key))) {
    throw new RangeError(`${label} must be an object with supported fields.`);
  }
  return value as Record<string, unknown>;
}

export function createAccidentalPolicy(input: AccidentalPolicyInput = {}): HoraryAccidentalPolicy {
  const options = object(input, ["weights", "meanDailyMotion", "stationarySpeed"], "Accidental policy options");
  const supplied = options.weights === undefined ? {} : object(options.weights, ACCIDENTAL_SCORE_RULES, "Accidental weights");
  const weights = {} as Record<AccidentalScoreRule, AccidentalWeight>;
  for (const rule of ACCIDENTAL_SCORE_RULES) {
    const value = Object.hasOwn(supplied, rule) ? supplied[rule] : DEFAULT_ACCIDENTAL_WEIGHTS[rule];
    if (value !== false && (typeof value !== "number" || !Number.isFinite(value))) {
      throw new RangeError("Accidental weights must be finite numbers or false.");
    }
    weights[rule] = value as AccidentalWeight;
  }
  const rates = options.meanDailyMotion === undefined ? {} : object(options.meanDailyMotion, CLASSICAL_PLANETS, "Mean daily motions");
  const meanDailyMotion = {} as Record<ClassicalPlanet, number>;
  for (const planet of CLASSICAL_PLANETS) {
    const value = Object.hasOwn(rates, planet) ? rates[planet] : DEFAULT_MEAN_DAILY_MOTION[planet];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new RangeError("Mean daily motions must be positive finite degrees/day.");
    }
    meanDailyMotion[planet] = value;
  }
  const stationarySpeed = options.stationarySpeed === undefined ? 0 : options.stationarySpeed;
  if (typeof stationarySpeed !== "number" || !Number.isFinite(stationarySpeed) || stationarySpeed < 0) {
    throw new RangeError("Stationary speed must be nonnegative finite degrees/day.");
  }
  return Object.freeze({ schema: "horary.accidental-policy/v1", weights: Object.freeze(weights),
    meanDailyMotion: Object.freeze(meanDailyMotion), stationarySpeed });
}

export function validateAccidentalPolicy(input: HoraryAccidentalPolicy): HoraryAccidentalPolicy {
  const policy = object(input, ["schema", "weights", "meanDailyMotion", "stationarySpeed"], "Accidental policy");
  const weights = object(policy.weights, ACCIDENTAL_SCORE_RULES, "Accidental weights");
  const rates = object(policy.meanDailyMotion, CLASSICAL_PLANETS, "Mean daily motions");
  if (policy.schema !== "horary.accidental-policy/v1" ||
      !ACCIDENTAL_SCORE_RULES.every((rule) => Object.hasOwn(weights, rule)) ||
      !CLASSICAL_PLANETS.every((planet) => Object.hasOwn(rates, planet)) || policy.stationarySpeed === undefined) {
    throw new RangeError("Unsupported or incomplete accidental policy snapshot.");
  }
  return createAccidentalPolicy({ weights: weights as HoraryAccidentalPolicy["weights"],
    meanDailyMotion: rates as HoraryAccidentalPolicy["meanDailyMotion"], stationarySpeed: policy.stationarySpeed as number });
}
