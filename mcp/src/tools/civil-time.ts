import { ENGINE_VERSION } from "@zodiacs/engine";
import { TZDB, prepareLocalTime, resolveLocalToUtc } from "@zodiacs/engine/geo";
import { z } from "zod";
import { civilTimeSchema, inputSchemas, instantSchema } from "../contracts.js";
import { toJson } from "../serialization.js";

const causeSchema = z.enum(["dst", "legal-change", "date-line"]);
const transitionSchema = z.strictObject({
  at: instantSchema, offsetBeforeMinutes: z.number(), offsetAfterMinutes: z.number(), cause: causeSchema
});
const calendarSchema = z.enum(["gregorian", "julian"]);
const dataFormSchema = z.enum(["main+backzone", "main", "host"]);
const meanTimeSchema = z.strictObject({ longitude: z.number(), zoneOffsetMinutes: z.number() });
const resolutionSchema = z.strictObject({
  utc: instantSchema,
  offsetMinutes: z.number().describe("Minutes east of UTC at the instant; may be fractional."),
  flags: z.array(z.enum(["dst-gap", "dst-fold", "lmt"])),
  date: z.string().describe("Resolved proleptic Gregorian date."),
  writtenDate: z.string().describe("Date as written in its calendar."),
  calendar: calendarSchema,
  jump: z.strictObject({ kind: z.enum(["gap", "fold"]), cause: causeSchema }).nullable(),
  transition: transitionSchema.nullable(),
  localMeanTime: meanTimeSchema.nullable(),
  zone: z.strictObject({
    source: z.enum(["tzdb", "intl"]), tzdbVersion: z.string().nullable(), dataForm: dataFormSchema,
    abbreviation: z.string().nullable(), dst: z.boolean().nullable()
  }),
  intlOffsetMinutes: z.number().nullable(),
  calendarNote: z.strictObject({
    kind: z.enum(["old-style", "new-style"]),
    adoption: z.strictObject({
      code: z.string(), country: z.string(), region: z.string().nullable(), firstGregorian: z.string(),
      lastJulian: z.string(), sources: z.array(z.enum(["tzdb", "grotefend-1891", "grotefend-1898"])), note: z.string()
    })
  }).nullable(),
  localResolution: z.strictObject({
    date: z.string(), time: z.string(), timeZone: z.string(), offsetMinutes: z.number(),
    gapShiftMinutes: z.number(),
    policy: z.strictObject({ fold: z.literal("earlier"), gap: z.literal("shift-forward") }),
    calendar: calendarSchema.optional(), writtenDate: z.string().optional(),
    tzdbVersion: z.string().nullable().optional(), dataForm: dataFormSchema.optional(),
    clock: z.enum(["local-mean-time", "legal"]).optional(),
    transition: transitionSchema.nullable().optional(), localMeanTime: meanTimeSchema.nullable().optional()
  })
});
export const civilTimeDataSchema = z.strictObject({
  status: z.enum(["resolved", "gap", "fold"])
    .describe("gap: the wall time was skipped and moved forward; fold: it occurred twice and the earlier instant is given."),
  request: civilTimeSchema,
  resolution: resolutionSchema
});
/** Names the software and zone data used; it is not a chart receipt and carries no chart values. */
export const timeResolutionRecordSchema = z.strictObject({
  role: z.literal("time-resolution"),
  engine: z.strictObject({ name: z.literal("@zodiacs/engine"), version: z.string() }),
  shippedTzdb: z.strictObject({ version: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/), form: z.literal("main+backzone") })
    .describe("Zone history the engine ships, used before 1970."),
  answeredBy: z.strictObject({ source: z.enum(["tzdb", "intl"]), tzdbVersion: z.string().nullable(), dataForm: dataFormSchema })
    .describe("Which zone data gave this offset: the shipped history (tzdb) or the host's Intl.")
});
export const civilTimeOutputSchema = z.strictObject({
  schemaVersion: z.literal("zodiacs-astro/1"), data: civilTimeDataSchema, record: timeResolutionRecordSchema
});

/** Loads the shipped zone history when needed; validation and engine refusals propagate as tool errors. */
export async function resolveCivilTimeTool(input: unknown) {
  const request = inputSchemas.resolve_civil_time.parse(input);
  const { date, timeZone, longitude, calendar, country } = request;
  // Loads the zone's shipped history for a written date before 1971; a Julian date after
  // year 200 falls later in the Gregorian calendar, so the written date is enough.
  await prepareLocalTime(date, timeZone);
  const resolution = resolveLocalToUtc(date, request.time.slice(0, 5), timeZone, {
    ...(longitude === undefined ? {} : { longitude }),
    ...(calendar === undefined ? {} : { calendar }),
    ...(country === undefined ? {} : { country })
  });
  const structuredContent = civilTimeOutputSchema.parse({
    schemaVersion: "zodiacs-astro/1",
    data: { status: resolution.jump === null ? "resolved" : resolution.jump.kind, request, resolution: toJson(resolution) },
    record: {
      role: "time-resolution",
      engine: { name: "@zodiacs/engine", version: ENGINE_VERSION },
      shippedTzdb: { ...TZDB },
      answeredBy: { source: resolution.zone.source, tzdbVersion: resolution.zone.tzdbVersion, dataForm: resolution.zone.dataForm }
    }
  });
  return { content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }], structuredContent };
}
