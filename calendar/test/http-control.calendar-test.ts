import { readFileSync } from "node:fs";
import { once } from "node:events";
import type { EventEmitter } from "node:events";
import { request, ServerResponse } from "node:http";
import type { Server, IncomingHttpHeaders } from "node:http";
import { setImmediate as tick } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFeedServer, DEFAULT_HTTP_LIMITS, MAX_HTTP_CONFIG_BYTES, feedPath } from "../src/http.js";
import type { FeedConfiguration } from "../src/cli-config.js";

interface Double extends EventEmitter {
  readonly options: { workerData: unknown; execArgv: string[]; resourceLimits: { maxOldGenerationSizeMb: number } };
  readonly pulls: string[];
  terminated: boolean;
  release?: () => void;
}
const state = vi.hoisted(() => ({ workers: [] as Double[], holdTermination: false }));
vi.mock("node:worker_threads", async () => {
  const { EventEmitter } = await import("node:events");
  return { Worker: class extends EventEmitter {
    pulls: string[] = [];
    terminated = false;
    release?: () => void;
    constructor(_url: URL, readonly options: Double["options"]) { super(); state.workers.push(this); }
    postMessage(value: string) { this.pulls.push(value); }
    async terminate() {
      if (state.holdTermination) await new Promise<void>(resolve => { this.release = resolve; });
      this.terminated = true;
      return 0;
    }
  } };
});
const example = (): FeedConfiguration => JSON.parse(readFileSync(new URL("../examples/synthetic-void.json", import.meta.url), "utf8"));
const servers: Server[] = [];
async function start(overrides: Parameters<typeof createFeedServer>[1] = {}) {
  const server = createFeedServer({ synthetic: example() }, overrides); servers.push(server);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No address.");
  return `http://127.0.0.1:${address.port}${feedPath("synthetic")}`;
}
function begin(url: string, headers: IncomingHttpHeaders = {}, method = "GET") {
  let body = "";
  let responseHeaders: IncomingHttpHeaders | undefined;
  const outgoing = request(url, { headers, method, agent: false });
  const result = new Promise<{ status: number; body: string; complete: boolean; headers: IncomingHttpHeaders }>((resolve, reject) => {
    outgoing.once("error", reject);
    outgoing.once("response", response => {
      responseHeaders = response.headers;
      response.setEncoding("utf8"); response.on("data", chunk => { body += chunk; });
      response.on("error", () => {});
      response.once("close", () => resolve({ status: response.statusCode!, body, complete: response.complete, headers: response.headers }));
    });
  });
  // Disconnect tests may intentionally close before headers arrive.
  void result.catch(() => {});
  outgoing.end();
  return { outgoing, result, body: () => body, headers: () => responseHeaders };
}
async function worker(index = state.workers.length - 1): Promise<Double> {
  await expect.poll(() => state.workers.length).toBeGreaterThan(index);
  return state.workers[index]!;
}
async function complete(value: Double) {
  value.emit("message", { type: "ready" });
  value.emit("message", { type: "chunk", chunk: "BEGIN:VCALENDAR\r\n" });
  value.emit("message", { type: "complete", chunk: "END:VCALENDAR\r\n" });
}
afterEach(async () => {
  vi.restoreAllMocks(); state.holdTermination = false;
  for (const value of state.workers) value.release?.();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections(); server.close(() => resolve());
  })));
  await tick(); state.workers = [];
});

describe("HTTP transport controls with a deterministic worker double", () => {
  it("enforces documented limits and validates every configured schedule before any worker starts", () => {
    expect(DEFAULT_HTTP_LIMITS).toEqual({ maxFeeds: 32, maxConcurrent: 2, deadlineMs: 30_000,
      maxEvaluations: 1_000_000, maxBufferedEvents: 1_000, maxRangeDays: 3_660,
      maxSelections: 32, maxOutputBytes: 8_000_000, workerMemoryMb: 128 });
    expect(MAX_HTTP_CONFIG_BYTES).toBe(1_048_576);
    for (const id of ["", "../natal", "synthetic.ics?query", "月", "a".repeat(65)]) expect(() => feedPath(id)).toThrow();
    expect(feedPath("Synthetic_42-test")).toBe("/feeds/Synthetic_42-test.ics");
    for (const limits of [{ maxConcurrent: 0 }, { deadlineMs: 2_147_483_648 }, { workerMemoryMb: NaN },
      { maxConcurrent: 1.2 }, { typo: 1 }, { toString: 1 }]) {
      expect(() => createFeedServer({ synthetic: example() }, limits as never)).toThrow();
    }
    for (const limits of [{ maxEvaluations: 10 }, { maxBufferedEvents: 10 }, { maxRangeDays: 1 }, { maxSelections: 1, maxFeeds: 1 }]) {
      const value = example();
      if (limits.maxSelections !== undefined) (value.schedule as { schedules: readonly unknown[] }).schedules = [...value.schedule.schedules, ...value.schedule.schedules];
      expect(() => createFeedServer({ synthetic: value }, limits)).toThrow("work limits");
    }
    expect(() => createFeedServer({})).toThrow("feed count");
    expect(() => createFeedServer({ a: example(), b: example() }, { maxFeeds: 1 })).toThrow("feed count");
    expect(() => createFeedServer({ synthetic: { ...example(), dtstamp: "x".repeat(MAX_HTTP_CONFIG_BYTES) } })).toThrow("byte limit");
    const invalid = example();
    (invalid.schedule.schedules[0]!.request as { clock: string }).clock = "tt";
    expect(() => createFeedServer({ valid: example(), invalid })).toThrow("UTC clock");
    expect(state.workers).toEqual([]);
  });

  it("captures configuration and worker memory settings and pulls nothing before worker readiness", async () => {
    const input = example(), before = structuredClone(input);
    const server = createFeedServer({ synthetic: input }, { workerMemoryMb: 192 }); servers.push(server);
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No address.");
    (input as { dtstamp: string }).dtstamp = "2027-01-01T00:00:00.000Z";
    const feed = begin(`http://127.0.0.1:${address.port}/feeds/synthetic.ics`), value = await worker(0);
    expect(value.options.workerData).toEqual(before);
    expect(value.options.execArgv).toEqual([]);
    expect(value.options.resourceLimits.maxOldGenerationSizeMb).toBe(192);
    expect(value.pulls).toEqual([]);
    await complete(value);
    expect((await feed.result).status).toBe(200);
    await expect.poll(() => value.terminated).toBe(true);
  });

  it("waits for response drain before pulling and terminates a paused worker on disconnect", async () => {
    let response: ServerResponse | undefined;
    const original = ServerResponse.prototype.write;
    vi.spyOn(ServerResponse.prototype, "write").mockImplementation(function (this: ServerResponse, ...args: unknown[]) {
      response = this;
      Reflect.apply(original, this, args);
      return false;
    });
    const url = await start(), pending = begin(url), value = await worker(0);
    value.emit("message", { type: "ready" });
    expect(value.pulls).toHaveLength(1);
    value.emit("message", { type: "chunk", chunk: "BEGIN:VCALENDAR\r\n" });
    await tick(); await tick();
    expect(value.pulls).toHaveLength(1);
    response!.emit("drain");
    expect(value.pulls).toHaveLength(2);
    pending.outgoing.destroy();
    await expect.poll(() => value.terminated).toBe(true);
    expect(value.pulls).toHaveLength(2);
    expect(response!.listenerCount("drain")).toBe(0);
  });

  it("keeps capacity occupied until termination ends and never revalidates an incomplete feed", async () => {
    state.holdTermination = true;
    const url = await start({ maxConcurrent: 1 }), pending = begin(url), value = await worker(0);
    const busy = await begin(url).result;
    expect(busy.status).toBe(503); expect(busy.headers["retry-after"]).toBe("1");
    value.emit("message", { type: "ready" });
    value.emit("message", { type: "chunk", chunk: "BEGIN:VCALENDAR\r\n" });
    await expect.poll(() => pending.body()).toContain("BEGIN:VCALENDAR");
    const tag = pending.headers()!.etag!;
    value.emit("message", { type: "error", status: 422, reason: "Feed search refused (evaluation-budget)." });
    const broken = await pending.result;
    expect(broken.complete).toBe(false); expect(broken.body).not.toContain("END:VCALENDAR");
    await expect.poll(() => value.release !== undefined).toBe(true);
    expect((await begin(url, { "if-none-match": tag }).result).status).toBe(503);
    state.holdTermination = false; value.release!();
    await expect.poll(() => value.terminated).toBe(true);
    const retry = begin(url, { "if-none-match": tag }), next = await worker(1);
    await complete(next);
    expect(await retry.result).toMatchObject({ status: 304, body: "", complete: true });
    expect((await begin(url, { "if-none-match": tag }).result).status).toBe(304);
    expect(state.workers).toHaveLength(2);
  });

  it("counts UTF-8 bytes including the footer and closes a late oversized response without a success footer", async () => {
    const header = "BEGIN:VCALENDAR\r\n", footer = "END:VCALENDAR\r\n";
    const url = await start({ maxOutputBytes: Buffer.byteLength(header + "月" + footer) - 1 });
    const pending = begin(url), value = await worker(0);
    value.emit("message", { type: "ready" });
    value.emit("message", { type: "chunk", chunk: header });
    value.emit("message", { type: "chunk", chunk: "月" });
    await expect.poll(() => pending.body()).toContain("月");
    value.emit("message", { type: "complete", chunk: footer });
    expect(await pending.result).toMatchObject({ complete: false, body: header + "月" });
    await expect.poll(() => value.terminated).toBe(true);
    const exact = await start({ maxOutputBytes: Buffer.byteLength(header + footer) });
    const accepted = begin(exact), next = await worker(1); await complete(next);
    expect(await accepted.result).toMatchObject({ status: 200, complete: true, body: header + footer });
  });

  it("terminates a blocked worker at the deadline, both before and after sending headers", async () => {
    const url = await start({ deadlineMs: 100 });
    const early = begin(url), first = await worker(0);
    expect(await early.result).toMatchObject({ status: 504, complete: true });
    await expect.poll(() => first.terminated).toBe(true);
    const late = begin(url), second = await worker(1);
    second.emit("message", { type: "ready" });
    second.emit("message", { type: "chunk", chunk: "BEGIN:VCALENDAR\r\n" });
    await expect.poll(() => late.body()).toContain("BEGIN:VCALENDAR");
    expect(await late.result).toMatchObject({ status: 200, complete: false, body: "BEGIN:VCALENDAR\r\n" });
    await expect.poll(() => second.terminated).toBe(true);
  });

  it("handles worker errors, exits and bad messages and stops workers when the server's sockets close", async () => {
    const url = await start();
    for (const [index, event, data] of [[0, "error", new Error("private-details")], [1, "exit", 1],
      [2, "message", { type: "unexpected" }]] as const) {
      const pending = begin(url), value = await worker(index); value.emit(event, data);
      const result = await pending.result;
      expect(result.status).toBe(500); expect(result.body).not.toContain("private-details");
      expect(result.headers.etag).toBeUndefined();
      await expect.poll(() => value.terminated).toBe(true);
    }
    const pending = begin(url), value = await worker(3);
    servers[0]!.closeAllConnections();
    await expect.poll(() => value.terminated).toBe(true);
    await expect(pending.result).rejects.toBeDefined();
  });
});
