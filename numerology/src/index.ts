export { reduceInteger, MAX_INTEGER_DIGITS } from "./reduction.js";
export { NUMBER_MEANINGS, KARMIC_DEBT_MEANINGS } from "./meanings.js";
export { parseGregorianDate, lifePath, birthday } from "./dates.js";
export { normalizeName, LATIN_NAME_TABLE, LATIN_NAME_TABLE_ID, MAX_NAME_CODE_UNITS } from "./names.js";
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
