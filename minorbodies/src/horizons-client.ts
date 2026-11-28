/** Build-time data intake only. Importing this module performs no I/O. */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { makeHorizonsRequest } from "./horizons-request.ts";
import type { HorizonsRequest } from "./horizons-request.ts";
import { parseHorizonsResponse } from "./horizons-parser.ts";
import type { HorizonsResponse } from "./horizons-parser.ts";

export const HORIZONS_GENERATOR = "minorbodies-horizons-client-v1";
export const HORIZONS_USER_AGENT = "zodiacs-minorbodies/0.0.0 (https://github.com/zodiacs-org/engine)";
export const MAX_RESPONSE_BYTES = 900_000;
export const MAX_CAPTURE_BYTES = 1_999_999;
const MAX_RETRY_DELAY_MS = 60_000;

export interface HorizonsManifest {
  readonly schema: "minorbodies-horizons-capture-v1";
  readonly generator: typeof HORIZONS_GENERATOR;
  readonly requestSha256: string;
  readonly responseSha256: string;
  readonly retrievedAt: string;
  readonly byteLength: number;
  readonly signature: HorizonsResponse["signature"];
  readonly identity: HorizonsResponse["identity"];
}

export interface HorizonsCapture {
  readonly request: HorizonsRequest;
  readonly manifest: HorizonsManifest;
  readonly response: HorizonsResponse;
  readonly raw: string;
}

export interface HorizonsClientOptions {
  readonly cacheDirectory: string;
  readonly offline?: boolean;
  readonly fetch?: typeof globalThis.fetch;
  readonly maxAttempts?: number;
  readonly retryBaseMs?: number;
  readonly timeoutMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => Date;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalRequest(request: HorizonsRequest): HorizonsRequest {
  const canonical = makeHorizonsRequest(request.body, request.epochs);
  if (!isDeepStrictEqual(request, canonical)) throw new Error("Noncanonical Horizons request.");
  return canonical;
}

function validDigest(value: string): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

/** Also used for importing an already downloaded, unchanged source response. */
export function createHorizonsCapture(
  request: HorizonsRequest, raw: string, retrievedAt: string
): HorizonsCapture {
  request = canonicalRequest(request);
  if (!Number.isFinite(Date.parse(retrievedAt)) || new Date(retrievedAt).toISOString() !== retrievedAt) {
    throw new RangeError("Expected an ISO retrieval timestamp.");
  }
  const byteLength = Buffer.byteLength(raw, "utf8");
  if (byteLength > MAX_RESPONSE_BYTES) throw new RangeError("Horizons response exceeds size limit.");
  const response = parseHorizonsResponse(raw, request);
  const manifest: HorizonsManifest = Object.freeze({
    schema: "minorbodies-horizons-capture-v1",
    generator: HORIZONS_GENERATOR,
    requestSha256: sha256(JSON.stringify(request)),
    responseSha256: sha256(raw), retrievedAt, byteLength,
    signature: response.signature, identity: response.identity
  });
  return Object.freeze({ request, manifest, response, raw });
}

export function encodeHorizonsCapture(capture: HorizonsCapture): string {
  const data = JSON.stringify({ request: capture.request, manifest: capture.manifest, raw: capture.raw });
  if (Buffer.byteLength(data) > MAX_CAPTURE_BYTES) throw new RangeError("Horizons capture exceeds size limit.");
  return data;
}

/** Validates even cached data from disk; digests detect corruption, not authorship. */
export function decodeHorizonsCapture(data: string, request: HorizonsRequest): HorizonsCapture {
  if (Buffer.byteLength(data) > MAX_CAPTURE_BYTES) throw new RangeError("Horizons capture exceeds size limit.");
  const record = JSON.parse(data) as { request?: unknown; manifest?: HorizonsManifest; raw?: unknown } | null;
  if (!record || typeof record.raw !== "string" || !record.manifest ||
      typeof record.manifest.retrievedAt !== "string" || !isDeepStrictEqual(record.request, request)) {
    throw new Error("Invalid Horizons cache record.");
  }
  const capture = createHorizonsCapture(request, record.raw, record.manifest.retrievedAt);
  if (!isDeepStrictEqual(capture.manifest, record.manifest)) {
    throw new Error("Horizons cache manifest or source digest mismatch.");
  }
  return capture;
}

function checkPin(capture: HorizonsCapture, expectedDigest: string | undefined): HorizonsCapture {
  if (expectedDigest !== undefined && capture.manifest.responseSha256 !== expectedDigest) {
    throw new Error("Horizons response does not match the pinned source digest.");
  }
  return capture;
}

// One queue across all instances in this module, covering response bodies, cache
// writes and retry backoff. Run only one generator process at a time as well.
let queue: Promise<void> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.then(() => undefined, () => undefined);
  return result;
}

class TransientError extends Error {
  readonly retryAfterMs: number;
  constructor(message: string, retryAfterMs = 0, options?: ErrorOptions) {
    super(message, options);
    this.retryAfterMs = retryAfterMs;
  }
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`Invalid Horizons ${label}.`);
  }
  return value;
}

function retryAfter(response: Response, now: Date): number {
  const value = response.headers.get("retry-after");
  if (value === null) return 0;
  const milliseconds = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now.getTime();
  if (!Number.isFinite(milliseconds) || milliseconds > MAX_RETRY_DELAY_MS) {
    throw new Error("Horizons Retry-After requires a later explicit retry.");
  }
  return Math.max(0, milliseconds);
}

async function download(
  request: HorizonsRequest, fetcher: typeof globalThis.fetch, timeoutMs: number, now: () => Date
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    try {
      response = await fetcher(request.url, {
        headers: { "User-Agent": HORIZONS_USER_AGENT, Accept: "application/json" },
        redirect: "error", signal: controller.signal
      });
    } catch (cause) {
      throw new TransientError("Horizons transport failed or timed out.", 0, { cause });
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429 || response.status >= 500 && response.status <= 599) {
        throw new TransientError(`Horizons HTTP ${response.status}.`, retryAfter(response, now()));
      }
      throw new Error(`Horizons HTTP ${response.status}.`);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel();
      throw new Error("Horizons response is not application/json.");
    }
    const advertised = response.headers.get("content-length");
    if (advertised !== null && (!/^\d+$/.test(advertised) || Number(advertised) > MAX_RESPONSE_BYTES)) {
      await response.body?.cancel();
      throw new RangeError("Horizons response exceeds size limit or has invalid length.");
    }
    if (!response.body) throw new Error("Horizons response body is missing.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try { chunk = await reader.read(); }
        catch (cause) { throw new TransientError("Horizons body read failed or timed out.", 0, { cause }); }
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new RangeError("Horizons response exceeds size limit.");
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    // Reject invalid UTF-8 rather than changing bytes before hashing them.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks, length));
  } finally {
    clearTimeout(timer);
  }
}

export function createHorizonsClient(options: HorizonsClientOptions) {
  if (!options || typeof options.cacheDirectory !== "string" || !options.cacheDirectory.trim()) {
    throw new RangeError("A Horizons cache directory is required.");
  }
  if (options.offline !== undefined && typeof options.offline !== "boolean") {
    throw new RangeError("Invalid Horizons offline option.");
  }
  // Snapshot options so queued work cannot observe subsequent caller mutations.
  const cacheDirectory = options.cacheDirectory;
  const offline = options.offline ?? false;
  const fetcher = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const now = options.now ?? (() => new Date());
  const maxAttempts = boundedInteger(options.maxAttempts ?? 3, 1, 5, "attempt count");
  const retryBaseMs = boundedInteger(options.retryBaseMs ?? 1000, 0, 30_000, "retry delay");
  const timeoutMs = boundedInteger(options.timeoutMs ?? 30_000, 1, 60_000, "timeout");

  return Object.freeze({
    async load(request: HorizonsRequest, expectedDigest?: string): Promise<HorizonsCapture> {
      request = canonicalRequest(request);
      if (expectedDigest !== undefined && !validDigest(expectedDigest)) {
        throw new RangeError("Expected a lowercase SHA-256 source digest.");
      }
      const filename = join(cacheDirectory, `${sha256(JSON.stringify(request))}.json`);
      return serialized(async () => {
        let cached: string | undefined;
        try {
          if ((await stat(filename)).size > MAX_CAPTURE_BYTES) throw new Error("Horizons cache exceeds size limit.");
          cached = await readFile(filename, "utf8");
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
        if (cached !== undefined) return checkPin(decodeHorizonsCapture(cached, request), expectedDigest);
        if (offline) throw new Error("Horizons offline cache miss.");

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          let raw: string;
          try { raw = await download(request, fetcher, timeoutMs, now); }
          catch (error) {
            if (!(error instanceof TransientError) || attempt + 1 === maxAttempts) throw error;
            const delay = Math.max(error.retryAfterMs, Math.min(MAX_RETRY_DELAY_MS, retryBaseMs * 2 ** attempt));
            await sleep(delay);
            continue;
          }
          const capture = checkPin(createHorizonsCapture(request, raw, now().toISOString()), expectedDigest);
          const encoded = encodeHorizonsCapture(capture);
          await mkdir(cacheDirectory, { recursive: true });
          const temporary = `${filename}.${randomUUID()}.tmp`;
          try {
            await writeFile(temporary, encoded, { flag: "wx" });
            await rename(temporary, filename);
          } finally {
            await rm(temporary, { force: true });
          }
          return capture;
        }
        throw new Error("Horizons attempt count exhausted.");
      });
    }
  });
}
