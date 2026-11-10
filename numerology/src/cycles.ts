import { parseGregorianDate } from "./dates.js";
import type { GregorianDate } from "./dates.js";
import { reduceInteger } from "./reduction.js";
import type { KarmicDebtAnnotation, MasterPolicy, ReductionOptions, ReductionResult } from "./types.js";

export type PersonalCycle = "personal-year" | "personal-month" | "personal-day";
export type CycleComponent = "birth-month" | "birth-day" | "target-year";

export interface CycleKarmicDebt extends KarmicDebtAnnotation {
  /** Stage is local to the named component or cycle reduction. */
  readonly source: CycleComponent | PersonalCycle;
}

export interface PersonalCycleStage {
  readonly cycle: PersonalCycle;
  readonly sum: { readonly inputs: readonly number[]; readonly output: number };
  readonly reduction: ReductionResult;
}

export interface PersonalCycleResult {
  readonly value: ReductionResult["value"];
  readonly meaning: string;
  readonly karmicDebts: readonly CycleKarmicDebt[];
  readonly receipt: {
    readonly schema: "numerology-personal-cycle/1";
    readonly calculation: PersonalCycle;
    readonly convention: "year-components;year-plus-raw-month;month-plus-raw-day/1";
    readonly yearBoundary: "january-1";
    readonly monthBoundary: "first-of-month";
    readonly dayBoundary: "civil-date";
    readonly birthDate: GregorianDate;
    readonly targetDate: GregorianDate;
    readonly masterNumbers: MasterPolicy;
    readonly components: readonly {
      readonly component: CycleComponent;
      readonly reduction: ReductionResult;
    }[];
    /** Year first, followed by month and day only when needed. */
    readonly stages: readonly PersonalCycleStage[];
  };
}

function readPolicy(options: ReductionOptions): MasterPolicy {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Personal cycle options must be an object.");
  }
  for (const key of Reflect.ownKeys(options)) {
    if (key !== "masterNumbers") throw new RangeError("Unknown personal cycle option.");
  }
  const policy = options.masterNumbers;
  if (policy === undefined) return "preserve";
  if (policy !== "preserve" && policy !== "reduce") {
    throw new RangeError("Master-number policy must be preserve or reduce.");
  }
  return policy;
}

function calculateCycle(
  birth: string, target: string, calculation: PersonalCycle, options: ReductionOptions
): PersonalCycleResult {
  const birthDate = parseGregorianDate(birth);
  const targetDate = parseGregorianDate(target);
  const masterNumbers = readPolicy(options);
  const reduce = (value: number) => reduceInteger(value, { masterNumbers });
  const components = Object.freeze([
    Object.freeze({ component: "birth-month" as const, reduction: reduce(birthDate.month) }),
    Object.freeze({ component: "birth-day" as const, reduction: reduce(birthDate.day) }),
    Object.freeze({ component: "target-year" as const, reduction: reduce(targetDate.year) })
  ]);
  const karmicDebts: CycleKarmicDebt[] = [];
  function locate(reduction: ReductionResult, source: CycleKarmicDebt["source"]): void {
    karmicDebts.push(...reduction.karmicDebts.map((debt) => Object.freeze({ ...debt, source })));
  }
  for (const { component, reduction } of components) locate(reduction, component);
  const stages: PersonalCycleStage[] = [];
  function stage(cycle: PersonalCycle, inputs: number[]): ReductionResult {
    const output = inputs.reduce((sum, value) => sum + value, 0);
    const reduction = reduce(output);
    locate(reduction, cycle);
    stages.push(Object.freeze({ cycle,
      sum: Object.freeze({ inputs: Object.freeze(inputs), output }), reduction }));
    return reduction;
  }
  let result = stage("personal-year", components.map(({ reduction }) => reduction.value));
  if (calculation !== "personal-year") {
    result = stage("personal-month", [result.value, targetDate.month]);
  }
  if (calculation === "personal-day") {
    result = stage("personal-day", [result.value, targetDate.day]);
  }
  return Object.freeze({
    value: result.value, meaning: result.meaning, karmicDebts: Object.freeze(karmicDebts),
    receipt: Object.freeze({
      schema: "numerology-personal-cycle/1", calculation,
      convention: "year-components;year-plus-raw-month;month-plus-raw-day/1",
      yearBoundary: "january-1", monthBoundary: "first-of-month", dayBoundary: "civil-date",
      birthDate, targetDate, masterNumbers, components, stages: Object.freeze(stages)
    })
  });
}

/** Calendar-year cycle; birth year is validated but does not enter the sum. */
export function personalYear(
  birth: string, target: string, options: ReductionOptions = {}
): PersonalCycleResult {
  return calculateCycle(birth, target, "personal-year", options);
}

/** Reduced personal year plus the raw target calendar month, then reduced. */
export function personalMonth(
  birth: string, target: string, options: ReductionOptions = {}
): PersonalCycleResult {
  return calculateCycle(birth, target, "personal-month", options);
}

/** Reduced personal month plus the raw target calendar day, then reduced. */
export function personalDay(
  birth: string, target: string, options: ReductionOptions = {}
): PersonalCycleResult {
  return calculateCycle(birth, target, "personal-day", options);
}
