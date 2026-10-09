import { RESPONSE_SCHEMAS } from "./contract.js";
import type { ComputeOperations } from "./contract.js";

export type { ComputeOperations, ComputeSchemas } from "./contract.js";
export type ComputeEndpoint = keyof ComputeOperations;

export interface CallOptions {
  signal?: AbortSignal;
}
export interface ClientOptions {
  origin?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}
export interface ComputeClient {
  call<E extends ComputeEndpoint>(
    endpoint: E,
    request: ComputeOperations[E]["request"],
    options?: CallOptions,
  ): Promise<ComputeOperations[E]["response"]>;
  chart(request: ComputeOperations["chart"]["request"], options?: CallOptions): Promise<ComputeOperations["chart"]["response"]>;
  positions(request: ComputeOperations["positions"]["request"], options?: CallOptions): Promise<ComputeOperations["positions"]["response"]>;
  houses(request: ComputeOperations["houses"]["request"], options?: CallOptions): Promise<ComputeOperations["houses"]["response"]>;
  events(request: ComputeOperations["events"]["request"], options?: CallOptions): Promise<ComputeOperations["events"]["response"]>;
  time(request: ComputeOperations["time"]["request"], options?: CallOptions): Promise<ComputeOperations["time"]["response"]>;
  skyFact(request: ComputeOperations["sky-fact"]["request"], options?: CallOptions): Promise<ComputeOperations["sky-fact"]["response"]>;
  elections(request: ComputeOperations["elections"]["request"], options?: CallOptions): Promise<ComputeOperations["elections"]["response"]>;
}

export class ComputeHttpError extends Error {
  readonly status: number;
  readonly retryAfter: string | null;
  readonly response: unknown;
  constructor(status: number, retryAfter: string | null, response: unknown) {
    super("Compute request failed with HTTP " + status);
    this.name = "ComputeHttpError";
    this.status = status;
    this.retryAfter = retryAfter;
    this.response = response;
  }
}
export class ComputeProtocolError extends Error {
  constructor() {
    super("Compute response did not match its documented envelope.");
    this.name = "ComputeProtocolError";
  }
}
export class ComputeTimeoutError extends Error {
  constructor() {
    super("Compute request exceeded its configured timeout.");
    this.name = "ComputeTimeoutError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Creates a hosted HTTP client; calculations occur at the selected origin. */
export function createComputeClient(options: ClientOptions = {}): ComputeClient {
  const origin = new URL(options.origin ?? "https://zodiacs.org");
  if (!["https:", "http:"].includes(origin.protocol) || origin.username
    || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new RangeError("origin must be an HTTP(S) origin without credentials, path, query or fragment");
  }
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new RangeError("timeoutMs must be positive and no greater than 60000");
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function") throw new TypeError("A fetch implementation is required");

  async function call<E extends ComputeEndpoint>(
    endpoint: E,
    request: ComputeOperations[E]["request"],
    callOptions: CallOptions = {},
  ): Promise<ComputeOperations[E]["response"]> {
    if (!Object.hasOwn(RESPONSE_SCHEMAS, endpoint)) throw new RangeError("Unknown Compute API endpoint");
    if (!record(request)) throw new TypeError("Compute request must be an object");
    const callerSignal = callOptions.signal;
    if (callerSignal?.aborted) {
      throw callerSignal.reason ?? new DOMException("Request aborted", "AbortError");
    }
    const body = JSON.stringify(request);
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(callerSignal?.reason);
    callerSignal?.addEventListener("abort", forwardAbort, { once: true });
    if (callerSignal?.aborted) forwardAbort();
    const timer = setTimeout(() => controller.abort(new ComputeTimeoutError()), timeoutMs);
    try {
      if (controller.signal.aborted) throw controller.signal.reason;
      const response = await fetcher(new URL("/api/v1/" + endpoint, origin), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      });
      const text = await response.text();
      let payload: unknown;
      try { payload = JSON.parse(text); }
      catch {
        if (response.ok) throw new ComputeProtocolError();
        payload = text;
      }
      if (!response.ok) {
        throw new ComputeHttpError(response.status, response.headers.get("Retry-After"), payload);
      }
      if (!record(payload) || payload.schema !== RESPONSE_SCHEMAS[endpoint]
        || !Object.hasOwn(payload, "result") || !record(payload.receipt)
        || !record(payload.backend) || typeof payload.backend.version !== "string"
        || !record(payload.cite)) {
        throw new ComputeProtocolError();
      }
      return payload as unknown as ComputeOperations[E]["response"];
    } catch (error) {
      if (controller.signal.reason instanceof ComputeTimeoutError) throw controller.signal.reason;
      throw error;
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", forwardAbort);
    }
  }
  return {
    call,
    chart: (request, callOptions) => call("chart", request, callOptions),
    positions: (request, callOptions) => call("positions", request, callOptions),
    houses: (request, callOptions) => call("houses", request, callOptions),
    events: (request, callOptions) => call("events", request, callOptions),
    time: (request, callOptions) => call("time", request, callOptions),
    skyFact: (request, callOptions) => call("sky-fact", request, callOptions),
    elections: (request, callOptions) => call("elections", request, callOptions),
  };
}
