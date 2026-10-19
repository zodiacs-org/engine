import type { Chart } from "@zodiacs/engine";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "@zodiacs/engine/receipt";
import { z } from "zod";
import { jsonObjectSchema, outputSchema } from "./contracts.js";
export type JsonValue = z.infer<ReturnType<typeof z.json>>;

/** Reject lossy conversion instead of dropping fields or rounding numbers. */
export function toJson(value: unknown): JsonValue {
  const ancestors = new Set<object>();
  function visit(item: unknown): JsonValue {
    if (item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (item instanceof Date) {
      if (!Number.isFinite(item.getTime())) throw new TypeError("Invalid result date.");
      return item.toISOString();
    }
    if (typeof item !== "object" || item === null) throw new TypeError("Result is not JSON-safe.");
    if (ancestors.has(item)) throw new TypeError("Cyclic result.");
    ancestors.add(item);
    try {
      if (Array.isArray(item)) return Array.from(item, visit);
      if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
        throw new TypeError("Result must contain plain objects.");
      }
      return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, visit(entry)]));
    } finally { ancestors.delete(item); }
  }
  return visit(value);
}
export function chartReceipt(role: string, chart: Chart, sourceInstant?: string) {
  const envelope = createNatalEnvelope(chart, sourceInstant === undefined ? undefined : { sourceInstant });
  const encoded = serializeNatalEnvelope(envelope);
  const parsed = parseNatalEnvelope(encoded);
  if (!parsed.ok) throw new TypeError("Engine receipt failed validation.");
  return { role, envelope: jsonObjectSchema.parse(JSON.parse(encoded)) };
}
export function structuredResult<S extends z.ZodType>(schema: S, data: unknown, receipts: ReturnType<typeof chartReceipt>[]) {
  const structuredContent = outputSchema(schema).parse({
    schemaVersion: "zodiacs-astro/1", data: toJson(data), receipts
  });
  return { content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }], structuredContent };
}
