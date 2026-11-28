import { lifePath } from "./dates.js";
import type { DateComponent, GregorianDate, LifePathOptions, LifePathResult } from "./dates.js";
import { reduceInteger } from "./reduction.js";
import type { KarmicDebtAnnotation, MasterPolicy, ReductionResult } from "./types.js";

export type PeriodCalculation = "pinnacles" | "challenges";
export type PeriodIndex = 1 | 2 | 3 | 4;
export type PeriodSource = DateComponent | "period-1" | "period-2" | "period-3" | "period-4";
export type ChallengeNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Original reflection prompts, not excerpts or predictions. */
export const CHALLENGE_MEANINGS: Readonly<Record<ChallengeNumber, string>> = Object.freeze({
  0: "Choose a skill to practice; equal inputs leave no single numbered focus.",
  1: "Practice speaking for yourself while listening to other people.",
  2: "Practice patience with differences without hiding your needs.",
  3: "Practice sharing your ideas without letting self-criticism silence them.",
  4: "Practice finishing manageable tasks and building dependable routines.",
  5: "Practice making room for change while keeping useful commitments.",
  6: "Practice caring for others without deciding everything for them.",
  7: "Practice asking questions without withdrawing from every connection.",
  8: "Practice handling resources and authority with clear, fair limits."
});

export interface AgeInterval {
  readonly fromInclusive: number;
  /** null is an open end, rather than Infinity, so the interval is JSON-safe. */
  readonly toExclusive: number | null;
}

export interface PeriodKarmicDebt extends KarmicDebtAnnotation {
  /** Stage is local to the named component or period reduction. */
  readonly source: PeriodSource;
}

export interface PeriodNumberResult {
  readonly period: PeriodIndex;
  readonly ages: AgeInterval;
  readonly value: ReductionResult["value"];
  readonly meaning: string;
  /** Only this period's reduction; component debts live on the outer result. */
  readonly karmicDebts: readonly PeriodKarmicDebt[];
  readonly receipt: {
    readonly operation: "sum" | "absolute-difference";
    readonly inputs: readonly { readonly source: PeriodSource; readonly value: number }[];
    readonly output: number;
    readonly reduction: ReductionResult;
  };
}

export interface PeriodsResult {
  readonly periods: readonly PeriodNumberResult[];
  /** Component debts, then period debts; timing debts remain in timing receipts. */
  readonly karmicDebts: readonly PeriodKarmicDebt[];
  readonly receipt: {
    readonly schema: "numerology-periods/1";
    readonly calculation: PeriodCalculation;
    readonly convention: "component-sums/1" | "single-digit-absolute-differences/1";
    readonly date: GregorianDate;
    readonly masterNumbers: MasterPolicy;
    readonly arithmeticMasterNumbers: MasterPolicy;
    readonly components: readonly { readonly component: DateComponent; readonly reduction: ReductionResult }[];
    readonly timing: {
      readonly convention: "inclusive-36-minus-single-digit-life-path;then-nine-ages/1";
      readonly ageUnit: "attained-years";
      readonly lifePath: LifePathResult;
      readonly reduction: ReductionResult;
      readonly firstEndAge: { readonly minuend: 36; readonly subtrahend: number; readonly output: number };
      /** Start ages of periods two, three, and four, computed in order. */
      readonly boundaries: readonly { readonly inputs: readonly number[]; readonly output: number }[];
    };
  };
}

function locate(reduction: ReductionResult, source: PeriodSource): readonly PeriodKarmicDebt[] {
  return Object.freeze(reduction.karmicDebts.map((debt) => Object.freeze({ ...debt, source })));
}

function calculatePeriods(
  input: string, calculation: PeriodCalculation, options: LifePathOptions
): PeriodsResult {
  // Reuse strict date/options validation and capture supplied getters only once.
  const timingLifePath = lifePath(input, options);
  const { date, masterNumbers } = timingLifePath.receipt;
  const arithmeticMasterNumbers = calculation === "challenges" ? "reduce" : masterNumbers;
  const reduce = (value: number) => reduceInteger(value, { masterNumbers: arithmeticMasterNumbers });
  const components = Object.freeze((["month", "day", "year"] as const).map((component) =>
    Object.freeze({ component, reduction: reduce(date[component]) })));
  const values = new Map<PeriodSource, number>(components.map(({ component, reduction }) =>
    [component, reduction.value]));
  const timingReduction = reduceInteger(timingLifePath.value, { masterNumbers: "reduce" });
  const firstEndAge = Object.freeze({ minuend: 36 as const, subtrahend: timingReduction.value,
    output: 36 - timingReduction.value });
  const boundaries: { readonly inputs: readonly number[]; readonly output: number }[] = [];
  let start = firstEndAge.output;
  for (const increment of [1, 9, 9]) {
    const inputs = Object.freeze([start, increment]);
    start += increment;
    boundaries.push(Object.freeze({ inputs, output: start }));
  }
  const starts = [0, ...boundaries.map(({ output }) => output)];
  const pairs: readonly (readonly [PeriodSource, PeriodSource])[] = [
    ["month", "day"], ["day", "year"], ["period-1", "period-2"], ["month", "year"]
  ];
  const operation = calculation === "pinnacles" ? "sum" : "absolute-difference";
  const periods = pairs.map((pair, index): PeriodNumberResult => {
    const period = (index + 1) as PeriodIndex;
    const inputs = Object.freeze(pair.map((source) => {
      const value = values.get(source);
      if (value === undefined) throw new Error("Missing period arithmetic dependency.");
      return Object.freeze({ source, value });
    }));
    const [a, b] = inputs;
    if (a === undefined || b === undefined) throw new Error("Missing period arithmetic input.");
    const output = operation === "sum" ? a.value + b.value : Math.abs(a.value - b.value);
    const reduction = reduce(output);
    values.set(`period-${period}`, reduction.value);
    return Object.freeze({
      period, ages: Object.freeze({ fromInclusive: starts[index]!, toExclusive: starts[index + 1] ?? null }),
      value: reduction.value,
      meaning: calculation === "challenges" ? CHALLENGE_MEANINGS[reduction.value as ChallengeNumber] : reduction.meaning,
      karmicDebts: locate(reduction, `period-${period}`),
      receipt: Object.freeze({ operation, inputs, output, reduction })
    });
  });
  return Object.freeze({
    periods: Object.freeze(periods),
    karmicDebts: Object.freeze([
      ...components.flatMap(({ component, reduction }) => locate(reduction, component)),
      ...periods.flatMap(({ karmicDebts }) => karmicDebts)
    ]),
    receipt: Object.freeze({
      schema: "numerology-periods/1", calculation,
      convention: calculation === "pinnacles" ? "component-sums/1" : "single-digit-absolute-differences/1",
      date, masterNumbers, arithmeticMasterNumbers, components,
      timing: Object.freeze({
        convention: "inclusive-36-minus-single-digit-life-path;then-nine-ages/1", ageUnit: "attained-years",
        lifePath: timingLifePath, reduction: timingReduction, firstEndAge,
        boundaries: Object.freeze(boundaries)
      })
    })
  });
}

/** Four reduced sums of date components, under the declared age schedule. */
export function pinnacles(input: string, options: LifePathOptions = {}): PeriodsResult {
  return calculatePeriods(input, "pinnacles", options);
}

/** Four absolute differences of single-digit components; zero is retained. */
export function challenges(input: string, options: LifePathOptions = {}): PeriodsResult {
  return calculatePeriods(input, "challenges", options);
}
