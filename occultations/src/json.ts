import { Buffer } from "node:buffer";

export const JSON_LIMITS = Object.freeze({ maxBytes: 1_900_000, maxDepth: 64, maxNodes: 100_000 });

export interface JsonSerializationOptions {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
}

export type JsonSerializationFailure = "byte-limit" | "depth-limit" | "node-limit" |
  "unsupported-value" | "circular-value";

/** Fixed messages never disclose a value or an object key. */
export class JsonSerializationError extends Error {
  constructor(readonly code: JsonSerializationFailure) {
    super(`JSON serialization refused: ${code}.`);
    this.name = "JsonSerializationError";
  }
}

/**
 * Compact JSON with lexicographically ordered UTF-16 object keys. Array order
 * is retained, shared references are repeated, and negative zero becomes zero.
 * Only plain data objects and dense arrays are accepted. Getters and toJSON
 * hooks are never called. Limits apply while encoding, before a complete
 * oversized string can be allocated. These are transport bounds, not accuracy.
 */
export function serializeJson(value: unknown, options: JsonSerializationOptions = {}): string {
  if (options === null || typeof options !== "object" || Array.isArray(options) ||
    options instanceof Date ||
    Reflect.ownKeys(options).some((key) => typeof key !== "string" || !["maxBytes", "maxDepth", "maxNodes"].includes(key))) {
    throw new RangeError("JSON limits must be a supported options object.");
  }
  const maxBytes = Object.hasOwn(options, "maxBytes") ? options.maxBytes : undefined;
  const maxDepth = Object.hasOwn(options, "maxDepth") ? options.maxDepth : undefined;
  const maxNodes = Object.hasOwn(options, "maxNodes") ? options.maxNodes : undefined;
  const limits = {
    maxBytes: maxBytes === undefined ? JSON_LIMITS.maxBytes : maxBytes,
    maxDepth: maxDepth === undefined ? JSON_LIMITS.maxDepth : maxDepth,
    maxNodes: maxNodes === undefined ? JSON_LIMITS.maxNodes : maxNodes
  };
  for (const key of ["maxBytes", "maxDepth", "maxNodes"] as const) {
    const limit = limits[key];
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > JSON_LIMITS[key]) {
      throw new RangeError("JSON limits must be positive integers within the supported bounds.");
    }
  }
  let bytes = 0, nodes = 0, pending = "";
  const chunks: string[] = [];
  const ancestors = new Set<object>();
  function fail(code: JsonSerializationFailure): never { throw new JsonSerializationError(code); }
  const append = (part: string): void => {
    bytes += Buffer.byteLength(part, "utf8");
    if (bytes > limits.maxBytes) fail("byte-limit");
    pending += part;
    if (pending.length >= 1024) { chunks.push(pending); pending = ""; }
  };
  const string = (text: string): void => {
    // A lower bound avoids scanning a very long value that cannot fit. Escape
    // expansion and multibyte characters are accounted for by append below.
    if (text.length + 2 > limits.maxBytes - bytes) fail("byte-limit");
    append('"');
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      const char = text[i]!;
      if (char === '"') append('\\"');
      else if (char === "\\") append("\\\\");
      else if (code < 32) append(`\\u${code.toString(16).padStart(4, "0")}`);
      else if (code >= 0xd800 && code <= 0xdbff &&
        text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
        append(text.slice(i, i + 2)); i += 1;
      } else if (code >= 0xd800 && code <= 0xdfff) append(`\\u${code.toString(16).padStart(4, "0")}`);
      else append(char);
    }
    append('"');
  };
  const encode = (item: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > limits.maxNodes) fail("node-limit");
    if (depth > limits.maxDepth) fail("depth-limit");
    if (item === null) { append("null"); return; }
    if (typeof item === "string") { string(item); return; }
    if (typeof item === "boolean") { append(item ? "true" : "false"); return; }
    if (typeof item === "number") {
      if (!Number.isFinite(item)) fail("unsupported-value");
      append(String(item)); return;
    }
    if (typeof item !== "object") fail("unsupported-value");
    const object = item as object;
    if (ancestors.has(object)) fail("circular-value");
    const array = Array.isArray(object);
    if (!array && Object.getPrototypeOf(object) !== Object.prototype && Object.getPrototypeOf(object) !== null) {
      fail("unsupported-value");
    }
    if (Object.getOwnPropertySymbols(object).length) fail("unsupported-value");
    ancestors.add(object);
    if (array) {
      const values = object as unknown[];
      if (values.length > limits.maxNodes - nodes) fail("node-limit");
      // A sparse array or an array carrying extra enumerable fields is not a
      // JSON data array. Inspect descriptors without invoking accessors.
      for (const key in values) {
        if (Object.hasOwn(values, key) && (!/^(0|[1-9][0-9]*)$/u.test(key) ||
          Number(key) >= values.length)) fail("unsupported-value");
      }
      append("[");
      for (let i = 0; i < values.length; i += 1) {
        if (i) append(",");
        const field = Object.getOwnPropertyDescriptor(values, i);
        if (!field || !("value" in field)) fail("unsupported-value");
        encode(field.value, depth + 1);
      }
      append("]");
    } else {
      const keys: string[] = [];
      let minimumKeyBytes = 0;
      for (const key in object) {
        if (!Object.hasOwn(object, key)) continue;
        if (keys.length >= limits.maxNodes - nodes) fail("node-limit");
        minimumKeyBytes += key.length + 3;
        if (minimumKeyBytes > limits.maxBytes - bytes) fail("byte-limit");
        keys.push(key);
      }
      keys.sort();
      append("{");
      for (let i = 0; i < keys.length; i += 1) {
        if (i) append(",");
        const key = keys[i]!;
        const field = Object.getOwnPropertyDescriptor(object, key);
        if (!field || !("value" in field)) fail("unsupported-value");
        string(key); append(":"); encode(field.value, depth + 1);
      }
      append("}");
    }
    ancestors.delete(object);
  };
  encode(value, 0);
  if (pending) chunks.push(pending);
  return chunks.join("");
}
