/** Deterministic JSON for CLI results, not a signature or receipt authenticator. */
export function serializeCliJson(value: unknown): string {
  const active = new Set<object>();
  function encode(item: unknown): string {
    if (item === null) return "null";
    if (typeof item === "string" || typeof item === "boolean") return JSON.stringify(item);
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new TypeError("CLI JSON requires finite numbers.");
      return JSON.stringify(item);
    }
    if (item instanceof Date) {
      if (!Number.isFinite(item.getTime())) throw new TypeError("CLI JSON requires valid Dates.");
      return JSON.stringify(item.toISOString());
    }
    if (typeof item !== "object") throw new TypeError("Unsupported CLI JSON value.");
    if (active.has(item)) throw new TypeError("CLI JSON cannot contain cycles.");
    active.add(item);
    try {
      if (Array.isArray(item)) {
        const values: string[] = [];
        for (let i = 0; i < item.length; i += 1) values.push(encode(item[i]));
        return `[${values.join(",")}]`;
      }
      if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
        throw new TypeError("CLI JSON requires plain objects.");
      }
      const fields = item as Record<string, unknown>;
      return `{${Object.keys(fields).sort().filter((key) => fields[key] !== undefined)
        .map((key) => `${JSON.stringify(key)}:${encode(fields[key])}`).join(",")}}`;
    } finally {
      active.delete(item);
    }
  }
  return `${encode(value)}\n`;
}
