import { HOUSE_SYSTEMS, natalChart } from "../../src/index.js";
import type { BirthInput, HouseSystem, TimeScaleName } from "../../src/index.js";

// Application limits, not provider limits or a CPU-time guarantee.
export const HTTP_LIMITS = Object.freeze({
  bodyBytes: 4096,
  bodyChunks: 4096,
  bodyTimeoutMs: 5000,
  utcCharacters: 64
});

const fields = new Set(["utc", "latitude", "longitude", "houseSystem", "timeKnown", "timeScale"]);

class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string
  ) {
    super(message);
  }
}

function invalidInput(field?: string): never {
  throw new RequestError(400, "invalid-input", "Supply a chart input with supported fields and values.", field);
}

function chartInput(value: unknown): BirthInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalidInput();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !fields.has(key))) invalidInput();
  if (typeof input.utc !== "string" || input.utc.length === 0 || input.utc.length > HTTP_LIMITS.utcCharacters) {
    invalidInput("utc");
  }
  const result: BirthInput = { utc: input.utc };
  const hasLatitude = Object.hasOwn(input, "latitude");
  const hasLongitude = Object.hasOwn(input, "longitude");
  if (hasLatitude !== hasLongitude) invalidInput("coordinates");
  if (hasLatitude) {
    if (typeof input.latitude !== "number" || !Number.isFinite(input.latitude) || Math.abs(input.latitude) > 90) {
      invalidInput("latitude");
    }
    if (typeof input.longitude !== "number" || !Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180) {
      invalidInput("longitude");
    }
    result.latitude = input.latitude;
    result.longitude = input.longitude;
  }
  if (Object.hasOwn(input, "houseSystem")) {
    if (typeof input.houseSystem !== "string" || !HOUSE_SYSTEMS.includes(input.houseSystem as HouseSystem)) {
      invalidInput("houseSystem");
    }
    result.houseSystem = input.houseSystem as HouseSystem;
  }
  if (Object.hasOwn(input, "timeKnown")) {
    if (typeof input.timeKnown !== "boolean") invalidInput("timeKnown");
    result.timeKnown = input.timeKnown;
  }
  if (Object.hasOwn(input, "timeScale")) {
    if (input.timeScale !== "utc" && input.timeScale !== "ut1" && input.timeScale !== "tt") invalidInput("timeScale");
    result.timeScale = input.timeScale as TimeScaleName;
  }
  // The engine validates calendar syntax, offsets and the ephemeris span.
  return result;
}

function unreadableBody(): RequestError {
  return new RequestError(400, "unreadable-body", "The request body could not be read.");
}

function tooLarge(): RequestError {
  return new RequestError(413, "body-too-large", "The request body exceeds the byte limit.");
}

function validateHeaders(request: Request): void {
  const encoding = request.headers.get("content-encoding");
  if (encoding !== null && encoding.trim().toLowerCase() !== "identity") {
    throw new RequestError(415, "unsupported-content-encoding", "Send an uncompressed JSON body.");
  }
  const type = request.headers.get("content-type")?.trim() ?? "";
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(type)) {
    throw new RequestError(415, "unsupported-media-type", "Use application/json with UTF-8 encoding.");
  }
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))) {
      throw new RequestError(400, "invalid-content-length", "Content-Length must be an unsigned byte count.");
    }
    if (Number(length) > HTTP_LIMITS.bodyBytes) throw tooLarge();
  }
}

async function readJson(request: Request): Promise<unknown> {
  if (request.signal.aborted || request.bodyUsed || request.body?.locked) throw unreadableBody();
  if (!request.body) throw new RequestError(400, "invalid-json", "Supply a UTF-8 JSON body.");
  const reader = request.body.getReader();
  // Copy at most the allowed bytes; never retain a caller's oversized chunk.
  const bytes = new Uint8Array(HTTP_LIMITS.bodyBytes);
  let used = 0;
  let chunks = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new RequestError(408, "body-timeout", "The request body did not finish in time.")), HTTP_LIMITS.bodyTimeoutMs);
    onAbort = () => reject(unreadableBody());
    request.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      if (!(value instanceof Uint8Array)) throw unreadableBody();
      if (used + value.byteLength > bytes.byteLength) throw tooLarge();
      // Empty chunks must not spin indefinitely or starve the timer's task.
      if (++chunks > HTTP_LIMITS.bodyChunks) {
        throw new RequestError(413, "body-too-fragmented", "The request body exceeds the chunk limit.");
      }
      bytes.set(value, used);
      used += value.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, used)));
    } catch {
      throw new RequestError(400, "invalid-json", "Supply a UTF-8 JSON body.");
    }
  } catch (error) {
    // Cancellation can itself wait on the sender. Do not wait before replying.
    void reader.cancel().catch(() => {});
    throw error instanceof RequestError ? error : unreadableBody();
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

function response(request: Request, body: unknown, status: number): Response {
  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(status === 405 ? { Allow: "POST" } : {})
    }
  });
}

function failure(request: Request, error: RequestError): Response {
  if (request.body && !request.body.locked) void request.body.cancel().catch(() => {});
  return response(request, {
    ok: false,
    error: { code: error.code, message: error.message, ...(error.field === undefined ? {} : { field: error.field }) }
  }, error.status);
}

/** Shared Fetch handler. The injectable synchronous calculator supports local failure tests. */
export function createHandler(calculate: typeof natalChart = natalChart): (request: Request) => Promise<Response> {
  return async (request) => {
    let input: BirthInput;
    try {
      const url = new URL(request.url);
      if (url.pathname !== "/chart") throw new RequestError(404, "not-found", "No handler exists at this path.");
      if (request.method !== "POST") throw new RequestError(405, "method-not-allowed", "Use POST for chart requests.");
      if (url.search !== "") throw new RequestError(400, "invalid-request", "Put chart inputs in the JSON body.");
      validateHeaders(request);
      input = chartInput(await readJson(request));
    } catch (error) {
      return failure(request, error instanceof RequestError ? error : unreadableBody());
    }
    let result: ReturnType<typeof natalChart>;
    try {
      result = calculate(input);
    } catch (error) {
      return failure(request, error instanceof RangeError
        ? new RequestError(422, "calculation-rejected", "The engine rejected the instant or calculation inputs.")
        : new RequestError(500, "calculation-failed", "The chart calculation failed."));
    }
    try {
      // HTTP uses ordinary JSON: dates become strings, and signed zero is lost.
      // Exact cross-runtime comparison has a separate protocol in the plan.
      return response(request, { ok: true, result }, 200);
    } catch {
      return failure(request, new RequestError(500, "calculation-failed", "The chart result could not be serialized."));
    }
  };
}

export const handleRequest = createHandler();
