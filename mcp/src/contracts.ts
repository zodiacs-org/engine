import { z } from "zod";
import { parseNatalEnvelope } from "@zodiacs/engine/receipt";

/** Resolved Gregorian instants; no implicit local zone or noon convention. */
export const instantSchema = z.iso.datetime({ offset: true }).refine((value) => {
  const fraction = value.match(/\.(\d+)/)?.[1];
  return (!fraction || fraction.length <= 3) && Number.isFinite(Date.parse(value));
}, "Use a resolved ISO instant with at most millisecond precision.");
export const houseSystemSchema = z.enum([
  "whole", "placidus", "porphyry", "equal", "equal-mc", "vehlow", "koch",
  "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian"
]);
export const bodySchema = z.enum([
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus",
  "Neptune", "Pluto", "North Node", "South Node"
]);
export const locationSchema = z.strictObject({
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180)
});
export const birthSchema = z.strictObject({
  utc: instantSchema,
  latitude: locationSchema.shape.latitude.optional(),
  longitude: locationSchema.shape.longitude.optional(),
  houseSystem: houseSystemSchema.optional(), timeKnown: z.boolean().optional(),
  timeScale: z.enum(["utc", "ut1", "tt"]).optional(),
  deltaT: z.number().min(-1e10).max(1e10).optional()
}).refine((b) => (b.latitude === undefined) === (b.longitude === undefined), {
  message: "Supply latitude and longitude together.", path: ["longitude"]
});
export const inputSchemas = {
  natal_chart: z.strictObject({ birth: birthSchema }),
  transits_at: z.strictObject({ birth: birthSchema, at: instantSchema }),
  transits_now: z.strictObject({ birth: birthSchema }),
  synastry: z.strictObject({ first: birthSchema, second: birthSchema }),
  solar_return: z.strictObject({
    birth: birthSchema, near: instantSchema, location: locationSchema.nullable().optional(),
    houseSystem: houseSystemSchema.optional(), selection: z.enum(["nearest", "most-recent"]).optional()
  }),
  lunar_return: z.strictObject({
    birth: birthSchema, after: instantSchema, location: locationSchema.nullable().optional(),
    houseSystem: houseSystemSchema.optional()
  }),
  moon_phase: z.strictObject({ at: instantSchema }),
  event_search: z.strictObject({
    body: bodySchema, longitude: z.number().min(0).lt(360),
    from: instantSchema, to: instantSchema,
    maxSamples: z.number().int().min(1).max(100_000).optional()
  }).refine(({ from, to }) => {
    const span = Date.parse(to) - Date.parse(from);
    return span >= 0 && span <= 366 * 86_400_000;
  }, "Search window must be ordered and no longer than 366 days.")
};
export type ToolName = keyof typeof inputSchemas;
export type ToolInput<T extends ToolName> = z.infer<(typeof inputSchemas)[T]>;
export const jsonObjectSchema = z.record(z.string(), z.json());
export const receiptRecordSchema = z.strictObject({ role: z.string().min(1), envelope: jsonObjectSchema.refine((value) => {
  try { return parseNatalEnvelope(JSON.stringify(value)).ok; } catch { return false; }
}, "Invalid native engine receipt envelope.") });
/** Each tool supplies its concrete data schema in its implementation milestone. */
export function outputSchema<S extends z.ZodType>(data: S) {
  return z.strictObject({
    schemaVersion: z.literal("zodiacs-astro/1"), data,
    receipts: z.array(receiptRecordSchema).min(1)
  });
}
