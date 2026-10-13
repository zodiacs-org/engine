import { natalChart, synastry } from "@zodiacs/engine";
import { z } from "zod";
import { aspectTypeSchema, chartSchema } from "../chart-schema.js";
import { bodySchema, inputSchemas, outputSchema, type ToolInput } from "../contracts.js";
import { chartReceipt, structuredResult } from "../serialization.js";

const count = z.number().int().nonnegative();
const elements = z.strictObject({ fire: count, earth: count, air: count, water: count });
const modalities = z.strictObject({ cardinal: count, fixed: count, mutable: count });
const aspect = z.strictObject({
  a: bodySchema.describe("Body in the first chart."),
  aLon: z.number().min(0).lt(360).describe("First-chart longitude, degrees."),
  b: bodySchema.describe("Body in the second chart."),
  bLon: z.number().min(0).lt(360).describe("Second-chart longitude, degrees."),
  type: aspectTypeSchema, orb: z.number().nonnegative().describe("Aspect orb, degrees.")
});
export const synastryDataSchema = z.strictObject({
  synastry: z.strictObject({
    a: chartSchema, b: chartSchema, aspects: z.array(aspect), top: z.array(aspect),
    counts: z.strictObject({ conjunction: count, sextile: count, square: count, trine: count, opposition: count }),
    easeful: count.describe("Native count of trines and sextiles; not a compatibility score."),
    charged: count.describe("Native count of squares and oppositions; not a compatibility score."),
    elements: z.strictObject({ a: elements, b: elements }),
    modalities: z.strictObject({ a: modalities, b: modalities })
  })
});
export const synastryOutputSchema = outputSchema(synastryDataSchema);

function chartFor(birth: ToolInput<"synastry">["first"]) {
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

/** Preserve native pair summaries without adding interpretation or scores. */
export function synastryTool(input: unknown) {
  const { first, second } = inputSchemas.synastry.parse(input);
  const a = chartFor(first);
  const b = chartFor(second);
  return structuredResult(synastryDataSchema, { synastry: synastry(a, b) }, [
    chartReceipt("first-natal", a, first.utc), chartReceipt("second-natal", b, second.utc)
  ]);
}
