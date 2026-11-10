import type { BirthInput } from "../../src/types.js";

/** JSON subset of the engine's birth input. All instants use its UTC clock. */
export type BatchBirth = Readonly<
  Pick<BirthInput, "latitude" | "longitude" | "houseSystem" | "timeKnown"> & {
    utc: string;
  }
>;

export interface Person {
  readonly id: string;
  readonly birth: BatchBirth;
}

export interface ChartsJob {
  readonly version: 1;
  readonly kind: "charts";
  readonly births: readonly Person[];
}

export interface TransitGridJob {
  readonly version: 1;
  readonly kind: "transit-grid";
  readonly births: readonly Person[];
  /** UTC samples start + k * stepMs, with start included and end excluded. */
  readonly start: string;
  readonly end: string;
  readonly stepMs: number;
}

export interface SynastryMatrixJob {
  readonly version: 1;
  readonly kind: "synastry-matrix";
  /** Directed pairs in input row order, excluding self-pairs. */
  readonly people: readonly Person[];
}

export type JobSpec = ChartsJob | TransitGridJob | SynastryMatrixJob;

export interface ValidatedJob {
  readonly spec: JobSpec;
  /** Number of result rows, not a measurement of engine calls or runtime. */
  readonly totalTasks: number;
}

export interface ValidationLimits {
  readonly maxInputBytes: number;
  readonly maxPeople: number;
  readonly maxTasks: number;
}

export const DEFAULT_LIMITS: ValidationLimits = Object.freeze({
  maxInputBytes: 1_000_000,
  maxPeople: 10_000,
  maxTasks: 1_000_000,
});
