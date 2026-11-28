import type { FastifyInstance } from "fastify";
import type { CalculationRunner } from "./calculations.js";
import { routeDocs } from "./route-docs.js";
import { transits } from "../../src/index.js";
import type { TransitResult } from "../../src/index.js";
import { birthInputSchema, calculateNatal } from "./natal.js";
import type { NatalRequest } from "./natal.js";
import { RequestValidationError } from "./request-validation.js";
import { success } from "./responses.js";

export interface TransitsRequest {
  natal: NatalRequest;
  at: string | number;
}

export const transitsRequestSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["natal", "at"],
    properties: {
      natal: birthInputSchema,
      at: {
        ...birthInputSchema.properties.utc,
        description: "Resolved ISO calendar date or date-time with an explicit offset, or epoch milliseconds, read as UTC using the engine's default time basis. Date-only strings mean midnight UTC. Does not inherit natal timeScale or deltaT."
      }
    }
  },
  querystring: { type: "object", additionalProperties: false, properties: {} }
} as const;

export function calculateTransitsResponse(input: TransitsRequest, requestId: string) {
  const { natal, at } = input;
  const birth = calculateNatal(natal);
  // The transit API returns positions without a receipt. A location-free
  // chart at the same instant supplies their time basis and natal envelope.
  // Keep its default known time; missing location explains absent houses.
  const sky = calculateNatal({ utc: at });
  let result: TransitResult;
  try {
    result = transits(birth.chart, at);
  } catch (error) {
    if (error instanceof RangeError) throw new RequestValidationError();
    throw error;
  }
  // These envelopes cover their named charts, not the cross-chart aspects.
  // Return the complete engine result and the supporting chart unchanged.
  return success(requestId, { ...result, sky: sky.chart }, [
    { scope: "/data/natal", envelope: birth.envelope },
    { scope: "/data/sky", envelope: sky.envelope }
  ]);
}

export function registerTransitsRoute(app: FastifyInstance, runner?: CalculationRunner): void {
  app.post<{ Body: TransitsRequest }>("/v1/transits", { schema: transitsRequestSchema, config: { openapi: routeDocs.transits } }, async (request) => {
    return runner
      ? runner.run("transits", request.body, request.id)
      : calculateTransitsResponse(request.body, request.id);
  });
}
