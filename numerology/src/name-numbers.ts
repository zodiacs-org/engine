import { normalizeName } from "./names.js";
import type { NameLetterReceipt, NameOptions, NormalizedName } from "./names.js";
import { reduceInteger } from "./reduction.js";
import type { MasterPolicy, ReductionOptions, ReductionResult } from "./types.js";

export type NumerologySystem = "pythagorean" | "chaldean";
export type AsciiLetter =
  | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M"
  | "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z";
export type LetterValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Repeating alphabetical values; all emitted ASCII letters contribute. */
export const PYTHAGOREAN_LETTER_TABLE = Object.freeze({
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9,
  J: 1, K: 2, L: 3, M: 4, N: 5, O: 6, P: 7, Q: 8, R: 9,
  S: 1, T: 2, U: 3, V: 4, W: 5, X: 6, Y: 7, Z: 8
} as const satisfies Readonly<Record<AsciiLetter, LetterValue>>);

/** Letter values checked against Cheiro's Book of Numbers, chapter XII. */
export const CHALDEAN_LETTER_TABLE = Object.freeze({
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 8, G: 3, H: 5, I: 1,
  J: 1, K: 2, L: 3, M: 4, N: 5, O: 7, P: 8, Q: 1, R: 2,
  S: 3, T: 4, U: 6, V: 6, W: 6, X: 5, Y: 1, Z: 7
} as const satisfies Readonly<Record<AsciiLetter, LetterValue>>);

export const PYTHAGOREAN_LETTER_TABLE_ID = "numerology-pythagorean-letters/1";
export const CHALDEAN_LETTER_TABLE_ID = "numerology-chaldean-letters/1";

export interface NameNumberOptions extends NameOptions, ReductionOptions {
  readonly system?: NumerologySystem;
}

export type NameCalculation = "expression" | "soul-urge" | "personality";
export type NameSelection = "all" | "vowels" | "consonants";

/** Index remains the original emitted-letter index, even for filtered selections. */
export interface LetterContribution extends NameLetterReceipt {
  readonly value: LetterValue;
}

export interface NameNumberResult {
  readonly value: ReductionResult["value"];
  readonly meaning: string;
  /** Stages belong to the selected letters' total reduction only. */
  readonly karmicDebts: ReductionResult["karmicDebts"];
  readonly receipt: {
    readonly schema: "numerology-name-number/1";
    readonly calculation: NameCalculation;
    readonly system: NumerologySystem;
    readonly letterTable: typeof PYTHAGOREAN_LETTER_TABLE_ID | typeof CHALDEAN_LETTER_TABLE_ID;
    readonly masterNumbers: MasterPolicy;
    readonly selection: NameSelection;
    readonly normalization: NormalizedName;
    readonly contributions: readonly LetterContribution[];
    /** Raw letter values are summed once, without per-token reduction. */
    readonly sum: { readonly inputs: readonly LetterValue[]; readonly output: number };
    readonly reduction: ReductionResult;
  };
}

// Original prompts for absent selections, which are arithmetic zero, not traits.
export const EMPTY_SELECTION_MEANINGS = Object.freeze({
  "soul-urge": "No vowels were selected by this spelling and Y policy; there is no vowel-based reflection prompt.",
  personality: "No consonants were selected by this spelling and Y policy; there is no consonant-based reflection prompt."
});

function readOptions(options: NameNumberOptions): {
  system: NumerologySystem; masterNumbers: MasterPolicy; normalization: NameOptions;
} {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Name calculation options must be an object.");
  }
  for (const key of Reflect.ownKeys(options)) {
    if (key !== "system" && key !== "masterNumbers" && key !== "yAsVowel" && key !== "transliteration") {
      throw new RangeError("Unknown name calculation option.");
    }
  }
  const suppliedSystem = options.system;
  const system = suppliedSystem === undefined ? "pythagorean" : suppliedSystem;
  if (system !== "pythagorean" && system !== "chaldean") {
    throw new RangeError("System must be pythagorean or chaldean.");
  }
  const suppliedPolicy = options.masterNumbers;
  const masterNumbers = suppliedPolicy === undefined ? "preserve" : suppliedPolicy;
  if (masterNumbers !== "preserve" && masterNumbers !== "reduce") {
    throw new RangeError("Master-number policy must be preserve or reduce.");
  }
  const yAsVowel = options.yAsVowel;
  const transliteration = options.transliteration;
  return { system, masterNumbers, normalization: {
    ...(yAsVowel === undefined ? {} : { yAsVowel }),
    ...(transliteration === undefined ? {} : { transliteration })
  } };
}

function calculateName(
  input: string, calculation: NameCalculation, selection: NameSelection, options: NameNumberOptions
): NameNumberResult {
  const { system, masterNumbers, normalization: normalizationOptions } = readOptions(options);
  const normalization = normalizeName(input, normalizationOptions);
  const table = system === "pythagorean" ? PYTHAGOREAN_LETTER_TABLE : CHALDEAN_LETTER_TABLE;
  const letterTable = system === "pythagorean" ? PYTHAGOREAN_LETTER_TABLE_ID : CHALDEAN_LETTER_TABLE_ID;
  const contributions = normalization.receipt.letters
    .filter(({ kind }) => selection === "all" || kind === (selection === "vowels" ? "vowel" : "consonant"))
    .map((row) => Object.freeze({ ...row, value: table[row.letter as AsciiLetter] }));
  const inputs = contributions.map(({ value }) => value);
  // Normalization bounds the number of emissions; this sum is an exact safe integer.
  const output = inputs.reduce((sum, value) => sum + value, 0);
  const reduction = reduceInteger(output, { masterNumbers });
  const meaning = contributions.length === 0 && calculation !== "expression"
    ? EMPTY_SELECTION_MEANINGS[calculation] : reduction.meaning;
  return Object.freeze({
    value: reduction.value, meaning, karmicDebts: reduction.karmicDebts,
    receipt: Object.freeze({
      schema: "numerology-name-number/1", calculation, system, letterTable,
      masterNumbers, selection, normalization, contributions: Object.freeze(contributions),
      sum: Object.freeze({ inputs: Object.freeze(inputs), output }), reduction
    })
  });
}

/** Sum every emitted letter across the full supplied name, then reduce once. */
export function expression(input: string, options: NameNumberOptions = {}): NameNumberResult {
  return calculateName(input, "expression", "all", options);
}

/** Exact alias: destiny and expression name the same calculation and receipt. */
export const destiny = expression;

/** Sum emitted vowels under the normalization's explicit Y policy. */
export function soulUrge(input: string, options: NameNumberOptions = {}): NameNumberResult {
  return calculateName(input, "soul-urge", "vowels", options);
}

/** Sum emitted consonants under the normalization's explicit Y policy. */
export function personality(input: string, options: NameNumberOptions = {}): NameNumberResult {
  return calculateName(input, "personality", "consonants", options);
}
