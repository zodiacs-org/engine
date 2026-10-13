import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { assertCivilDate, assertCivilTime } from "./civil-time.js";
import type { Geocoder, GeocodeRequest } from "./geocoder.js";
import type { LookupOptions } from "./lookup.js";
import { createAdmissionController } from "./http-admission.js";
import type { AdmissionOptions } from "./http-admission.js";
import { createClientIdentifier } from "./http-client.js";

export { ADMISSION_DEFAULTS } from "./http-admission.js";
export type { AdmissionOptions } from "./http-admission.js";

export interface HttpServerOptions {
  readonly host?: string;
  /** Zero requests an ephemeral port. */
  readonly port?: number;
  readonly admission?: AdmissionOptions;
  /** Exact IP literals. Forwarding headers are ignored by default. */
  readonly trustedProxies?: readonly string[];
  readonly maxConnections?: number;
}

export interface GeocodeHttpServer {
  /** Listen once, explicitly. Resolves to the actual bound address. */
  start(): Promise<Readonly<AddressInfo>>;
  /** Stop accepting connections and drain requests, with bounded shutdown. */
  close(): Promise<void>;
}

// Transport limits, distinct from the library's query and result limits.
export const HTTP_LIMITS = Object.freeze({
  urlBytes: 4096, bodyBytes: 8192, headerBytes: 8192,
  headersTimeoutMs: 10_000, requestTimeoutMs: 15_000,
  idleTimeoutMs: 10_000, shutdownTimeoutMs: 1000, maxConnections: 128
});

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

function invalid(): never {
  throw new HttpError(400, "invalid-input", "Invalid request parameters. Check the route's documented input format.");
}

function send(res: ServerResponse, status: number, value: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  const body = `${JSON.stringify(value)}\n`;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"
  });
  res.end(body);
}

function parseTarget(req: IncomingMessage): { path: string; params: URLSearchParams } {
  const target = req.url ?? "";
  if (Buffer.byteLength(target) > HTTP_LIMITS.urlBytes) {
    throw new HttpError(414, "url-too-large", "Request URL exceeds the service limit.");
  }
  if (!target.startsWith("/") || target.startsWith("//") || target.includes("#")) invalid();
  const separator = target.indexOf("?");
  const path = separator < 0 ? target : target.slice(0, separator);
  const query = separator < 0 ? "" : target.slice(separator + 1);
  // URLSearchParams tolerates malformed escapes and UTF-8; refuse them first.
  try { decodeURIComponent(query.replace(/\+/gu, " ")); } catch { invalid(); }
  return { path, params: new URLSearchParams(query) };
}

function lookupInput(params: URLSearchParams): { query: string; filters: LookupOptions } {
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (!["query", "country", "region", "limit"].includes(key) || seen.has(key)) invalid();
    seen.add(key);
  }
  if (!params.has("query")) invalid();
  const filters: { country?: string; region?: string; limit?: number } = {};
  for (const key of ["country", "region"] as const) {
    if (params.has(key)) filters[key] = params.get(key)!;
  }
  if (params.has("limit")) {
    const limit = params.get("limit")!;
    if (!/^(?:[1-9][0-9]?|100)$/u.test(limit)) invalid();
    filters.limit = Number(limit);
  }
  return { query: params.get("query")!, filters };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const contentType = req.headers["content-type"] ?? "";
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/iu.test(contentType)
      || req.headers["content-encoding"] !== undefined) {
    throw new HttpError(415, "unsupported-media-type", "Supply uncompressed application/json encoded as UTF-8.");
  }
  const length = req.headers["content-length"];
  if (length !== undefined && Number(length) > HTTP_LIMITS.bodyBytes) {
    throw new HttpError(413, "body-too-large", "Request body exceeds the service limit.");
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  // Keep the request stream alive long enough to send a structured rejection
  // when a chunked body crosses the bound; the response closes the connection.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    bytes += (chunk as Buffer).length;
    if (bytes > HTTP_LIMITS.bodyBytes) {
      throw new HttpError(413, "body-too-large", "Request body exceeds the service limit.");
    }
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch { invalid(); }
}

function timeInput(value: unknown, geocoder: Geocoder): GeocodeRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const request = value as GeocodeRequest;
  const byQuery = Object.hasOwn(request, "query");
  const byId = Object.hasOwn(request, "placeId");
  const allowed = byQuery ? ["query", "filters", "date", "time"] : ["placeId", "date", "time"];
  if (byQuery === byId || !Object.hasOwn(request, "date")
      || Object.keys(request).some((key) => !allowed.includes(key))) invalid();
  try {
    if (Object.hasOwn(request, "time")) assertCivilTime(request.date, request.time as string);
    else assertCivilDate(request.date);
    // Validate using the existing lookup before asynchronous providers run.
    // Provider RangeErrors must remain operational errors, not client errors.
    if (byQuery) {
      if (Object.hasOwn(request, "filters") && request.filters === undefined) invalid();
      geocoder.lookup(request.query as string, request.filters);
    } else geocoder.getById(request.placeId as string);
  } catch { invalid(); }
  return request;
}

/** Node-only transport. No listening, file loading or logging on import. */
export function createGeocodeServer(geocoder: Geocoder, options: HttpServerOptions = {}): GeocodeHttpServer {
  if (!geocoder || typeof geocoder.lookup !== "function" || typeof geocoder.resolve !== "function"
      || typeof geocoder.getById !== "function") throw new RangeError("Expected an explicit geocoder.");
  if (!options || typeof options !== "object" || Array.isArray(options)
      || Object.keys(options).some((key) => !["host", "port", "admission", "trustedProxies", "maxConnections"].includes(key))
      || ["admission", "trustedProxies"].some((key) => Object.hasOwn(options, key) && options[key as keyof HttpServerOptions] === undefined)) {
    throw new RangeError("Invalid service options.");
  }
  const host = Object.hasOwn(options, "host") ? options.host : "127.0.0.1";
  const port = Object.hasOwn(options, "port") ? options.port : 0;
  const maxConnections = Object.hasOwn(options, "maxConnections") ? options.maxConnections : HTTP_LIMITS.maxConnections;
  if (typeof host !== "string" || !host || host.trim() !== host || /[\p{Cc}\p{Cs}]/u.test(host)
      || typeof port !== "number" || !Number.isInteger(port) || port < 0 || port > 65535
      || typeof maxConnections !== "number" || !Number.isInteger(maxConnections) || maxConnections < 1 || maxConnections > 100_000) {
    throw new RangeError("Expected a host and an integer TCP port, or zero for an ephemeral port.");
  }
  let state: "new" | "starting" | "listening" | "closed" = "new";
  let starting: Promise<Readonly<AddressInfo>> | undefined;
  let closing: Promise<void> | undefined;
  let cleanup: ReturnType<typeof setInterval> | undefined;
  const identify = createClientIdentifier(options.trustedProxies);
  const admission = createAdmissionController(options.admission);

  async function handle(req: IncomingMessage, res: ServerResponse, expectContinue = false): Promise<void> {
    let release: (() => void) | undefined;
    let workDone = false;
    let responseDone = false;
    function completed(): void {
      responseDone = true;
      if (workDone) release?.();
    }
    res.once("finish", completed);
    res.once("close", completed);
    try {
      let client: string;
      try { client = identify(req.socket.remoteAddress ?? "", req.rawHeaders); } catch { invalid(); }
      const decision = admission.acquire(client);
      if (decision.status !== "allowed") {
        res.setHeader("Retry-After", decision.retryAfterSeconds);
        throw decision.status === "rate-limited"
          ? new HttpError(429, "rate-limited", "Request rate exceeds the client limit. Retry after the stated delay.")
          : new HttpError(503, "overloaded", "The service admission limit is full. Retry later.");
      }
      release = decision.release;
      if (req.headers.expect !== undefined && !expectContinue) {
        throw new HttpError(417, "unsupported-expectation", "Request expectation is not supported.");
      }
      const { path, params } = parseTarget(req);
      if (path !== "/lookup" && path !== "/tz") {
        throw new HttpError(404, "not-found", "No such service route.");
      }
      const method = path === "/lookup" ? "GET" : "POST";
      if (req.method !== method) {
        res.setHeader("Allow", method);
        throw new HttpError(405, "method-not-allowed", "Method is not supported for this route.");
      }
      if (path === "/lookup") {
        if (req.headers["transfer-encoding"] !== undefined || Number(req.headers["content-length"] ?? 0) !== 0) invalid();
        const { query, filters } = lookupInput(params);
        let result;
        try { result = geocoder.lookup(query, filters); } catch { invalid(); }
        send(res, 200, { ...result, provenance: geocoder.provenance });
      } else {
        if ([...params].length) invalid();
        if (expectContinue) res.writeContinue();
        const request = timeInput(await readJson(req), geocoder);
        const result = await geocoder.resolve(request);
        send(res, 200, result);
      }
    } catch (error) {
      if (res.destroyed || res.writableEnded) return;
      // Close rather than consume an unbounded rejected request body. No raw
      // request, provider exception or filesystem path enters diagnostics.
      res.setHeader("Connection", "close");
      const failure = error instanceof HttpError ? error : new HttpError(
        500, "resolution-error", "The service could not complete the request; no fallback answer was substituted."
      );
      send(res, failure.status, { error: { code: failure.code, message: failure.message } });
    } finally {
      // Hold the slot until both work and response complete. A disconnected
      // caller cannot free a slot while its provider still runs.
      workDone = true;
      if (responseDone || res.destroyed) release?.();
    }
  }

  const server = createServer({
    maxHeaderSize: HTTP_LIMITS.headerBytes, headersTimeout: HTTP_LIMITS.headersTimeoutMs,
    requestTimeout: HTTP_LIMITS.requestTimeoutMs, connectionsCheckingInterval: 1000
  }, (req, res) => { void handle(req, res); });
  server.maxConnections = maxConnections;
  server.on("checkContinue", (req, res) => { void handle(req, res, true); });
  server.on("checkExpectation", (req, res) => { void handle(req, res); });
  server.setTimeout(HTTP_LIMITS.idleTimeoutMs, (socket) => { socket.destroy(); });
  server.on("clientError", (error: Error & { code?: string }, socket) => {
    if (!socket.writable || socket.writableEnded || error.code === "ECONNRESET") { socket.destroy(); return; }
    const status = error.code === "HPE_HEADER_OVERFLOW" ? 431 : 400;
    const body = JSON.stringify({ error: { code: "invalid-http", message: "Invalid HTTP request or oversized headers." } });
    socket.end(`HTTP/1.1 ${status} ${status === 431 ? "Request Header Fields Too Large" : "Bad Request"}\r\nConnection: close\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  });

  function start(): Promise<Readonly<AddressInfo>> {
    if (state !== "new") return Promise.reject(new Error("The service can only be started once."));
    state = "starting";
    starting = new Promise((resolve, reject) => {
      function failed(error: Error): void { state = "closed"; admission.close(); reject(error); }
      server.once("error", failed);
      server.listen({ host, port }, () => {
        server.removeListener("error", failed);
        state = "listening";
        cleanup = setInterval(() => admission.sweep(), admission.cleanupIntervalMs);
        cleanup.unref();
        resolve(Object.freeze({ ...(server.address() as AddressInfo) }));
      });
    });
    return starting;
  }

  function close(): Promise<void> {
    closing ??= (async () => {
      if (state === "starting") { try { await starting; } catch { return; } }
      if (cleanup !== undefined) clearInterval(cleanup);
      admission.close();
      if (state !== "listening") { state = "closed"; return; }
      state = "closed";
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => server.closeAllConnections(), HTTP_LIMITS.shutdownTimeoutMs);
        timeout.unref();
        server.close((error) => { clearTimeout(timeout); if (error) reject(error); else resolve(); });
      });
    })();
    return closing;
  }

  return Object.freeze({ start, close });
}
