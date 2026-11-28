import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

// Operational ceilings, not model token counts or remote spending limits.
export const GENERATION_LIMITS = Object.freeze({
  maxInputBytes: 65_536,
  maxOutputBytes: 65_536,
  timeoutMs: 30_000,
  maxCalls: 256
});

const messages = Object.freeze({
  "invalid-options": "Invalid generation client options.",
  "invalid-backend": "Invalid or unavailable generation backend.",
  "invalid-request": "Invalid generation request.",
  "input-limit": "Generation request exceeds the input byte limit.",
  "invalid-response": "Generation backend returned an invalid response.",
  "output-limit": "Generation response exceeds the output byte limit.",
  "backend-failure": "Generation backend failed.",
  "call-limit": "Generation client exhausted its call budget.",
  busy: "Generation client already has a request in progress.",
  timeout: "Generation request exceeded its deadline.",
  aborted: "Generation request was cancelled.",
  closed: "Generation client is closed after a cancelled or timed-out request."
});

/** Fixed diagnostics never retain request text, adapter exceptions or causes. */
export class GenerationError extends Error {
  constructor(code) {
    const safeCode = Object.hasOwn(messages, code) ? code : "backend-failure";
    super(messages[safeCode]);
    this.name = "GenerationError";
    this.code = safeCode;
  }
}

const fail = (code) => { throw new GenerationError(code); };
const slug = (value) => typeof value === "string" && value.length <= 100 &&
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?![\s\S])/.test(value);
const label = (value) => typeof value === "string" && value.length > 0 &&
  value.length <= 160 && value.trim() === value && value.isWellFormed() &&
  !/[\u0000-\u001f\u007f]/.test(value);
const digest = (value) => `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;

// Flat ordinary data objects only. Reject accessors without evaluating them.
// This does not sandbox proxies or adapter code supplied by the host program.
function fields(value, required, optional, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" ||
      ![...required, ...optional].includes(key) || !Object.hasOwn(descriptors[key], "value")) ||
      required.some((key) => !Object.hasOwn(descriptors, key))) fail(code);
}

const mock = Object.freeze({
  id: "mock",
  model: "offline-meaning-template-v1",
  version: "1.0.0",
  mode: "offline",
  async generate(request) {
    // A workflow fixture, not an interpretation model. No source prose is copied.
    const marker = digest(JSON.stringify(request)).slice(7);
    return {
      text: JSON.stringify({
        summary: `Offline mock ${marker}: use the supplied chart factor as a prompt for reflection, without treating it as a prediction.`,
        themes: ["reflection"],
        epistemicStatus: "symbolic-interpretation"
      }),
      finishReason: "stop"
    };
  }
});

function selectBackend(options) {
  const selected = Object.hasOwn(options, "backend") ? options.backend : "mock";
  const adapters = Object.hasOwn(options, "adapters") ? options.adapters : [];
  if (!slug(selected) || !Array.isArray(adapters) || adapters.length > 32) fail("invalid-backend");
  const registry = new Map([[mock.id, mock]]);
  for (const adapter of adapters) {
    fields(adapter, ["id", "model", "version", "mode", "generate"], [], "invalid-backend");
    if (!slug(adapter.id) || !label(adapter.model) || !label(adapter.version) ||
        !["offline", "network"].includes(adapter.mode) || typeof adapter.generate !== "function" ||
        registry.has(adapter.id)) fail("invalid-backend");
    registry.set(adapter.id, adapter);
  }
  const adapter = registry.get(selected);
  if (!adapter) fail("invalid-backend");
  const { id, model, version, mode, generate } = adapter;
  return { backend: Object.freeze({ id, model, version, mode }), generate };
}

function readLimits(value) {
  fields(value, [], Object.keys(GENERATION_LIMITS), "invalid-options");
  const limits = {};
  for (const [key, ceiling] of Object.entries(GENERATION_LIMITS)) {
    const limit = Object.hasOwn(value, key) ? value[key] : ceiling;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > ceiling) fail("invalid-options");
    limits[key] = limit;
  }
  return Object.freeze(limits);
}

function readRequest(value, limit) {
  fields(value, ["schemaVersion", "promptVersion", "system", "prompt", "seed"], [], "invalid-request");
  if (value.schemaVersion !== "1.0.0" || !slug(value.promptVersion) ||
      !Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffff_ffff) fail("invalid-request");
  for (const key of ["system", "prompt"]) {
    const text = value[key];
    if (typeof text !== "string") fail("invalid-request");
    // Short-circuit oversized strings before scanning or serializing them.
    if (text.length > limit || Buffer.byteLength(text, "utf8") > limit) fail("input-limit");
    if (!text.isWellFormed() || !/\S/.test(text)) fail("invalid-request");
  }
  // Fixed field order means JSON property insertion order cannot change identity.
  const request = Object.freeze({
    schemaVersion: value.schemaVersion,
    promptVersion: value.promptVersion,
    system: value.system,
    prompt: value.prompt,
    seed: value.seed === 0 ? 0 : value.seed
  });
  if (Buffer.byteLength(JSON.stringify(request), "utf8") > limit) fail("input-limit");
  return request;
}

function readResponse(value, limit) {
  fields(value, ["text", "finishReason"], [], "invalid-response");
  if (typeof value.text !== "string" || !["stop", "length", "refusal"].includes(value.finishReason)) {
    fail("invalid-response");
  }
  if (value.text.length > limit || Buffer.byteLength(value.text, "utf8") > limit) fail("output-limit");
  if (!value.text.isWellFormed() || (value.finishReason === "stop" && !/\S/.test(value.text))) {
    fail("invalid-response");
  }
  return { text: value.text, finishReason: value.finishReason };
}

/**
 * A serial, bounded text transport. Custom adapters are trusted host code,
 * explicitly registered and selected; no environment or module discovery occurs.
 * Adapters must honor cancellation and bound their own network buffers/tokens.
 * Timeout closes the client but cannot preempt synchronous code or remote work.
 */
export function createGenerationClient(options = {}) {
  fields(options, [], ["backend", "adapters", "limits"], "invalid-options");
  const limits = readLimits(Object.hasOwn(options, "limits") ? options.limits : {});
  const { backend, generate } = selectBackend(options);
  let calls = 0;
  let busy = false;
  let closed = false;

  return Object.freeze({
    backend,
    limits,
    async generate(value, callOptions = {}) {
      fields(callOptions, [], ["signal"], "invalid-options");
      const signal = callOptions.signal;
      if (Object.hasOwn(callOptions, "signal") && !(signal instanceof AbortSignal)) fail("invalid-options");
      if (closed) fail("closed");
      if (signal?.aborted) fail("aborted");
      if (busy) fail("busy");
      if (calls >= limits.maxCalls) fail("call-limit");
      const request = readRequest(value, limits.maxInputBytes);
      const requestDigest = digest(JSON.stringify({ schemaVersion: "1.0.0", backend, limits, request }));
      const controller = new AbortController();
      const deadline = performance.now() + limits.timeoutMs;
      let timer;
      let cancelled;
      let rejectCancellation;
      const cancellation = new Promise((_, reject) => { rejectCancellation = reject; });
      const cancel = (code) => {
        if (cancelled) return;
        cancelled = code;
        closed = true;
        // Reject before notifying the adapter so its abort handler cannot win
        // the race with a provider-specific error. Never forward caller reasons.
        rejectCancellation(new GenerationError(code));
        controller.abort();
      };
      const onAbort = () => cancel("aborted");
      busy = true;
      calls += 1;
      signal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => cancel("timeout"), limits.timeoutMs);
      try {
        const operation = Promise.resolve().then(() => {
          if (cancelled) throw new GenerationError(cancelled);
          return generate(request, Object.freeze({ signal: controller.signal, maxOutputBytes: limits.maxOutputBytes }));
        }).catch(() => { fail("backend-failure"); });
        const response = await Promise.race([operation, cancellation]);
        if (cancelled) fail(cancelled);
        // A late synchronous result must not evade the deadline just because
        // the event loop has not yet dispatched the timeout callback.
        if (performance.now() >= deadline) {
          cancel("timeout");
          fail("timeout");
        }
        const result = readResponse(response, limits.maxOutputBytes);
        return Object.freeze({
          schemaVersion: "1.0.0", backend, limits, requestDigest,
          promptVersion: request.promptVersion, ...result
        });
      } catch (error) {
        if (cancelled) fail(cancelled);
        if (error instanceof GenerationError) throw error;
        fail("backend-failure");
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        busy = false;
      }
    }
  });
}
