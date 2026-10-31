import { moonPhase, natalChart, searchLongitudeCrossings } from "@zodiacs/engine";
import { z } from "zod";
import { chartSchema } from "../chart-schema.js";
import { bodySchema, inputSchemas, instantSchema, outputSchema } from "../contracts.js";
import { chartReceipt, structuredResult } from "../serialization.js";

export const EVENT_STEP_DAYS = 0.25;
export const EVENT_DEFAULT_MAX_SAMPLES = 10_000;
const crossingSchema = z.strictObject({ at: instantSchema, retrograde: z.boolean() });
const searchResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("complete"), crossings: z.array(crossingSchema), samples: z.number().int().nonnegative() }),
  z.strictObject({ status: z.literal("refused"), reason: z.literal("sample-budget"),
    crossings: z.array(crossingSchema).length(0), samples: z.number().int().nonnegative(),
    maxSamples: z.number().int().positive() })
]);
export const moonPhaseDataSchema = z.strictObject({
  phase: z.strictObject({ at: instantSchema, angle: z.number().min(0).lt(360).describe("Moon minus Sun elongation, degrees."),
    illumination: z.number().min(0).max(1).describe("Native elongation-based illuminated fraction."),
    name: z.enum(["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"]),
    waxing: z.boolean() }),
  sky: chartSchema
});
export const eventSearchDataSchema = z.strictObject({
  request: z.strictObject({ body: bodySchema, longitude: z.number().min(0).lt(360), from: instantSchema, to: instantSchema }),
  policy: z.strictObject({ stepDays: z.literal(EVENT_STEP_DAYS), maxSamples: z.number().int().min(1).max(100_000),
    interval: z.literal("(from,to]"), completeness: z.literal("not-proven") }),
  search: searchResultSchema
});
export const moonPhaseOutputSchema = outputSchema(moonPhaseDataSchema);
export const eventSearchOutputSchema = outputSchema(eventSearchDataSchema);

export function moonPhaseTool(input: unknown) {
  const { at } = inputSchemas.moon_phase.parse(input);
  const sky = natalChart({ utc: at });
  return structuredResult(moonPhaseDataSchema, { phase: moonPhase(at), sky }, [chartReceipt("phase-sky", sky, at)]);
}

/** Native bounded solver; refusal never exposes a partial set of events. */
export function eventSearchTool(input: unknown) {
  const { body, longitude, from, to, maxSamples = EVENT_DEFAULT_MAX_SAMPLES } = inputSchemas.event_search.parse(input);
  // Validate both endpoints and retain their time and coverage provenance even for a refused or empty scan.
  const start = natalChart({ utc: from });
  const end = natalChart({ utc: to });
  const search = searchLongitudeCrossings(body, longitude, new Date(from), new Date(to), {
    stepDays: EVENT_STEP_DAYS, maxSamples
  });
  const receipts = [chartReceipt("search-start", start, from), chartReceipt("search-end", end, to)];
  for (const [index, crossing] of search.crossings.entries()) {
    const at = crossing.at.toISOString();
    receipts.push(chartReceipt(`event-${index + 1}`, natalChart({ utc: at }), at));
  }
  return structuredResult(eventSearchDataSchema, {
    request: { body, longitude, from, to },
    policy: { stepDays: EVENT_STEP_DAYS, maxSamples, interval: "(from,to]", completeness: "not-proven" }, search
  }, receipts);
}
