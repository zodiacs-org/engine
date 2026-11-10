import { natalChart } from "@zodiacs/engine";
import { lunarReturn, solarReturn } from "@zodiacs/engine/techniques";
import { z } from "zod";
import { chartSchema } from "../chart-schema.js";
import { inputSchemas, instantSchema, locationSchema, outputSchema, type ToolInput } from "../contracts.js";
import { chartReceipt, structuredResult } from "../serialization.js";

const returnFields = {
  natalLongitude: z.number().min(0).lt(360).describe("Natal tropical longitude, degrees."),
  instant: instantSchema.describe("Return instant on the engine's UTC time basis."),
  chart: chartSchema,
  location: locationSchema.nullable(),
  flags: z.array(z.literal("outside-reference-span")).describe("Coverage flags for the natal instant and search window.")
};
export const solarReturnDataSchema = z.strictObject({
  return: z.strictObject({ ...returnFields, body: z.literal("Sun"), selection: z.enum(["nearest", "most-recent"]) })
});
export const lunarReturnDataSchema = z.strictObject({
  return: z.strictObject({ ...returnFields, body: z.literal("Moon") })
});
export const solarReturnOutputSchema = outputSchema(solarReturnDataSchema);
export const lunarReturnOutputSchema = outputSchema(lunarReturnDataSchema);

function chartFor(birth: ToolInput<"solar_return">["birth"]) {
  return natalChart({
    utc: birth.utc,
    ...(birth.latitude === undefined ? {} : { latitude: birth.latitude }),
    ...(birth.longitude === undefined ? {} : { longitude: birth.longitude }),
    ...(birth.houseSystem === undefined ? {} : { houseSystem: birth.houseSystem }),
    ...(birth.timeKnown === undefined ? {} : { timeKnown: birth.timeKnown }),
    ...(birth.timeScale === undefined ? {} : { timeScale: birth.timeScale }),
    ...(birth.deltaT === undefined ? {} : { deltaT: birth.deltaT })
  });
}

/** Preserve native search selection, chart settings and refusals. */
export function solarReturnTool(input: unknown) {
  const { birth, near, location, houseSystem, selection } = inputSchemas.solar_return.parse(input);
  const natal = chartFor(birth);
  const result = solarReturn(natal, near, {
    ...(location === undefined ? {} : { location }),
    ...(houseSystem === undefined ? {} : { houseSystem }),
    ...(selection === undefined ? {} : { selection })
  });
  return structuredResult(solarReturnDataSchema, { return: result }, [
    chartReceipt("natal", natal, birth.utc), chartReceipt("solar-return", result.chart, result.instant.toISOString())
  ]);
}

export function lunarReturnTool(input: unknown) {
  const { birth, after, location, houseSystem } = inputSchemas.lunar_return.parse(input);
  const natal = chartFor(birth);
  const result = lunarReturn(natal, after, {
    ...(location === undefined ? {} : { location }),
    ...(houseSystem === undefined ? {} : { houseSystem })
  });
  return structuredResult(lunarReturnDataSchema, { return: result }, [
    chartReceipt("natal", natal, birth.utc), chartReceipt("lunar-return", result.chart, result.instant.toISOString())
  ]);
}
