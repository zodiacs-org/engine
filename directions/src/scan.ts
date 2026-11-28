import type { DirectionMotionConvention } from "./conventions.js";
import { parseHit } from "./hit.js";
import type { DirectionHit, HitInput, HitRefusal } from "./hit.js";

/** Implementation work cap, not an astronomical age or accuracy limit. */
export const SCAN_MAX_EVALUATIONS = 10_000;

export interface DirectionAgeRange {
  readonly fromYears: number;
  readonly toYears: number;
  readonly includeFrom: boolean;
  readonly includeTo: boolean;
}

type Request<Input> = Input extends HitInput
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

/** A finite contact list crossed with explicit motions on one supplied sphere. */
export type ScanInput = Request<HitInput>;

export interface ScanIndex {
  readonly selectionIndex: number;
  readonly motionIndex: number;
}

export interface ScanRow extends ScanIndex {
  /** The unchanged single-hit result, including its geometry and timing audit. */
  readonly hit: DirectionHit;
}

export interface ScanWork {
  /** Raw selection count times raw motion count, before deduplication. */
  readonly requestedEvaluations: number;
  readonly evaluated: number;
  readonly maxEvaluations: number;
}

export interface ScanComplete {
  readonly status: "complete";
  readonly ageRange: DirectionAgeRange;
  readonly hits: readonly ScanRow[];
  readonly work: ScanWork;
  readonly duplicateCount: number;
  /** Unique successful hits excluded by the explicit age interval. */
  readonly outsideAgeRangeCount: number;
}

type RefusalBase<Code extends string> = {
  readonly status: "refused";
  readonly stage: "scan";
  readonly code: Code;
  readonly message: string;
  readonly hits: readonly [];
};

export type ScanRefusal =
  | RefusalBase<"invalid-input">
  | (RefusalBase<"evaluation-budget"> & { readonly work: ScanWork })
  | (RefusalBase<"hit-refused"> & {
    readonly work: ScanWork; readonly at: ScanIndex; readonly cause: HitRefusal;
  })
  | (RefusalBase<"inconsistent-body"> & { readonly work: ScanWork; readonly at: ScanIndex });

export type ScanResult = ScanComplete | ScanRefusal;

/** Internal shared enumeration shape; individual adapters retain their hit audit. */
export type EvaluatedScanResult<Hit extends DirectionHit, Refusal> =
  | (Omit<ScanComplete, "hits"> & { readonly hits: readonly (ScanIndex & { readonly hit: Hit })[] })
  | Exclude<ScanRefusal, { readonly code: "hit-refused" }>
  | (Omit<Extract<ScanRefusal, { readonly code: "hit-refused" }>, "cause"> & { readonly cause: Refusal });

class InputError extends RangeError {}
function invalid(message: string): never { throw new InputError(message); }

function data(input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    return invalid("Scan input must consist of plain data objects.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (required.some(field => !Object.hasOwn(descriptors, field))
    || keys.some(key => typeof key !== "string" || ![...required, ...optional].includes(key))) {
    return invalid("Provide all required scan fields and no unknown fields.");
  }
  const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor) || !descriptor.enumerable) {
      return invalid("Scan fields must be explicit enumerable data properties.");
    }
    values[key] = descriptor.value;
  }
  return values;
}

/** Inspect lengths before materializing arrays or starting any hit work. */
function listLength(input: unknown): number {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
    return invalid("Selections and motions must be ordinary arrays.");
  }
  const length = Object.getOwnPropertyDescriptor(input, "length")!.value as number;
  if (length < 1 || length > SCAN_MAX_EVALUATIONS) {
    return invalid("Selections and motions must each contain from 1 to 10000 elements.");
  }
  return length;
}

function list(input: unknown, length: number): unknown[] {
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== length + 1 || keys.some(key => key !== "length"
    && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))) {
    return invalid("Scan arrays must be dense and contain no extra fields.");
  }
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const slot = descriptors[String(index)];
    if (!slot || !("value" in slot) || !slot.enumerable) {
      return invalid("Scan arrays must contain explicit enumerable data elements.");
    }
    result.push(slot.value);
  }
  return result;
}

function ageRange(input: unknown): DirectionAgeRange {
  const values = data(input, ["fromYears", "toYears", "includeFrom", "includeTo"]);
  const { fromYears, toYears, includeFrom, includeTo } = values;
  if (typeof fromYears !== "number" || !Number.isFinite(fromYears) || fromYears < 0
    || typeof toYears !== "number" || !Number.isFinite(toYears) || toYears < fromYears
    || typeof includeFrom !== "boolean" || typeof includeTo !== "boolean") {
    return invalid("Use ordered finite nonnegative ages and explicit boolean endpoint inclusion flags.");
  }
  return Object.freeze({ fromYears: fromYears === 0 ? 0 : fromYears, toYears: toYears === 0 ? 0 : toYears,
    includeFrom, includeTo });
}

function refusal<const Code extends string>(code: Code, message: string): RefusalBase<Code> {
  return { status: "refused", stage: "scan", code, message, hits: Object.freeze([]) };
}

/**
 * Validate unknown data and enumerate the selected first-turn hits atomically.
 * No time sampling, extra revolutions, ephemeris calls or inferred contacts.
 * Trusted same-realm proxies are not sandboxed; unexpected exceptions propagate.
 */
export function parseScan(input: unknown): ScanResult {
  return enumerateScan<DirectionHit, HitRefusal>(input, true, parseHit);
}

/** Shared internal scanner. Validation and budgets precede the evaluator. */
export function enumerateScan<Hit extends DirectionHit,
  Refusal extends { readonly status: "refused" }>(
  input: unknown, requireGeometry: boolean, evaluate: (request: unknown) => Hit | Refusal
): EvaluatedScanResult<Hit, Refusal> {
  try {
    const values = data(input,
      ["convention", ...(requireGeometry ? ["geometry"] : []), "selections", "motions", "yearUnit", "ageRange", "maxEvaluations"], ["solar"]);
    const range = ageRange(values.ageRange);
    const maxEvaluations = values.maxEvaluations;
    if (typeof maxEvaluations !== "number" || !Number.isSafeInteger(maxEvaluations)
      || maxEvaluations < 1 || maxEvaluations > SCAN_MAX_EVALUATIONS) {
      return invalid("maxEvaluations must be an integer from 1 to 10000.");
    }
    const selectionCount = listLength(values.selections);
    const motionCount = listLength(values.motions);
    // Both lengths are capped, so this product is an exact safe integer.
    const requestedEvaluations = selectionCount * motionCount;
    let evaluated = 0;
    const work = (): ScanWork => Object.freeze({ requestedEvaluations, evaluated, maxEvaluations });
    if (requestedEvaluations > maxEvaluations) {
      return Object.freeze({ ...refusal("evaluation-budget", "The raw selection/motion product exceeds maxEvaluations."), work: work() });
    }
    // Structural scan validation precedes all evaluations. Per-hit validation
    // and mathematical refusal codes remain owned by the existing hit API.
    const commonConvention = data(values.convention, ["system", "mode", "latitude", "key"]);
    const selections = list(values.selections, selectionCount).map(value => data(value, ["significator", "promissor", "contact"]));
    const motions = list(values.motions, motionCount).map(value => {
      const motion = data(value, ["motion"], ["converseConstruction"]);
      if (motion.motion === "direct" && Object.keys(motion).length === 1) return motion;
      if (motion.motion === "converse" && motion.converseConstruction === "placidus-role-swap") return motion;
      return invalid("Select direct, or converse with the explicit placidus-role-swap construction.");
    });
    const bodies = new Map<string, string>();
    const seen = new Set<string>();
    const hits: (ScanIndex & { readonly hit: Hit })[] = [];
    let duplicateCount = 0;
    let outsideAgeRangeCount = 0;
    for (let selectionIndex = 0; selectionIndex < selectionCount; selectionIndex++) {
      for (let motionIndex = 0; motionIndex < motionCount; motionIndex++) {
        const at = Object.freeze({ selectionIndex, motionIndex });
        evaluated++;
        const result = evaluate({
          convention: { ...commonConvention, ...motions[motionIndex] },
          ...(requireGeometry ? { geometry: values.geometry } : {}),
          ...selections[selectionIndex], yearUnit: values.yearUnit,
          ...(Object.hasOwn(values, "solar") ? { solar: values.solar } : {})
        });
        if (result.status === "refused") {
          return Object.freeze({ ...refusal("hit-refused", "A selected hit refused; the scan returns no partial hits."),
            work: work(), at, cause: result });
        }
        // A scan describes one sphere; a label must not acquire a different
        // original coordinate pair even if zero-both would project it away.
        for (const point of [result.significator, result.promissor]) {
          if (point.kind !== "body") continue;
          const coordinates = JSON.stringify(point.coordinates);
          const previous = bodies.get(point.id);
          if (previous !== undefined && previous !== coordinates) {
            return Object.freeze({ ...refusal("inconsistent-body", "One body label names different coordinates across scan selections."),
              work: work(), at });
          }
          bodies.set(point.id, coordinates);
        }
        // These are canonical fresh data from the hit evaluator, not raw input order or
        // computed ages. Geometry, key samples and year unit are common to this
        // scan. Original labels, coordinates, contact and motion remain distinct.
        const identity = JSON.stringify([result.convention, result.significator, result.promissor, result.contact]);
        if (seen.has(identity)) { duplicateCount++; continue; }
        seen.add(identity);
        const age = result.directedAgeYears;
        const inside = (range.includeFrom ? age >= range.fromYears : age > range.fromYears)
          && (range.includeTo ? age <= range.toYears : age < range.toYears);
        if (inside) hits.push(Object.freeze({ ...at, hit: result }));
        else outsideAgeRangeCount++;
      }
    }
    // Exact binary64 age ordering, then first raw enumeration index. No epsilon,
    // locale-sensitive string comparison or floating-point proximity merge.
    hits.sort((a, b) => a.hit.directedAgeYears - b.hit.directedAgeYears
      || a.selectionIndex - b.selectionIndex || a.motionIndex - b.motionIndex);
    return Object.freeze({ status: "complete", ageRange: range, hits: Object.freeze(hits), work: work(),
      duplicateCount, outsideAgeRangeCount });
  } catch (error) {
    if (error instanceof InputError) return Object.freeze(refusal("invalid-input", error.message));
    throw error;
  }
}

/** Pure typed scan API; runtime validation is identical to parseScan. */
export function scan(input: ScanInput): ScanResult { return parseScan(input); }
