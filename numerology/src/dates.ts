import { reduceInteger } from "./reduction.js";
import type { KarmicDebtAnnotation, MasterPolicy, ReductionOptions, ReductionResult } from "./types.js";

/** A civil date, without a time, timezone, or inferred calendar conversion. */
export interface GregorianDate {
  readonly calendar: "proleptic-gregorian";
  readonly iso: string;
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export type LifePathMethod = "components" | "whole-date";
export type DateComponent = "year" | "month" | "day";

export interface LifePathOptions extends ReductionOptions {
  readonly method?: LifePathMethod;
}

export interface DateKarmicDebt extends KarmicDebtAnnotation {
  /** Stage is local to this source's reduction, not the entire calculation. */
  readonly source: DateComponent | "total";
}

export interface LifePathResult {
  readonly value: ReductionResult["value"];
  readonly meaning: string;
  readonly karmicDebts: readonly DateKarmicDebt[];
  readonly receipt: {
    readonly schema: "numerology-life-path/1";
    readonly date: GregorianDate;
    readonly method: LifePathMethod;
    readonly masterNumbers: MasterPolicy;
    readonly components: readonly {
      readonly component: DateComponent;
      readonly reduction: ReductionResult;
    }[];
    /** Reduced components, or date digits in YYYYMMDD order, and their sum. */
    readonly sum: { readonly inputs: readonly number[]; readonly output: number };
    readonly reduction: ReductionResult;
  };
}

export interface BirthdayResult {
  readonly value: ReductionResult["value"];
  readonly meaning: string;
  readonly karmicDebts: readonly DateKarmicDebt[];
  readonly receipt: {
    readonly schema: "numerology-birthday/1";
    readonly date: GregorianDate;
    readonly masterNumbers: MasterPolicy;
    readonly reduction: ReductionResult;
  };
}

/** Strict YYYY-MM-DD in years 0001 through 9999; never constructs a Date. */
export function parseGregorianDate(input: string): GregorianDate {
  if (typeof input !== "string") throw new TypeError("Civil date must be a string.");
  if (input.length !== 10 || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(input)) {
    throw new RangeError("Civil date must use YYYY-MM-DD.");
  }
  const year = Number(input.slice(0, 4));
  const month = Number(input.slice(5, 7));
  const day = Number(input.slice(8, 10));
  if (year < 1 || month < 1 || month > 12) {
    throw new RangeError("Civil date year or month is out of range.");
  }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = month === 2 ? (leap ? 29 : 28) : ([4, 6, 9, 11].includes(month) ? 30 : 31);
  if (day < 1 || day > days) throw new RangeError("Civil date day is out of range.");
  return Object.freeze({ calendar: "proleptic-gregorian", iso: input, year, month, day });
}

function readOptions(options: LifePathOptions, allowMethod: boolean): {
  masterNumbers: MasterPolicy; method: LifePathMethod;
} {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Date calculation options must be an object.");
  }
  for (const key of Reflect.ownKeys(options)) {
    if (key !== "masterNumbers" && !(allowMethod && key === "method")) {
      throw new RangeError("Unknown date calculation option.");
    }
  }
  const suppliedPolicy = options.masterNumbers;
  const masterNumbers = suppliedPolicy === undefined ? "preserve" : suppliedPolicy;
  if (masterNumbers !== "preserve" && masterNumbers !== "reduce") {
    throw new RangeError("Master-number policy must be preserve or reduce.");
  }
  const suppliedMethod = allowMethod ? options.method : undefined;
  const method = suppliedMethod === undefined ? "components" : suppliedMethod;
  if (method !== "components" && method !== "whole-date") {
    throw new RangeError("Life-path method must be components or whole-date.");
  }
  return { masterNumbers, method };
}

function locateDebts(reduction: ReductionResult, source: DateKarmicDebt["source"]): DateKarmicDebt[] {
  return reduction.karmicDebts.map((debt) => Object.freeze({ ...debt, source }));
}

/** Reduce components separately by default; whole-date sums all date digits first. */
export function lifePath(input: string, options: LifePathOptions = {}): LifePathResult {
  const date = parseGregorianDate(input);
  const { masterNumbers, method } = readOptions(options, true);
  const componentNames = ["year", "month", "day"] as const;
  const components = method === "components"
    ? componentNames.map((component) => Object.freeze({
      component, reduction: reduceInteger(date[component], { masterNumbers })
    }))
    : [];
  const inputs = method === "components"
    ? components.map(({ reduction }) => reduction.value)
    : Array.from(date.iso.replaceAll("-", ""), Number);
  const output = inputs.reduce((sum, value) => sum + value, 0);
  const reduction = reduceInteger(output, { masterNumbers });
  return Object.freeze({
    value: reduction.value,
    meaning: reduction.meaning,
    karmicDebts: Object.freeze([
      ...components.flatMap((row) => locateDebts(row.reduction, row.component)),
      ...locateDebts(reduction, "total")
    ]),
    receipt: Object.freeze({
      schema: "numerology-life-path/1", date, method, masterNumbers,
      components: Object.freeze(components),
      sum: Object.freeze({ inputs: Object.freeze(inputs), output }),
      reduction
    })
  });
}

/** Reduce the day of the month only, retaining the complete validated date. */
export function birthday(input: string, options: ReductionOptions = {}): BirthdayResult {
  const date = parseGregorianDate(input);
  const { masterNumbers } = readOptions(options, false);
  const reduction = reduceInteger(date.day, { masterNumbers });
  return Object.freeze({
    value: reduction.value,
    meaning: reduction.meaning,
    karmicDebts: Object.freeze(locateDebts(reduction, "day")),
    receipt: Object.freeze({ schema: "numerology-birthday/1", date, masterNumbers, reduction })
  });
}
