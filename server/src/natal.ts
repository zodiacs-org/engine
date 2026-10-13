import type { FastifyInstance } from "fastify";
import type { CalculationRunner } from "./calculations.js";
import { routeDocs } from "./route-docs.js";
import { HOUSE_SYSTEMS, natalChart } from "../../src/index.js";
import type { BirthInput, Chart, ChartFlag } from "../../src/index.js";
import { createNatalEnvelope } from "../../src/receipt.js";
import { RequestValidationError } from "./request-validation.js";
import { success } from "./responses.js";

/** The JSON forms of the engine's public birth input. */
export type NatalRequest = Omit<BirthInput, "utc"> & { utc: string | number };

const chartFlags = [
  "dst-gap", "dst-fold", "lmt", "no-time", "polar-fallback", "outside-reference-span"
] satisfies ChartFlag[];

// Shared with later chart routes and the generated OpenAPI document. Calendar
// validity, ephemeris coverage and flag consistency remain engine decisions.
export const birthInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["utc"],
  properties: {
    utc: {
      description: "Resolved ISO calendar date or date-time with an explicit offset, or epoch milliseconds. Read on timeScale, UTC by default. Date-only strings mean midnight on that scale.",
      anyOf: [
        { type: "string", minLength: 1, maxLength: 40 },
        { type: "number", minimum: -8_640_000_000_000_000, maximum: 8_640_000_000_000_000 }
      ]
    },
    latitude: { type: "number", minimum: -90, maximum: 90, description: "Degrees north; requires longitude." },
    longitude: { type: "number", minimum: -180, maximum: 180, description: "Degrees east; requires latitude." },
    houseSystem: { type: "string", enum: [...HOUSE_SYSTEMS], description: "Requested house system; the engine defaults to whole sign." },
    timeKnown: { type: "boolean", description: "Defaults to true. False keeps the supplied reference instant and omits angles and houses." },
    timeScale: { type: "string", enum: ["utc", "ut1", "tt"], description: "Scale of utc; defaults to UTC." },
    deltaT: { type: "number", minimum: -1e10, maximum: 1e10, description: "Pinned TT minus UT1, in seconds. Omit to use the engine's time basis." },
    flags: {
      type: "array", maxItems: 64, items: { type: "string", enum: chartFlags },
      description: "Time-resolution assertions or consistent derived flag echoes. The engine collapses duplicates and rejects contradictory claims."
    }
  },
  allOf: [
    { if: { required: ["latitude"] }, then: { required: ["longitude"] } },
    { if: { required: ["longitude"] }, then: { required: ["latitude"] } },
    // A timed chart at an exact pole has no rising point. The engine's natal
    // receipt refuses that geometry, so refuse the HTTP input before computing.
    {
      if: { required: ["timeKnown"], properties: { timeKnown: { const: false } } },
      else: { properties: { latitude: { type: "number", exclusiveMinimum: -90, exclusiveMaximum: 90 } } }
    }
  ]
} as const;

export const natalRequestSchema = {
  body: birthInputSchema,
  querystring: { type: "object", additionalProperties: false, properties: {} }
} as const;

export function calculateNatal(input: NatalRequest) {
  let chart: Chart;
  try {
    chart = natalChart(input);
  } catch (error) {
    // The engine documents RangeError for invalid/unsupported birth inputs.
    // Never expose its message, which can quote the supplied instant or field.
    if (error instanceof RangeError) throw new RequestValidationError();
    throw error;
  }
  // Keep the complete engine envelope so clients can parse it and replay the
  // chart. A codec refusal reaches the HTTP boundary; never return a partial
  // success or rewrite the chart to make a receipt pass validation.
  const envelope = createNatalEnvelope(chart, {
    sourceInstant: typeof input.utc === "string" ? input.utc : null
  });
  return { chart, envelope };
}

export function calculateNatalResponse(input: NatalRequest, requestId: string) {
  const { chart, envelope } = calculateNatal(input);
  return success(requestId, chart, [{ scope: "/data", envelope }]);
}

export function registerNatalRoute(app: FastifyInstance, runner?: CalculationRunner): void {
  app.post<{ Body: NatalRequest }>("/v1/natal", { schema: natalRequestSchema, config: { openapi: routeDocs.natal } }, async (request) => {
    return runner
      ? runner.run("natal", request.body, request.id)
      : calculateNatalResponse(request.body, request.id);
  });
}
