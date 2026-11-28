/** Strings preserve exact integers beyond JavaScript's safe-number range. */
export type IntegerInput = number | bigint | string;
export type MasterPolicy = "preserve" | "reduce";
export type MasterNumber = 11 | 22 | 33;
export type KarmicDebtNumber = 13 | 14 | 16 | 19;
export type ReducedNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | MasterNumber;

export interface ReductionOptions {
  readonly masterNumbers?: MasterPolicy;
}

export interface ReductionStep {
  readonly input: string;
  readonly digits: readonly number[];
  readonly output: string;
}

export interface ReductionReceipt {
  readonly schema: "numerology-reduction/1";
  readonly input: string;
  readonly masterNumbers: MasterPolicy;
  readonly steps: readonly ReductionStep[];
  readonly stopReason: "single-digit" | "master-number";
}

export interface KarmicDebtAnnotation {
  readonly number: KarmicDebtNumber;
  /** Zero is the initial compound; each following stage is a step output. */
  readonly stage: number;
  readonly meaning: string;
}

export interface ReductionResult {
  readonly value: ReducedNumber;
  readonly meaning: string;
  readonly karmicDebts: readonly KarmicDebtAnnotation[];
  readonly receipt: ReductionReceipt;
}
