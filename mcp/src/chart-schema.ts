import { z } from "zod";
import { bodySchema, houseSystemSchema, instantSchema } from "./contracts.js";

const longitude = z.number().min(0).lt(360);
export const chartFlagSchema = z.enum([
  "dst-gap", "dst-fold", "lmt", "no-time", "polar-fallback", "outside-reference-span"
]);
export const aspectTypeSchema = z.enum(["conjunction", "sextile", "square", "trine", "opposition"]);
export const bodyPositionSchema = z.strictObject({
  body: bodySchema, lon: longitude.describe("Tropical ecliptic longitude of date, degrees."),
  lat: z.number().describe("Ecliptic latitude, degrees."),
  speed: z.number().describe("Longitude speed, degrees per day."),
  retrograde: z.boolean(),
  sign: z.enum(["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]),
  degree: z.number().min(0).lt(30)
});
export const deltaTSchema = z.strictObject({
  seconds: z.number(), sigma: z.number().nonnegative().nullable(),
  model: z.enum(["zodiacs-deltat/1", "iers-utc/1", "pinned"]),
  table: z.string().nullable(), tableDigest: z.string().nullable(),
  segment: z.enum(["long-term", "reconstructed", "observed", "predicted", "extrapolated", "pinned", "fallback"])
});
export const timeScaleSchema = z.strictObject({
  input: z.enum(["utc", "ut1", "tt"]), basis: z.enum(["iers", "delta-t", "pinned"]),
  ut1MinusUtc: z.strictObject({ seconds: z.number(), sigma: z.number().nonnegative(),
    source: z.enum(["observed", "predicted", "fallback"]) }).nullable(),
  leapSeconds: z.strictObject({ taiMinusUtc: z.number(), listed: z.boolean() }).nullable()
});
/** JSON representation of the native Chart, with Date serialized as ISO text. */
export const chartSchema = z.strictObject({
  input: z.strictObject({
    utc: instantSchema, timeScale: z.enum(["ut1", "tt"]).optional(),
    deltaT: z.number().optional(), latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(), houseSystem: houseSystemSchema,
    timeKnown: z.boolean(), flags: z.array(chartFlagSchema).optional()
  }),
  bodies: z.array(bodyPositionSchema),
  angles: z.strictObject({ asc: longitude, mc: longitude, dsc: longitude, ic: longitude }).nullable(),
  houses: z.strictObject({ system: houseSystemSchema, cusps: z.array(longitude).length(12) }).nullable(),
  aspects: z.array(z.strictObject({ a: bodySchema, b: bodySchema, type: aspectTypeSchema,
    orb: z.number().nonnegative(), applying: z.boolean() })),
  flags: z.array(chartFlagSchema), deltaT: deltaTSchema, timeScale: timeScaleSchema,
  engineVersion: z.string().min(1)
});
