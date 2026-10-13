import { randomUUID } from "node:crypto";
import Fastify, { LogController } from "fastify";
import type { FastifyError, FastifyReply, FastifyServerOptions } from "fastify";
import { NatalEnvelopeError } from "../../src/receipt.js";
import { verifyEngine } from "./engine.js";
import { failure, success } from "./responses.js";
import { ApiKeyStore } from "./api-keys.js";
import { registerAuthentication } from "./auth.js";
import { registerRateLimiting } from "./rate-limit-hook.js";
import type { RateLimitOptions } from "./rate-limit.js";
import { JSON_LIMITS, registerRequestValidation, RequestValidationError } from "./request-validation.js";
import { registerNatalRoute } from "./natal.js";
import { registerTransitsRoute } from "./transits.js";
import { registerSynastryRoute } from "./synastry.js";
import { registerReturnRoutes } from "./returns.js";
import { registerMoonPhaseRoute } from "./moon-phase.js";
import { registerHousesRoute } from "./houses.js";
import { registerOpenApi } from "./openapi.js";
import { routeDocs } from "./route-docs.js";
import type { CalculationRunner } from "./calculations.js";
import { CalculationError } from "./calculation-pool.js";
import { HTTP_LIMITS, resourceLimits, type ResourceLimits } from "./resource-limits.js";

export interface AppOptions {
  logger?: FastifyServerOptions["logger"];
  readiness?: () => boolean;
  apiKeys?: ApiKeyStore;
  rateLimit?: RateLimitOptions;
  monotonicNow?: () => number;
  calculations?: CalculationRunner;
  limits?: ResourceLimits;
}

function responseHeaders(reply: FastifyReply, requestId: string): void {
  reply.header("x-request-id", requestId);
  reply.header("cache-control", "no-store");
  reply.header("x-content-type-options", "nosniff");
}

/** Construct the app without opening a socket or installing process handlers. */
export function buildApp(options: AppOptions = {}) {
  let ready = false;
  let stopping = false;
  const limits = resourceLimits(options.limits);
  const app = Fastify({
    logger: options.logger ?? { level: "info" },
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    exposeHeadRoutes: false,
    bodyLimit: JSON_LIMITS.bytes,
    http: {
      maxHeaderSize: HTTP_LIMITS.headerBytes,
      headersTimeout: Math.min(HTTP_LIMITS.headersTimeoutMs, limits.requestTimeoutMs),
      connectionsCheckingInterval: HTTP_LIMITS.timeoutCheckIntervalMs
    },
    requestTimeout: limits.requestTimeoutMs,
    connectionTimeout: limits.requestTimeoutMs,
    keepAliveTimeout: HTTP_LIMITS.keepAliveTimeoutMs,
    // Keep the normal response envelope when a keepalive request races close().
    return503OnClosing: false,
    trustProxy: false,
    frameworkErrors(error, request, reply: FastifyReply) {
      // Router failures run before normal request hooks and error handlers.
      responseHeaders(reply, request.id);
      const tooLong = error.code === "FST_ERR_MAX_PARAM_LENGTH";
      const badUrl = error.code === "FST_ERR_BAD_URL";
      const status = tooLong ? 414 : badUrl ? 400 : 500;
      const code = tooLong ? "uri_too_long" : badUrl ? "invalid_request" : "internal_error";
      const message = tooLong ? "Request URI is too long." : badUrl ? "Request is invalid." : "Internal server error.";
      return reply.code(status).send(failure(request.id, code, message));
    },
    clientErrorHandler(error, socket) {
      // Node's parser has no Fastify request. Its error can contain rawPacket,
      // including credentials, so never pass it to the logger or response.
      if (socket.destroyed || !socket.writable) {
        socket.destroy();
        return;
      }
      const requestId = randomUUID();
      const overflow = error.code === "HPE_HEADER_OVERFLOW";
      const timeout = error.code === "ERR_HTTP_REQUEST_TIMEOUT";
      const status = overflow ? 431 : timeout ? 408 : 400;
      const phrase = overflow ? "Request Header Fields Too Large" : timeout ? "Request Timeout" : "Bad Request";
      const body = JSON.stringify(failure(requestId, "invalid_request", "Request is invalid."));
      app.log.info({ event: "http_request_rejected", reqId: requestId, statusCode: status });
      socket.end([
        `HTTP/1.1 ${status} ${phrase}`,
        "Content-Type: application/json; charset=utf-8",
        `Content-Length: ${Buffer.byteLength(body)}`,
        "Connection: close",
        "Cache-Control: no-store",
        "X-Content-Type-Options: nosniff",
        `X-Request-Id: ${requestId}`,
        "",
        body
      ].join("\r\n"));
    },
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: false, allErrors: false, ownProperties: true } }
  });
  app.server.maxConnections = limits.maxConnections;

  app.addHook("onReady", async () => {
    verifyEngine();
    ready = true;
  });
  app.addHook("preClose", async () => { ready = false; stopping = true; });

  app.addHook("onRequest", async (request, reply) => {
    responseHeaders(reply, request.id);
    if (stopping) return reply.code(503).send(failure(request.id, "not_ready", "Server is not ready."));
  });
  registerAuthentication(app, options.apiKeys ?? new ApiKeyStore());
  registerRateLimiting(app, options.rateLimit, options.monotonicNow);
  registerRequestValidation(app);
  // A body admitted before shutdown may finish arriving while the app drains.
  app.addHook("preHandler", async (request, reply) => {
    if (stopping) return reply.code(503).send(failure(request.id, "not_ready", "Server is not ready."));
  });
  app.addHook("onResponse", async (request, reply) => {
    request.log.info({
      event: "request_completed",
      method: request.method,
      route: request.routeOptions.url ?? "unmatched",
      statusCode: reply.statusCode,
      durationMs: reply.elapsedTime
    });
  });

  app.setNotFoundHandler(async (request, reply) => {
    return reply.code(404).send(failure(request.id, "not_found", "Route not found."));
  });
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    // Never log raw errors: parser errors and upstream messages can contain
    // headers, body fragments, birth details or other caller-controlled data.
    if (error instanceof CalculationError) {
      const status = error.code === "invalid_request" ? 400
        : error.code === "receipt_unavailable" ? 422
        : error.code === "calculation_timeout" ? 504
        : error.code === "internal_error" || error.code === "calculation_failed" ? 500 : 503;
      if (status >= 500) request.log.warn({ event: "calculation_rejected", code: error.code });
      return reply.code(status).send(failure(request.id, error.code, error.message));
    }
    if (error instanceof NatalEnvelopeError) {
      return reply.code(422).send(failure(request.id, "receipt_unavailable", "The engine could not produce a receipt for this calculation."));
    }
    if (error instanceof RequestValidationError) {
      const status = error.kind === "unsupported_media_type" ? 415 : 400;
      return reply.code(status).send(failure(request.id, error.kind, error.message));
    }
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply.code(413).send(failure(request.id, "body_too_large", "Request body is too large."));
    }
    if (error.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
      return reply.code(415).send(failure(request.id, "unsupported_media_type", "Content type or encoding is not supported."));
    }
    if (error.validation || error.code === "FST_ERR_CTP_INVALID_JSON_BODY" || error.code === "FST_ERR_CTP_EMPTY_JSON_BODY" || error.code === "FST_ERR_CTP_INVALID_CONTENT_LENGTH") {
      return reply.code(400).send(failure(request.id, "invalid_request", "Request is invalid."));
    }
    request.log.error({ event: "request_failed" });
    return reply.code(500).send(failure(request.id, "internal_error", "Internal server error."));
  });

  const sealOpenApi = registerOpenApi(app, options.rateLimit, limits);
  app.get("/healthz", { config: { openapi: routeDocs.health } }, async (request) => success(request.id, { status: "ok" }));
  app.get("/readyz", { config: { openapi: routeDocs.ready } }, async (request, reply) => {
    if (!ready || (options.readiness && !options.readiness())) {
      return reply.code(503).send(failure(request.id, "not_ready", "Server is not ready."));
    }
    return success(request.id, { status: "ready" });
  });
  registerNatalRoute(app, options.calculations);
  registerTransitsRoute(app, options.calculations);
  registerSynastryRoute(app, options.calculations);
  registerReturnRoutes(app, options.calculations);
  registerMoonPhaseRoute(app, options.calculations);
  registerHousesRoute(app, options.calculations);
  sealOpenApi();
  return app;
}
