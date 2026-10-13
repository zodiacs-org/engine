import { Buffer } from "node:buffer";
import type { ResultRow } from "./execution.js";
import type { ValidatedJob } from "./model.js";
import { QUEUE_LIMITS, QueueError } from "./queue.js";
import type { LeaseRef, QueueErrorCode } from "./queue.js";
import { workItemAt } from "./work.js";

type JsonData = null | boolean | number | string | JsonData[] | { [key: string]: JsonData };

/** Capture primitive arguments before checking mutable state. Never run getters. */
export function queueFields(value: unknown, allowed: readonly string[], code: QueueErrorCode = "invalid-argument"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new QueueError(code);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new QueueError(code);
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key)) throw new QueueError(code);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !("value" in descriptor) || descriptor.value === undefined) throw new QueueError(code);
    copy[key] = descriptor.value;
  }
  return copy;
}

export function queueIdentifier(value: unknown, code: QueueErrorCode = "invalid-argument"): string {
  if (typeof value !== "string" || !value.length || value.length > QUEUE_LIMITS.maxIdentifierLength) {
    throw new QueueError(code);
  }
  return value;
}

export function queueLeaseRef(value: LeaseRef): LeaseRef {
  const fields = queueFields(value, ["jobId", "token", "owner", "expiresAt"], "lease-lost");
  return { jobId: queueIdentifier(fields.jobId, "lease-lost"), token: queueIdentifier(fields.token, "lease-lost") };
}

export function queueInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new QueueError("invalid-argument");
  }
  return value === 0 ? 0 : value;
}

export function queueOwner(value: unknown): string {
  if (typeof value !== "string" || value.length > QUEUE_LIMITS.maxOwnerLength
    || /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.exec(value)?.[0] !== value) {
    throw new QueueError("invalid-argument");
  }
  return value;
}

export function leaseDeadline(now: number, duration: unknown): number {
  return queueInteger(now + queueInteger(duration, 1), 0);
}

/** Strict JSON capture: no getters, toJSON hooks, holes or silent coercions. */
function chargeString(value: string, budget: { bytes: number }): string {
  // A lower bound before encoding prevents repeated large strings from
  // growing into an oversized allocation inside JSON.stringify. Escapes and
  // punctuation are charged by the final exact serialized-byte check.
  budget.bytes += Buffer.byteLength(value);
  if (budget.bytes > QUEUE_LIMITS.maxBatchBytes) throw new QueueError("invalid-result");
  return value;
}

function copyJson(value: unknown, budget: { nodes: number; bytes: number }, depth = 0): JsonData {
  if (++budget.nodes > QUEUE_LIMITS.maxResultNodes || depth > QUEUE_LIMITS.maxResultDepth) {
    throw new QueueError("invalid-result");
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return chargeString(value, budget);
  if (typeof value !== "object" || value === null) throw new QueueError("invalid-result");
  if (Array.isArray(value)) {
    if (value.length > QUEUE_LIMITS.maxResultNodes || Reflect.ownKeys(value).length !== value.length + 1) {
      throw new QueueError("invalid-result");
    }
    const copy: JsonData[] = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new QueueError("invalid-result");
      copy.push(copyJson(descriptor.value, budget, depth + 1));
    }
    return copy;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new QueueError("invalid-result");
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length > QUEUE_LIMITS.maxResultNodes) throw new QueueError("invalid-result");
  const copy: { [key: string]: JsonData } = Object.create(null) as { [key: string]: JsonData };
  for (const key of keys) {
    if (typeof key !== "string") throw new QueueError("invalid-result");
    chargeString(key, budget);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !("value" in descriptor)) throw new QueueError("invalid-result");
    copy[key] = copyJson(descriptor.value, budget, depth + 1);
  }
  return copy;
}

/** Stage the entire write before a backend changes either rows or progress. */
export function prepareResultBatch(job: ValidatedJob, cursor: number, rows: readonly ResultRow[]): string[] {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > QUEUE_LIMITS.maxBatchRows) {
    throw new QueueError("invalid-result");
  }
  const copy = copyJson(rows, { nodes: 0, bytes: 0 }) as unknown as ResultRow[];
  if (!copy[0] || !Number.isSafeInteger(copy[0].index) || copy[0].index < 0) throw new QueueError("invalid-result");
  if (copy[0].index !== cursor) throw new QueueError("cursor-conflict");
  if (copy.length > job.totalTasks - cursor) throw new QueueError("invalid-result");
  let bytes = 0;
  return copy.map((row, offset) => {
    const index = cursor + offset;
    if (!row || row.version !== 1 || row.kind !== job.spec.kind || row.index !== index
      || row.nextCursor !== index + 1 || row.value === null || typeof row.value !== "object" || Array.isArray(row.value)) {
      throw new QueueError("invalid-result");
    }
    const item = workItemAt(job, index);
    const keys = ["version", "kind", "index", "nextCursor", "value"];
    switch (item.kind) {
      case "charts":
        keys.push("personId");
        if (row.kind !== "charts" || row.personId !== item.person.id) throw new QueueError("invalid-result");
        break;
      case "transit-grid":
        keys.push("personId", "sampleIndex", "at");
        if (row.kind !== "transit-grid" || row.personId !== item.person.id
          || row.sampleIndex !== item.sampleIndex || row.at !== item.at) throw new QueueError("invalid-result");
        break;
      case "synastry-matrix":
        keys.push("aId", "bId");
        if (row.kind !== "synastry-matrix" || row.aId !== item.a.id || row.bId !== item.b.id) throw new QueueError("invalid-result");
        break;
    }
    if (Object.keys(row).some((key) => !keys.includes(key))) throw new QueueError("invalid-result");
    const encoded = JSON.stringify(row);
    bytes += Buffer.byteLength(encoded);
    if (bytes > QUEUE_LIMITS.maxBatchBytes) throw new QueueError("invalid-result");
    return encoded;
  });
}
