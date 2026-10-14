export { reduceInteger, MAX_INTEGER_DIGITS } from "./reduction.js";
export { NUMBER_MEANINGS, KARMIC_DEBT_MEANINGS } from "./meanings.js";
export { parseGregorianDate, lifePath, birthday } from "./dates.js";
export { personalYear, personalMonth, personalDay } from "./cycles.js";
export { pinnacles, challenges, CHALLENGE_MEANINGS } from "./periods.js";
export type {
  PeriodCalculation, PeriodIndex, PeriodSource, ChallengeNumber, AgeInterval,
  PeriodKarmicDebt, PeriodNumberResult, PeriodsResult
} from "./periods.js";
export type {
  PersonalCycle, CycleComponent, CycleKarmicDebt, PersonalCycleStage, PersonalCycleResult
} from "./cycles.js";
export { maturity, karmicLessons, hiddenPassion, KARMIC_LESSON_MEANINGS, HIDDEN_PASSION_MEANINGS } from "./derived.js";
export type {
  MaturityOptions, MaturityKarmicDebt, MaturityResult, FrequencyCalculation,
  FrequencyRow, FrequencyStep, NameFrequencyResult
} from "./derived.js";
export {
  expression, destiny, soulUrge, personality, PYTHAGOREAN_LETTER_TABLE,
  CHALDEAN_LETTER_TABLE, PYTHAGOREAN_LETTER_TABLE_ID, CHALDEAN_LETTER_TABLE_ID,
  EMPTY_SELECTION_MEANINGS
} from "./name-numbers.js";
export type {
  NumerologySystem, AsciiLetter, LetterValue, NameNumberOptions, NameCalculation,
  NameSelection, LetterContribution, NameNumberResult
} from "./name-numbers.js";
export { normalizeName, LATIN_NAME_TABLE, LATIN_NAME_TABLE_ID, MAX_NAME_CODE_UNITS } from "./names.js";
export {
  GREEK_NAME_TABLE, GREEK_NAME_TABLE_ID, CYRILLIC_NAME_TABLE, CYRILLIC_NAME_TABLE_ID,
  MAX_CUSTOM_MAPPINGS, MAX_TRANSLITERATION_EXPANSION
} from "./transliteration.js";
export type { CustomTransliteration, CustomTransliterationReceipt } from "./transliteration.js";
export type {
  YVowelPolicy, NameOptions, NameNormalizationStep, NameCharacterReceipt,
  NameLetterReceipt, NormalizedName
} from "./names.js";
export type {
  GregorianDate, LifePathMethod, LifePathOptions, DateComponent,
  DateKarmicDebt, LifePathResult, BirthdayResult
} from "./dates.js";
export type {
  IntegerInput, MasterPolicy, MasterNumber, KarmicDebtNumber, ReducedNumber,
  ReductionOptions, ReductionStep, ReductionReceipt, KarmicDebtAnnotation,
  ReductionResult
} from "./types.js";
