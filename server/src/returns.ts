import type { FastifyInstance } from "fastify";
import { routeDocs } from "./route-docs.js";
import { lunarReturn, solarReturn } from "../../src/techniques.js";
import type { LunarReturn, ReturnOptions, SolarReturn, SolarReturnSelection } from "../../src/techniques.js";
import { createNatalEnvelope } from "../../src/receipt.js";
import { birthInputSchema, calculateNatal } from "./natal.js";
import type { NatalRequest } from "./natal.js";
import { RequestValidationError } from "./request-validation.js";
import { success } from "./responses.js";

interface ReturnRequest extends ReturnOptions {
  natal: NatalRequest;
}

export interface SolarReturnRequest extends ReturnRequest {
  at: string | number;
  selection?: SolarReturnSelection;
}

export interface LunarReturnRequest extends ReturnRequest {
  after: string | number;
}

const returnProperties = {
  natal: birthInputSchema,
  location: {
    description: "Place for the return chart. Omit to inherit natal coordinates; null omits angles and houses. Exact geographic poles are refused because the return chart has a known time.",
    anyOf: [
      { type: "null" },
      {
        type: "object", additionalProperties: false, required: ["latitude", "longitude"],
        properties: {
          latitude: { type: "number", exclusiveMinimum: -90, exclusiveMaximum: 90, description: "Degrees north." },
          longitude: birthInputSchema.properties.longitude
        }
      }
    ]
  },
  houseSystem: {
    ...birthInputSchema.properties.houseSystem,
    description: "Requested system for the return chart; defaults to the natal chart's requested system."
  }
} as const;

const returnInstantSchema = {
  ...birthInputSchema.properties.utc,
  description: "Resolved ISO calendar date or date-time with an explicit offset, or epoch milliseconds, read as UTC using the engine's default time basis. Date-only strings mean midnight UTC. Does not inherit natal timeScale or deltaT."
} as const;

export const solarReturnRequestSchema = {
  body: {
    type: "object", additionalProperties: false, required: ["natal", "at"],
    properties: {
      ...returnProperties,
      at: returnInstantSchema,
      selection: {
        type: "string", enum: ["nearest", "most-recent"],
        description: "Defaults to nearest. The engine uses fixed search windows and steps; callers cannot expand the scan."
      }
    }
  },
  querystring: { type: "object", additionalProperties: false, properties: {} }
} as const;

export const lunarReturnRequestSchema = {
  body: {
    type: "object", additionalProperties: false, required: ["natal", "after"],
    properties: { ...returnProperties, after: returnInstantSchema }
  },
  querystring: { type: "object", additionalProperties: false, properties: {} }
} as const;

function returnOptions(input: ReturnRequest): ReturnOptions {
  const latitude = input.location === undefined ? input.natal.latitude : input.location?.latitude;
  // Even an untimed natal chart can supply a place. The return chart is always
  // timed, so refuse an inherited exact pole before the engine starts its scan.
  if (latitude !== undefined && Math.abs(latitude) === 90) throw new RequestValidationError();
  return {
    ...(input.location === undefined ? {} : { location: input.location }),
    ...(input.houseSystem === undefined ? {} : { houseSystem: input.houseSystem })
  };
}

export function registerReturnRoutes(app: FastifyInstance): void {
  app.post<{ Body: SolarReturnRequest }>("/v1/returns/solar", { schema: solarReturnRequestSchema, config: { openapi: routeDocs.solar } }, async (request) => {
    const input = request.body;
    const options = returnOptions(input);
    const natal = calculateNatal(input.natal);
    let result: SolarReturn;
    try {
      // The public engine owns the fixed search window, step and selection.
      // No arbitrary range, step, batch or event-search input is accepted.
      result = solarReturn(natal.chart, input.at, {
        ...options, ...(input.selection === undefined ? {} : { selection: input.selection })
      });
    } catch (error) {
      if (error instanceof RangeError) throw new RequestValidationError();
      throw error;
    }
    return response(request.id, natal, result);
  });

  app.post<{ Body: LunarReturnRequest }>("/v1/returns/lunar", { schema: lunarReturnRequestSchema, config: { openapi: routeDocs.lunar } }, async (request) => {
    const input = request.body;
    const options = returnOptions(input);
    const natal = calculateNatal(input.natal);
    let result: LunarReturn;
    try {
      result = lunarReturn(natal.chart, input.after, options);
    } catch (error) {
      if (error instanceof RangeError) throw new RequestValidationError();
      throw error;
    }
    return response(request.id, natal, result);
  });
}

function response(requestId: string, natal: ReturnType<typeof calculateNatal>, result: SolarReturn | LunarReturn) {
  // This chart came from the return function. Do not recompute it or attach the
  // caller's search instant as its source spelling. Natal envelopes cover the
  // two charts only, not the return search, selection or technique flags.
  const envelope = createNatalEnvelope(result.chart);
  return success(requestId, { ...result, natal: natal.chart }, [
    { scope: "/data/natal", envelope: natal.envelope },
    { scope: "/data/chart", envelope }
  ]);
}
