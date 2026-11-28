import type { ResultRow } from "./execution.js";
import type { WorkItem } from "./work.js";

export interface WorkerRequest {
  readonly taskId: string;
  readonly item: WorkItem;
}

export type WorkerResponse =
  | { readonly taskId: string; readonly ok: true; readonly row: ResultRow }
  | { readonly taskId: string; readonly ok: false; readonly code: "calculation-failed" };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object"
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

/** Check transport routing, not the astronomical content of the result. */
export function matchingResponse(value: unknown, request: WorkerRequest): value is WorkerResponse {
  if (!record(value) || value.taskId !== request.taskId) return false;
  if (value.ok === false) {
    return value.code === "calculation-failed"
      && Object.keys(value).every((key) => ["taskId", "ok", "code"].includes(key));
  }
  if (value.ok !== true || !record(value.row)
    || Object.keys(value).some((key) => !["taskId", "ok", "row"].includes(key))) return false;
  const { row } = value;
  const { item } = request;
  if (row.version !== 1 || row.kind !== item.kind || row.index !== item.index
    || row.nextCursor !== item.index + 1 || !record(row.value)) return false;
  const keys = ["version", "kind", "index", "nextCursor", "value"];
  switch (item.kind) {
    case "charts":
      keys.push("personId");
      if (row.personId !== item.person.id) return false;
      break;
    case "transit-grid":
      keys.push("personId", "sampleIndex", "at");
      if (row.personId !== item.person.id || row.sampleIndex !== item.sampleIndex || row.at !== item.at) return false;
      break;
    case "synastry-matrix":
      keys.push("aId", "bId");
      if (row.aId !== item.a.id || row.bId !== item.b.id) return false;
      break;
  }
  return Object.keys(row).every((key) => keys.includes(key));
}
