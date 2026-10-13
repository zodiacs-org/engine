import type { FastifyInstance, RouteOptions } from "fastify";
import { EPHEMERIS_SPAN, REFERENCE_SPAN } from "../../src/index.js";
import { CALC_SPAN } from "../../src/calc.js";
import { isPublicRoute } from "./auth.js";
import { admissionLimits } from "./admission-limit.js";
import { engineIdentity } from "./engine.js";
import { JSON_LIMITS } from "./request-validation.js";
import { DEFAULT_RATE_LIMIT, type RateLimitOptions } from "./rate-limit.js";
import { responseSchemas } from "./openapi-schemas.js";
import { routeDocs, type RouteDocumentation } from "./route-docs.js";
import { DEFAULT_RESOURCE_LIMITS, HTTP_LIMITS, type ResourceLimits } from "./resource-limits.js";

// The OpenAPI validator checks the generated document in tests. Its TypeScript
// declarations omit JSON Schema 2020-12 keywords such as prefixItems and const.
type Schema = Record<string, unknown>;
interface Header { description?: string; schema: Schema }
interface Response { description: string; headers: Record<string, Header>; content: Record<string, { schema: Schema }> }
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, Schema>): Schema => ({
  type: "object", additionalProperties: false, required: Object.keys(properties), properties
});
const emptyReceipts: Schema = { type: "array", maxItems: 0, items: false } as Schema;
const envelopeProperties = { requestId: { type: "string", format: "uuid" } as Schema, engine: ref("EngineIdentity") };

const errors = {
  "400": ["invalid_request", "Request is invalid."],
  "401": ["unauthorized", "A valid API key is required."],
  "404": ["not_found", "Route not found."],
  "408": ["invalid_request", "Request is invalid."],
  "413": ["body_too_large", "Request body is too large."],
  "414": ["uri_too_long", "Request URI is too long."],
  "415": ["unsupported_media_type", "Content type or encoding is not supported."],
  "422": ["receipt_unavailable", "The engine could not produce a receipt for this calculation."],
  "429": ["rate_limited", "API key request limit exceeded."],
  "500": ["internal_error", "Internal server error."],
  "503": ["not_ready", "Server is not ready."],
  "504": ["calculation_timeout", "Calculation deadline exceeded."],
  "431": ["invalid_request", "Request is invalid."]
} as const;

const headers: Record<string, Header> = {
  "X-Request-Id": { description: "Server-generated request identity. Matches requestId on enveloped responses.", schema: { type: "string", format: "uuid" } },
  "Cache-Control": { schema: { type: "string", const: "no-store" } },
  "X-Content-Type-Options": { schema: { type: "string", const: "nosniff" } }
};

function responseHeaders(protectedRoute: boolean): Record<string, Header> {
  return {
    ...headers,
    ...(protectedRoute ? {
      "X-RateLimit-Limit": { description: "Bucket capacity; present only when the request reaches per-key rate limiting after authentication. Early parser, router, admission and shutdown refusals may omit it.", schema: { type: "integer", minimum: 1 } },
      "X-RateLimit-Remaining": { description: "Whole tokens remaining; present only when the request reaches per-key rate limiting after authentication. Early parser, router, admission and shutdown refusals may omit it.", schema: { type: "integer", minimum: 0 } }
    } satisfies Record<string, Header> : {})
  };
}

function errorResponse(status: keyof typeof errors, protectedRoute: boolean): Response {
  const [code, message] = errors[status];
  // Parser/router failures can happen before authentication and token buckets.
  const hasBucket = protectedRoute && !["401", "408", "414", "431"].includes(status);
  return {
    description: `${code}: ${message}${protectedRoute && status === "503" ? " server_busy means the calculation queue is full." : ""}${protectedRoute && status === "500" ? " calculation_failed means the worker was lost." : ""} No partial result or calculation receipt is returned.`,
    headers: {
      ...responseHeaders(hasBucket),
      ...(status === "401" ? { "WWW-Authenticate": { schema: { type: "string", const: 'Bearer realm="engine-api"' } } } : {}),
      ...(status === "429" ? { "Retry-After": { description: "Wait until the client admission window resets or a per-key token is available, rounded up to seconds. Other requests can consume the allowance first.", schema: { type: "integer", minimum: 1 } } } : {})
    },
    content: {
      "application/json": {
        schema: object({ ...envelopeProperties, receipts: emptyReceipts, error: {
          oneOf: [
            [code, message],
            ...(status === "429" ? [["rate_limited", "Client request limit exceeded."]] : []),
            ...(protectedRoute && status === "503" ? [["server_busy", "Calculation capacity is full."]] : []),
            ...(protectedRoute && status === "500" ? [["calculation_failed", "Calculation worker failed."]] : [])
          ].map(([errorCode, errorMessage]) => object({
            code: { type: "string", const: errorCode }, message: { type: "string", const: errorMessage }
          }))
        } })
      }
    }
  };
}

function successSchema(doc: RouteDocumentation): Schema {
  if (doc.rawDocument) return ref(doc.dataSchema);
  const items = doc.receipts.map(({ scope, kind }) => object({
    scope: { type: "string", const: scope, description: "Server JSON pointer to the result covered by this engine receipt." },
    [kind === "natal" ? "envelope" : "receipt"]: ref(kind === "natal" ? "NatalEnvelope" : "HousesCalcReceipt")
  }));
  return object({
    ...envelopeProperties,
    data: ref(doc.dataSchema),
    receipts: items.length === 0 ? emptyReceipts : {
      type: "array", minItems: items.length, maxItems: items.length, prefixItems: items, items: false
    } as Schema
  });
}

function operation(route: RouteOptions, doc: RouteDocumentation, method: string): Record<string, unknown> {
  const protectedRoute = !isPublicRoute(method, route.url);
  const statuses: (keyof typeof errors)[] = ["400", "408", "414", "415", "429", "431", "500", "503"];
  if (protectedRoute) statuses.push("401", "413", "504");
  if (doc.receipts.some(({ kind }) => kind === "natal")) statuses.push("422");
  const responses: Record<string, Response> = {
    "200": {
      description: doc.rawDocument ? "Generated OpenAPI document." : "Complete result with engine identity and scoped receipts.",
      headers: responseHeaders(protectedRoute),
      content: { "application/json": { schema: successSchema(doc) } }
    }
  };
  for (const status of statuses) responses[status] = errorResponse(status, protectedRoute);
  const query = route.schema?.querystring;
  return {
    operationId: doc.operationId,
    summary: doc.summary,
    description: doc.description + (query ? " Query parameters are refused." : ""),
    security: protectedRoute ? [{ apiKey: [] }] : [],
    responses,
    ...(route.schema?.body ? {
      requestBody: {
        required: true,
        content: { "application/json": { schema: structuredClone(route.schema.body) as Schema, examples: doc.examples } }
      }
    } : {}),
    ...(query ? { "x-query-schema": structuredClone(query) } : {}),
    "x-receipt-scopes": doc.receipts,
    "x-rate-limit-cost": protectedRoute ? 1 : 0
  } as Record<string, unknown>;
}

/** Register before application routes and seal after them. Only route schemas
 * supply request contracts; documentation schemas never serialize responses. */
export function registerOpenApi(app: FastifyInstance, rateLimit: RateLimitOptions = DEFAULT_RATE_LIMIT, limits: ResourceLimits = DEFAULT_RESOURCE_LIMITS): () => void {
  const routes: RouteOptions[] = [];
  let sealed = false;
  let documentJson: string;
  app.addHook("onRoute", (route) => {
    if (!sealed) routes.push(route);
  });
  app.get("/openapi.json", {
    config: { openapi: routeDocs.openapi },
    schema: { querystring: { type: "object", additionalProperties: false, properties: {} } }
  }, async (_request, reply) => reply.type("application/json; charset=utf-8").send(documentJson));

  return () => {
    if (sealed) throw new Error("OpenAPI routes already sealed.");
    sealed = true;
    const paths: Record<string, Record<string, unknown>> = {};
    const operationIds = new Set<string>();
    for (const route of routes) {
      const doc = route.config?.openapi;
      if (!doc) throw new Error("An application route is missing OpenAPI documentation.");
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const method of methods) {
        if (operationIds.has(doc.operationId)) throw new Error("Duplicate OpenAPI operation identity.");
        operationIds.add(doc.operationId);
        const path = paths[route.url] ??= {};
        path[method.toLowerCase()] = operation(route, doc, method);
      }
    }
    const document = {
      openapi: "3.1.1",
      jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
      info: {
        title: "Zodiacs Engine HTTP API", version: "0.0.0",
        description: "Self-hosted HTTP adapter for this engine checkout. All examples are synthetic. Submit resolved instants; this API does not resolve local wall times. Schema acceptance is followed by engine calendar, coverage and flag checks. Receipts describe conventions and coverage, not signed authenticity. Client admission throttling precedes authentication, per-key token buckets and JSON validation. Parser/router failures may occur earlier. Unknown protected paths or methods return unauthorized, rate_limited or not_found as applicable."
      },
      servers: [{ url: "/", description: "This server; no request Host or forwarded header is copied into the document." }],
      paths,
      components: {
        securitySchemes: {
          apiKey: {
            type: "http", scheme: "bearer",
            description: "Opaque configured API key, not a JWT. Send one Authorization header as Bearer followed by one space and the key. Keys come from API_KEYS or API_KEYS_FILE and are never embedded in this document."
          }
        },
        schemas: {
          ...responseSchemas,
          HealthData: object({ status: { type: "string", const: "ok" } }),
          ReadinessData: object({ status: { type: "string", const: "ready" } }),
          OpenApiDocument: {
            type: "object", required: ["openapi", "info", "paths", "components"],
            properties: { openapi: { type: "string", const: "3.1.1" }, info: { type: "object" }, paths: { type: "object" }, components: { type: "object" } },
            additionalProperties: true,
            description: "Raw OpenAPI document; this response has no calculation envelope or receipts list."
          }
        },
        responses: { NotFound: errorResponse("404", true) }
      },
      "x-engine": engineIdentity,
      "x-resource-limits": {
        ...limits, ...HTTP_LIMITS,
        description: "The executable runs one calculation worker, with a bounded FIFO queue shared across keys. The calculation deadline includes queue wait and ends at the worker result, excluding JSON transfer. Admission follows authentication, rate limiting and validation. A full queue returns server_busy; recovery or shutdown returns not_ready; an expired calculation returns calculation_timeout with no partial result. Worker loss returns calculation_failed and rejects queued jobs as not_ready. Saturation alone does not fail readiness. Timed out active work terminates the worker before replacement. Deadlines are enforced by the HTTP event loop, subject to scheduling delay. The socket cap drops excess TCP connections without an HTTP response. Header timeout is the smaller of headersTimeoutMs and requestTimeoutMs; request timeout and socket inactivity timeout both use requestTimeoutMs. The shutdown deadline can end connections before their own deadlines."
      },
      "x-time-coverage": {
        referenceSpan: REFERENCE_SPAN,
        ephemerisSpan: EPHEMERIS_SPAN,
        housesSpan: CALC_SPAN,
        description: "Chart-based routes can compute outside referenceSpan and retain the outside-reference-span flag. Ephemeris limits apply to TT and all speed samples; accepting an input Date alone does not establish coverage. Returns require their whole search windows to be computable. Houses requires both UT1 and TT inside housesSpan, upper endpoint excluded. Read each engine receipt and bound for its measured scope."
      },
      "x-json-limits": {
        ...JSON_LIMITS,
        description: "UTF-8 bytes include punctuation and whitespace. Depth counts containers, root at one. Nodes count all values including containers, not property names. Numeric overflow, non-object roots, and __proto__/constructor/prototype keys are refused. Content-Type must be application/json with optional UTF-8 charset; compression is unsupported. GET requests must have no body."
      },
      "x-admission-limit": {
        ...admissionLimits(rateLimit),
        description: "All requests reaching onRequest spend one allowance per socket peer IP before authentication. Fixed process-wide windows. New clients are refused when the bounded table is full; entries reset together at the next window. Forwarding headers are ignored. Restarts and replicas have independent allowances."
      },
      "x-rate-limit": {
        ...rateLimit, costPerAuthenticatedRequest: 1,
        description: "Per-key token bucket shared across protected routes, initially full, refilled using monotonic elapsed time. Invalid authenticated requests consume tokens. Rate-limit rejections do not consume a token. Public GET routes do not spend per-key tokens, but all routes are subject to client admission throttling. Buckets reset on restart; replicas have independent allowances. These values describe this process configuration."
      }
    };
    // Serialize once. No request input or per-key state reaches the document,
    // and a client cannot mutate the snapshot returned to subsequent clients.
    documentJson = JSON.stringify(document);
  };
}
