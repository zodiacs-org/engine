import type { DirectionMotionConvention } from "./conventions.js";
import { hitFromNatal } from "./natal-hit.js";
import type { NatalHitResult, NatalHitSelection } from "./natal-hit.js";
import type { NatalSnapshot } from "./natal.js";
import { enumerateScan } from "./scan.js";
import type { DirectionAgeRange, ScanComplete, ScanIndex, ScanRefusal } from "./scan.js";

type Request<Input> = Input extends NatalHitSelection
  ? Omit<Input, "convention" | "significator" | "promissor" | "contact"> & {
    readonly convention: Omit<Input["convention"], "motion" | "converseConstruction"> & {
      readonly motion?: never;
      readonly converseConstruction?: never;
    };
    readonly selections: readonly Pick<Input, "significator" | "promissor" | "contact">[];
    readonly motions: readonly DirectionMotionConvention[];
    readonly ageRange: DirectionAgeRange;
    readonly maxEvaluations: number;
  } : never;

/** Explicit label-only contacts on one supplied natal snapshot. */
export type NatalScanInput = Request<NatalHitSelection>;

export interface NatalScanRow extends ScanIndex {
  readonly hit: Extract<NatalHitResult, { readonly status: "ok" }>;
}

export interface NatalScanComplete extends Omit<ScanComplete, "hits"> {
  readonly hits: readonly NatalScanRow[];
}

export type NatalScanRefusal = Exclude<ScanRefusal, { readonly code: "hit-refused" }>
  | (Omit<Extract<ScanRefusal, { readonly code: "hit-refused" }>, "cause"> & {
    readonly cause: Exclude<NatalHitResult, { readonly status: "ok" }>;
  });

export type NatalScanResult = NatalScanComplete | NatalScanRefusal;

/** Pure unknown-data scan; each evaluated hit retains the snapshot audit. */
export function parseNatalScan(snapshot: NatalSnapshot, input: unknown): NatalScanResult {
  return enumerateScan<NatalScanRow["hit"], Exclude<NatalHitResult, { readonly status: "ok" }>>(
    input, false, request => hitFromNatal(snapshot, request as NatalHitSelection));
}

/** Runtime validation and atomic scan semantics are identical to parseNatalScan. */
export function scanFromNatal(snapshot: NatalSnapshot, input: NatalScanInput): NatalScanResult {
  return parseNatalScan(snapshot, input);
}
