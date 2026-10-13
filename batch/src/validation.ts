import { Buffer } from "node:buffer";
import type { HouseSystem } from "../../src/types.js";
import { DEFAULT_LIMITS } from "./model.js";
import type { BatchBirth, JobSpec, Person, ValidatedJob, ValidationLimits } from "./model.js";

export type ValidationCode = "invalid-input" | "unsupported-version" | "limit-exceeded";

/** Messages contain schema paths and fixed descriptions, never supplied values. */
export class JobValidationError extends Error {
  override readonly name = "JobValidationError";

  constructor(
    readonly code: ValidationCode,
    readonly path: string,
    description: string,
  ) {
    super(`${path}: ${description}`);
  }
}

const HOUSE_SYSTEMS: readonly HouseSystem[] = [
  "whole", "placidus", "porphyry", "equal", "equal-mc", "vehlow", "koch",
  "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian",
];

function fail(path: string, description: string, code: ValidationCode = "invalid-input"): never {
  throw new JobValidationError(code, path, description);
}

function record(value: unknown, path: string, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "expected an object");
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "expected a plain object");
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key)) fail(path, "unknown field");
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor) || !descriptor.enumerable || descriptor.value === undefined) {
      fail(path, "expected JSON data fields");
    }
    output[key] = descriptor.value;
  }
  return output;
}

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    fail(path, "expected a positive safe integer");
  }
  return value;
}

function limitsFor(overrides: Partial<ValidationLimits>): ValidationLimits {
  const values = record(overrides, "limits", ["maxInputBytes", "maxPeople", "maxTasks"]);
  return {
    maxInputBytes: positiveInteger("maxInputBytes" in values ? values.maxInputBytes : DEFAULT_LIMITS.maxInputBytes, "limits.maxInputBytes"),
    maxPeople: positiveInteger("maxPeople" in values ? values.maxPeople : DEFAULT_LIMITS.maxPeople, "limits.maxPeople"),
    maxTasks: positiveInteger("maxTasks" in values ? values.maxTasks : DEFAULT_LIMITS.maxTasks, "limits.maxTasks"),
  };
}

/** Deliberately narrower than DateInput: UTC ISO date-time with seconds. */
function instant(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length > 24) fail(path, "expected a UTC ISO date-time");
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (!match || match[0] !== value) fail(path, "expected a UTC ISO date-time");
  const normalized = `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`;
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== normalized) {
    fail(path, "invalid calendar date or clock time");
  }
  return normalized;
}

function coordinate(value: unknown, path: string, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > maximum) {
    fail(path, "coordinate outside its range in degrees");
  }
  return Object.is(value, -0) ? 0 : value;
}

function birth(value: unknown, path: string): BatchBirth {
  const fields = record(value, path, ["utc", "latitude", "longitude", "houseSystem", "timeKnown"]);
  const utc = instant(fields.utc, `${path}.utc`);
  let houseSystem: HouseSystem = "whole";
  if ("houseSystem" in fields) {
    if (!HOUSE_SYSTEMS.includes(fields.houseSystem as HouseSystem)) fail(`${path}.houseSystem`, "unknown house system");
    houseSystem = fields.houseSystem as HouseSystem;
  }
  if ("timeKnown" in fields && typeof fields.timeKnown !== "boolean") {
    fail(`${path}.timeKnown`, "expected a boolean");
  }
  const timeKnown = fields.timeKnown === undefined ? true : fields.timeKnown as boolean;
  if (("latitude" in fields) !== ("longitude" in fields)) fail(path, "coordinates must be supplied together");
  const place = "latitude" in fields ? {
    latitude: coordinate(fields.latitude, `${path}.latitude`, 90),
    longitude: coordinate(fields.longitude, `${path}.longitude`, 180),
  } : {};
  return Object.freeze({ utc, ...place, houseSystem, timeKnown });
}

function people(value: unknown, path: string, minimum: number, maximum: number): readonly Person[] {
  if (!Array.isArray(value) || value.length < minimum) fail(path, "too few input rows");
  if (value.length > maximum) fail(path, "too many input rows", "limit-exceeded");
  // JSON arrays contain only indexed, enumerable data properties and length.
  if (Reflect.ownKeys(value).length !== value.length + 1) fail(path, "expected a dense JSON array");
  const ids = new Set<string>();
  const rows: Person[] = [];
  for (let index = 0; index < value.length; index++) {
    const rowPath = `${path}[${index}]`;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(rowPath, "expected a data row");
    const fields = record(descriptor.value, rowPath, ["id", "birth"]);
    if (typeof fields.id !== "string" || /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.exec(fields.id)?.[0] !== fields.id) {
      fail(`${rowPath}.id`, "expected a bounded ASCII identifier");
    }
    if (ids.has(fields.id)) fail(`${rowPath}.id`, "duplicate identifier");
    ids.add(fields.id);
    rows.push(Object.freeze({ id: fields.id, birth: birth(fields.birth, `${rowPath}.birth`) }));
  }
  return Object.freeze(rows);
}

function boundedCount(count: bigint, limits: ValidationLimits): number {
  if (count > BigInt(limits.maxTasks)) fail("job", "too many result rows", "limit-exceeded");
  return Number(count);
}

function validate(value: unknown, limits: ValidationLimits): ValidatedJob {
  const fields = record(value, "job", ["version", "kind", "births", "people", "start", "end", "stepMs"]);
  if (fields.version !== 1) fail("job.version", "unsupported schema version", "unsupported-version");
  let spec: JobSpec;
  let totalTasks: number;
  switch (fields.kind) {
    case "charts": {
      record(value, "job", ["version", "kind", "births"]);
      const births = people(fields.births, "job.births", 1, limits.maxPeople);
      spec = { version: 1, kind: "charts", births };
      totalTasks = boundedCount(BigInt(births.length), limits);
      break;
    }
    case "transit-grid": {
      record(value, "job", ["version", "kind", "births", "start", "end", "stepMs"]);
      const births = people(fields.births, "job.births", 1, limits.maxPeople);
      const start = instant(fields.start, "job.start");
      const end = instant(fields.end, "job.end");
      const stepMs = positiveInteger(fields.stepMs, "job.stepMs");
      const duration = BigInt(Date.parse(end)) - BigInt(Date.parse(start));
      if (duration <= 0n) fail("job.end", "must be after start");
      const samples = (duration - 1n) / BigInt(stepMs) + 1n;
      totalTasks = boundedCount(samples * BigInt(births.length), limits);
      spec = { version: 1, kind: "transit-grid", births, start, end, stepMs };
      break;
    }
    case "synastry-matrix": {
      record(value, "job", ["version", "kind", "people"]);
      const rows = people(fields.people, "job.people", 2, limits.maxPeople);
      const n = BigInt(rows.length);
      totalTasks = boundedCount(n * (n - 1n), limits);
      spec = { version: 1, kind: "synastry-matrix", people: rows };
      break;
    }
    default:
      fail("job.kind", "unknown job kind");
  }
  return Object.freeze({ spec: Object.freeze(spec), totalTasks });
}

/** Validate in-process data and return a frozen, canonical snapshot. */
export function validateJob(value: unknown, overrides: Partial<ValidationLimits> = {}): ValidatedJob {
  return validate(value, limitsFor(overrides));
}

/** Check the UTF-8 byte budget before parsing a JSON request. */
export function parseJobJson(text: string, overrides: Partial<ValidationLimits> = {}): ValidatedJob {
  const limits = limitsFor(overrides);
  if (typeof text !== "string") fail("job", "expected JSON text");
  if (Buffer.byteLength(text, "utf8") > limits.maxInputBytes) fail("job", "request too large", "limit-exceeded");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail("job", "invalid JSON");
  }
  return validate(value, limits);
}
