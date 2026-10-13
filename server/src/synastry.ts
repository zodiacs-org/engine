import type { FastifyInstance } from "fastify";
import { routeDocs } from "./route-docs.js";
import { synastry } from "../../src/index.js";
import type { SynastryResult } from "../../src/index.js";
import { birthInputSchema, calculateNatal } from "./natal.js";
import type { NatalRequest } from "./natal.js";
import { RequestValidationError } from "./request-validation.js";
import { success } from "./responses.js";

export interface SynastryRequest {
  a: NatalRequest;
  b: NatalRequest;
}

export const synastryRequestSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["a", "b"],
    properties: { a: birthInputSchema, b: birthInputSchema }
  },
  querystring: { type: "object", additionalProperties: false, properties: {} }
} as const;

export function registerSynastryRoute(app: FastifyInstance): void {
  app.post<{ Body: SynastryRequest }>("/v1/synastry", { schema: synastryRequestSchema, config: { openapi: routeDocs.synastry } }, async (request) => {
    const a = calculateNatal(request.body.a);
    const b = calculateNatal(request.body.b);
    let result: SynastryResult;
    try {
      result = synastry(a.chart, b.chart);
    } catch (error) {
      if (error instanceof RangeError) throw new RequestValidationError();
      throw error;
    }
    // Natal receipts cover only a and b; the pair analysis is not part of them.
    return success(request.id, result, [
      { scope: "/data/a", envelope: a.envelope },
      { scope: "/data/b", envelope: b.envelope }
    ]);
  });
}
