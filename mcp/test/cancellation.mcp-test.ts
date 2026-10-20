import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import type { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { EventSearchRunner } from "../src/event-search-runner.js";
import { startHttp } from "../src/transports.js";
import { eventSearchOutputSchema } from "../src/tools/events.js";

const longSearch = { name: "event_search", arguments: {
  body: "Moon", longitude: 0, from: "2024-01-01T00:00:00Z", to: "2025-01-01T00:00:00Z", maxSamples: 100_000
} };
const shortSearch = { name: "event_search", arguments: {
  body: "Sun", longitude: 0, from: "2026-01-01T00:00:00Z", to: "2026-01-02T00:00:00Z"
} };
const snapshot = { name: "moon_phase", arguments: { at: "2026-01-01T00:00:00Z" } };
const versions = ["modern", "legacy"] as const;

type ObservedWorker = { worker: Worker; started: Promise<void>; exited: Promise<number>; resultReceived: boolean };
function workerObserver() {
  const queued: ObservedWorker[] = [];
  let waiting: ((observed: ObservedWorker) => void) | undefined;
  return {
    next(): Promise<ObservedWorker> {
      const observed = queued.shift();
      return observed ? Promise.resolve(observed) : new Promise((resolve) => { waiting = resolve; });
    },
    onWorker(worker: Worker) {
      let started!: () => void;
      const observed: ObservedWorker = {
        worker,
        started: new Promise<void>((resolve) => { started = resolve; }),
        exited: new Promise<number>((resolve) => { worker.once("exit", resolve); }),
        resultReceived: false
      };
      worker.on("message", (message: unknown) => {
        if (typeof message !== "object" || message === null || !("type" in message)) return;
        if (message.type === "started") started();
        if (message.type === "result") observed.resultReceived = true;
      });
      if (waiting) {
        const resolve = waiting;
        waiting = undefined;
        resolve(observed);
      } else queued.push(observed);
    }
  };
}

function outcome<T>(request: Promise<T>) {
  // Attach both handlers immediately: transport cancellation can settle before worker exit.
  return request.then((result) => ({ result }), (error: unknown) => ({ error }));
}

function expectSearch(result: Awaited<ReturnType<Client["callTool"]>>) {
  expect(result.isError).not.toBe(true);
  const output = eventSearchOutputSchema.parse(result.structuredContent);
  expect(output.data.search.status).toBe("complete");
  expect(output.receipts.length).toBeGreaterThanOrEqual(2);
}

describe("HTTP search cancellation and resource lifecycle", () => {
  const clients: Client[] = [];
  const endpoints: Awaited<ReturnType<typeof startHttp>>[] = [];
  const runners: EventSearchRunner[] = [];
  afterEach(async () => {
    // Stop workers before closing clients, including on failed assertions.
    await Promise.all(runners.splice(0).map((runner) => runner.close()));
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await Promise.all(endpoints.splice(0).map((endpoint) => endpoint.close()));
  });

  async function endpoint(budgetMs?: number) {
    const observed = workerObserver();
    const runner = new EventSearchRunner({ ...(budgetMs === undefined ? {} : { budgetMs }), onWorker: observed.onWorker });
    runners.push(runner);
    const running = await startHttp({ port: 0, eventSearchRunner: runner });
    endpoints.push(running);
    return { ...running, observed };
  }

  async function connect(url: URL, version: typeof versions[number] = "modern", fetcher?: typeof fetch) {
    const client = new Client({ name: "synthetic-cancellation-test", version: "0.0.0" },
      version === "legacy" ? { supportedProtocolVersions: ["2025-11-25"] }
        : { versionNegotiation: { mode: { pin: "2026-07-28" } } });
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(url, fetcher ? { fetch: fetcher } : {}));
    expect(client.getProtocolEra()).toBe(version);
    return client;
  }

  it("stops active work when the modern SDK client cancels its HTTP request, then runs another search", async () => {
    const running = await endpoint();
    const client = await connect(running.url);
    const cancellation = new AbortController();
    const pending = outcome(client.callTool(longSearch, { signal: cancellation.signal }));
    const observed = await running.observed.next();
    await observed.started;
    cancellation.abort();
    expect(await pending).toHaveProperty("error");
    await observed.exited;
    expect(observed.worker.threadId).toBe(-1);
    expect(observed.resultReceived).toBe(false);
    expectSearch(await client.callTool(shortSearch));
  }, 15_000);

  it("reports a server deadline without partial structured results and keeps other tools usable", async () => {
    const running = await endpoint(1);
    const client = await connect(running.url);
    const pending = client.callTool(longSearch);
    const observed = await running.observed.next();
    const result = await pending;
    await observed.exited;
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toEqual([{ type: "text", text: expect.stringContaining("deadline exceeded") }]);
    expect(observed.worker.threadId).toBe(-1);
    expect(observed.resultReceived).toBe(false);
    expect((await client.callTool(snapshot)).isError).not.toBe(true);
  });

  it("refuses a concurrent search across clients and preserves work when another request finishes", async () => {
    const running = await endpoint();
    const first = await connect(running.url);
    const second = await connect(running.url);
    const pending = first.callTool(longSearch);
    const observed = await running.observed.next();
    await observed.started;
    const refused = await second.callTool(shortSearch);
    expect(refused.isError).toBe(true);
    expect(refused.structuredContent).toBeUndefined();
    expect(refused.content).toEqual([{ type: "text", text: expect.stringContaining("busy") }]);
    expect((await second.callTool(snapshot)).isError).not.toBe(true);
    expectSearch(await pending);
    await observed.exited;
    expectSearch(await second.callTool(shortSearch));
  }, 15_000);

  it.each(versions)("stops an active %s HTTP search when the endpoint closes", async (version) => {
    const running = await endpoint();
    const client = await connect(running.url, version);
    const pending = outcome(client.callTool(longSearch));
    const observed = await running.observed.next();
    await observed.started;
    await running.close();
    await observed.exited;
    expect(observed.worker.threadId).toBe(-1);
    expect(observed.resultReceived).toBe(false);
    await client.close();
    const settled = await pending;
    if ("result" in settled) {
      expect(settled.result.isError).toBe(true);
      expect(settled.result.structuredContent).toBeUndefined();
    } else expect(settled.error).toBeInstanceOf(Error);
  }, 15_000);

  it("stops legacy HTTP work on a socket disconnect and recovers for another client", async () => {
    const running = await endpoint();
    const request = httpRequest(running.url, { method: "POST", headers: {
      "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25"
    } }, (response) => { response.resume(); });
    request.on("error", () => {});
    const disconnected = new Promise<void>((resolve) => { request.once("close", resolve); });
    request.end(JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: longSearch }));
    const observed = await running.observed.next();
    try {
      await observed.started;
      request.destroy();
      await disconnected;
      await observed.exited;
      expect(observed.worker.threadId).toBe(-1);
      expect(observed.resultReceived).toBe(false);
      const client = await connect(running.url, "legacy");
      expectSearch(await client.callTool(shortSearch));
    } finally { request.destroy(); }
  }, 15_000);

  it("does not let a separate legacy client's cancellation target another client's request ID", async () => {
    const running = await endpoint();
    let searchId: string | number | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      if (typeof init?.body === "string") {
        const message = JSON.parse(init.body) as { method?: string; id?: string | number; params?: { name?: string } };
        if (message.method === "tools/call" && message.params?.name === "event_search") searchId = message.id;
      }
      return fetch(input, init);
    };
    const first = await connect(running.url, "legacy", fetcher);
    const second = await connect(running.url, "legacy");
    const pending = first.callTool(longSearch);
    const observed = await running.observed.next();
    await observed.started;
    expect(searchId).toBeDefined();
    await second.notification({ method: "notifications/cancelled", params: { requestId: searchId! } });
    expectSearch(await pending);
    await observed.exited;
    expect(observed.resultReceived).toBe(true);
    expectSearch(await second.callTool(shortSearch));
  }, 15_000);
});

// Worker lifecycle is observed on stderr; protocol messages continue over the real stdio pipes.
const stdioProgram = `
import { startStdio } from ${JSON.stringify(new URL("../build/transports.js", import.meta.url).href)};
import { EventSearchRunner } from ${JSON.stringify(new URL("../build/event-search-runner.js", import.meta.url).href)};
const runner = new EventSearchRunner({ onWorker(worker) {
  worker.on("message", (message) => {
    if (message?.type === "started") process.stderr.write("search-started\\n");
    if (message?.type === "result") process.stderr.write("search-result\\n");
  });
  worker.once("exit", () => process.stderr.write("search-stopped\\n"));
} });
const running = startStdio({ eventSearchRunner: runner });
process.once("SIGINT", () => { void running.close(); });
process.once("SIGTERM", () => { void running.close(); });
`;

function diagnostic(transport: StdioClientTransport, marker: string) {
  return new Promise<void>((resolve, reject) => {
    const stream = transport.stderr;
    if (!stream) { reject(new Error("Expected a stderr observation pipe.")); return; }
    let text = "";
    const read = (chunk: unknown) => {
      text += String(chunk);
      if (text.includes(`${marker}\n`)) { stream.removeListener("data", read); resolve(); }
    };
    stream.on("data", read);
  });
}

describe.each(versions)("%s SDK stdio search cancellation", (version) => {
  let client: Client | undefined;
  afterEach(async () => { await client?.close(); });

  it("sends cancellation over stdio, stops the worker and accepts another search", async () => {
    client = new Client({ name: "synthetic-stdio-cancellation-test", version: "0.0.0" },
      version === "legacy" ? { supportedProtocolVersions: ["2025-11-25"] }
        : { versionNegotiation: { mode: { pin: "2026-07-28" } } });
    const transport = new StdioClientTransport({
      command: process.execPath, args: ["--input-type=module", "--eval", stdioProgram],
      cwd: fileURLToPath(new URL("../", import.meta.url)), stderr: "pipe"
    });
    await client.connect(transport);
    expect(client.getProtocolEra()).toBe(version);
    let diagnostics = "";
    transport.stderr?.on("data", (chunk: unknown) => { diagnostics += String(chunk); });
    const started = diagnostic(transport, "search-started");
    const stopped = diagnostic(transport, "search-stopped");
    const cancellation = new AbortController();
    const pending = outcome(client.callTool(longSearch, { signal: cancellation.signal }));
    await started;
    cancellation.abort();
    expect(await pending).toHaveProperty("error");
    await stopped;
    expect(diagnostics).not.toContain("search-result");
    expectSearch(await client.callTool(shortSearch));
  }, 20_000);
});
