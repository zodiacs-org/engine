import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import { isIP } from "node:net";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { pipeline } from "node:stream/promises";
import { TextDecoder } from "node:util";
import { DEFAULT_LIMITS } from "./model.js";
import { prepareSubmission, queueFields, queueIdentifier, queueInteger } from "./queue-data.js";
import { QueueError } from "./queue.js";
import type { QueueBackend, SubmitOptions } from "./queue.js";
import { createResultStream, ResultStreamError, RESULT_STREAM_DEFAULTS } from "./result-stream.js";
import { JobValidationError } from "./validation.js";

export const HTTP_CONTROL_DEFAULTS = Object.freeze({
  maxBodyBytes: DEFAULT_LIMITS.maxInputBytes,
  requestTimeoutMs: 30_000,
  streamPollMs: RESULT_STREAM_DEFAULTS.pollMs,
  maxConcurrentRequests: 64,
  maxHeaderBytes: 16_384,
});

export interface HttpControlOptions {
  /** UTF-8 bytes for the entire submission envelope, including retry fields. */
  readonly maxBodyBytes?: number;
  /** Total time to receive a submission body, measured after its headers. */
  readonly requestTimeoutMs?: number;
  readonly streamPollMs?: number;
  /** Active handlers, including uploads and following result streams. */
  readonly maxConcurrentRequests?: number;
  /** Exact Host authorities. Omitted: loopback names at the socket's port. */
  readonly allowedHosts?: readonly string[];
  /** Exact HTTP(S) origins. Omitted: HTTP loopback origins at the socket's port. */
  readonly allowedOrigins?: readonly string[];
}

type HandlerOptions = Required<Pick<HttpControlOptions,
  "maxBodyBytes" | "requestTimeoutMs" | "streamPollMs" | "maxConcurrentRequests">>;

export interface ControlServer {
  /** Not listening yet. The embedding application chooses the bind address. */
  readonly server: Server;
  /** Abort HTTP consumers and close sockets. The caller still owns the queue. */
  close(): Promise<void>;
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

const invalidRequest = (): HttpError => new HttpError(400, "invalid-request", "Invalid HTTP request.");
const unavailable = (): HttpError => new HttpError(503, "unavailable", "The control service is unavailable; retry later.");
const tooLarge = (): HttpError => new HttpError(413, "body-too-large", "The submission body exceeds its byte limit.");

function publicError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof JobValidationError) {
    return new HttpError(error.code === "limit-exceeded" ? 413 : 400, error.code, error.message);
  }
  if (error instanceof QueueError) {
    if (error.code === "invalid-argument") return new HttpError(400, error.code, error.message);
    if (error.code === "idempotency-conflict") return new HttpError(409, error.code, error.message);
    if (error.code === "storage-busy" || error.code === "closed") return unavailable();
  }
  if (error instanceof ResultStreamError && error.code === "not-found") {
    return new HttpError(404, "not-found", "The requested job does not exist.");
  }
  return new HttpError(500, "internal-error", "The control operation failed.");
}

function json(response: ServerResponse, status: number, value: unknown): void {
  const encoded = JSON.stringify(value) + "\n";
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(encoded),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(encoded);
}

function sendError(request: IncomingMessage, response: ServerResponse, error: unknown): void {
  if (response.destroyed) return;
  if (response.headersSent) { response.destroy(); return; }
  // Do not consume an unbounded rejected body to keep a connection alive.
  if (!request.readableEnded) response.setHeader("Connection", "close");
  const failure = publicError(error);
  json(response, failure.status, { error: { code: failure.code, message: failure.message } });
}

function singleHeader(request: IncomingMessage, name: string): string | undefined {
  const values = request.headersDistinct[name];
  if (values && values.length !== 1) throw invalidRequest();
  return values?.[0];
}

// Parse literal authorities, never resolve DNS or normalize URL paths, userinfo,
// percent escapes, alternative numeric IP forms or trailing dots into loopback.
function authority(value: string, defaultPort = 80): string | undefined {
  const match = /^(\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::([1-9][0-9]{0,4}))?$/i.exec(value);
  if (!match || match[0] !== value) return undefined;
  const name = match[1]!.toLowerCase();
  if (name.startsWith("[")) {
    if (isIP(name.slice(1, -1)) !== 6) return undefined;
  } else if (name.length > 253 || name.split(".").some(label =>
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return undefined;
  const port = match[2] === undefined ? defaultPort : Number(match[2]);
  if (port > 65535) return undefined;
  return `${name}:${port}`;
}

function origin(value: string): string | undefined {
  const match = /^(https?):\/\/(.+)$/i.exec(value);
  if (!match || match[0] !== value) return undefined;
  const scheme = match[1]!.toLowerCase();
  const host = authority(match[2]!, scheme === "https" ? 443 : 80);
  return host === undefined ? undefined : `${scheme}://${host}`;
}

function allowlist(value: unknown, parse: (entry: string) => string | undefined): ReadonlySet<string> {
  if (!Array.isArray(value) || value.length > HTTP_CONTROL_DEFAULTS.maxHeaderBytes) throw new QueueError("invalid-argument");
  const captured = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const entry = Object.getOwnPropertyDescriptor(value, String(index));
    if (!entry || !("value" in entry) || typeof entry.value !== "string"
      || entry.value.length > HTTP_CONTROL_DEFAULTS.maxHeaderBytes) throw new QueueError("invalid-argument");
    const parsed = parse(entry.value);
    if (parsed === undefined) throw new QueueError("invalid-argument");
    captured.add(parsed);
  }
  return captured;
}

function requestBoundary(request: IncomingMessage, hosts: ReadonlySet<string> | undefined,
  origins: ReadonlySet<string> | undefined): void {
  const rawHost = singleHeader(request, "host");
  const rawOrigin = singleHeader(request, "origin");
  const host = rawHost === undefined ? undefined : authority(rawHost);
  const source = rawOrigin === undefined ? undefined : origin(rawOrigin);
  if (host === undefined || (rawOrigin !== undefined && source === undefined)) throw invalidRequest();
  const port = request.socket.localPort;
  const local = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  if (!(hosts ?? local).has(host)
    || (source !== undefined && !(origins ?? new Set([...local].map(name => `http://${name}`))).has(source))) {
    throw new HttpError(403, "forbidden", "The request host or origin is not allowed.");
  }
}

function submissionHeaders(request: IncomingMessage, maxBytes: number): string | undefined {
  const type = singleHeader(request, "content-type");
  const encoding = singleHeader(request, "content-encoding");
  if (!type || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(type)
    || (encoding !== undefined && encoding.toLowerCase() !== "identity")) {
    throw new HttpError(415, "unsupported-media-type", "Use an uncompressed UTF-8 application/json body.");
  }
  const length = singleHeader(request, "content-length");
  if (length !== undefined) {
    if (!/^\d+$/.test(length)) throw invalidRequest();
    if (BigInt(length) > BigInt(maxBytes)) throw tooLarge();
  }
  return singleHeader(request, "idempotency-key");
}

/** Avoid async iteration here: its early exit destroys the socket before 413. */
function readBody(request: IncomingMessage, maxBytes: number, timeoutMs: number, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(Math.min(maxBytes, 8192));
    let length = 0;
    const finish = (error?: unknown): void => {
      clearTimeout(timer);
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      signal.removeEventListener("abort", onAbort);
      request.pause();
      if (error !== undefined) { reject(error); return; }
      try {
        // Fatal decoding prevents malformed UTF-8 from silently changing a job.
        const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length));
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, "invalid-json", "The body must contain valid UTF-8 JSON."));
      }
    };
    const onData = (chunk: Buffer): void => {
      if (chunk.length > maxBytes - length) { finish(tooLarge()); return; }
      if (length + chunk.length > buffer.length) {
        const expanded = Buffer.alloc(Math.min(maxBytes, Math.max(length + chunk.length, buffer.length * 2)));
        buffer.copy(expanded, 0, 0, length);
        buffer = expanded;
      }
      buffer.set(chunk, length);
      length += chunk.length;
    };
    const onEnd = (): void => finish();
    const onError = (): void => finish(invalidRequest());
    const onAbort = (): void => finish(new ResultStreamError("aborted"));
    const timer = setTimeout(() => finish(new HttpError(408, "request-timeout", "The submission body timed out.")), timeoutMs);
    request.on("data", onData);
    request.once("end", onEnd);
    request.once("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

/** Abandon an uninterruptible backend call on disconnect, observing late errors. */
async function connected<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
  let onAbort: (() => void) | undefined;
  try {
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new ResultStreamError("aborted"));
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    const pending = Promise.resolve().then(() => {
      if (signal.aborted) throw new ResultStreamError("aborted");
      return operation();
    });
    return await Promise.race([pending, cancelled]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function route(request: IncomingMessage): { id?: string; operation: string; query: URLSearchParams } {
  // Parse the path literally, without URL dot-segment or backslash normalization.
  const target = request.url ?? "";
  if (!target.startsWith("/") || target.startsWith("//") || target.includes("#")) throw invalidRequest();
  const separator = target.indexOf("?");
  const path = separator < 0 ? target : target.slice(0, separator);
  const query = new URLSearchParams(separator < 0 ? "" : target.slice(separator + 1));
  if (path === "/v1/jobs") return { operation: "submit", query };
  const match = /^\/v1\/jobs\/([^/]+)(?:\/(progress|results))?$/.exec(path);
  if (!match) throw new HttpError(404, "not-found", "The requested route does not exist.");
  let id: string;
  try { id = decodeURIComponent(match[1]!); } catch { throw invalidRequest(); }
  queueIdentifier(id);
  return { id, operation: match[2] ?? "status", query };
}

async function handle(queue: QueueBackend, request: IncomingMessage, response: ServerResponse, options: HandlerOptions, signal: AbortSignal): Promise<void> {
  const target = route(request);
  const expected = target.operation === "submit" ? "POST" : "GET";
  if (request.method !== expected) {
    response.setHeader("Allow", expected);
    throw new HttpError(405, "method-not-allowed", "The route does not support this HTTP method.");
  }
  const allowed = target.operation === "results" ? ["cursor", "follow"] : [];
  for (const key of target.query.keys()) {
    if (!allowed.includes(key) || target.query.getAll(key).length !== 1) throw invalidRequest();
  }
  if (target.operation === "submit") {
    const key = submissionHeaders(request, options.maxBodyBytes);
    const input = await readBody(request, options.maxBodyBytes, options.requestTimeoutMs, signal);
    let body: Record<string, unknown>;
    try { body = queueFields(input, ["job", "retry"]); } catch {
      throw new JobValidationError("invalid-input", "submission", "expected an object with job and optional retry fields");
    }
    const submission = {
      ...(key !== undefined ? { idempotencyKey: key } : {}),
      ...("retry" in body ? { retry: body.retry } : {}),
    } as SubmitOptions;
    // Validate at the boundary even when an injected queue is used.
    const prepared = prepareSubmission(body.job, submission);
    const job = await connected(signal, () => queue.submit(prepared.job.spec, submission));
    response.setHeader("Location", `/v1/jobs/${encodeURIComponent(job.id)}`);
    json(response, 202, { job });
    return;
  }
  if (request.headers["transfer-encoding"] !== undefined
    || (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0")) throw invalidRequest();
  const id = target.id!;
  if (target.operation !== "results") {
    const job = await connected(signal, () => queue.getJob(id));
    if (!job) throw new HttpError(404, "not-found", "The requested job does not exist.");
    json(response, 200, target.operation === "status" ? { job } : {
      id: job.id, status: job.status, totalTasks: job.totalTasks,
      completedTasks: job.completedTasks, nextCursor: job.nextCursor,
    });
    return;
  }
  const rawCursor = target.query.get("cursor") ?? "0";
  if (!/^(0|[1-9]\d*)$/.test(rawCursor)) throw invalidRequest();
  const cursor = queueInteger(Number(rawCursor), 0);
  const rawFollow = target.query.get("follow") ?? "false";
  if (rawFollow !== "true" && rawFollow !== "false") throw invalidRequest();
  // Preflight detects missing jobs, invalid cursors and storage failures before
  // sending headers. Reuse that atomic first page to freeze finite exports.
  let first = await connected(signal, () => queue.readResults(id, { cursor, limit: RESULT_STREAM_DEFAULTS.pageSize }));
  if (!first) throw new HttpError(404, "not-found", "The requested job does not exist.");
  const source = createResultStream({
    async readResults(jobId, pageOptions) {
      if (first) { const page = first; first = null; return page; }
      return queue.readResults(jobId, pageOptions);
    },
  }, id, { cursor, follow: rawFollow === "true", pollMs: options.streamPollMs, signal });
  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.flushHeaders();
  // Once headers are sent, failures interrupt the response, never add JSON
  // error records to the result protocol or claim a clean truncated export.
  await pipeline(source, response);
}

/** Local control API. Does not start workers, listen, authenticate or own queue. */
export function createControlServer(queue: QueueBackend, options: HttpControlOptions = {}): ControlServer {
  const fields = queueFields(options, ["maxBodyBytes", "requestTimeoutMs", "streamPollMs", "maxConcurrentRequests", "allowedHosts", "allowedOrigins"]);
  const setting = (name: keyof HandlerOptions, max: number): number =>
    queueInteger(name in fields ? fields[name] : HTTP_CONTROL_DEFAULTS[name], 1, max);
  const captured = {
    maxBodyBytes: setting("maxBodyBytes", DEFAULT_LIMITS.maxInputBytes),
    requestTimeoutMs: setting("requestTimeoutMs", 2_147_483_647),
    streamPollMs: setting("streamPollMs", RESULT_STREAM_DEFAULTS.maxPollMs),
    maxConcurrentRequests: setting("maxConcurrentRequests", Number.MAX_SAFE_INTEGER),
  };
  const hosts = "allowedHosts" in fields ? allowlist(fields.allowedHosts, authority) : undefined;
  const origins = "allowedOrigins" in fields ? allowlist(fields.allowedOrigins, origin) : undefined;
  const sockets = new Set<Socket>();
  const controllers = new Set<AbortController>();
  const tasks = new Set<Promise<void>>();
  let closing: Promise<void> | undefined;
  let closed = false;
  const server = createServer({ maxHeaderSize: HTTP_CONTROL_DEFAULTS.maxHeaderBytes }, (request, response) => {
    try { requestBoundary(request, hosts, origins); } catch (error) { sendError(request, response, error); return; }
    if (closed || controllers.size >= captured.maxConcurrentRequests) { sendError(request, response, unavailable()); return; }
    const controller = new AbortController();
    controllers.add(controller);
    const abort = (): void => controller.abort();
    response.once("close", abort);
    request.once("aborted", abort);
    request.on("error", abort);
    const task = handle(queue, request, response, captured, controller.signal)
      .catch(error => { if (!controller.signal.aborted) sendError(request, response, error); })
      .finally(() => {
        response.off("close", abort);
        request.off("aborted", abort);
        request.off("error", abort);
        controllers.delete(controller);
        tasks.delete(task);
      });
    tasks.add(task);
  });
  // Body deadlines are enforced by readBody; Node retains its header timeout.
  server.requestTimeout = 0;
  server.on("connection", socket => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    if (closed) socket.destroy();
  });
  const expectation = (request: IncomingMessage, response: ServerResponse): void => {
    try { requestBoundary(request, hosts, origins); } catch (error) { sendError(request, response, error); return; }
    sendError(request, response, new HttpError(417, "invalid-request", "HTTP expectations are not supported."));
  };
  server.on("checkContinue", expectation);
  server.on("checkExpectation", expectation);
  return {
    server,
    close() {
      if (closing) return closing;
      closed = true;
      const stopped = new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") reject(error);
          else resolve();
        });
      });
      for (const controller of controllers) controller.abort();
      for (const socket of sockets) socket.destroy();
      closing = Promise.all([stopped, ...tasks]).then(() => undefined);
      return closing;
    },
  };
}
