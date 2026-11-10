import { escapeText } from "./content-line.js";
import type { JsonValue } from "./types.js";

/** Sort object fields without rounding numbers or silently dropping non-JSON data. */
export function canonicalJson(value: JsonValue, ancestors = new Set<object>()): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    escapeText(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== "object" || value === null || ancestors.has(value)) {
    throw new RangeError("Expected finite, acyclic JSON data.");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Reflect.ownKeys(value).length !== value.length + 1) {
        throw new RangeError("JSON arrays must contain only dense indexed data.");
      }
      return `[${Array.from({ length: value.length }, (_, index) =>
        canonicalJson(dataProperty(value, String(index)), ancestors)).join(",")}]`;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new RangeError("Expected plain JSON objects.");
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) throw new RangeError("JSON keys must be strings.");
    return `{${(keys as string[]).sort()
      .map((key) => `${canonicalJson(key, ancestors)}:${canonicalJson(dataProperty(value, key), ancestors)}`).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function dataProperty(value: object, key: string): JsonValue {
  const property = Object.getOwnPropertyDescriptor(value, key);
  if (property === undefined || !property.enumerable || !("value" in property)) {
    throw new RangeError("JSON fields must be enumerable data properties.");
  }
  return property.value as JsonValue;
}

