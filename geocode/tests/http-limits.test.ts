import { request as httpRequest } from "node:http";
import { setImmediate as immediate } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeocoder } from "../src/geocoder.js";
import type { Geocoder } from "../src/geocoder.js";
import { createGeocodeServer, HTTP_LIMITS } from "../src/http-server.js";
import type { GeocodeHttpServer, HttpServerOptions } from "../src/http-server.js";

const geocoder = createGeocoder({
  schemaVersion: 1, provenance: { dataset: "synthetic", license: "MIT", attribution: "Invented admission tests", sources: [] }, places: []
}, { resolve() { throw new Error("No atlas lookup expected"); } });
const services: GeocodeHttpServer[] = [];
const input = { placeId: "synthetic:absent", date: "2001-06-15" };

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function start(options: HttpServerOptions = {}, provider: Geocoder = geocoder) {
  const service = createGeocodeServer(provider, options);
  services.push(service);
  return { service, ...(await service.start()) };
}

function request(port: number, headers: Record<string, string | string[]> = {}, post = false, localAddress?: string) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: any; text: string }>((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, agent: false, headers,
      ...(localAddress === undefined ? {} : { localAddress }),
      path: post ? "/tz" : "/lookup?query=Invented", method: post ? "POST" : "GET"
    }, (res) => {
      let text = "";
      res.on("data", (chunk: Buffer) => { text += chunk.toString(); });
      res.on("error", reject);
      res.on("end", () => { try { resolve({ status: res.statusCode!, headers: res.headers, body: JSON.parse(text), text }); } catch (error) { reject(error); } });
    });
    req.setTimeout(5000, () => req.destroy(new Error("Test client timed out")));
    req.on("error", reject);
    req.end(post ? JSON.stringify(input) : undefined);
  });
}

function blockedProvider() {
  let entered!: () => void;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const resolve = vi.fn(async () => { entered(); await gate; return geocoder.resolve(input); });
  return { provider: { ...geocoder, resolve }, waiting, release };
}

describe("HTTP admission before parsing or provider execution", () => {
  it("shares a burst across both routes, returns private 429 diagnostics and recovers at refill", async () => {
    let time = 0;
    const provider = { ...geocoder, resolve: vi.fn(geocoder.resolve), lookup: vi.fn(geocoder.lookup) };
    const { port } = await start({ admission: { capacity: 2, refillPerSecond: 0.5, clock: () => time } }, provider);
    expect((await request(port)).status).toBe(200);
    expect((await request(port, { "Content-Type": "application/json" }, true)).status).toBe(200);
    const rejected = await request(port, { "Content-Length": "999999", "X-Forwarded-For": "PRIVATE" }, true);
    expect(rejected.status).toBe(429);
    expect(rejected.headers).toMatchObject({ "retry-after": "2", connection: "close", "cache-control": "no-store" });
    expect(rejected.body.error.code).toBe("rate-limited");
    expect(rejected.text).not.toContain("PRIVATE");
    expect(provider.resolve).toHaveBeenCalledTimes(1);
    expect(provider.lookup).toHaveBeenCalledTimes(1);
    time = 1999;
    expect((await request(port)).status).toBe(429);
    time = 2000;
    expect((await request(port)).status).toBe(200);
  });

  it("counts malformed requests and ignores spoofed forwarding for direct clients", async () => {
    const { port } = await start({ admission: { capacity: 1, clock: () => 0 } });
    expect((await request(port, {}, true)).status).toBe(415);
    for (const client of ["192.0.2.1", "192.0.2.2", "PRIVATE"]) {
      expect((await request(port, { "X-Forwarded-For": client, "X-Real-IP": client, Forwarded: `for=${client}` })).status).toBe(429);
    }
  });

  it("isolates concurrent direct clients by socket address", async () => {
    const { port } = await start({ admission: { capacity: 1, clock: () => 0 } });
    const responses = await Promise.all([request(port, {}, false, "127.0.0.1"), request(port, {}, false, "127.0.0.2")]);
    expect(responses.map((res) => res.status)).toEqual([200, 200]);
    expect((await request(port, {}, false, "127.0.0.1")).status).toBe(429);
    expect((await request(port, {}, false, "127.0.0.2")).status).toBe(429);
  });

  it("enforces a shared burst across simultaneous requests from the same client", async () => {
    const provider = { ...geocoder, lookup: vi.fn(geocoder.lookup) };
    const { port } = await start({ admission: { capacity: 3, clock: () => 0 } }, provider);
    const responses = await Promise.all(Array.from({ length: 20 }, () => request(port)));
    expect(responses.filter((res) => res.status === 200)).toHaveLength(3);
    expect(responses.filter((res) => res.status === 429)).toHaveLength(17);
    expect(provider.lookup).toHaveBeenCalledTimes(3);
  });

  it("uses the nearest untrusted proxy hop, refusing duplicates and malformed chains privately", async () => {
    const { port } = await start({ trustedProxies: ["::ffff:127.0.0.1", "192.0.2.10"], admission: { capacity: 1, clock: () => 0 } });
    expect((await request(port, { "X-Forwarded-For": "198.51.100.1,203.0.113.1,192.0.2.10" })).status).toBe(200);
    expect((await request(port, { "X-Forwarded-For": "198.51.100.2,203.0.113.1,192.0.2.10" })).status).toBe(429);
    expect((await request(port, { "X-Forwarded-For": "203.0.113.2,192.0.2.10" })).status).toBe(200);
    for (const value of ["PRIVATE", ["192.0.2.1", "192.0.2.2"]]) {
      const result = await request(port, { "X-Forwarded-For": value });
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("invalid-input");
      expect(result.text).not.toContain("PRIVATE");
    }
  });

  it("bounds tracked clients without resetting existing limits and recovers after idle cleanup", async () => {
    let time = 0;
    const { port } = await start({ trustedProxies: ["127.0.0.1"], admission: {
      capacity: 1, maxClients: 2, idleTimeoutMs: 1000, cleanupIntervalMs: 100, clock: () => time
    } });
    const client = (ip: string) => request(port, { "X-Forwarded-For": ip });
    expect((await client("192.0.2.1")).status).toBe(200);
    expect((await client("192.0.2.2")).status).toBe(200);
    const overloaded = await client("192.0.2.3");
    expect(overloaded.status).toBe(503);
    expect(overloaded.body.error.code).toBe("overloaded");
    expect(overloaded.headers["retry-after"]).toBe("1");
    expect((await client("192.0.2.1")).status).toBe(429);
    time = 1000;
    expect((await client("192.0.2.3")).status).toBe(200);
  });

  it("rejects excess active work without invoking the provider and recovers when work completes", async () => {
    const blocked = blockedProvider();
    const { port } = await start({ admission: { maxConcurrent: 1 } }, blocked.provider);
    const first = request(port, { "Content-Type": "application/json" }, true);
    try {
      await blocked.waiting;
      const rejected = await request(port, { "Content-Type": "application/json" }, true);
      expect(rejected.status).toBe(503);
      expect(rejected.body.error.code).toBe("overloaded");
      expect(blocked.provider.resolve).toHaveBeenCalledTimes(1);
    } finally { blocked.release(); }
    expect((await first).status).toBe(200);
    expect((await request(port)).status).toBe(200);
  });

  it("does not release still-running provider work when its caller disconnects", async () => {
    const blocked = blockedProvider();
    const { port } = await start({ admission: { maxConcurrent: 1 } }, blocked.provider);
    const req = httpRequest({ host: "127.0.0.1", port, path: "/tz", method: "POST", agent: false,
      headers: { "Content-Type": "application/json" } });
    req.on("error", () => {});
    req.end(JSON.stringify(input));
    try {
      await blocked.waiting;
      req.destroy();
      expect((await request(port)).status).toBe(503);
    } finally { blocked.release(); }
    await immediate();
    expect((await request(port)).status).toBe(200);
  });

  it("releases slots after validation and provider errors without granting rate refunds", async () => {
    const provider = { ...geocoder, resolve: vi.fn(async () => { throw new Error("PRIVATE"); }) };
    const { port } = await start({ admission: { maxConcurrent: 1, capacity: 3, clock: () => 0 } }, provider);
    expect((await request(port, {}, true)).status).toBe(415);
    expect((await request(port, { "Content-Type": "application/json" }, true)).status).toBe(500);
    expect((await request(port)).status).toBe(200);
    expect((await request(port)).status).toBe(429);
  });

  it("counts a body still being streamed and recovers after that client aborts", async () => {
    const provider = { ...geocoder, resolve: vi.fn(geocoder.resolve) };
    const { port } = await start({ admission: { maxConcurrent: 1 } }, provider);
    const req = httpRequest({ host: "127.0.0.1", port, path: "/tz", method: "POST", agent: false,
      headers: { Expect: "100-continue", "Content-Type": "application/json", "Content-Length": "100" } });
    req.on("error", () => {});
    const admitted = new Promise<void>((resolve) => req.once("continue", () => { req.write("{"); resolve(); }));
    req.flushHeaders();
    await admitted;
    try {
      expect((await request(port)).status).toBe(503);
      expect(provider.resolve).not.toHaveBeenCalled();
    } finally { req.destroy(); }
    await immediate();
    expect((await request(port)).status).toBe(200);
  });

  it("gates Expect requests before sending 100 Continue and counts unsupported expectations", async () => {
    const { port } = await start({ admission: { capacity: 2, clock: () => 0 } });
    expect((await request(port, { "Content-Type": "application/json", Expect: "100-continue" }, true)).status).toBe(200);
    expect((await request(port, { Expect: "synthetic-expectation" })).status).toBe(417);
    let continued = false;
    const result = await new Promise<number>((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port, path: "/tz", method: "POST", agent: false,
        headers: { Expect: "100-continue", "Content-Length": "999999", "Content-Type": "application/json" }
      }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode!)); });
      req.on("continue", () => { continued = true; req.end("PRIVATE"); });
      req.on("error", reject);
      req.flushHeaders();
    });
    expect(result).toBe(429);
    expect(continued).toBe(false);
  });

  it("bounds TCP connections while an admitted provider is pending", async () => {
    expect(HTTP_LIMITS.maxConnections).toBe(128);
    const blocked = blockedProvider();
    const { port } = await start({ maxConnections: 1 }, blocked.provider);
    const first = request(port, { "Content-Type": "application/json" }, true);
    try {
      await blocked.waiting;
      await expect(request(port)).rejects.toThrow();
      expect(blocked.provider.resolve).toHaveBeenCalledTimes(1);
    } finally { blocked.release(); }
    expect((await first).status).toBe(200);
  });

  it("schedules cleanup only while listening and clears it on close", async () => {
    const set = vi.spyOn(globalThis, "setInterval");
    const clear = vi.spyOn(globalThis, "clearInterval");
    const service = createGeocodeServer(geocoder, { admission: { cleanupIntervalMs: 1234 } });
    services.push(service);
    expect(set).not.toHaveBeenCalled();
    await service.start();
    expect(set).toHaveBeenCalledWith(expect.any(Function), 1234);
    const timer = set.mock.results.find((result) => result.type === "return")!.value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);
    await service.close();
    expect(clear).toHaveBeenCalledWith(timer);
  });

  it("periodically frees an idle client even between admission-triggered scan intervals", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let time = 0;
    const { port } = await start({ trustedProxies: ["127.0.0.1"], admission: {
      capacity: 1, maxClients: 1, idleTimeoutMs: 100, cleanupIntervalMs: 100, clock: () => time
    } });
    expect((await request(port, { "X-Forwarded-For": "192.0.2.1" })).status).toBe(200);
    time = 999;
    expect((await request(port, { "X-Forwarded-For": "192.0.2.2" })).status).toBe(503);
    time = 1000;
    await vi.advanceTimersByTimeAsync(100);
    expect((await request(port, { "X-Forwarded-For": "192.0.2.2" })).status).toBe(200);
  });

  it.each([{ trustedProxies: true }, { trustedProxies: undefined }, { admission: undefined }, { admission: null },
    { maxConnections: 0 }, { maxConnections: undefined }, { maxConnections: 100_001 }, { maxConnections: 1.5 }])(
    "rejects malformed service limits %#", (options) => {
      expect(() => createGeocodeServer(geocoder, options as HttpServerOptions)).toThrow(RangeError);
    }
  );
});
