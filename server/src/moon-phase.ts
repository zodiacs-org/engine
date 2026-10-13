import type { FastifyInstance } from "fastify";
import type { CalculationRunner } from "./calculations.js";
import { routeDocs } from "./route-docs.js";
import { moonPhase } from "../../src/index.js";
import type { MoonPhase } from "../../src/index.js";
import { calculateNatal } from "./natal.js";
import { transitsRequestSchema } from "./transits.js";
import { RequestValidationError } from "./request-validation.js";
import { success } from "./responses.js";

export interface MoonPhaseRequest {
  at: string | number;
}

export const moonPhaseRequestSchema = {
  body: {
    type: "object", additionalProperties: false, required: ["at"],
    properties: {
      at: {
        ...transitsRequestSchema.body.properties.at,
        description: "Resolved ISO calendar date or date-time with an explicit offset, or epoch milliseconds, read as UTC using the engine's default time basis. Date-only strings mean midnight UTC."
      }
    }
  },
  querystring: { type: "object", additionalProperties: false, properties: {} }
} as const;

export function calculateMoonPhaseResponse(input: MoonPhaseRequest, requestId: string) {
  const { at } = input;
  const sky = calculateNatal({ utc: at });
  let result: MoonPhase;
  try {
    result = moonPhase(at);
  } catch (error) {
    if (error instanceof RangeError) throw new RequestValidationError();
    throw error;
  }
  // The engine's natal receipt covers the sky chart only. Phase angle,
  // illumination, waxing and name remain direct, unreceipted engine output.
  return success(requestId, { ...result, sky: sky.chart }, [
    { scope: "/data/sky", envelope: sky.envelope }
  ]);
}

export function registerMoonPhaseRoute(app: FastifyInstance, runner?: CalculationRunner): void {
  app.post<{ Body: MoonPhaseRequest }>("/v1/moon-phase", { schema: moonPhaseRequestSchema, config: { openapi: routeDocs.moon } }, async (request) => {
    return runner
      ? runner.run("moon-phase", request.body, request.id)
      : calculateMoonPhaseResponse(request.body, request.id);
  });
}
