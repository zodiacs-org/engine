import type { FastifyInstance } from "fastify";
import type { ApiKeyStore } from "./api-keys.js";
import { failure } from "./responses.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Opaque, process-local identity for the authenticated key; never a secret. */
    apiKeyId: string | null;
  }
}

/** Exact public GET routes, shared with the discovery document's security. */
export function isPublicRoute(method: string, route: string | undefined): boolean {
  return method === "GET" && (route === "/healthz" || route === "/readyz" || route === "/openapi.json");
}

/** Default protection applies to future routes and to the not-found handler. */
export function registerAuthentication(app: FastifyInstance, apiKeys: ApiKeyStore): void {
  app.decorateRequest("apiKeyId", null);
  app.addHook("onRequest", async (request, reply) => {
    const route = request.routeOptions.url;
    if (isPublicRoute(request.method, route)) return;

    // Node may discard duplicate Authorization headers. Count the original
    // fields before trusting the normalized header, including case variants.
    let authorizationCount = 0;
    for (let index = 0; index < request.raw.rawHeaders.length; index += 2) {
      if (request.raw.rawHeaders[index]!.toLowerCase() === "authorization") authorizationCount++;
    }
    const header = request.headers.authorization;
    if (authorizationCount === 1 && typeof header === "string") {
      const parts = header.split(" ");
      if (parts.length === 2 && parts[0]!.toLowerCase() === "bearer") {
        const principal = apiKeys.authenticate(parts[1]!);
        if (principal !== undefined) {
          request.apiKeyId = principal;
          return;
        }
      }
    }
    return reply.code(401)
      .header("www-authenticate", 'Bearer realm="engine-api"')
      .send(failure(request.id, "unauthorized", "A valid API key is required."));
  });
}
