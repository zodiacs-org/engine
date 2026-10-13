import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { Worker } from "node:worker_threads";
import { canonicalJson } from "./canonical-json.js";
import { configureFeed } from "./cli-config.js";
import type { JsonValue } from "./types.js";

export const MAX_HTTP_CONFIG_BYTES = 1_048_576;
export const DEFAULT_HTTP_LIMITS = Object.freeze({
  maxFeeds: 32, maxConcurrent: 2, deadlineMs: 30_000,
  maxEvaluations: 1_000_000, maxBufferedEvents: 1_000,
  maxRangeDays: 3_660, maxSelections: 32, maxOutputBytes: 8_000_000,
  workerMemoryMb: 128
});
export type FeedServerLimits = { readonly [Key in keyof typeof DEFAULT_HTTP_LIMITS]: number };

/** A durable configured name, independent of chart data, ranges and revisions. */
export function feedPath(id: string): string {
  if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id)) {
    throw new RangeError("Feed IDs require ASCII letters, digits, underscore or hyphen.");
  }
  return `/feeds/${id}.ics`;
}

// Parse quoted opaque tags without splitting commas inside a quoted tag.
function matches(value: string | undefined, tag: string): boolean {
  if (value === undefined) return false;
  if (value.trim() === "*") return true;
  const tokens = value.match(/(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"|,/g);
  if (!tokens || value.replace(/(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"|[\t ,]/g, "") !== "") return false;
  let expectTag = true, found = false;
  for (const token of tokens) {
    if (token === ",") { expectTag = true; continue; }
    if (!expectTag) return false;
    expectTag = false;
    if (token.replace(/^W\//, "") === tag.replace(/^W\//, "")) found = true;
  }
  return found;
}

interface Feed {
  readonly config: unknown;
  readonly tag: string;
  complete: boolean;
}

function errorResponse(response: ServerResponse, status: number, message: string): void {
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) { response.destroy(); return; }
  response.removeHeader("ETag");
  response.removeHeader("Content-Disposition");
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(`${message}\n`);
}

/**
 * Immutable operator-configured feeds. No request can supply birth data, query
 * inputs, work settings or a filename. Call listen() explicitly; no side effects
 * occur merely by importing this module.
 */
export function createFeedServer(
  configurations: Readonly<Record<string, unknown>>, overrides: Partial<FeedServerLimits> = {}
): Server {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides) ||
      Object.keys(overrides).some(key => !Object.hasOwn(DEFAULT_HTTP_LIMITS, key))) throw new RangeError("Unknown HTTP work limits.");
  const limits = { ...DEFAULT_HTTP_LIMITS, ...overrides };
  if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value < 1) || limits.deadlineMs > 2_147_483_647) {
    throw new RangeError("HTTP work limits must be positive safe integers within the timer range.");
  }
  const encoded = canonicalJson(configurations as JsonValue);
  if (Buffer.byteLength(encoded) > MAX_HTTP_CONFIG_BYTES) throw new RangeError("HTTP configuration exceeds the byte limit.");
  const captured = JSON.parse(encoded) as Record<string, unknown>;
  if (!captured || typeof captured !== "object" || Array.isArray(captured)) throw new TypeError("Expected a configured feed map.");
  const entries = Object.entries(captured);
  if (!entries.length || entries.length > limits.maxFeeds) throw new RangeError("HTTP feed count exceeds the configured limits.");
  const revision = randomUUID();
  const feeds = new Map<string, Feed>();
  for (const [id, config] of entries) {
    const url = feedPath(id);
    const { request } = configureFeed(config);
    if (request.maxEvaluations > limits.maxEvaluations || request.maxBufferedEvents > limits.maxBufferedEvents ||
        request.schedules.length > limits.maxSelections ||
        Date.parse(request.endUtc) - Date.parse(request.startUtc) > limits.maxRangeDays * 86_400_000) {
      throw new RangeError("Feed schedule exceeds HTTP work limits.");
    }
    // A process revision avoids reusing validators across code/runtime changes.
    // Only successfully completed configurations qualify for conditional reuse.
    const hash = createHash("sha256").update(revision).update(canonicalJson(config as JsonValue)).digest("hex");
    feeds.set(url, { config, tag: `W/"${hash}"`, complete: false });
  }
  let active = 0;
  const server = createServer({ maxHeaderSize: 8_192 }, (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    const url = request.url ?? "";
    if (url.includes("?") || !/^\/feeds\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.ics$/.test(url)) {
      errorResponse(response, 400, "Use a configured /feeds/ID.ics URL without query parameters."); return;
    }
    const feed = feeds.get(url);
    if (!feed) { errorResponse(response, 404, "Feed not found."); return; }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD"); errorResponse(response, 405, "Method not allowed."); return;
    }
    if (request.headers["transfer-encoding"] !== undefined ||
        (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0")) {
      errorResponse(response, 400, "Feed requests cannot contain a body."); return;
    }
    const conditional = matches(request.headers["if-none-match"], feed.tag);
    const metadata = () => {
      response.setHeader("Content-Type", "text/calendar; charset=utf-8");
      response.setHeader("Content-Disposition", `inline; filename="${url.slice(7)}"`);
      response.setHeader("Cache-Control", "private, no-cache, no-transform");
      response.setHeader("ETag", feed.tag);
    };
    if (feed.complete && (conditional || request.method === "HEAD")) {
      metadata(); response.statusCode = conditional ? 304 : 200; response.end(); return;
    }
    if (active >= limits.maxConcurrent) {
      response.setHeader("Retry-After", "1"); errorResponse(response, 503, "Feed server is busy."); return;
    }
    active++;
    void serve(request, response, feed, conditional, metadata).finally(() => { active--; });
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  return server;

  async function serve(
    request: IncomingMessage, response: ServerResponse, feed: Feed, conditional: boolean, metadata: () => void
  ): Promise<void> {
    let worker: Worker | undefined;
    let timer: NodeJS.Timeout | undefined;
    let bytes = 0, done = false;
    let finish!: () => void;
    const settled = new Promise<void>(resolve => { finish = resolve; });
    const stop = (status?: number, message?: string) => {
      if (done) return;
      done = true;
      if (status !== undefined) errorResponse(response, status, message!);
      finish();
    };
    const disconnect = () => stop();
    const pull = () => { if (!done) worker!.postMessage("pull"); };
    request.once("aborted", disconnect);
    response.once("close", disconnect);
    response.once("error", disconnect);
    try {
      worker = new Worker(new URL("../scripts/feed-worker.mjs", import.meta.url), {
        workerData: feed.config, execArgv: [],
        resourceLimits: { maxOldGenerationSizeMb: limits.workerMemoryMb }
      });
      worker.once("error", () => stop(500, "Feed worker failed."));
      worker.once("exit", () => { if (!done) stop(500, "Feed worker ended before completion."); });
      worker.on("message", (message: { type: string; chunk?: string; status?: number; reason?: string }) => {
        if (done) return;
        if (message.type === "ready") { pull(); return; }
        if (message.type === "error") { stop(message.status!, message.reason!); return; }
        if ((message.type !== "chunk" && message.type !== "complete") || typeof message.chunk !== "string") {
          stop(500, "Invalid feed worker response."); return;
        }
        bytes += Buffer.byteLength(message.chunk);
        if (bytes > limits.maxOutputBytes) { stop(413, "Feed exceeds the response byte limit."); return; }
        const discard = conditional || request.method === "HEAD";
        if (message.type === "complete") {
          feed.complete = true;
          if (!response.headersSent) { metadata(); response.statusCode = conditional ? 304 : 200; }
          response.end(discard ? undefined : message.chunk);
          stop();
        } else if (discard) pull();
        else {
          if (!response.headersSent) metadata();
          if (response.write(message.chunk)) pull();
          else response.once("drain", pull);
        }
      });
      timer = setTimeout(() => stop(504, "Feed deadline exceeded."), limits.deadlineMs);
      timer.unref();
      await settled;
    } catch { stop(500, "Cannot start feed worker."); }
    finally {
      if (timer) clearTimeout(timer);
      response.removeListener("drain", pull);
      request.removeListener("aborted", disconnect);
      response.removeListener("close", disconnect);
      response.removeListener("error", disconnect);
      if (worker) await worker.terminate().catch(() => {});
    }
  }
}
