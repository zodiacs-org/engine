import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHorizonsClient, decodeHorizonsCapture } from "../src/horizons-client.js";
import { makeHorizonsRequest } from "../src/horizons-request.js";

const fixturePath = new URL("./fixtures/horizons/chiron.json", import.meta.url);
const cacheRoot = fileURLToPath(new URL("../.cache/", import.meta.url));
const request = makeHorizonsRequest("Chiron", [2451545, 2451545.125, 2451546]);
const retrievedAt = "2026-10-15T00:00:00.000Z";
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const requestDigest = digest(JSON.stringify(request));

let raw: string;
let cacheDirectory: string;

function jsonResponse(body: BodyInit | null, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "application/json" } });
}

function successfulFetch() {
  return vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse(raw));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

type CacheRecord = {
  request: unknown;
  raw: string;
  manifest: Record<string, unknown>;
};

async function readCache(): Promise<CacheRecord> {
  return JSON.parse(await readFile(join(cacheDirectory, `${requestDigest}.json`), "utf8")) as CacheRecord;
}

async function overwriteCache(record: CacheRecord): Promise<void> {
  await writeFile(join(cacheDirectory, `${requestDigest}.json`), JSON.stringify(record));
}

beforeAll(async () => {
  raw = await readFile(fixturePath, "utf8");
  await mkdir(cacheRoot, { recursive: true });
});

beforeEach(async () => {
  cacheDirectory = await mkdtemp(join(cacheRoot, "test-client-"));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(cacheDirectory, { recursive: true, force: true });
});

describe("Horizons capture cache", () => {
  it("captures original bytes with request, source identity and a content receipt", async () => {
    const fetch = successfulFetch();
    const client = createHorizonsClient({
      cacheDirectory, fetch, now: () => new Date(retrievedAt)
    });
    const capture = await client.load(request);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [input, options] = fetch.mock.calls[0]!;
    const url = new URL(String(input));
    expect(url.origin).toBe("https://ssd.jpl.nasa.gov");
    expect(url.pathname).toBe("/api/horizons.api");
    expect(url.searchParams.get("COMMAND")).toContain("2060;");
    expect(url.searchParams.get("TIME_TYPE")).toContain("TT");
    expect(options?.redirect).toBe("error");
    expect(new Headers(options?.headers).get("User-Agent")).toContain("zodiacs");
    expect(capture.request).toEqual(request);
    expect(capture.raw).toBe(raw);
    expect(capture.manifest).toMatchObject({
      schema: "minorbodies-horizons-capture-v1",
      generator: "minorbodies-horizons-client-v1",
      requestSha256: requestDigest,
      responseSha256: digest(raw),
      byteLength: Buffer.byteLength(raw),
      retrievedAt,
      signature: capture.response.signature,
      identity: capture.response.identity
    });
    const record = await readCache();
    expect(record).toEqual({ request, manifest: capture.manifest, raw });
    expect(await readdir(cacheDirectory)).toEqual([`${requestDigest}.json`]);
  });

  it("replays a pinned capture offline without changing the retrieval receipt", async () => {
    const capture = await createHorizonsClient({
      cacheDirectory, fetch: successfulFetch(), now: () => new Date(retrievedAt)
    }).load(request, digest(raw));
    const fetch = successfulFetch();
    const cached = await createHorizonsClient({
      cacheDirectory, offline: true, fetch,
      now: () => { throw new Error("An offline hit must retain its original retrieval time."); }
    }).load(request, digest(raw));
    expect(cached).toEqual(capture);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails an offline miss without trying the network or creating a capture", async () => {
    const fetch = successfulFetch();
    await expect(createHorizonsClient({ cacheDirectory, offline: true, fetch }).load(request))
      .rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it("rejects a mismatched response pin before storing downloaded bytes", async () => {
    const fetch = successfulFetch();
    await expect(createHorizonsClient({ cacheDirectory, fetch }).load(request, "0".repeat(64)))
      .rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it("rejects a mismatched response pin on a cache hit without replacing the source", async () => {
    await createHorizonsClient({ cacheDirectory, fetch: successfulFetch() }).load(request);
    const original = await readCache();
    const fetch = successfulFetch();
    await expect(createHorizonsClient({ cacheDirectory, fetch }).load(request, "0".repeat(64)))
      .rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(await readCache()).toEqual(original);
  });

  it("detects changed response bytes even when cached metadata still parses", async () => {
    await createHorizonsClient({ cacheDirectory, fetch: successfulFetch() }).load(request);
    const record = await readCache();
    record.raw += " ";
    await overwriteCache(record);
    const fetch = successfulFetch();
    await expect(createHorizonsClient({ cacheDirectory, fetch }).load(request)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["schema", "unreviewed-schema"],
    ["generator", "unreviewed-generator"],
    ["requestSha256", "0".repeat(64)],
    ["responseSha256", "0".repeat(64)],
    ["byteLength", 1],
    ["retrievedAt", "not-a-date"],
    ["signature", { source: "another service", version: "1.2" }],
    ["identity", { target: "Ceres" }]
  ])("rejects tampered cached %s metadata", async (field, value) => {
    await createHorizonsClient({ cacheDirectory, fetch: successfulFetch() }).load(request);
    const record = await readCache();
    record.manifest[field as string] = value;
    await overwriteCache(record);
    const fetch = successfulFetch();
    await expect(createHorizonsClient({ cacheDirectory, fetch }).load(request)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("compares the complete cached request with the requested input", async () => {
    await createHorizonsClient({ cacheDirectory, fetch: successfulFetch() }).load(request);
    const record = await readCache();
    record.request = makeHorizonsRequest("Ceres", [2451545, 2451545.125, 2451546]);
    await overwriteCache(record);
    const fetch = successfulFetch();
    await expect(createHorizonsClient({ cacheDirectory, fetch }).load(request)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reparses cached source conventions even if someone recomputed the byte receipt", async () => {
    await createHorizonsClient({ cacheDirectory, fetch: successfulFetch() }).load(request);
    const record = await readCache();
    expect(record.raw).toContain("LT+S CORRECTED cartesian states");
    record.raw = record.raw.replace("LT+S CORRECTED cartesian states", "GEOMETRIC cartesian states");
    record.manifest.responseSha256 = digest(record.raw);
    record.manifest.byteLength = Buffer.byteLength(record.raw);
    await overwriteCache(record);
    await expect(createHorizonsClient({ cacheDirectory, offline: true }).load(request)).rejects.toThrow();
  });

  it("rejects a truncated cache record without silently fetching a replacement", async () => {
    await writeFile(join(cacheDirectory, `${requestDigest}.json`), '{"raw":');
    const fetch = successfulFetch();
    await expect(createHorizonsClient({ cacheDirectory, fetch }).load(request)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not poison the cache with a failed response", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse("invalid JSON"))
      .mockImplementation(async () => jsonResponse(raw));
    const client = createHorizonsClient({ cacheDirectory, fetch });
    await expect(client.load(request)).rejects.toThrow();
    expect(await readdir(cacheDirectory)).toEqual([]);
    const capture = await client.load(request);
    expect(capture.raw).toBe(raw);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("Horizons transport discipline", () => {
  it("defaults to three attempts with one-second exponential backoff", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    await expect(createHorizonsClient({ cacheDirectory, fetch, sleep }).load(request)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[1000], [2000]]);
  });

  it("defaults to a thirty-second deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const started = deferred();
      let aborted = false;
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((_input, options) => {
        return new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          }, { once: true });
          started.resolve();
        });
      });
      const failed = expect(createHorizonsClient({ cacheDirectory, fetch, maxAttempts: 1 }).load(request))
        .rejects.toThrow();
      await started.promise;
      await vi.advanceTimersByTimeAsync(29_999);
      expect(aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await failed;
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts a 900000-byte source and rejects one more byte", async () => {
    const atLimit = raw + " ".repeat(900_000 - Buffer.byteLength(raw));
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse(atLimit))
      .mockResolvedValueOnce(jsonResponse(atLimit + " "));
    const capture = await createHorizonsClient({ cacheDirectory, fetch }).load(request);
    expect(capture.manifest.byteLength).toBe(900_000);
    await rm(join(cacheDirectory, `${requestDigest}.json`));
    await expect(createHorizonsClient({ cacheDirectory, fetch }).load(request)).rejects.toThrow(/size limit/);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it("refuses a two-million-byte cache record before parsing it", () => {
    expect(() => decodeHorizonsCapture(" ".repeat(2_000_000), request)).toThrow(/size limit/);
  });

  it("serializes calls across client instances until the previous body is consumed", async () => {
    const started = deferred();
    const releaseBody = deferred();
    const events: string[] = [];
    const fetchFirst = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
      events.push("first-fetch");
      started.resolve();
      return jsonResponse(new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode(raw.slice(0, 100)));
          await releaseBody.promise;
          events.push("first-body-complete");
          controller.enqueue(new TextEncoder().encode(raw.slice(100)));
          controller.close();
        }
      }));
    });
    const fetchSecond = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
      events.push("second-fetch");
      return jsonResponse(raw);
    });
    const first = createHorizonsClient({ cacheDirectory: join(cacheDirectory, "a"), fetch: fetchFirst });
    const second = createHorizonsClient({ cacheDirectory: join(cacheDirectory, "b"), fetch: fetchSecond });
    const firstLoad = first.load(request);
    await started.promise;
    const secondLoad = second.load(request);
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      expect(fetchSecond).not.toHaveBeenCalled();
    } finally {
      releaseBody.resolve();
      await Promise.all([firstLoad, secondLoad]);
    }
    expect(events).toEqual(["first-fetch", "first-body-complete", "second-fetch"]);
  });

  it("serves concurrent identical loads from one atomically installed capture", async () => {
    const fetch = successfulFetch();
    const first = createHorizonsClient({ cacheDirectory, fetch });
    const second = createHorizonsClient({ cacheDirectory, fetch });
    const captures = await Promise.all([first.load(request), second.load(request), first.load(request)]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(captures[1]).toEqual(captures[0]);
    expect(captures[2]).toEqual(captures[0]);
    expect(await readdir(cacheDirectory)).toEqual([`${requestDigest}.json`]);
  });

  it.each([429, 500, 502, 503, 504])("retries transient HTTP %i with bounded backoff", async (status) => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse("temporarily unavailable", status))
      .mockResolvedValueOnce(jsonResponse("temporarily unavailable", status))
      .mockImplementation(async () => jsonResponse(raw));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    const capture = await createHorizonsClient({
      cacheDirectory, fetch, sleep, maxAttempts: 3, retryBaseMs: 5
    }).load(request);
    expect(capture.raw).toBe(raw);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[5], [10]]);
  });

  it("retries transient network failures and stops at the attempt limit", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    await expect(createHorizonsClient({
      cacheDirectory, fetch, sleep, maxAttempts: 3, retryBaseMs: 5
    }).load(request)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[5], [10]]);
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it("honors Retry-After when it exceeds the local backoff", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "Retry-After": "2" } }))
      .mockImplementation(async () => jsonResponse(raw));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    await createHorizonsClient({ cacheDirectory, fetch, sleep, retryBaseMs: 5 }).load(request);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toEqual([[2000]]);
  });

  it("reads an HTTP-date Retry-After against the supplied clock", async () => {
    const later = new Date(Date.parse(retrievedAt) + 3000).toUTCString();
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 503, headers: { "Retry-After": later } }))
      .mockImplementation(async () => jsonResponse(raw));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    await createHorizonsClient({
      cacheDirectory, fetch, sleep, retryBaseMs: 5, now: () => new Date(retrievedAt)
    }).load(request);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toEqual([[3000]]);
  });

  it("refuses a server delay beyond the bounded retry window", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
      return new Response("busy", { status: 429, headers: { "Retry-After": "120" } });
    });
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    await expect(createHorizonsClient({ cacheDirectory, fetch, sleep }).load(request)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("caps exponential retry delays", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    await expect(createHorizonsClient({
      cacheDirectory, fetch, sleep, maxAttempts: 5, retryBaseMs: 30_000
    }).load(request)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(sleep.mock.calls).toEqual([[30_000], [60_000], [60_000], [60_000]]);
  });

  it.each([400, 401, 403, 404, 408])("does not retry permanent HTTP %i failures", async (status) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse("rejected", status));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    await expect(createHorizonsClient({ cacheDirectory, fetch, sleep, maxAttempts: 3 }).load(request))
      .rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it.each(["semantic error", "unknown signature", "invalid JSON"])(
    "does not retry a successful HTTP response with %s", async (failure) => {
      const envelope = JSON.parse(raw) as { signature: { source: string; version: string }; error?: string };
      let bad = raw;
      if (failure === "semantic error") {
        envelope.error = "No matches found.";
        bad = JSON.stringify(envelope);
      } else if (failure === "unknown signature") {
        envelope.signature.version = "999";
        bad = JSON.stringify(envelope);
      } else {
        bad = "{invalid";
      }
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse(bad));
      const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
      await expect(createHorizonsClient({ cacheDirectory, fetch, sleep, maxAttempts: 3 }).load(request))
        .rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(await readdir(cacheDirectory)).toEqual([]);
    }
  );

  it("times out a stalled request and releases the queue for another client", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((_input, options) => {
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
    });
    const stalled = createHorizonsClient({
      cacheDirectory: join(cacheDirectory, "stalled"), fetch, timeoutMs: 10, maxAttempts: 1
    }).load(request);
    const failed = expect(stalled).rejects.toThrow();
    const next = createHorizonsClient({
      cacheDirectory: join(cacheDirectory, "next"), fetch: successfulFetch()
    }).load(request);
    await failed;
    expect((await next).raw).toBe(raw);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the timeout active while a response body stalls and can retry", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockImplementationOnce(async (_input, options) => {
        return jsonResponse(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(raw.slice(0, 100)));
            options?.signal?.addEventListener("abort", () => {
              controller.error(new DOMException("aborted", "AbortError"));
            }, { once: true });
          }
        }));
      })
      .mockImplementation(async () => jsonResponse(raw));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    const capture = await createHorizonsClient({
      cacheDirectory, fetch, sleep, timeoutMs: 10, maxAttempts: 2, retryBaseMs: 0
    }).load(request);
    expect(capture.raw).toBe(raw);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toEqual([[0]]);
  });

  it("rejects invalid UTF-8 bytes without changing them into a different hashed source", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse(Uint8Array.of(0xff)));
    await expect(createHorizonsClient({ cacheDirectory, fetch }).load(request)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it("rejects HTML responses without retrying or caching them", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
      return new Response("<html>upstream error</html>", { headers: { "Content-Type": "text/html" } });
    });
    await expect(createHorizonsClient({ cacheDirectory, fetch }).load(request)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it("rejects an oversized response before it can become a cache file", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse(" ".repeat(2_000_000) + raw));
    await expect(createHorizonsClient({ cacheDirectory, fetch, maxAttempts: 3 }).load(request)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it("does not perform a fetch when its module is imported or a client is constructed", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("Unexpected network request."));
    vi.stubGlobal("fetch", fetch);
    vi.resetModules();
    const module = await import("../src/horizons-client.js");
    module.createHorizonsClient({ cacheDirectory });
    expect(fetch).not.toHaveBeenCalled();
  });
});
