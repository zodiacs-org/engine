import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export const CONTROL_LIMITS = Object.freeze({
  tokenBytes: 32, requestBytes: 65_536, headerBytes: 16_384, targetBytes: 4096,
  requestTimeoutMs: 60_000, pageSize: 100, responseBytes: 1_048_576,
});
export const CONTROL_DEFAULTS = Object.freeze({
  maxRequestBytes: 16_384, maxHeaderBytes: 8192, requestTimeoutMs: 5000,
  defaultPageSize: 25, maxPageSize: 100,
});
export interface ControlPolicy {
  readonly maxRequestBytes: number;
  readonly maxHeaderBytes: number;
  readonly requestTimeoutMs: number;
  readonly defaultPageSize: number;
  readonly maxPageSize: number;
}
export class ControlApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super("Webhook control request rejected.");
    this.name = "ControlApiError";
  }
}
export function reject(status = 400, code = "invalid-request"): never {
  throw new ControlApiError(status, code);
}
export function parseControlPolicy(input: Partial<ControlPolicy> = {}): ControlPolicy {
  if (!input || typeof input !== "object") reject();
  const policy = { ...CONTROL_DEFAULTS, ...input };
  const caps: ControlPolicy = { maxRequestBytes: CONTROL_LIMITS.requestBytes,
    maxHeaderBytes: CONTROL_LIMITS.headerBytes, requestTimeoutMs: CONTROL_LIMITS.requestTimeoutMs,
    defaultPageSize: CONTROL_LIMITS.pageSize, maxPageSize: CONTROL_LIMITS.pageSize };
  for (const key of Object.keys(policy) as (keyof ControlPolicy)[]) {
    if (!Object.hasOwn(caps, key) || !Number.isSafeInteger(policy[key]) || policy[key] < 1 || policy[key] > caps[key]) reject();
  }
  if (policy.defaultPageSize > policy.maxPageSize) reject();
  return Object.freeze(policy);
}
export function singleHeader(request: IncomingMessage, name: string): string | undefined {
  let value: string | undefined;
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    if (request.rawHeaders[i]?.toLowerCase() !== name) continue;
    if (value !== undefined) reject();
    value = request.rawHeaders[i + 1];
  }
  return value;
}
export function authenticate(request: IncomingMessage, token: Buffer): boolean {
  let header: string | undefined;
  try { header = singleHeader(request, "authorization"); } catch { return false; }
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/iu.exec(header ?? "");
  if (!match) return false;
  const candidate = Buffer.from(match[1]!, "base64url");
  try {
    return candidate.length === CONTROL_LIMITS.tokenBytes && candidate.toString("base64url") === match[1] &&
      timingSafeEqual(candidate, token);
  } finally { candidate.fill(0); }
}
export function send(response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  if (response.destroyed || response.writableEnded) return;
  let body = JSON.stringify(value);
  if (Buffer.byteLength(body) > CONTROL_LIMITS.responseBytes) {
    status = 503; body = '{"error":{"code":"response-too-large"}}'; headers = {};
  }
  response.writeHead(status, { ...headers, "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(body)), "cache-control": "no-store",
    "x-content-type-options": "nosniff", connection: "close" });
  response.end(body);
}
/** Absolute request deadline is owned by the handler; no inactivity timer resets it. */
export function readBody(request: IncomingMessage, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, fail) => {
    const chunks: Buffer[] = [];
    let length = 0;
    const cleanup = () => {
      request.off("data", data); request.off("end", end); request.off("error", error);
      signal.removeEventListener("abort", abort);
      for (const chunk of chunks) chunk.fill(0);
    };
    const error = () => { cleanup(); request.pause(); fail(new ControlApiError(400, "invalid-request")); };
    const abort = () => { cleanup(); request.pause(); fail(new ControlApiError(408, "request-timeout")); };
    const data = (chunk: Buffer) => {
      length += chunk.length;
      if (length > maxBytes) {
        cleanup(); request.pause(); fail(new ControlApiError(413, "request-too-large")); return;
      }
      chunks.push(Buffer.from(chunk));
    };
    const end = () => { const body = Buffer.concat(chunks, length); cleanup(); resolve(body); };
    if (signal.aborted) { abort(); return; }
    request.on("data", data); request.once("end", end); request.once("error", error);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export function jsonBody(body: Buffer): unknown {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown; }
  catch { return reject(400, "invalid-json"); }
}
export function identifier(input: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/u.test(input)) reject();
  return input;
}
export function unsigned(input: string, minimum: number, maximum: number): number {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(input)) reject();
  const value = Number(input);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) reject();
  return value;
}
export function expectedRevision(request: IncomingMessage): number {
  const value = singleHeader(request, "if-match");
  if (value === undefined) reject(428, "revision-required");
  if (!/^"[1-9][0-9]*"$/u.test(value)) reject();
  return unsigned(value.slice(1, -1), 1, Number.MAX_SAFE_INTEGER);
}
export function parameters(request: IncomingMessage): { path: string; query: Map<string, string> } {
  const target = request.url ?? "";
  if (Buffer.byteLength(target) > CONTROL_LIMITS.targetBytes) reject(414, "target-too-large");
  if (!target.startsWith("/") || target.startsWith("//") || /[\\#\s]/u.test(target) || /%(?![0-9a-f]{2})/iu.test(target)) reject();
  const question = target.indexOf("?");
  const path = question < 0 ? target : target.slice(0, question);
  const query = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(question < 0 ? "" : target.slice(question + 1))) {
    if (query.has(key)) reject();
    query.set(key, value);
  }
  return { path, query };
}
export function onlyParameters(query: Map<string, string>, allowed: readonly string[]): void {
  if ([...query.keys()].some(key => !allowed.includes(key))) reject();
}
