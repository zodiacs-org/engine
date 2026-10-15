import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeHorizonsFileRequest, parseHorizonsFileResponse, createHorizonsFileCapture,
  encodeHorizonsFileCapture, decodeHorizonsFileCapture, createHorizonsFileClient,
  assertSameHorizonsFileSolution, MAX_FILE_EPOCHS, MAX_FILE_RESPONSE_BYTES
} from "../src/horizons-file.ts";
import type { HorizonsFileRequest } from "../src/horizons-file.ts";
import { sha256 } from "../src/horizons-client.ts";

const raw = readFileSync(new URL("fixtures/horizons-file/ceres.json", import.meta.url), "utf8");
const epochs = [2378496.5, 2451545, 2524958.5];
const request = makeHorizonsFileRequest("Ceres", epochs);
const timestamp = "2026-10-15T00:00:00.000Z";
const cacheRoot = fileURLToPath(new URL("../.cache/", import.meta.url));
let cacheDirectory: string;
function response(text = raw, status = 200, headers: Record<string, string> = {}) {
  return new Response(text, { status, headers: { "Content-Type": "application/json", ...headers } });
}
function fetchOk() { return vi.fn<typeof globalThis.fetch>().mockImplementation(async () => response()); }
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function changedResult(update: (result: string) => string): string {
  const envelope = JSON.parse(raw) as { result: string };
  return JSON.stringify({ ...envelope, result: update(envelope.result) });
}
const cacheFile = () => join(cacheDirectory, `${sha256(JSON.stringify(request))}.json`);

beforeEach(async () => {
  await mkdir(cacheRoot, { recursive: true });
  cacheDirectory = await mkdtemp(join(cacheRoot, "test-file-client-"));
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(cacheDirectory, { recursive: true, force: true });
});

describe("Horizons File requests and the original File 1.0 grammar", () => {
  it("constructs frozen, explicit file settings while retaining the File API identity", () => {
    const sourceEpochs = [...epochs];
    const built = makeHorizonsFileRequest("Ceres", sourceEpochs);
    sourceEpochs[0] = 1;
    expect(built.epochs).toEqual(epochs);
    expect(built.endpoint).toBe("https://ssd.jpl.nasa.gov/api/horizons_file.api");
    expect(built.input).toContain("COMMAND='1;'\nEPHEM_TYPE='VECTORS'");
    expect(built.input).toContain("TIME_TYPE='TT'\nTLIST_TYPE='JD'");
    expect(built.input).toContain("TLIST=\n'2378496.5'\n'2451545'\n'2524958.5'\n!$$EOF\n");
    expect(Object.isFrozen(built)).toBe(true);
    expect(Object.isFrozen(built.parameters)).toBe(true);
    expect(Object.isFrozen(built.epochs)).toBe(true);
    const parsed = parseHorizonsFileResponse(raw, built);
    expect(parsed.signature).toEqual({ source: "NASA/JPL Horizons API", version: "1.0" });
    expect(parsed.identity).toMatchObject({ body: "Ceres", targetNumber: 1, targetSource: "JPL#48", centerSource: "DE441" });
    expect(parsed.rows.map(row => row.jdTt)).toEqual(epochs);
    expect(Object.isFrozen(parsed.rows)).toBe(true);
    expect(Object.isFrozen(parsed.rows[0]!.positionAu)).toBe(true);
    const capture = createHorizonsFileCapture(built, raw, timestamp);
    expect(capture.manifest.signature.version).toBe("1.0");
    expect(capture.raw).toBe(raw);
    expect(decodeHorizonsFileCapture(encodeHorizonsFileCapture(capture), built)).toEqual(capture);
  });

  it("accepts the full local batch limit and validates ordering at every grammar-block boundary", () => {
    const many = Array.from({ length: MAX_FILE_EPOCHS }, (_, index) => 2451545 + index);
    expect(makeHorizonsFileRequest("Ceres", many).epochs).toHaveLength(2048);
    for (const index of [127, 128, 254, 255, 2047]) {
      const broken = [...many]; broken[index] = broken[index - 1]!;
      expect(() => makeHorizonsFileRequest("Ceres", broken)).toThrow(/increasing|distinct/);
    }
  });

  it.each([[], [NaN], [Infinity], [0], [-1], [1, 1], [2, 1], Array(2049).fill(2451545)].map(epochs => [epochs] as const))(
    "rejects invalid epoch lists", epochs => expect(() => makeHorizonsFileRequest("Ceres", epochs)).toThrow(RangeError));

  it("checks every row beyond the legacy parser's batch size", () => {
    // Synthetic row repetition tests parser coverage only, never astronomical accuracy.
    const many = Array.from({ length: 2048 }, (_, index) => 2451545 + index);
    const synthetic = changedResult(result => {
      const firstRow = result.split("$$SOE\n")[1]!.split("\n")[0]!;
      const rows = many.map(epoch => firstRow.replace(/^\d+\.\d+/, epoch.toFixed(9))).join("\n");
      return result.replace(/\$\$SOE\n[\s\S]*?\n\$\$EOE/, () => `$$SOE\n${rows}\n$$EOE`);
    });
    const largeRequest = makeHorizonsFileRequest("Ceres", many);
    const parsed = parseHorizonsFileResponse(synthetic, largeRequest);
    expect(parsed.rows.map(row => row.jdTt)).toEqual(many);
    const malformed = synthetic.replace(`${many.at(-1)!.toFixed(9)},`, `${many[0]!.toFixed(9)},`);
    expect(() => parseHorizonsFileResponse(malformed, largeRequest)).toThrow(/epoch/);
  });

  it.each([
    ["Target body name: 1 Ceres", "Target body name: 1 Vesta"],
    ["Center body name: Earth (399)", "Center body name: Earth (3)"],
    ["Output type     : LT+S CORRECTED", "Output type     : LT CORRECTED"],
    ["Reference frame : ICRF", "Reference frame : Ecliptic"],
    ["Output units    : AU-D", "Output units    : KM-S"],
    ["Calendar Date (TT )", "Calendar Date (TDB)"],
    ["JDTT ,", "JDTDB ,"],
    ["$$SOE", " $$SOE"], ["$$EOE", "$$EOE\n$$EOE"],
    ["2378496.500000000,", "2378496.500001000,"]
  ])("rejects changed source metadata or rows: %s", (before, after) => {
    expect(raw).toContain(before!);
    expect(() => parseHorizonsFileResponse(changedResult(result => result.replace(before!, after!)), request)).toThrow();
  });

  it("rejects unreviewed envelope signatures, provider errors and oversized sources", () => {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const signature of [null, { source: "NASA/JPL Horizons API", version: "1.2" },
      { source: "other", version: "1.0" }]) {
      expect(() => parseHorizonsFileResponse(JSON.stringify({ ...parsed, signature }), request)).toThrow(/signature/);
    }
    expect(() => parseHorizonsFileResponse(JSON.stringify({ ...parsed, error: "" }), request)).toThrow(/error/);
    expect(() => parseHorizonsFileResponse("null", request)).toThrow();
    expect(() => parseHorizonsFileResponse("{", request)).toThrow();
    expect(() => parseHorizonsFileResponse(raw + " ".repeat(MAX_FILE_RESPONSE_BYTES), request)).toThrow(/size/);
    expect(() => parseHorizonsFileResponse(raw, { ...request, input: request.input + "\n" })).toThrow(/canonical/);
    expect(() => parseHorizonsFileResponse(raw, { ...request, extra: true } as HorizonsFileRequest)).toThrow(/canonical/);
  });

  it("refuses mixed orbit identities", () => {
    const first = parseHorizonsFileResponse(raw, request);
    expect(() => assertSameHorizonsFileSolution(first, first)).not.toThrow();
    const other = parseHorizonsFileResponse(changedResult(result => result.replace(/JPL#48/g, "JPL#49")), request);
    expect(() => assertSameHorizonsFileSolution(first, other)).toThrow(/mixed/);
  });

  it("verifies the retained original request, source digest and retrieval receipt", () => {
    const record = JSON.parse(readFileSync(new URL("fixtures/horizons-file/ceres.manifest.json", import.meta.url), "utf8")) as {
      request: HorizonsFileRequest; manifest: { retrievedAt: string };
    };
    expect(record.request).toEqual(request);
    const captured = createHorizonsFileCapture(request, raw, record.manifest.retrievedAt);
    expect(captured.manifest).toEqual(record.manifest);
  });
});

describe("Horizons File transport and frozen cache", () => {
  it("posts the complete canonical file, saves original bytes and replays offline", async () => {
    const fetch = fetchOk();
    const capture = await createHorizonsFileClient({ cacheDirectory, fetch, now: () => new Date(timestamp) }).load(request, sha256(raw));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe(request.endpoint);
    expect(options).toMatchObject({ method: "POST", redirect: "error" });
    expect(new Headers(options?.headers).get("User-Agent")).toContain("zodiacs-minorbodies");
    const form = options!.body as FormData;
    expect(form.get("format")).toBe("json");
    expect(await (form.get("input") as Blob).text()).toBe(request.input);
    expect(capture.manifest).toMatchObject({ requestSha256: sha256(JSON.stringify(request)),
      responseSha256: sha256(raw), byteLength: Buffer.byteLength(raw), retrievedAt: timestamp,
      signature: { version: "1.0" } });
    const offlineFetch = fetchOk();
    expect(await createHorizonsFileClient({ cacheDirectory, offline: true, fetch: offlineFetch,
      now: () => { throw new Error("offline clock read"); } }).load(request, sha256(raw))).toEqual(capture);
    expect(offlineFetch).not.toHaveBeenCalled();
    expect(await readdir(cacheDirectory)).toEqual([`${sha256(JSON.stringify(request))}.json`]);
  });

  it("refuses offline misses and mismatched pins without storing or replacing a source", async () => {
    const fetch = fetchOk();
    await expect(createHorizonsFileClient({ cacheDirectory, offline: true, fetch }).load(request)).rejects.toThrow(/miss/);
    expect(fetch).not.toHaveBeenCalled();
    await expect(createHorizonsFileClient({ cacheDirectory, fetch }).load(request, "0".repeat(64))).rejects.toThrow(/pinned/);
    expect(await readdir(cacheDirectory)).toEqual([]);
    await createHorizonsFileClient({ cacheDirectory, fetch }).load(request);
    const saved = await readFile(cacheFile(), "utf8");
    await expect(createHorizonsFileClient({ cacheDirectory, offline: true }).load(request, "0".repeat(64))).rejects.toThrow(/pinned/);
    expect(await readFile(cacheFile(), "utf8")).toBe(saved);
  });

  it.each(["requestSha256", "responseSha256", "byteLength", "signature", "identity", "generator", "retrievedAt"])(
    "rejects altered cached %s metadata", async field => {
      await createHorizonsFileClient({ cacheDirectory, fetch: fetchOk() }).load(request);
      const cached = JSON.parse(await readFile(cacheFile(), "utf8")) as { manifest: Record<string, unknown> };
      cached.manifest[field] = "changed";
      await writeFile(cacheFile(), JSON.stringify(cached));
      const fetch = fetchOk();
      await expect(createHorizonsFileClient({ cacheDirectory, fetch }).load(request)).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    });

  it("rechecks source conventions even if an altered cache carries new byte hashes", async () => {
    await createHorizonsFileClient({ cacheDirectory, fetch: fetchOk() }).load(request);
    const cached = JSON.parse(await readFile(cacheFile(), "utf8")) as { raw: string; manifest: Record<string, unknown> };
    cached.raw = cached.raw.replace("LT+S CORRECTED", "GEOMETRIC");
    cached.manifest.responseSha256 = sha256(cached.raw);
    cached.manifest.byteLength = Buffer.byteLength(cached.raw);
    await writeFile(cacheFile(), JSON.stringify(cached));
    await expect(createHorizonsFileClient({ cacheDirectory, offline: true }).load(request)).rejects.toThrow(/Output type/);
  });

  it("bounds retries, honors Retry-After and does not retry malformed success payloads", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response("busy", 503, { "Retry-After": "3" }))
      .mockRejectedValueOnce(new TypeError("unavailable"))
      .mockImplementation(async () => response());
    await createHorizonsFileClient({ cacheDirectory, fetch, sleep }).load(request);
    expect(sleep.mock.calls).toEqual([[3000], [2000]]);
    expect(fetch).toHaveBeenCalledTimes(3);
    await rm(cacheFile());
    const invalid = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => response("invalid JSON"));
    await expect(createHorizonsFileClient({ cacheDirectory, fetch: invalid, sleep }).load(request)).rejects.toThrow(/JSON/);
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it("stops after the default three transport attempts", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("transport failure"));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    await expect(createHorizonsFileClient({ cacheDirectory, fetch, sleep }).load(request)).rejects.toThrow(/transport/);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[1000], [2000]]);
  });

  it("serializes different client instances through body reads and retry backoff", async () => {
    const bodyGate = deferred(); const firstStarted = deferred(); const backoffGate = deferred(); const backoffStarted = deferred();
    let calls = 0;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        firstStarted.resolve();
        return new Response(new ReadableStream<Uint8Array>({ async start(controller) {
          await bodyGate.promise; controller.enqueue(new TextEncoder().encode(raw)); controller.close();
        } }), { headers: { "Content-Type": "application/json" } });
      }
      if (calls === 2) return response("busy", 503);
      return response();
    });
    const first = createHorizonsFileClient({ cacheDirectory: join(cacheDirectory, "first"), fetch }).load(request);
    await firstStarted.promise;
    const second = createHorizonsFileClient({ cacheDirectory: join(cacheDirectory, "second"), fetch,
      sleep: async () => { backoffStarted.resolve(); await backoffGate.promise; } }).load(request);
    const third = createHorizonsFileClient({ cacheDirectory: join(cacheDirectory, "third"), fetch }).load(request);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(calls).toBe(1);
    bodyGate.resolve(); await first; await backoffStarted.promise;
    expect(calls).toBe(2);
    backoffGate.resolve(); await Promise.all([second, third]);
    expect(calls).toBe(4);
  });

  it("aborts a stalled request at its configured deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const started = deferred(); let aborted = false;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); });
      started.resolve();
    }));
    const failure = expect(createHorizonsFileClient({ cacheDirectory, fetch, timeoutMs: 500, maxAttempts: 1 }).load(request))
      .rejects.toThrow(/timed out/);
    await started.promise;
    await vi.advanceTimersByTimeAsync(499); expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await failure; expect(aborted).toBe(true);
  });

  it.each([
    () => response(raw, 200, { "Content-Type": "text/plain" }),
    () => response(raw, 200, { "Content-Length": "900001" }),
    () => response(raw + " ".repeat(MAX_FILE_RESPONSE_BYTES)),
    () => response("invalid", 400),
    () => response("busy", 503, { "Retry-After": "61" }),
    () => new Response(new Uint8Array([0xff]), { headers: { "Content-Type": "application/json" } })
  ])("rejects invalid transport responses without cache writes", async build => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => build());
    await expect(createHorizonsFileClient({ cacheDirectory, fetch }).load(request)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await readdir(cacheDirectory)).toEqual([]);
  });
});
