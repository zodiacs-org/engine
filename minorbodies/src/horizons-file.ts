/** Explicit bulk intake through the Horizons File API. No import-time I/O. */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { sha256, HORIZONS_USER_AGENT } from "./horizons-client.ts";
import type { HorizonsClientOptions } from "./horizons-client.ts";
import { HorizonsParseError, parseHorizonsResponse, assertSameHorizonsSolution } from "./horizons-parser.ts";
import type { HorizonsResponse } from "./horizons-parser.ts";
import { makeHorizonsRequest, MAX_HORIZONS_EPOCHS } from "./horizons-request.ts";
import type { MinorBody } from "./catalog.ts";

export const HORIZONS_FILE_ENDPOINT = "https://ssd.jpl.nasa.gov/api/horizons_file.api";
export const MAX_FILE_EPOCHS = 2048;
export const MAX_FILE_RESPONSE_BYTES = 900_000;
export const MAX_FILE_CAPTURE_BYTES = 1_999_999;
export const HORIZONS_FILE_GENERATOR = "minorbodies-horizons-file-client-v1";
const MAX_RETRY_DELAY_MS = 60_000;

export interface HorizonsFileRequest {
  readonly schema: "minorbodies-horizons-file-request-v1";
  readonly body: MinorBody;
  readonly epochs: readonly number[];
  readonly endpoint: typeof HORIZONS_FILE_ENDPOINT;
  /** Exact settings, including Horizons quote delimiters. */
  readonly parameters: Readonly<Record<string, string>>;
  /** Canonical original file sent in the multipart input field. */
  readonly input: string;
}
export interface HorizonsFileResponse {
  readonly signature: Readonly<{ source: "NASA/JPL Horizons API"; version: "1.0" }>;
  readonly identity: HorizonsResponse["identity"];
  readonly rows: HorizonsResponse["rows"];
}
export interface HorizonsFileManifest {
  readonly schema: "minorbodies-horizons-file-capture-v1";
  readonly generator: typeof HORIZONS_FILE_GENERATOR;
  readonly requestSha256: string;
  readonly responseSha256: string;
  readonly retrievedAt: string;
  readonly byteLength: number;
  readonly signature: HorizonsFileResponse["signature"];
  readonly identity: HorizonsFileResponse["identity"];
}
export interface HorizonsFileCapture {
  readonly request: HorizonsFileRequest;
  readonly manifest: HorizonsFileManifest;
  readonly response: HorizonsFileResponse;
  readonly raw: string;
}

export function makeHorizonsFileRequest(body: MinorBody, epochs: readonly number[]): HorizonsFileRequest {
  if (!Array.isArray(epochs) || epochs.length < 1 || epochs.length > MAX_FILE_EPOCHS) {
    throw new RangeError(`Horizons File requests require 1 to ${MAX_FILE_EPOCHS} epochs.`);
  }
  // Reuse the existing epoch/body validation, including the boundary between blocks.
  for (let start = 0; start < epochs.length; start += MAX_HORIZONS_EPOCHS - 1) {
    makeHorizonsRequest(body, epochs.slice(start, start + MAX_HORIZONS_EPOCHS));
  }
  const template = makeHorizonsRequest(body, [epochs[0]!]).parameters;
  const parameters = Object.freeze(Object.fromEntries(Object.entries(template)
    .filter(([key]) => key !== "format")
    .map(([key, value]) => [key, key === "TLIST" ? epochs.map(epoch => `'${epoch}'`).join("\n") : value])));
  const input = "!$$SOF\n" + Object.entries(parameters)
    .map(([key, value]) => key === "TLIST" ? `${key}=\n${value}` : `${key}=${value}`).join("\n") + "\n!$$EOF\n";
  return Object.freeze({ schema: "minorbodies-horizons-file-request-v1", body,
    epochs: Object.freeze([...epochs]), endpoint: HORIZONS_FILE_ENDPOINT, parameters, input });
}

function canonicalRequest(request: HorizonsFileRequest): HorizonsFileRequest {
  if (request === null || typeof request !== "object") throw new RangeError("Invalid Horizons File request.");
  const canonical = makeHorizonsFileRequest(request.body, request.epochs);
  if (!isDeepStrictEqual(request, canonical)) throw new RangeError("Noncanonical Horizons File request.");
  return canonical;
}

/**
 * The File API has its own observed 1.0 envelope. The result-table grammar is
 * checked by the existing strict parser in bounded views, not by relabelling an
 * original source. Only an in-memory grammar view carries its expected 1.2 tag;
 * returned signatures, receipts, source hashes and cache bytes retain File 1.0.
 */
export function parseHorizonsFileResponse(raw: string, request: HorizonsFileRequest): HorizonsFileResponse {
  request = canonicalRequest(request);
  const fail = (message: string): never => { throw new HorizonsParseError(`File API: ${message}`); };
  if (typeof raw !== "string" || Buffer.byteLength(raw) > MAX_FILE_RESPONSE_BYTES) fail("response exceeds size limit.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; } catch { fail("invalid JSON."); }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || Object.hasOwn(parsed, "error")) {
    fail("invalid envelope or API error.");
  }
  const envelope = parsed as { signature?: { source?: unknown; version?: unknown }; result?: unknown };
  if (envelope.signature?.source !== "NASA/JPL Horizons API" || envelope.signature?.version !== "1.0") {
    fail("unreviewed API signature.");
  }
  if (typeof envelope.result !== "string" || envelope.result.includes("\r")) fail("invalid result text.");
  const lines = (envelope.result as string).split("\n");
  const starts = lines.flatMap((line, index) => line === "$$SOE" ? [index] : []);
  const ends = lines.flatMap((line, index) => line === "$$EOE" ? [index] : []);
  if (starts.length !== 1 || ends.length !== 1 || starts[0]! >= ends[0]! ||
      lines.filter(line => line.includes("$$SOE") || line.includes("$$EOE")).length !== 2) fail("invalid table markers.");
  const data = lines.slice(starts[0]! + 1, ends[0]!);
  if (data.length !== request.epochs.length) fail("row count does not match requested epochs.");
  const before = lines.slice(0, starts[0]! + 1);
  const after = lines.slice(ends[0]!);
  const rows: HorizonsResponse["rows"][number][] = [];
  let first: HorizonsResponse | undefined;
  for (let offset = 0; offset < data.length; offset += MAX_HORIZONS_EPOCHS) {
    const view = JSON.stringify({ signature: { source: "NASA/JPL Horizons API", version: "1.2" },
      result: [...before, ...data.slice(offset, offset + MAX_HORIZONS_EPOCHS), ...after].join("\n") });
    const response = parseHorizonsResponse(view,
      makeHorizonsRequest(request.body, request.epochs.slice(offset, offset + MAX_HORIZONS_EPOCHS)));
    if (first) assertSameHorizonsSolution(first, response); else first = response;
    rows.push(...response.rows);
  }
  return Object.freeze({ signature: Object.freeze({ source: "NASA/JPL Horizons API", version: "1.0" }),
    identity: first!.identity, rows: Object.freeze(rows) });
}

export function assertSameHorizonsFileSolution(left: HorizonsFileResponse, right: HorizonsFileResponse): void {
  if (!isDeepStrictEqual(left.signature, right.signature) || !isDeepStrictEqual(left.identity, right.identity)) {
    throw new HorizonsParseError("mixed Horizons File solution identities.");
  }
}

export function createHorizonsFileCapture(request: HorizonsFileRequest, raw: string, retrievedAt: string): HorizonsFileCapture {
  request = canonicalRequest(request);
  if (!Number.isFinite(Date.parse(retrievedAt)) || new Date(retrievedAt).toISOString() !== retrievedAt) {
    throw new RangeError("Expected an ISO retrieval timestamp.");
  }
  const response = parseHorizonsFileResponse(raw, request);
  const manifest: HorizonsFileManifest = Object.freeze({ schema: "minorbodies-horizons-file-capture-v1",
    generator: HORIZONS_FILE_GENERATOR, requestSha256: sha256(JSON.stringify(request)), responseSha256: sha256(raw),
    retrievedAt, byteLength: Buffer.byteLength(raw), signature: response.signature, identity: response.identity });
  return Object.freeze({ request, manifest, response, raw });
}

export function encodeHorizonsFileCapture(capture: HorizonsFileCapture): string {
  const encoded = JSON.stringify({ request: capture.request, manifest: capture.manifest, raw: capture.raw });
  if (Buffer.byteLength(encoded) > MAX_FILE_CAPTURE_BYTES) throw new RangeError("Horizons File capture exceeds size limit.");
  return encoded;
}

export function decodeHorizonsFileCapture(encoded: string, request: HorizonsFileRequest): HorizonsFileCapture {
  if (Buffer.byteLength(encoded) > MAX_FILE_CAPTURE_BYTES) throw new RangeError("Horizons File capture exceeds size limit.");
  const record = JSON.parse(encoded) as { request?: unknown; manifest?: HorizonsFileManifest; raw?: unknown } | null;
  if (!record || !isDeepStrictEqual(record.request, request) || typeof record.raw !== "string" ||
      !record.manifest || typeof record.manifest.retrievedAt !== "string") throw new Error("Invalid Horizons File cache record.");
  const capture = createHorizonsFileCapture(request, record.raw, record.manifest.retrievedAt);
  if (!isDeepStrictEqual(record.manifest, capture.manifest)) throw new Error("Horizons File cache manifest or source digest mismatch.");
  return capture;
}

// One queue for all File clients in this process, including reads and backoff.
// Run only one generator process, and do not run a legacy GET generator beside it.
let queue: Promise<void> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.then(() => undefined, () => undefined);
  return result;
}
class TransientError extends Error {
  readonly delay: number;
  constructor(message: string, delay = 0, options?: ErrorOptions) { super(message, options); this.delay = delay; }
}
function integer(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`Invalid Horizons File ${label}.`);
  return value;
}
function checkPin(capture: HorizonsFileCapture, pin: string | undefined): HorizonsFileCapture {
  if (pin !== undefined && capture.manifest.responseSha256 !== pin) throw new Error("Horizons File response does not match pinned digest.");
  return capture;
}
function retryAfter(response: Response, now: Date): number {
  const value = response.headers.get("retry-after");
  if (value === null) return 0;
  const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now.getTime();
  if (!Number.isFinite(delay) || delay > MAX_RETRY_DELAY_MS) throw new Error("Horizons File Retry-After requires a later explicit retry.");
  return Math.max(0, delay);
}
async function download(request: HorizonsFileRequest, fetcher: typeof globalThis.fetch, timeoutMs: number, now: () => Date): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const form = new FormData();
    form.set("format", "json");
    form.set("input", new Blob([request.input], { type: "text/plain" }), "horizons-input.txt");
    let response: Response;
    try {
      response = await fetcher(request.endpoint, { method: "POST", body: form,
        headers: { "User-Agent": HORIZONS_USER_AGENT, Accept: "application/json" },
        redirect: "error", signal: controller.signal });
    } catch (cause) { throw new TransientError("Horizons File transport failed or timed out.", 0, { cause }); }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429 || response.status >= 500 && response.status <= 599) {
        throw new TransientError(`Horizons File HTTP ${response.status}.`, retryAfter(response, now()));
      }
      throw new Error(`Horizons File HTTP ${response.status}.`);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel();
      throw new Error("Horizons File response is not application/json.");
    }
    const advertised = response.headers.get("content-length");
    if (advertised !== null && (!/^\d+$/.test(advertised) || Number(advertised) > MAX_FILE_RESPONSE_BYTES)) {
      await response.body?.cancel();
      throw new RangeError("Horizons File response exceeds size limit or has invalid length.");
    }
    if (!response.body) throw new Error("Horizons File response body is missing.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try { chunk = await reader.read(); }
        catch (cause) { throw new TransientError("Horizons File body read failed or timed out.", 0, { cause }); }
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > MAX_FILE_RESPONSE_BYTES) {
          await reader.cancel();
          throw new RangeError("Horizons File response exceeds size limit.");
        }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks, length));
  } finally { clearTimeout(timer); }
}

export function createHorizonsFileClient(options: HorizonsClientOptions) {
  if (!options || typeof options.cacheDirectory !== "string" || !options.cacheDirectory.trim()) throw new RangeError("A Horizons File cache directory is required.");
  if (options.offline !== undefined && typeof options.offline !== "boolean") throw new RangeError("Invalid Horizons File offline option.");
  const cacheDirectory = options.cacheDirectory;
  const offline = options.offline ?? false;
  const fetcher = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const now = options.now ?? (() => new Date());
  const maxAttempts = integer(options.maxAttempts ?? 3, 1, 5, "attempt count");
  const retryBaseMs = integer(options.retryBaseMs ?? 1000, 0, 30_000, "retry delay");
  const timeoutMs = integer(options.timeoutMs ?? 60_000, 1, 60_000, "timeout");
  return Object.freeze({
    async load(request: HorizonsFileRequest, expectedDigest?: string): Promise<HorizonsFileCapture> {
      request = canonicalRequest(request);
      if (expectedDigest !== undefined && (typeof expectedDigest !== "string" || !/^[a-f0-9]{64}$/.test(expectedDigest))) {
        throw new RangeError("Expected a lowercase SHA-256 source digest.");
      }
      const filename = join(cacheDirectory, `${sha256(JSON.stringify(request))}.json`);
      return serialized(async () => {
        let cached: string | undefined;
        try {
          if ((await stat(filename)).size > MAX_FILE_CAPTURE_BYTES) throw new Error("Horizons File cache exceeds size limit.");
          cached = await readFile(filename, "utf8");
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
        if (cached !== undefined) return checkPin(decodeHorizonsFileCapture(cached, request), expectedDigest);
        if (offline) throw new Error("Horizons File offline cache miss.");
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          let raw: string;
          try { raw = await download(request, fetcher, timeoutMs, now); }
          catch (error) {
            if (!(error instanceof TransientError) || attempt + 1 === maxAttempts) throw error;
            await sleep(Math.max(error.delay, Math.min(MAX_RETRY_DELAY_MS, retryBaseMs * 2 ** attempt)));
            continue;
          }
          const capture = checkPin(createHorizonsFileCapture(request, raw, now().toISOString()), expectedDigest);
          const encoded = encodeHorizonsFileCapture(capture);
          await mkdir(cacheDirectory, { recursive: true });
          const temporary = `${filename}.${randomUUID()}.tmp`;
          try { await writeFile(temporary, encoded, { flag: "wx" }); await rename(temporary, filename); }
          finally { await rm(temporary, { force: true }); }
          return capture;
        }
        throw new Error("Horizons File attempt count exhausted.");
      });
    }
  });
}
