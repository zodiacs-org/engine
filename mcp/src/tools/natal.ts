import { natalChart } from "@zodiacs/engine";
import { z } from "zod";
import { chartSchema } from "../chart-schema.js";
import { inputSchemas, outputSchema } from "../contracts.js";
import { chartReceipt, structuredResult } from "../serialization.js";

export const natalDataSchema = z.strictObject({ chart: chartSchema });
export const natalOutputSchema = outputSchema(natalDataSchema);

/** Validation and calculation errors propagate to the protocol boundary. */
export function natalChartTool(input: unknown) {
  const { birth } = inputSchemas.natal_chart.parse(input);
  const chart = natalChart({
    utc: birth.utc,
    ...(birth.latitude === undefined ? {} : { latitude: birth.latitude }),
    ...(birth.longitude === undefined ? {} : { longitude: birth.longitude }),
    ...(birth.houseSystem === undefined ? {} : { houseSystem: birth.houseSystem }),
    ...(birth.timeKnown === undefined ? {} : { timeKnown: birth.timeKnown }),
    ...(birth.timeScale === undefined ? {} : { timeScale: birth.timeScale }),
    ...(birth.deltaT === undefined ? {} : { deltaT: birth.deltaT })
  });
  return structuredResult(natalDataSchema, { chart }, [chartReceipt("natal", chart, birth.utc)]);
}
