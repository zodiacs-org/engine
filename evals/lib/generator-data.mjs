import { createHash } from "node:crypto";

export const GENERATOR_FILE_BYTES = 1_048_576;

/** Canonical JSON for bounded ordinary data; arrays retain their given order. */
export function canonicalJson(value, limit = GENERATOR_FILE_BYTES) {
  const invalid = () => { throw new TypeError("Expected bounded, well-formed JSON data."); };
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > GENERATOR_FILE_BYTES) invalid();
  const ancestors = new Set();
  let nodes = 0;
  let bytes = 0;
  function account(text) {
    bytes += Buffer.byteLength(text, "utf8");
    if (bytes > limit) invalid();
    return text;
  }
  function encode(item, depth) {
    if (++nodes > 30_000 || depth > 32) invalid();
    if (item === null) return account("null");
    if (typeof item === "string") {
      if (item.length > limit || !item.isWellFormed()) invalid();
      return account(JSON.stringify(item));
    }
    if (typeof item === "boolean") return account(JSON.stringify(item));
    if (typeof item === "number" && Number.isFinite(item)) return account(JSON.stringify(item));
    if (typeof item !== "object" || ancestors.has(item)) invalid();
    const array = Array.isArray(item);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length > 30_000 || keys.some((key) => typeof key !== "string" ||
        !Object.hasOwn(descriptors[key], "value") || (!(array && key === "length") && !descriptors[key].enumerable))) invalid();
    if (array && (item.length > 30_000 || keys.length !== item.length + 1 ||
        keys.some((key) => key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key)))) invalid();
    ancestors.add(item);
    account(array ? "[]" : "{}");
    const parts = [];
    const ordered = array ? Array.from({ length: item.length }, (_, i) => String(i)) : keys.sort();
    for (const key of ordered) {
      if (!Object.hasOwn(descriptors, key) || key.length > limit || !key.isWellFormed()) invalid();
      if (parts.length) account(",");
      parts.push((array ? "" : account(JSON.stringify(key) + ":")) + encode(descriptors[key].value, depth + 1));
    }
    ancestors.delete(item);
    return (array ? "[" : "{") + parts.join(",") + (array ? "]" : "}");
  }
  return encode(value, 0);
}

export const sha256 = (text) => `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;

export function freezeData(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}
