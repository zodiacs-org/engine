import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { parseNatalEnvelope } from "@zodiacs/engine/receipt";
import { inputSchemas } from "../src/contracts.js";
import { parseArguments } from "../src/cli.js";
import { MAX_REQUEST_BYTES, startHttp } from "../src/transports.js";
import { natalChartTool } from "../src/tools/natal.js";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../build/cli.js", import.meta.url));
const birth = { utc: "2000-02-03T04:05:06+02:00", latitude: 12, longitude: 34 };
const at = "2026-01-03T00:00:00Z";
const requests = [
  { name: "natal_chart", arguments: { birth } },
  { name: "transits_at", arguments: { birth, at } },
  { name: "transits_now", arguments: { birth } },
  { name: "synastry", arguments: { first: birth, second: { utc: "2002-03-04T05:06:07Z" } } },
  { name: "solar_return", arguments: { birth, near: at } },
  { name: "lunar_return", arguments: { birth, after: at } },
  { name: "moon_phase", arguments: { at } },
  { name: "event_search", arguments: { body: "Sun", longitude: 0, from: at, to: "2026-01-04T00:00:00Z" } }
];

beforeAll(() => {
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.build.json"], { cwd });
});

describe.each(["stdio", "http", "http-legacy"] as const)("%s SDK transport", (mode) => {
  let client: Client | undefined;
  let endpoint: Awaited<ReturnType<typeof startHttp>> | undefined;
  afterEach(async () => { await client?.close(); await endpoint?.close(); });

  it("discovers tools, carries structured receipts for every tool, and recovers from invalid calls", async () => {
    client = new Client({ name: "synthetic-transport-test", version: "0.0.0" },
      mode === "http-legacy" ? { supportedProtocolVersions: ["2025-11-25"] } : {});
    if (mode === "stdio") {
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli], stderr: "pipe" }));
    } else {
      endpoint = await startHttp({ port: 0, clock: () => new Date(at) });
      const transport = new StreamableHTTPClientTransport(endpoint.url);
      await client.connect(transport);
      expect(transport.sessionId).toBeUndefined();
    }
    expect(client.getServerVersion()?.name).toBe("zodiacs-astro");
    expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual(Object.keys(inputSchemas).sort());
    for (const request of requests) {
      const result = await client.callTool(request);
      expect(result.isError, request.name).not.toBe(true);
      const output = result.structuredContent as { receipts: { envelope: unknown }[] };
      expect(output.receipts.length).toBeGreaterThan(0);
      for (const receipt of output.receipts) expect(parseNatalEnvelope(JSON.stringify(receipt.envelope)).ok).toBe(true);
      const text = result.content?.find((item) => item.type === "text");
      if (text?.type === "text") expect(JSON.parse(text.text)).toEqual(output);
      else throw new Error("Missing JSON text content.");
      if (request.name === "natal_chart") expect(result).toMatchObject(natalChartTool(request.arguments));
    }
    const refused = await client.callTool({ name: "natal_chart", arguments: {} });
    expect(refused.isError).toBe(true);
    expect(refused.structuredContent).toBeUndefined();
    expect((await client.callTool(requests[0]!)).isError).not.toBe(true);
  });
});

describe("local HTTP boundaries and lifecycle", () => {
  let endpoint: Awaited<ReturnType<typeof startHttp>> | undefined;
  afterEach(async () => { await endpoint?.close(); });

  it("rejects foreign hosts/origins, paths and session methods", async () => {
    endpoint = await startHttp({ port: 0 });
    for (const headers of [{ Host: "foreign.example" }, { Origin: "https://foreign.example" }, { Origin: "null" }]) {
      // node:http preserves an explicit Host header; fetch may replace it.
      const response = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
        const request = httpRequest(endpoint!.url, { method: "POST", headers }, (response) => {
          let body = "";
          response.on("data", (chunk) => { body += String(chunk); });
          response.on("end", () => resolve({ status: response.statusCode, body }));
        });
        request.on("error", reject);
        request.end();
      });
      expect(response.status).toBe(403);
      expect(JSON.parse(response.body).error).toBeDefined();
    }
    expect((await fetch(new URL("/other", endpoint.url))).status).toBe(404);
    for (const method of ["GET", "DELETE", "PUT"]) expect((await fetch(endpoint.url, { method })).status).toBe(405);
    const allowed = await fetch(endpoint.url, { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "not-json" });
    expect(allowed.status).toBe(400);
    expect(allowed.headers.get("cache-control")).toBe("no-store");
  });

  it("bounds bodies and remains usable after malformed and oversized requests", async () => {
    endpoint = await startHttp({ port: 0 });
    const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    expect((await fetch(endpoint.url, { method: "POST", headers, body: "x".repeat(MAX_REQUEST_BYTES) })).status).toBe(400);
    expect((await fetch(endpoint.url, { method: "POST", headers, body: "x".repeat(MAX_REQUEST_BYTES + 1) })).status).toBe(413);
    const client = new Client({ name: "recovery-test", version: "0.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(endpoint.url));
      expect((await client.callTool(requests[0]!)).isError).not.toBe(true);
    } finally { await client.close(); }
  });

  it("supports independent concurrent clients and idempotent close", async () => {
    endpoint = await startHttp({ port: 0 });
    const clients = [0, 1].map(() => new Client({ name: "parallel-synthetic-test", version: "0.0.0" }));
    try {
      await Promise.all(clients.map((client) => client.connect(new StreamableHTTPClientTransport(endpoint!.url))));
      const results = await Promise.all(clients.map((client) => client.callTool(requests[0]!)));
      expect(results[0]).toEqual(results[1]);
    } finally { await Promise.all(clients.map((client) => client.close())); }
    await Promise.all([endpoint.close(), endpoint.close()]);
    await expect(fetch(endpoint.url)).rejects.toThrow();
  });

  it("closes sockets even when a client has not finished sending its body", async () => {
    endpoint = await startHttp({ port: 0 });
    const request = httpRequest(endpoint.url, { method: "POST", headers: {
      "Content-Type": "application/json", "Content-Length": "100", Accept: "application/json, text/event-stream"
    } });
    request.on("error", () => {});
    const connected = once(request, "socket").then(async ([socket]) => {
      if (socket.connecting) await once(socket, "connect");
    });
    const disconnected = new Promise<void>((resolve) => request.once("close", resolve));
    request.write("{");
    await connected;
    await endpoint.close();
    await disconnected;
  });

  it("refuses invalid ports and occupied listeners", async () => {
    for (const port of [-1, 65536, NaN, 1.5]) await expect(startHttp({ port })).rejects.toThrow("Invalid HTTP port");
    endpoint = await startHttp({ port: 0 });
    await expect(startHttp({ port: Number(endpoint.url.port) })).rejects.toThrow();
  });
});

describe("CLI lifecycle", () => {
  const children: ChildProcess[] = [];
  afterEach(() => { for (const child of children) if (child.exitCode === null) child.kill("SIGKILL"); });
  function child(args: string[]) {
    const process = spawn(globalThis.process.execPath, [cli, ...args], { stdio: "pipe" });
    children.push(process);
    return process;
  }

  it("accepts only explicit transport and port arguments", () => {
    expect(parseArguments([])).toEqual({ transport: "stdio" });
    expect(parseArguments(["stdio"])).toEqual({ transport: "stdio" });
    expect(parseArguments(["http"])).toEqual({ transport: "http" });
    expect(parseArguments(["http", "--port", "0"])).toEqual({ transport: "http", port: 0 });
    expect(parseArguments(["http", "--port", "3000"])).toEqual({ transport: "http", port: 3000 });
    for (const args of [["other"], ["stdio", "--port", "3"], ["http", "--port"], ["http", "--port", "65536"], ["http", "--port", "1e3"], ["http", "--host", "0.0.0.0"]]) expect(() => parseArguments(args)).toThrow("Usage");
  });

  it("exits on stdin EOF with clean protocol stdout", async () => {
    const process = child(["stdio"]);
    let stdout = "";
    let stderr = "";
    process.stdout!.on("data", (chunk) => { stdout += String(chunk); });
    process.stderr!.on("data", (chunk) => { stderr += String(chunk); });
    const exited = once(process, "exit");
    process.stdin!.end();
    expect(await exited).toEqual([0, null]);
    expect(stdout).toBe("");
    expect(stderr).toBe("");
  });

  it.each(["SIGINT", "SIGTERM"] as const)("closes the HTTP listener on %s", async (signal) => {
    const process = child(["http", "--port", "0"]);
    let stdout = "";
    process.stdout!.on("data", (chunk) => { stdout += String(chunk); });
    const [chunk] = await once(process.stderr!, "data");
    const url = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+\/mcp/)?.[0];
    expect(url).toBeDefined();
    const exited = once(process, "exit");
    process.kill(signal);
    expect(await exited).toEqual([0, null]);
    expect(stdout).toBe("");
    await expect(fetch(url!)).rejects.toThrow();
  });

  it.each(["SIGINT", "SIGTERM"] as const)("exits cleanly on %s immediately when HTTP readiness is received", async (signal) => {
    const process = child(["http", "--port", "0"]);
    const exited = once(process, "exit");
    let stdout = "";
    let stderr = "";
    let signaled = false;
    process.stdout!.on("data", (chunk) => { stdout += String(chunk); });
    process.stderr!.on("data", (chunk) => {
      stderr += String(chunk);
      if (!signaled && /zodiacs-astro: listening at http:\/\/127\.0\.0\.1:\d+\/mcp\n/.test(stderr)) {
        signaled = process.kill(signal);
      }
    });
    expect(await exited).toEqual([0, null]);
    expect(signaled).toBe(true);
    expect(stdout).toBe("");
  });

  it.each(["SIGINT", "SIGTERM"] as const)("closes stdio on %s after initialization", async (signal) => {
    const process = child(["stdio"]);
    const ready = once(process.stdout!, "data");
    process.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "synthetic-signal-test", version: "0.0.0" }
    } }) + "\n");
    const [chunk] = await ready;
    expect(JSON.parse(String(chunk)).result.serverInfo.name).toBe("zodiacs-astro");
    const exited = once(process, "exit");
    process.kill(signal);
    expect(await exited).toEqual([0, null]);
  });

  it("reports invalid startup only on stderr and exits unsuccessfully", async () => {
    const process = child(["invalid"]);
    let stdout = "";
    let stderr = "";
    process.stdout!.on("data", (chunk) => { stdout += String(chunk); });
    process.stderr!.on("data", (chunk) => { stderr += String(chunk); });
    expect(await once(process, "exit")).toEqual([1, null]);
    expect(stdout).toBe("");
    expect(stderr).toContain("startup failed");
  });
});
