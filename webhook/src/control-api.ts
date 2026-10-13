import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { SigningKeyVault, SecretError, VAULT_KEY_BYTES } from "./secrets.js";
import { WebhookStore, StorageError } from "./storage.js";
import { SubscriptionValidationError } from "./subscription.js";
import type { Page, StoredSubscription } from "./storage-types.js";
import {
  authenticate, CONTROL_LIMITS, ControlApiError, expectedRevision, identifier, jsonBody,
  onlyParameters, parameters, parseControlPolicy, readBody, reject, send, singleHeader, unsigned,
  type ControlPolicy,
} from "./control-http.js";
export { CONTROL_DEFAULTS, CONTROL_LIMITS, ControlApiError } from "./control-http.js";
export type { ControlPolicy } from "./control-http.js";

export interface ControlApiOptions {
  readonly store: WebhookStore;
  readonly vault: SigningKeyVault;
  /** Random runtime bytes. Clients encode this token as canonical base64url. */
  readonly bearerToken: Uint8Array;
  readonly policy?: Partial<ControlPolicy>;
  readonly now?: () => number;
}
function subscription(record: StoredSubscription): unknown {
  return { id: record.id, revision: record.revision, spec: record.spec, createdAt: record.createdAt,
    updatedAt: record.updatedAt, deletedAt: record.deletedAt };
}
function page(query: Map<string, string>, policy: ControlPolicy): Page & { limit: number } {
  onlyParameters(query, ["after", "limit"]);
  const after = query.get("after");
  return { limit: query.has("limit") ? unsigned(query.get("limit")!, 1, policy.maxPageSize) : policy.defaultPageSize,
    ...(after !== undefined ? { afterId: identifier(after) } : {}) };
}
function provision(vault: SigningKeyVault, body: unknown): unknown {
  if (body === null || typeof body !== "object" || Array.isArray(body)) reject();
  const data = body as Record<string, unknown>;
  if (Object.keys(data).some(key => key !== "secretRef" && key !== "secret") || typeof data.secretRef !== "string" ||
      typeof data.secret !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(data.secret)) reject();
  const key = Buffer.from(data.secret, "base64url");
  try {
    if (key.length !== VAULT_KEY_BYTES || key.toString("base64url") !== data.secret) reject();
    return vault.provision(data.secretRef, key);
  } finally { key.fill(0); }
}
function publicError(error: unknown): { status: number; code: string; field?: string } {
  if (error instanceof ControlApiError) return { status: error.status, code: error.code };
  if (error instanceof SubscriptionValidationError) return { status: 400, code: error.code, field: error.field };
  if (error instanceof StorageError) {
    if (error.code === "invalid-input") return { status: 400, code: "invalid-request" };
    if (error.code === "not-found") return { status: 404, code: "not-found" };
    if (error.code === "conflict") return { status: 409, code: "conflict" };
  }
  if (error instanceof SecretError) {
    if (error.code === "invalid-input") return { status: 400, code: "invalid-request" };
    if (error.code === "conflict") return { status: 409, code: "key-conflict" };
    if (error.code === "unavailable") return { status: 409, code: "key-unavailable" };
  }
  return { status: 503, code: "service-unavailable" };
}
function revisionWrite<T>(operation: () => T): T {
  try { return operation(); } catch (error) {
    if (error instanceof StorageError && error.code === "conflict") reject(412, "revision-conflict");
    throw error;
  }
}

/** Creates an unbound HTTP server. Deploy behind a private authenticated TLS boundary. */
export function createControlServer(options: ControlApiOptions): Server {
  if (!options || !(options.bearerToken instanceof Uint8Array) || options.bearerToken.byteLength !== CONTROL_LIMITS.tokenBytes ||
      !(options.store instanceof WebhookStore) || !(options.vault instanceof SigningKeyVault) ||
      (options.now !== undefined && typeof options.now !== "function")) reject();
  const { store, vault } = options;
  const now = options.now ?? Date.now;
  const policy = parseControlPolicy(options.policy);
  const token = Buffer.from(options.bearerToken);
  let closed = false;
  const dispatch = (request: IncomingMessage, response: ServerResponse, input: unknown) => {
    const { path, query } = parameters(request);
    const method = request.method;
    const parts = path.split("/");
    const resource = parts[2];
    const id = parts[3];
    const collection = parts.length === 3;
    const item = parts.length === 4 && id !== undefined && id !== "";
    let allowed: readonly string[];
    if (parts[1] !== "v1") reject(404, "not-found");
    if (resource === "subscriptions" && (collection || item)) allowed = collection ? ["GET", "POST"] : ["GET", "PUT", "DELETE"];
    else if (resource === "signing-keys" && (collection || item)) allowed = collection ? ["POST"] : ["GET", "DELETE"];
    else if ((resource === "deliveries" && (collection || item ||
      (parts.length === 5 && id && parts[4] === "attempts"))) || (resource === "dead-letters" && collection)) allowed = ["GET"];
    else return reject(404, "not-found");
    if (!allowed.includes(method ?? "")) {
      send(response, 405, { error: { code: "method-not-allowed" } }, { allow: allowed.join(", ") }); return;
    }
    if (resource === "subscriptions") {
      if (collection && method === "GET") {
        const paging = page(query, policy);
        const records = store.listSubscriptions(paging);
        send(response, 200, { items: records.map(subscription), nextAfter: records.length === paging.limit ? records.at(-1)!.id : null });
      } else {
        onlyParameters(query, []);
        if (collection) {
          const spec = vault.validateSubscription(input);
          const record = store.createSubscription(randomUUID(), spec, now());
          send(response, 201, subscription(record), { etag: `"${record.revision}"`, location: `/v1/subscriptions/${record.id}` });
        } else {
          identifier(id!);
          if (method === "GET") {
            const record = store.getSubscription(id!);
            if (!record) reject(404, "not-found");
            send(response, 200, subscription(record), { etag: `"${record.revision}"` });
          } else {
            const revision = expectedRevision(request);
            const record = method === "PUT"
              ? revisionWrite(() => store.updateSubscription(id!, revision, vault.validateSubscription(input), now()))
              : revisionWrite(() => store.deleteSubscription(id!, revision, now()));
            send(response, 200, subscription(record), { etag: `"${record.revision}"` });
          }
        }
      }
    } else if (resource === "signing-keys") {
      onlyParameters(query, []);
      if (collection) { send(response, 201, provision(vault, input)); return; }
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/u.test(id!)) reject();
      const metadata = vault.inspect(id!);
      if (!metadata) reject(404, "not-found");
      send(response, 200, method === "DELETE" ? vault.revoke(id!) : metadata);
    } else if (resource === "dead-letters") {
      const paging = page(query, policy);
      const records = store.listDeadLetters(paging);
      send(response, 200, { items: records, nextAfter: records.length === paging.limit ? records.at(-1)!.eventId : null });
    } else if (collection) {
      const paging = page(query, policy);
      const records = store.listDeliveryLogs(paging);
      send(response, 200, { items: records, nextAfter: records.length === paging.limit ? records.at(-1)!.eventId : null });
    } else {
      identifier(id!);
      if (item) onlyParameters(query, []);
      else onlyParameters(query, ["after", "limit"]);
      const record = store.getDeliveryLog(id!);
      if (!record) reject(404, "not-found");
      if (item) { send(response, 200, { ...record, deadLetter: store.getDeadLetter(id!) ?? null }); return; }
      const limit = query.has("limit") ? unsigned(query.get("limit")!, 1, policy.maxPageSize) : policy.defaultPageSize;
      const after = query.has("after") ? unsigned(query.get("after")!, 0, Number.MAX_SAFE_INTEGER) : 0;
      const attempts = store.listAttempts(id!, after, limit);
      send(response, 200, { items: attempts, nextAfter: attempts.length === limit ? attempts.at(-1)!.number : null });
    }
  };
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const startedAt = performance.now();
    const controller = new AbortController();
    const disconnect = () => controller.abort();
    request.once("aborted", disconnect);
    // A disconnect can emit an error after the body reader has removed its listeners.
    request.on("error", () => undefined);
    response.once("close", disconnect);
    const timer = setTimeout(() => {
      controller.abort(); send(response, 408, { error: { code: "request-timeout" } });
    }, policy.requestTimeoutMs);
    timer.unref();
    let body: Buffer | undefined;
    try {
      if (closed || !authenticate(request, token)) {
        send(response, 401, { error: { code: "unauthorized" } }, { "www-authenticate": "Bearer" }); return;
      }
      if (singleHeader(request, "origin") !== undefined) reject(403, "origin-refused");
      if (singleHeader(request, "expect") !== undefined) reject(417, "expectation-refused");
      parameters(request); // Reject targets before waiting for a body.
      if (singleHeader(request, "content-encoding") !== undefined) reject(415, "unsupported-media-type");
      const contentLength = singleHeader(request, "content-length");
      if (contentLength !== undefined && unsigned(contentLength, 0, Number.MAX_SAFE_INTEGER) > policy.maxRequestBytes) {
        reject(413, "request-too-large");
      }
      const needsJson = request.method === "POST" || request.method === "PUT";
      if (needsJson && !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(singleHeader(request, "content-type") ?? "")) {
        reject(415, "unsupported-media-type");
      }
      body = await readBody(request, policy.maxRequestBytes, controller.signal);
      if (controller.signal.aborted || response.destroyed) return;
      if (performance.now() - startedAt >= policy.requestTimeoutMs) reject(408, "request-timeout");
      if (!needsJson && body.length !== 0) reject();
      dispatch(request, response, needsJson ? jsonBody(body) : undefined);
    } catch (error) {
      const { status, ...details } = publicError(error);
      send(response, status, { error: details });
    } finally {
      clearTimeout(timer); body?.fill(0);
      request.off("aborted", disconnect); response.off("close", disconnect);
    }
  };
  const server = createServer({ maxHeaderSize: policy.maxHeaderBytes,
    requestTimeout: policy.requestTimeoutMs, headersTimeout: policy.requestTimeoutMs,
    connectionsCheckingInterval: Math.min(1000, policy.requestTimeoutMs) }, (request, response) => { void handle(request, response); });
  server.maxRequestsPerSocket = 1;
  server.on("checkContinue", (request, response) => { void handle(request, response); });
  server.on("checkExpectation", (request, response) => { void handle(request, response); });
  server.on("clientError", (error, socket) => {
    if (!socket.writable) return;
    const code = (error as NodeJS.ErrnoException).code;
    const status = code === "HPE_HEADER_OVERFLOW" ? "431 Request Header Fields Too Large" :
      code === "ERR_HTTP_REQUEST_TIMEOUT" ? "408 Request Timeout" : "400 Bad Request";
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  });
  server.once("close", () => { closed = true; token.fill(0); });
  return server;
}
