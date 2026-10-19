import { natalChart, transits } from "@zodiacs/engine";
import { z } from "zod";
import { aspectTypeSchema, bodyPositionSchema, chartSchema } from "../chart-schema.js";
import { bodySchema, inputSchemas, instantSchema, outputSchema, type ToolInput } from "../contracts.js";
import { chartReceipt, structuredResult } from "../serialization.js";

export const interAspectSchema = z.strictObject({
  a: bodySchema.describe("Moving body."), aLon: z.number().min(0).lt(360),
  b: bodySchema.describe("Natal body."), bLon: z.number().min(0).lt(360),
  type: aspectTypeSchema, orb: z.number().nonnegative()
});
export const transitDataSchema = z.strictObject({
  transit: z.strictObject({
    natal: chartSchema, at: instantSchema,
    positions: z.array(bodyPositionSchema), aspects: z.array(interAspectSchema)
  }),
  sky: chartSchema.describe("Coordinate-free UTC chart supplying transit position provenance.")
});
export const transitOutputSchema = outputSchema(transitDataSchema);
export type Clock = () => Date;

function calculate(birth: ToolInput<"transits_at">["birth"], at: string) {
  // Defaults and natal time options belong only to the natal calculation.
  const natal = natalChart({
    utc: birth.utc,
    ...(birth.latitude === undefined ? {} : { latitude: birth.latitude }),
    ...(birth.longitude === undefined ? {} : { longitude: birth.longitude }),
    ...(birth.houseSystem === undefined ? {} : { houseSystem: birth.houseSystem }),
    ...(birth.timeKnown === undefined ? {} : { timeKnown: birth.timeKnown }),
    ...(birth.timeScale === undefined ? {} : { timeScale: birth.timeScale }),
    ...(birth.deltaT === undefined ? {} : { deltaT: birth.deltaT })
  });
  const transit = transits(natal, at);
  const sky = natalChart({ utc: at });
  return structuredResult(transitDataSchema, { transit, sky }, [
    chartReceipt("natal", natal, birth.utc), chartReceipt("transit-sky", sky, at)
  ]);
}

export function transitsAtTool(input: unknown) {
  const { birth, at } = inputSchemas.transits_at.parse(input);
  return calculate(birth, at);
}

/** Read the clock once per valid request and preserve that captured instant. */
export function transitsNowTool(input: unknown, clock: Clock = () => new Date()) {
  const { birth } = inputSchemas.transits_now.parse(input);
  const now = clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new RangeError("Clock must return a valid Date.");
  }
  return calculate(birth, now.toISOString());
}
