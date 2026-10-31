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
/** Days in a month of a proleptic Gregorian or Julian year. */
function monthDays(year: number, month: number, calendar: "gregorian" | "julian") {
  const leap = calendar === "julian" ? year % 4 === 0 : (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}
/** A written local wall time; the engine resolves it to the minute, with no place lookup. */
export const civilTimeSchema = z.strictObject({
  date: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Use a date YYYY-MM-DD.")
    .describe("Local date as written, YYYY-MM-DD, in the calendar named by calendar."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/, "Use a time HH:MM or HH:MM:00.")
    .describe("Local wall time HH:MM, or HH:MM:00; the engine resolves to the minute."),
  timeZone: z.string().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+)*$/, "Use an IANA time zone name.")
    .describe("IANA time zone name, such as America/New_York."),
  longitude: z.number().min(-180).max(180).optional()
    .describe("Birthplace longitude, degrees east; used only inside a zone's local mean time era."),
  calendar: z.enum(["gregorian", "julian"]).optional().describe("Calendar of date; gregorian by default."),
  country: z.string().min(1).max(64).optional()
    .describe("ISO 3166-1 alpha-2 code or tzdata country name; adds a calendar note and never changes the instant.")
}).refine(({ date, calendar = "gregorian" }) => {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return day <= monthDays(year, month, calendar);
}, { message: "The day does not exist in that month and calendar.", path: ["date"] });
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
  }, "Search window must be ordered and no longer than 366 days."),
  resolve_civil_time: civilTimeSchema
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
