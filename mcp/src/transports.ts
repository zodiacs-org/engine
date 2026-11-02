import { createServer as createHttpServer } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { createServer } from "./server.js";
import { createBearerAuthenticator, type BearerAuthSource } from "./auth.js";
import { EventSearchRunner } from "./event-search-runner.js";
import { HttpRateLimiter, resolveHttpLimits, type HttpLimits } from "./http-limits.js";
import type { Clock } from "./tools/transits.js";

export { MAX_REQUEST_BYTES } from "./http-limits.js";

export function startStdio(options: { clock?: Clock; eventSearchRunner?: EventSearchRunner; onerror?: (error: Error) => void } = {}) {
  const searches = options.eventSearchRunner ?? new EventSearchRunner();
  const running = serveStdio(() => createServer({ ...options, eventSearchRunner: searches }), {
    ...(options.onerror ? { onerror: options.onerror } : {})
  });
  let closed: Promise<void> | undefined;
  return { close: () => closed ??= (async () => {
    try { await running.close(); }
    finally { await searches.close(); }
  })() };
}

/** Local HTTP endpoint with optional operator-configured bearer authentication. */
export async function startHttp(options: { port?: number; auth?: BearerAuthSource; limits?: Partial<HttpLimits>; clock?: Clock; eventSearchRunner?: EventSearchRunner; onerror?: (error: Error) => void } = {}) {
  const port = options.port ?? 3000;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError("Invalid HTTP port.");
  const limits = resolveHttpLimits(options.limits);
  const rate = new HttpRateLimiter(limits);
  const authorized = options.auth === undefined ? undefined : await createBearerAuthenticator(options.auth);
  const searches = options.eventSearchRunner ?? new EventSearchRunner();
  const handler = createMcpHandler((context) => createServer({
    ...options, eventSearchRunner: searches,
    ...(context.requestInfo ? { requestSignal: context.requestInfo.signal } : {})
  }), {
    legacy: "stateless", maxRequestBodySize: limits.maxRequestBytes,
    ...(options.onerror ? { onerror: options.onerror } : {})
  });
  const route = toNodeHandler({
    async fetch(request, requestOptions) {
      const response = await handler.fetch(request, requestOptions);
      // Retain the SDK's SSE directives while keeping calculation responses private.
      const headers = new Headers(response.headers);
      const cacheControl = headers.get("Cache-Control");
      headers.set("Cache-Control", cacheControl ? `no-store, ${cacheControl}` : "no-store");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
  }, {
    maxRequestBodySize: limits.maxRequestBytes,
    ...(options.onerror ? { onerror: options.onerror } : {})
  });
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  let closing = false;
  const server = createHttpServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (closing) { res.writeHead(503).end(); return; }
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    if (req.url !== "/mcp") { res.writeHead(404).end(); return; }
    const retryAfter = rate.take();
    if (retryAfter !== undefined) {
      res.writeHead(429, {
        "Retry-After": String(retryAfter), "Connection": "close", "Content-Type": "application/json"
      }).end(JSON.stringify({ error: "Too many requests" }));
      return;
    }
    if (authorized && !authorized(req)) {
      res.writeHead(401, {
        "WWW-Authenticate": 'Bearer realm="zodiacs-astro"',
        "Content-Type": "application/json", "Connection": "close"
      }).end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    // Explicit fields bridge the SDK's optional-property types under exactOptionalPropertyTypes.
    void route({
      method: req.method ?? "GET", url: req.url ?? "/", headers: req.headers,
      // Let the adapter flush its 413 response before closing an oversized stream.
      [Symbol.asyncIterator]: () => req.iterator({ destroyOnReturn: false })
    }, res).catch(() => {
      options.onerror?.(new Error("HTTP transport failed."));
      if (!res.headersSent) res.writeHead(500).end();
      else res.destroy();
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
    });
  } catch (error) { await handler.close(); await searches.close(); throw error; }
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP listener has no address.");
  let closed: Promise<void> | undefined;
  return {
    url: new URL(`http://127.0.0.1:${address.port}/mcp`),
    close(): Promise<void> {
      return closed ??= (async () => {
        closing = true;
        const stopped = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        try { await Promise.all([searches.close(), handler.close()]); }
        finally { server.closeAllConnections(); await stopped; }
      })();
    }
  };
}
