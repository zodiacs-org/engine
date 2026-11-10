import type { Chart, SynastryResult, TransitResult } from "../../src/types.js";
import { natalChart, synastry, transits } from "./engine.js";
import type { ValidatedJob } from "./model.js";
import { workItems } from "./work.js";
import type { WorkItem } from "./work.js";

/** Engine results on the JSON transport: Date values become ISO strings. */
export type JsonResult<T> = T extends Date ? string
  : T extends readonly (infer Item)[] ? JsonResult<Item>[]
    : T extends object ? { [Key in keyof T]: JsonResult<T[Key]> }
      : T;

interface ResultBase {
  readonly version: 1;
  readonly index: number;
  /** Next row to request after this row has been durably stored. */
  readonly nextCursor: number;
}

export interface ChartsResultRow extends ResultBase {
  readonly kind: "charts";
  readonly personId: string;
  readonly value: JsonResult<Chart>;
}

export interface TransitResultRow extends ResultBase {
  readonly kind: "transit-grid";
  readonly personId: string;
  readonly sampleIndex: number;
  readonly at: string;
  readonly value: JsonResult<TransitResult>;
}

export interface SynastryResultRow extends ResultBase {
  readonly kind: "synastry-matrix";
  readonly aId: string;
  readonly bId: string;
  readonly value: JsonResult<SynastryResult>;
}

export type ResultRow = ChartsResultRow | TransitResultRow | SynastryResultRow;

/** Fixed diagnostic fields; no supplied birth values or raw engine message. */
export class WorkExecutionError extends Error {
  override readonly name = "WorkExecutionError";
  readonly code = "calculation-failed";

  constructor(readonly index: number, readonly kind: WorkItem["kind"]) {
    super(`Calculation failed at work item ${index} (${kind}).`);
  }
}

function jsonResult<T>(value: T): JsonResult<T> {
  // Use the engine's normal JSON shape, but refuse non-finite results instead
  // of silently turning a failed numerical calculation into JSON null.
  const text = JSON.stringify(value, (_key, field: unknown) => {
    if (typeof field === "number" && !Number.isFinite(field)) {
      throw new RangeError("Non-finite calculation result.");
    }
    return field;
  });
  return JSON.parse(text) as JsonResult<T>;
}

/** Execute a work item produced from a validated job, without retained caches. */
export function executeWorkItem(item: WorkItem): ResultRow {
  const base = { version: 1 as const, index: item.index, nextCursor: item.index + 1 };
  try {
    switch (item.kind) {
      case "charts":
        return {
          ...base, kind: item.kind, personId: item.person.id,
          value: jsonResult(natalChart(item.person.birth)),
        };
      case "transit-grid":
        return {
          ...base, kind: item.kind, personId: item.person.id,
          sampleIndex: item.sampleIndex, at: item.at,
          value: jsonResult(transits(item.person.birth, item.at)),
        };
      case "synastry-matrix":
        return {
          ...base, kind: item.kind, aId: item.a.id, bId: item.b.id,
          value: jsonResult(synastry(item.a.birth, item.b.birth)),
        };
    }
  } catch {
    throw new WorkExecutionError(item.index, item.kind);
  }
}

/**
 * Pull one result at a time. Cursor validation is immediate, calculation is
 * deferred until next(). Failure ends this iterator at the unsuccessful row.
 */
export function executeSerial(job: ValidatedJob, cursor = 0): Generator<ResultRow, void, unknown> {
  const items = workItems(job, cursor);
  return (function* () {
    for (const item of items) yield executeWorkItem(item);
  })();
}
