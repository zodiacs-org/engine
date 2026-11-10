import { KARMIC_DEBT_MEANINGS, NUMBER_MEANINGS } from "./meanings.js";
import type {
  IntegerInput, KarmicDebtAnnotation, KarmicDebtNumber, MasterPolicy,
  ReducedNumber, ReductionOptions, ReductionResult, ReductionStep
} from "./types.js";

/** Bounds input and receipt allocation; counts supplied digits before trimming. */
export const MAX_INTEGER_DIGITS = 1024;

function decimalInteger(input: IntegerInput): string {
  let decimal: string;
  if (typeof input === "number") {
    if (!Number.isSafeInteger(input) || input < 0) {
      throw new RangeError("Integer input must be a nonnegative safe integer.");
    }
    decimal = String(input);
  } else if (typeof input === "bigint") {
    if (input < 0n) throw new RangeError("Integer input must be nonnegative.");
    decimal = String(input);
  } else if (typeof input === "string") {
    decimal = input;
  } else {
    throw new TypeError("Integer input must be a number, bigint, or decimal string.");
  }
  if (decimal.length > MAX_INTEGER_DIGITS) {
    throw new RangeError("Integer input exceeds the decimal digit limit.");
  }
  if (!/^[0-9]+$/u.test(decimal)) {
    throw new RangeError("Integer input must contain only decimal digits.");
  }
  return decimal.replace(/^0+(?=[0-9])/u, "");
}

function masterPolicy(options: ReductionOptions): MasterPolicy {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Reduction options must be an object.");
  }
  for (const key of Reflect.ownKeys(options)) {
    if (key !== "masterNumbers") throw new RangeError("Unknown reduction option.");
  }
  const policy = options.masterNumbers;
  if (policy === undefined) return "preserve";
  if (policy !== "preserve" && policy !== "reduce") {
    throw new RangeError("Master-number policy must be preserve or reduce.");
  }
  return policy;
}

function isMaster(decimal: string): boolean {
  return decimal === "11" || decimal === "22" || decimal === "33";
}

function debtAt(decimal: string, stage: number): KarmicDebtAnnotation | undefined {
  if (decimal !== "13" && decimal !== "14" && decimal !== "16" && decimal !== "19") {
    return undefined;
  }
  const number = Number(decimal) as KarmicDebtNumber;
  return Object.freeze({ number, stage, meaning: KARMIC_DEBT_MEANINGS[number] });
}

/** Exact decimal digit reduction with a frozen, JSON-safe receipt. */
export function reduceInteger(
  input: IntegerInput, options: ReductionOptions = {}
): ReductionResult {
  const decimal = decimalInteger(input);
  const policy = masterPolicy(options);
  const steps: ReductionStep[] = [];
  const karmicDebts: KarmicDebtAnnotation[] = [];
  let current = decimal;

  while (true) {
    const annotation = debtAt(current, steps.length);
    if (annotation !== undefined) karmicDebts.push(annotation);
    if (current.length === 1 || (policy === "preserve" && isMaster(current))) break;

    const digits = Array.from(current, (digit) => Number(digit));
    // The digit limit makes even the first sum a safe integer.
    const output = String(digits.reduce((sum, digit) => sum + digit, 0));
    steps.push(Object.freeze({ input: current, digits: Object.freeze(digits), output }));
    current = output;
  }

  const value = Number(current) as ReducedNumber;
  return Object.freeze({
    value,
    meaning: NUMBER_MEANINGS[value],
    karmicDebts: Object.freeze(karmicDebts),
    receipt: Object.freeze({
      schema: "numerology-reduction/1",
      input: decimal,
      masterNumbers: policy,
      steps: Object.freeze(steps),
      stopReason: current.length === 1 ? "single-digit" : "master-number"
    })
  });
}
