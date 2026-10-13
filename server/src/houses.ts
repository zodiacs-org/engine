import type { FastifyInstance } from "fastify";
import { houses } from "../../src/calc.js";
import type { CalcTime, HousesRequest, HousesResult, CalcRefusal } from "../../src/calc.js";
import { birthInputSchema } from "./natal.js";
import { RequestValidationError } from "./request-validation.js";
import { success } from "./responses.js";

export type HousesHttpRequest = Omit<HousesRequest, "time" | "zodiac"> & {
  time: Exclude<CalcTime, Date>;
  zodiac?: "tropical";
};

const isoSchema = birthInputSchema.properties.utc.anyOf[0];

// Keep the public calc vocabulary so the engine's recorded request can be
// replayed directly. No Date objects or custom/sidereal zodiac at this route.
export const housesRequestSchema = {
  body: {
    type: "object", additionalProperties: false, required: ["time", "place"],
    properties: {
      time: {
        description: "ISO calendar date or date-time with an explicit offset, an ISO object with optional deltaT, or a Julian date with an explicit scale and optional deltaT. Both UT1 and TT must lie in the engine's CALC_SPAN.",
        anyOf: [
          isoSchema,
          {
            type: "object", additionalProperties: false, required: ["iso"],
            properties: { iso: isoSchema, deltaT: birthInputSchema.properties.deltaT }
          },
          {
            type: "object", additionalProperties: false, required: ["jd", "scale"],
            properties: {
              jd: { type: "number", description: "Julian date on the named scale, not epoch milliseconds." },
              scale: { type: "string", enum: ["utc", "ut1", "tt"] },
              deltaT: birthInputSchema.properties.deltaT
            }
          }
        ]
      },
      place: {
        type: "object", additionalProperties: false, required: ["latitude", "longitude"],
        properties: {
          latitude: { type: "number", exclusiveMinimum: -90, exclusiveMaximum: 90, description: "Degrees north. Exact geographic poles have no rising point and are refused." },
          longitude: { type: "number", minimum: -180, maximum: 180, description: "Degrees east." }
        }
      },
      houseSystem: birthInputSchema.properties.houseSystem,
      zodiac: { type: "string", const: "tropical", description: "This route supports the tropical zodiac only, which is the engine default." }
    }
  },
  querystring: { type: "object", additionalProperties: false, properties: {} }
} as const;

export function registerHousesRoute(app: FastifyInstance): void {
  app.post<{ Body: HousesHttpRequest }>("/v1/houses", { schema: housesRequestSchema }, async (request) => {
    let result: HousesResult | CalcRefusal;
    try {
      result = houses(request.body);
    } catch (error) {
      if (error instanceof RangeError) throw new RequestValidationError();
      throw error;
    }
    // Typed refusals carry no receipt and can contain engine diagnostic text.
    // Use the same sanitized input error as other unsupported HTTP inputs.
    if (result.status === "refused") throw new RequestValidationError();
    return success(request.id, result, [{ scope: "/data", receipt: result.receipt }]);
  });
}
