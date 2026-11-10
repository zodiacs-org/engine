// Runtime-neutral transport for compatibility checks. This is not an engine API.
export const EXACT_SCHEMA = "edge-exact/1";
export const EXACT_LIMITS = Object.freeze({ depth: 128, nodes: 100_000, bytes: 1_999_999 });

type ExactNode =
  | ["null"] | ["undefined"] | ["hole"]
  | ["boolean", boolean] | ["string", string]
  | ["number", string] | ["date", string]
  | ["array", ExactNode[]]
  | ["object", "ordinary" | "null", [string, ExactNode][]];
export type ExactEnvelope = [typeof EXACT_SCHEMA, ExactNode];
export interface ExactDifference {
  path: string;
  reason: "type" | "value" | "length" | "prototype" | "missing" | "unexpected";
  expected: string;
  actual: string;
}

export class ExactProtocolError extends TypeError {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ExactProtocolError";
  }
}

const propertyPath = (path: string, key: string) => `${path}[${JSON.stringify(key)}]`;
function fail(path: string, message: string): never { throw new ExactProtocolError(path, message); }

function budget() {
  let nodes = 0;
  return (path: string, depth: number) => {
    if (depth > EXACT_LIMITS.depth) fail(path, "Depth limit exceeded.");
    if (++nodes > EXACT_LIMITS.nodes) fail(path, "Node limit exceeded.");
  };
}

function checkText(text: string) {
  if (typeof text !== "string") fail("$", "Expected protocol text.");
  if (text.length > EXACT_LIMITS.bytes || new TextEncoder().encode(text).length > EXACT_LIMITS.bytes) {
    fail("$", "UTF-8 byte limit exceeded.");
  }
}

function numberBits(value: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  return Array.from(new Uint8Array(view.buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function numberFromBits(bits: string): number {
  const view = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < 8; i++) view.setUint8(i, Number.parseInt(bits.slice(i * 2, i * 2 + 2), 16));
  return view.getFloat64(0, false);
}

/** Encode every supported data value before JSON can call toJSON or omit it. */
export function serializeExact(value: unknown): string {
  const visit = budget();
  const ancestors = new Set<object>();
  function encode(item: unknown, path: string, depth: number): ExactNode {
    visit(path, depth);
    if (item === null) return ["null"];
    switch (typeof item) {
      case "undefined": return ["undefined"];
      case "boolean": return ["boolean", item];
      case "string": return ["string", item];
      case "number": return ["number", numberBits(item)];
      case "object": break;
      default: return fail(path, `Unsupported value type: ${typeof item}.`);
    }
    if (ancestors.has(item)) fail(path, "Cyclic result.");
    ancestors.add(item);
    try {
      const prototype = Object.getPrototypeOf(item);
      const keys = Reflect.ownKeys(item);
      if (keys.some((key) => typeof key === "symbol")) fail(path, "Symbol keys are unsupported.");
      if (prototype === Date.prototype) {
        if (keys.length) fail(path, "Date properties are unsupported.");
        let milliseconds: number;
        try { milliseconds = Date.prototype.getTime.call(item); }
        catch { return fail(path, "Unsupported Date receiver."); }
        return ["date", Number.isNaN(milliseconds) ? "invalid" : numberBits(milliseconds)];
      }
      const isArray = Array.isArray(item);
      if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
        fail(path, "Unsupported object prototype.");
      }
      const slots = new Map<string, unknown>();
      for (const key of keys as string[]) {
        if (isArray && key === "length") continue;
        const at = propertyPath(path, key);
        const index = Number(key);
        if (isArray && (!Number.isInteger(index) || index < 0 || index >= item.length || String(index) !== key)) {
          fail(at, "Extra array properties are unsupported.");
        }
        const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
        if (!("value" in descriptor)) fail(at, "Accessors are unsupported.");
        if (!descriptor.enumerable) fail(at, "Non-enumerable data is unsupported.");
        slots.set(key, descriptor.value);
      }
      if (isArray) {
        if (item.length >= EXACT_LIMITS.nodes) fail(path, "Node limit exceeded.");
        const elements: ExactNode[] = [];
        for (let i = 0; i < item.length; i++) {
          const at = `${path}[${i}]`;
          if (slots.has(String(i))) elements.push(encode(slots.get(String(i)), at, depth + 1));
          else { visit(at, depth + 1); elements.push(["hole"]); }
        }
        return ["array", elements];
      }
      return ["object", prototype === null ? "null" : "ordinary", [...slots.keys()].sort().map(
        (key) => [key, encode(slots.get(key), propertyPath(path, key), depth + 1)]
      )];
    } finally {
      // Shared references are data occurrences, not cycles (e.g. house angles).
      ancestors.delete(item);
    }
  }
  const envelope: ExactEnvelope = [EXACT_SCHEMA, encode(value, "$", 0)];
  const text = JSON.stringify(envelope);
  checkText(text);
  return text;
}

/** Parse only canonical protocol text; ordinary result JSON cannot pass. */
export function parseExact(text: string): ExactEnvelope {
  checkText(text);
  let envelope: unknown;
  try { envelope = JSON.parse(text); }
  catch { return fail("$", "Invalid protocol JSON."); }
  if (!Array.isArray(envelope) || envelope.length !== 2 || envelope[0] !== EXACT_SCHEMA) {
    fail("$", "Unsupported exact protocol envelope.");
  }
  const visit = budget();
  function validate(node: unknown, path: string, depth: number, allowHole = false): void {
    visit(path, depth);
    if (!Array.isArray(node)) fail(path, "Expected a tagged value.");
    const tag = node[0];
    const arity = tag === "object" ? 3 : ["null", "undefined", "hole"].includes(tag) ? 1 : 2;
    if (node.length !== arity) fail(path, "Invalid tagged value length.");
    switch (tag) {
      case "null": case "undefined": return;
      case "hole": if (!allowHole) fail(path, "Hole outside an array slot."); return;
      case "boolean": if (typeof node[1] !== "boolean") fail(path, "Expected a boolean."); return;
      case "string": if (typeof node[1] !== "string") fail(path, "Expected a string."); return;
      case "number": case "date": {
        const bits = node[1];
        if (tag === "date" && bits === "invalid") return;
        if (typeof bits !== "string" || bits.length !== 16 || !/^[0-9a-f]{16}$/.test(bits)) {
          fail(path, "Invalid binary64 hex.");
        }
        if (tag === "date") {
          const ms = numberFromBits(bits);
          if (!Number.isInteger(ms) || Math.abs(ms) > 8_640_000_000_000_000 || Object.is(ms, -0)) {
            fail(path, "Invalid Date timestamp.");
          }
        }
        return;
      }
      case "array":
        if (!Array.isArray(node[1])) fail(path, "Expected array slots.");
        for (let i = 0; i < node[1].length; i++) validate(node[1][i], `${path}[${i}]`, depth + 1, true);
        return;
      case "object": {
        if (node[1] !== "ordinary" && node[1] !== "null") fail(path, "Invalid record prototype.");
        if (!Array.isArray(node[2])) fail(path, "Expected record entries.");
        let previous: string | undefined;
        for (const entry of node[2]) {
          if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") {
            fail(path, "Invalid record entry.");
          }
          const key = entry[0] as string;
          if (previous !== undefined && key <= previous) fail(path, "Record keys must be sorted and unique.");
          previous = key;
          validate(entry[1], propertyPath(path, key), depth + 1);
        }
        return;
      }
      default: fail(path, "Unknown value tag.");
    }
  }
  validate(envelope[1], "$", 0);
  // Also rejects whitespace variants, alternate escapes and duplicate JSON keys.
  if (JSON.stringify(envelope) !== text) fail("$", "Noncanonical protocol JSON.");
  return envelope as ExactEnvelope;
}

function describe(node: ExactNode): string {
  switch (node[0]) {
    case "number": return `binary64:${node[1]}`;
    case "date": return `date:${node[1]}`;
    case "string": return JSON.stringify(node[1]);
    case "boolean": return String(node[1]);
    case "array": return `array(length=${node[1].length})`;
    case "object": return `object(prototype=${node[1]})`;
    default: return node[0];
  }
}

/** Validate both reports in full, then return the first data-path mismatch. */
export function compareExact(expectedText: string, actualText: string): ExactDifference | null {
  const expected = parseExact(expectedText)[1];
  const actual = parseExact(actualText)[1];
  function compare(left: ExactNode, right: ExactNode, path: string): ExactDifference | null {
    const mismatch = (reason: ExactDifference["reason"]): ExactDifference => ({
      path, reason, expected: describe(left), actual: describe(right)
    });
    if (left[0] !== right[0]) return mismatch("type");
    if (left[0] === "array" && right[0] === "array") {
      if (left[1].length !== right[1].length) return mismatch("length");
      for (let i = 0; i < left[1].length; i++) {
        const difference = compare(left[1][i]!, right[1][i]!, `${path}[${i}]`);
        if (difference) return difference;
      }
      return null;
    }
    if (left[0] === "object" && right[0] === "object") {
      if (left[1] !== right[1]) return mismatch("prototype");
      let i = 0, j = 0;
      while (i < left[2].length || j < right[2].length) {
        const a = left[2][i], b = right[2][j];
        if (a && (!b || a[0] < b[0])) {
          return { path: propertyPath(path, a[0]), reason: "missing", expected: describe(a[1]), actual: "absent" };
        }
        if (b && (!a || b[0] < a[0])) {
          return { path: propertyPath(path, b[0]), reason: "unexpected", expected: "absent", actual: describe(b[1]) };
        }
        const difference = compare(a![1], b![1], propertyPath(path, a![0]));
        if (difference) return difference;
        i++; j++;
      }
      return null;
    }
    return left[1] === right[1] ? null : mismatch("value");
  }
  return compare(expected, actual, "$");
}
