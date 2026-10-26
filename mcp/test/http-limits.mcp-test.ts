import { randomBytes } from "node:crypto";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArguments } from "../src/cli.js";
import { EventSearchRunner } from "../src/event-search-runner.js";
import { DEFAULT_HTTP_LIMITS, HttpRateLimiter, MAX_REQUEST_BYTES, resolveHttpLimits, type HttpLimits } from "../src/http-limits.js";
import { startHttp } from "../src/transports.js";

const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
const endpoints: Awaited<ReturnType<typeof startHttp>>[] = [];

afterEach(async () => {
  await Promise.all(endpoints.splice(0).map((endpoint) => endpoint.close()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function listen(options: Parameters<typeof startHttp>[0] = {}) {
  const endpoint = await startHttp({ port: 0, ...options });
  endpoints.push(endpoint);
  return endpoint.url;
}

type Response = { status: number | undefined; headers: IncomingHttpHeaders; body: string };
type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  chunks?: Buffer[];
  unfinished?: boolean;
};

// Writing chunks explicitly avoids an automatically supplied Content-Length.
// An unfinished sender verifies that rejection does not wait for the body.
function request(url: URL, options: RequestOptions = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(url, { method: options.method ?? "POST", headers: { ...headers, ...options.headers } }, (incoming) => {
      const parts: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => { parts.push(chunk); });
      incoming.on("error", reject);
      incoming.on("end", () => {
        resolve({ status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(parts).toString("utf8") });
        outgoing.destroy();
      });
    });
    outgoing.on("error", reject);
    outgoing.setTimeout(3_000, () => outgoing.destroy(new Error("Loopback request timed out.")));
    for (const chunk of options.chunks ?? []) outgoing.write(chunk);
    if (options.unfinished) outgoing.flushHeaders();
    else outgoing.end();
  });
}

function initialization(bytes?: number): Buffer {
  const message = { jsonrpc: "2.0", id: 1, method: "initialize", params: {
    protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "", version: "0.0.0" }
  } };
  if (bytes !== undefined) {
    const padding = bytes - Buffer.byteLength(JSON.stringify(message));
    if (padding < 0) throw new Error("Initialization boundary is too small.");
    message.params.clientInfo.name = "é".repeat(Math.floor(padding / 2)) + (padding % 2 ? "a" : "");
  } else message.params.clientInfo.name = "synthetic-limits-test";
  return Buffer.from(JSON.stringify(message));
}

function message(response: Response) {
  const data = response.body.split(/\r?\n/).find((line) => line.startsWith("data:"));
  return JSON.parse(data ? data.slice(5).trim() : response.body);
}

async function expectInitialization(url: URL, body = initialization(), requestHeaders: Record<string, string> = {}) {
  const response = await request(url, { headers: { "Content-Length": String(body.length), ...requestHeaders }, chunks: [body] });
  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]?.split(/,\s*/)).toContain("no-store");
  expect(response.headers["cache-control"]?.split(/,\s*/)).toContain("no-transform");
  expect(message(response).result.serverInfo.name).toBe("zodiacs-astro");
}

function expectRateRefusal(response: Response, retryAfter?: string) {
  expect(response.status).toBe(429);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.headers.connection).toBe("close");
  expect(response.headers["content-type"]).toBe("application/json");
  expect(response.headers["retry-after"]).toMatch(/^[1-9]\d*$/);
  if (retryAfter !== undefined) expect(response.headers["retry-after"]).toBe(retryAfter);
  expect(JSON.parse(response.body)).toEqual({ error: "Too many requests" });
}

describe("HTTP request limit configuration", () => {
  it("uses immutable defaults and allows only bounded positive integer settings", () => {
    expect(MAX_REQUEST_BYTES).toBe(65_536);
    expect(DEFAULT_HTTP_LIMITS).toEqual({ maxRequests: 120, windowMs: 60_000, maxRequestBytes: 65_536 });
    expect(Object.isFrozen(DEFAULT_HTTP_LIMITS)).toBe(true);
    expect(resolveHttpLimits()).toEqual(DEFAULT_HTTP_LIMITS);
    const input = { maxRequests: 3, maxRequestBytes: 512 };
    const resolved = resolveHttpLimits(input);
    input.maxRequests = 5;
    expect(resolved).toEqual({ maxRequests: 3, windowMs: 60_000, maxRequestBytes: 512 });
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(resolveHttpLimits({ maxRequests: Number.MAX_SAFE_INTEGER, windowMs: Number.MAX_SAFE_INTEGER, maxRequestBytes: 1 }))
      .toEqual({ maxRequests: Number.MAX_SAFE_INTEGER, windowMs: Number.MAX_SAFE_INTEGER, maxRequestBytes: 1 });
  });

  it("rejects invalid values and unknown settings without including supplied values", async () => {
    const invalid: unknown[] = [null, [], "private-invalid-setting", { unsupported: 1 }, { maxRequestBytes: MAX_REQUEST_BYTES + 1 }];
    for (const key of ["maxRequests", "windowMs", "maxRequestBytes"]) {
      for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "3", null, undefined, true]) {
        invalid.push({ [key]: value });
      }
    }
    for (const limits of invalid) {
      expect(() => resolveHttpLimits(limits as Partial<HttpLimits>)).toThrow(new RangeError("Invalid HTTP request limits."));
    }
    for (const limits of [null, { windowMs: 0 }, { maxRequests: Infinity }, { maxRequestBytes: MAX_REQUEST_BYTES + 1 }]) {
      await expect(startHttp({ port: 0, limits: limits as Partial<HttpLimits> })).rejects.toThrow(new RangeError("Invalid HTTP request limits."));
    }
    for (const value of [0, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => new HttpRateLimiter({ maxRequests: value, windowMs: 1 })).toThrow(RangeError);
      expect(() => new HttpRateLimiter({ maxRequests: 1, windowMs: value })).toThrow(RangeError);
    }
  });

  it("parses HTTP options in any order while preserving authentication and port settings", async () => {
    const config = parseArguments(["http", "--max-request-bytes", "512", "--port", "0", "--rate-window-ms", "60000", "--max-requests", "1"]);
    expect(config).toEqual({ transport: "http", port: 0, limits: { maxRequestBytes: 512, windowMs: 60_000, maxRequests: 1 } });
    expect(parseArguments(["http", "--max-requests", "120", "--auth-token-env", "ZODIACS_MCP_LIMIT_TEST_TOKEN", "--max-request-bytes", "65536"]))
      .toEqual({ transport: "http", auth: { tokenEnv: "ZODIACS_MCP_LIMIT_TEST_TOKEN" }, limits: { maxRequests: 120, maxRequestBytes: 65_536 } });
    expect(parseArguments(["http", "--rate-window-ms", String(Number.MAX_SAFE_INTEGER)]).limits?.windowMs).toBe(Number.MAX_SAFE_INTEGER);
    const url = await listen(config);
    expect((await request(url, { method: "GET" })).status).toBe(405);
    expectRateRefusal(await request(url, { method: "GET" }));
  });

  it("rejects missing, repeated, disabled, noninteger and stdio CLI limit options", () => {
    for (const option of ["--max-requests", "--rate-window-ms", "--max-request-bytes"]) {
      for (const args of [["stdio", option, "1"], ["http", option], ["http", option, "1", option, "2"]]) {
        expect(() => parseArguments(args)).toThrow("Usage");
      }
      for (const value of ["0", "-1", "1.5", "1e3", "Infinity", "9007199254740992", " 1", "1 ", "1\n", "1\r\n", "", "off"]) {
        expect(() => parseArguments(["http", option, value])).toThrow("Usage");
      }
    }
    for (const args of [["http", "--max-request-bytes", "65537"], ["http", "--no-rate-limit"], ["http", "--disable-limits", "1"]]) {
      expect(() => parseArguments(args)).toThrow("Usage");
    }
  });
});

describe("HTTP fixed request window", () => {
  it("admits the boundary count, rounds Retry-After up and resets without extending refusals", () => {
    const rate = new HttpRateLimiter({ maxRequests: 2, windowMs: 2_500 });
    expect(rate.take(10_000)).toBeUndefined();
    expect(rate.take(10_100)).toBeUndefined();
    expect(rate.take(10_100)).toBe(3);
    expect(rate.take(10_500)).toBe(2);
    expect(rate.take(12_499)).toBe(1);
    expect(rate.take(12_500)).toBeUndefined();
    expect(rate.take(12_500)).toBeUndefined();
    expect(rate.take(12_500)).toBe(3);
    expect(rate.take(20_000)).toBeUndefined();
  });

  it("starts the HTTP window on its first matching request and recovers at the original boundary", async () => {
    let now = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const url = await listen({ limits: { maxRequests: 1, windowMs: 1_500 } });
    now = 10_000;
    expect((await request(url, { method: "GET" })).status).toBe(405);
    expectRateRefusal(await request(url, { method: "GET" }), "2");
    now = 11_499;
    expectRateRefusal(await request(url, { method: "GET" }), "1");
    now = 11_500;
    await expectInitialization(url);
    expectRateRefusal(await request(url, { method: "GET" }), "2");
  });

  it("runs host, origin and path guards before consuming the request allowance", async () => {
    const url = await listen({ limits: { maxRequests: 1 } });
    expect((await request(url, { headers: { Host: "foreign.example" } })).status).toBe(403);
    expect((await request(url, { headers: { Origin: "https://foreign.example" } })).status).toBe(403);
    expect((await request(new URL("/other", url))).status).toBe(404);
    expect((await request(new URL("?other=1", url))).status).toBe(404);
    expect((await request(url, { method: "GET" })).status).toBe(405);
    expectRateRefusal(await request(url, { method: "GET" }));
  });

  it("counts every endpoint method, including unsupported methods", async () => {
    const methods = ["GET", "DELETE", "PUT", "OPTIONS", "HEAD"];
    const url = await listen({ limits: { maxRequests: methods.length } });
    for (const method of methods) expect((await request(url, { method })).status).toBe(405);
    expectRateRefusal(await request(url));
  });

  it("counts authentication failures before parsing and refuses valid credentials after exhaustion without private diagnostics", async () => {
    let now = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const envName = "ZODIACS_MCP_LIMIT_TEST_TOKEN";
    const token = randomBytes(32).toString("base64url");
    const privateBody = randomBytes(24).toString("hex");
    vi.stubEnv(envName, token);
    const onerror = vi.fn();
    const clock = vi.fn(() => new Date("2026-01-03T00:00:00Z"));
    const runner = new EventSearchRunner();
    const run = vi.spyOn(runner, "run");
    const output = [vi.spyOn(console, "error"), vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(process.stderr, "write")];
    const url = await listen({ auth: { tokenEnv: envName }, limits: { maxRequests: 2 }, eventSearchRunner: runner, clock, onerror });
    const missing = await request(url, { headers: { "Content-Length": String(MAX_REQUEST_BYTES + 1) }, chunks: [Buffer.from("{")], unfinished: true });
    const wrong = await request(url, { headers: { Authorization: `Bearer ${randomBytes(32).toString("base64url")}`, "Content-Length": String(MAX_REQUEST_BYTES + 1) }, chunks: [Buffer.from(privateBody)], unfinished: true });
    for (const response of [missing, wrong]) {
      expect(response.status).toBe(401);
      expect(response.headers.connection).toBe("close");
      expect(JSON.parse(response.body)).toEqual({ error: "Unauthorized" });
    }
    for (const forwarded of ["192.0.2.1", "198.51.100.2"]) {
      const response = await request(url, { headers: {
        Authorization: `Bearer ${token}`, "Content-Length": String(MAX_REQUEST_BYTES + 1),
        "X-Forwarded-For": forwarded, Forwarded: `for=${forwarded}`, "X-Real-IP": forwarded
      }, chunks: [Buffer.from(privateBody)], unfinished: true });
      expectRateRefusal(response);
      for (const value of [token, privateBody, envName, forwarded]) expect(response.body).not.toContain(value);
    }
    now += DEFAULT_HTTP_LIMITS.windowMs;
    await expectInitialization(url, initialization(), { Authorization: `Bearer ${token}` });
    expect(onerror).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    for (const stream of output) expect(stream).not.toHaveBeenCalled();
  });

  it("counts malformed and oversized requests toward the same listener allowance", async () => {
    const url = await listen({ limits: { maxRequests: 2, maxRequestBytes: 512 } });
    expect((await request(url, { chunks: [Buffer.from("not-json")] })).status).toBe(400);
    expect((await request(url, { headers: { "Content-Length": "513" }, chunks: [initialization(513)] })).status).toBe(413);
    expectRateRefusal(await request(url, { chunks: [initialization()] }));
  });

  it("keeps independent listener allowances while fresh sockets and forwarding headers cannot bypass one", async () => {
    const first = await listen({ limits: { maxRequests: 1 } });
    const second = await listen({ limits: { maxRequests: 1 } });
    expect((await request(first, { method: "GET" })).status).toBe(405);
    expectRateRefusal(await request(first, { method: "GET", headers: { "X-Forwarded-For": "192.0.2.10" } }));
    expect((await request(second, { method: "GET" })).status).toBe(405);
    expectRateRefusal(await request(first, { method: "GET", headers: { "X-Forwarded-For": "198.51.100.20" } }));
    expectRateRefusal(await request(second, { method: "GET" }));
  });
});

describe.each([512, 65_536])("HTTP request body cap of %i bytes", (maxRequestBytes) => {
  it("accepts valid UTF-8 JSON at the byte boundary with declared length and with split chunked encoding", async () => {
    const url = await listen({ limits: { maxRequestBytes } });
    const boundary = initialization(maxRequestBytes);
    expect(boundary.length).toBe(maxRequestBytes);
    expect(boundary.toString("utf8").length).toBeLessThan(maxRequestBytes);
    await expectInitialization(url, boundary);
    const split = boundary.indexOf(Buffer.from("é")) + 1;
    const chunked = await request(url, { chunks: [boundary.subarray(0, split), boundary.subarray(split)] });
    expect(chunked.status).toBe(200);
    expect(message(chunked).result.serverInfo.name).toBe("zodiacs-astro");
  });

  it("rejects oversized declared length before the sender finishes and serves later requests", async () => {
    const onerror = vi.fn();
    const url = await listen({ limits: { maxRequestBytes }, onerror });
    const response = await request(url, { headers: { "Content-Length": String(maxRequestBytes + 1) }, chunks: [Buffer.from("{")], unfinished: true });
    expect(response.status).toBe(413);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.connection).toBe("close");
    await expectInitialization(url);
    expect(onerror).not.toHaveBeenCalled();
  });

  it("rejects chunked UTF-8 JSON above the byte cap and flushes the refusal before recovery", async () => {
    const onerror = vi.fn();
    const url = await listen({ limits: { maxRequestBytes }, onerror });
    const oversized = initialization(maxRequestBytes + 1);
    expect(oversized.toString("utf8").length).toBeLessThan(maxRequestBytes);
    const split = oversized.indexOf(Buffer.from("é")) + 1;
    const response = await request(url, { chunks: [oversized.subarray(0, split), oversized.subarray(split, maxRequestBytes - 1), oversized.subarray(maxRequestBytes - 1)] });
    expect(response.status).toBe(413);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.connection).toBe("close");
    await expectInitialization(url);
    expect(onerror).not.toHaveBeenCalled();
  });
});
