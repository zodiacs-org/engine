import { lifePath } from "./dates.js";
import type { DateKarmicDebt, LifePathOptions, LifePathResult } from "./dates.js";
import { expression, PYTHAGOREAN_LETTER_TABLE, CHALDEAN_LETTER_TABLE } from "./name-numbers.js";
import type { LetterValue, NameNumberOptions, NameNumberResult } from "./name-numbers.js";
import { reduceInteger } from "./reduction.js";
import type { KarmicDebtAnnotation, ReductionResult } from "./types.js";

export interface MaturityOptions extends NameNumberOptions, LifePathOptions {}

export interface MaturityKarmicDebt extends KarmicDebtAnnotation {
  readonly source: "life-path" | "expression" | "total";
  /** Present only for life-path debts; stage remains local to this component. */
  readonly component?: DateKarmicDebt["source"];
}

export interface MaturityResult {
  readonly value: ReductionResult["value"];
  readonly meaning: string;
  readonly karmicDebts: readonly MaturityKarmicDebt[];
  readonly receipt: {
    readonly schema: "numerology-maturity/1";
    readonly formula: "reduced-life-path-plus-reduced-expression";
    readonly masterNumbers: NameNumberResult["receipt"]["masterNumbers"];
    readonly lifePath: LifePathResult;
    readonly expression: NameNumberResult;
    readonly sum: { readonly inputs: readonly number[]; readonly output: number };
    readonly reduction: ReductionResult;
  };
}

/** Calculate from source inputs rather than trusting imported result objects. */
export function maturity(date: string, name: string, options: MaturityOptions = {}): MaturityResult {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Maturity options must be an object.");
  }
  for (const key of Reflect.ownKeys(options)) {
    if (key !== "method" && key !== "system" && key !== "masterNumbers" &&
        key !== "yAsVowel" && key !== "transliteration") {
      throw new RangeError("Unknown maturity option.");
    }
  }
  const { method, system, masterNumbers: suppliedPolicy, yAsVowel, transliteration } = options;
  const path = lifePath(date, {
    ...(method === undefined ? {} : { method }),
    ...(suppliedPolicy === undefined ? {} : { masterNumbers: suppliedPolicy })
  });
  const masterNumbers = path.receipt.masterNumbers;
  const named = expression(name, {
    masterNumbers,
    ...(system === undefined ? {} : { system }),
    ...(yAsVowel === undefined ? {} : { yAsVowel }),
    ...(transliteration === undefined ? {} : { transliteration })
  });
  const inputs = Object.freeze([path.value, named.value]);
  const output = path.value + named.value;
  const reduction = reduceInteger(output, { masterNumbers });
  const karmicDebts: MaturityKarmicDebt[] = [
    ...path.karmicDebts.map(({ source, ...debt }) => Object.freeze({
      ...debt, source: "life-path" as const, component: source
    })),
    ...named.karmicDebts.map((debt) => Object.freeze({ ...debt, source: "expression" as const })),
    ...reduction.karmicDebts.map((debt) => Object.freeze({ ...debt, source: "total" as const }))
  ];
  return Object.freeze({
    value: reduction.value, meaning: reduction.meaning, karmicDebts: Object.freeze(karmicDebts),
    receipt: Object.freeze({
      schema: "numerology-maturity/1", formula: "reduced-life-path-plus-reduced-expression",
      masterNumbers, lifePath: path, expression: named,
      sum: Object.freeze({ inputs, output }), reduction
    })
  });
}

export type FrequencyCalculation = "karmic-lessons" | "hidden-passion";

export interface FrequencyRow {
  readonly value: LetterValue;
  /** False for values the selected table never assigns, such as Chaldean nine. */
  readonly eligible: boolean;
  readonly count: number;
  /** Indices into the complete emitted-letter contributions, in source order. */
  readonly letterIndices: readonly number[];
}

export interface FrequencyStep {
  readonly letterIndex: number;
  readonly value: LetterValue;
  readonly before: number;
  readonly after: number;
}

export interface NameFrequencyResult {
  readonly values: readonly LetterValue[];
  readonly meaning: string;
  readonly meanings: readonly { readonly value: LetterValue; readonly meaning: string }[];
  /** Frequency counts are not compounds and never create karmic debts. */
  readonly karmicDebts: readonly KarmicDebtAnnotation[];
  readonly receipt: {
    readonly schema: "numerology-name-frequency/1";
    readonly calculation: FrequencyCalculation;
    readonly system: NameNumberResult["receipt"]["system"];
    readonly letterTable: NameNumberResult["receipt"]["letterTable"];
    readonly masterNumbers: NameNumberResult["receipt"]["masterNumbers"];
    readonly selection: "all";
    /** Complete expression result supplies normalization, contributions and reduction. */
    readonly name: NameNumberResult;
    readonly domain: readonly LetterValue[];
    readonly steps: readonly FrequencyStep[];
    /** All single-digit values remain visible, including ineligible ones. */
    readonly frequencies: readonly FrequencyRow[];
    readonly maximum: number;
    readonly selectionRule: "missing-assigned-values" | "maximum-positive-frequency;all-ties";
    readonly reduction: "not-applicable-to-frequency-selection";
  };
}

// Original reflection prompts. A missing letter value is not a personal deficit.
export const KARMIC_LESSON_MEANINGS: Readonly<Record<LetterValue, string>> = Object.freeze({
  1: "Try taking a small initiative and noticing how it feels.",
  2: "Practice listening and sharing a decision with someone else.",
  3: "Give an idea a clear voice or a playful form.",
  4: "Try a simple routine that supports work you care about.",
  5: "Explore an unfamiliar approach while keeping a commitment.",
  6: "Practice offering care with clear, mutual boundaries.",
  7: "Leave space for study and a question without an immediate answer.",
  8: "Practice a fair decision about time, resources, or responsibility.",
  9: "Consider a shared need or a useful way to finish something."
});

export const HIDDEN_PASSION_MEANINGS: Readonly<Record<LetterValue, string>> = Object.freeze({
  1: "Repeated initiative is a prompt to explore starting things thoughtfully.",
  2: "Repeated cooperation is a prompt to explore listening and partnership.",
  3: "Repeated expression is a prompt to explore communication and play.",
  4: "Repeated structure is a prompt to explore habits and practical craft.",
  5: "Repeated variety is a prompt to explore change with a clear purpose.",
  6: "Repeated care is a prompt to explore support that respects boundaries.",
  7: "Repeated reflection is a prompt to explore study and careful questions.",
  8: "Repeated responsibility is a prompt to explore fair use of resources.",
  9: "Repeated community themes are a prompt to explore contribution and completion."
});

function calculateFrequency(
  input: string, calculation: FrequencyCalculation, options: NameNumberOptions
): NameFrequencyResult {
  const name = expression(input, options);
  const { system, letterTable, masterNumbers, contributions } = name.receipt;
  const table = system === "pythagorean" ? PYTHAGOREAN_LETTER_TABLE : CHALDEAN_LETTER_TABLE;
  const domain = Object.freeze([...new Set<LetterValue>(Object.values(table))].sort((a, b) => a - b));
  const indices = new Map<LetterValue, number[]>(domain.map((value) => [value, []]));
  const steps = contributions.map(({ index, value }) => {
    const letters = indices.get(value)!;
    const before = letters.length;
    letters.push(index);
    return Object.freeze({ letterIndex: index, value, before, after: letters.length });
  });
  const frequencies = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((value) => {
    const letters = indices.get(value);
    return Object.freeze({ value, eligible: letters !== undefined, count: letters?.length ?? 0,
      letterIndices: Object.freeze(letters ?? []) });
  });
  const maximum = Math.max(...frequencies.map(({ count }) => count));
  const values = Object.freeze(frequencies.filter(({ eligible, count }) => eligible &&
    (calculation === "karmic-lessons" ? count === 0 : count === maximum && count > 0))
    .map(({ value }) => value));
  const text = calculation === "karmic-lessons" ? KARMIC_LESSON_MEANINGS : HIDDEN_PASSION_MEANINGS;
  const meanings = Object.freeze(values.map((value) => Object.freeze({ value, meaning: text[value] })));
  const meaning = calculation === "karmic-lessons"
    ? (values.length === 0 ? "Every assigned letter value occurs in this spelling; there are no missing-value prompts."
      : "Missing letter values offer practice prompts for this spelling, not claims about personal shortcomings.")
    : (values.length === 1 ? "The most frequent letter value offers a reflection prompt for this spelling."
      : "Several letter values share the highest frequency; each offers an equal reflection prompt.");
  return Object.freeze({
    values, meaning, meanings, karmicDebts: Object.freeze([]),
    receipt: Object.freeze({
      schema: "numerology-name-frequency/1", calculation, system, letterTable, masterNumbers,
      selection: "all", name, domain, steps: Object.freeze(steps), frequencies: Object.freeze(frequencies),
      maximum, selectionRule: calculation === "karmic-lessons" ? "missing-assigned-values"
        : "maximum-positive-frequency;all-ties", reduction: "not-applicable-to-frequency-selection"
    })
  });
}

/** Missing values among those assigned by the chosen letter table. */
export function karmicLessons(input: string, options: NameNumberOptions = {}): NameFrequencyResult {
  return calculateFrequency(input, "karmic-lessons", options);
}

/** Most frequent raw letter values; retain every positive-frequency tie. */
export function hiddenPassion(input: string, options: NameNumberOptions = {}): NameFrequencyResult {
  return calculateFrequency(input, "hidden-passion", options);
}
