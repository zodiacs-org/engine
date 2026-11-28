import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, StreamableHTTPClientTransport, type JsonSchemaType, type JsonSchemaValidator } from "@modelcontextprotocol/client";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/client/validators/ajv";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { parseNatalEnvelope } from "@zodiacs/engine/receipt";
import { inputSchemas, type ToolName } from "../src/contracts.js";
import { parseArguments } from "../src/cli.js";
import { MAX_REQUEST_BYTES, startHttp } from "../src/transports.js";
import { natalChartTool } from "../src/tools/natal.js";
import { descriptionIssues, wordingIssues } from "./factual-language.js";

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
  { name: "event_search", arguments: { body: "Sun", longitude: 0,
    from: "2026-03-19T00:00:00Z", to: "2026-03-22T00:00:00Z" } }
] satisfies { name: ToolName; arguments: Record<string, unknown> }[];

type StructuredOutput = { data: Record<string, unknown>; receipts: { role: string; envelope: unknown }[] };
type ToolResult = Awaited<ReturnType<Client["callTool"]>>;

function expectStructured(name: string, result: ToolResult, validators: Map<string, JsonSchemaValidator<unknown>>) {
  expect(wordingIssues(result), `${name} factual wording`).toEqual([]);
  expect(result.isError, name).not.toBe(true);
  const validate = validators.get(name);
  expect(validate, `${name} advertised output schema`).toBeDefined();
  const verdict = validate!(result.structuredContent);
  expect(verdict.valid, `${name}: ${verdict.errorMessage ?? ""}`).toBe(true);
  const output = result.structuredContent as StructuredOutput;
  for (const receipt of output.receipts) expect(parseNatalEnvelope(JSON.stringify(receipt.envelope)).ok).toBe(true);
  const text = result.content?.find((item) => item.type === "text");
  if (text?.type === "text") expect(JSON.parse(text.text)).toEqual(output);
  else throw new Error("Missing JSON text content.");
  return output;
}

function expectToolError(result: ToolResult) {
  expect(wordingIssues(result), "tool error factual wording").toEqual([]);
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toBeUndefined();
  expect(result.content).toEqual([{ type: "text", text: expect.any(String) }]);
}

beforeAll(() => {
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.build.json"], { cwd });
});

describe.each(["stdio", "stdio-legacy", "http", "http-legacy"] as const)("%s SDK transport", (mode) => {
  let client: Client | undefined;
  let endpoint: Awaited<ReturnType<typeof startHttp>> | undefined;
  let validators: Map<string, JsonSchemaValidator<unknown>>;
  afterEach(async () => { await client?.close(); await endpoint?.close(); });

  beforeEach(async () => {
    const legacy = mode.endsWith("-legacy");
    client = new Client({ name: "synthetic-transport-test", version: "0.0.0" },
      legacy ? { supportedProtocolVersions: ["2025-11-25"] }
        : { versionNegotiation: { mode: { pin: "2026-07-28" } } });
    if (mode.startsWith("stdio")) {
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli], stderr: "pipe" }));
    } else {
      endpoint = await startHttp({ port: 0, clock: () => new Date(at) });
      const transport = new StreamableHTTPClientTransport(endpoint.url);
      await client.connect(transport);
      expect(transport.sessionId).toBeUndefined();
    }
    expect(client.getServerVersion()?.name).toBe("zodiacs-astro");
    expect(client.getProtocolEra()).toBe(legacy ? "legacy" : "modern");
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual(Object.keys(inputSchemas).sort());
    expect(requests.map((request) => request.name).sort()).toEqual(names);
    const provider = new AjvJsonSchemaValidator();
    validators = new Map(tools.map((tool) => {
      expect(descriptionIssues(tool), `${tool.name} factual descriptions`).toEqual([]);
      expect(tool.outputSchema, tool.name).toBeDefined();
      return [tool.name, provider.getValidator(tool.outputSchema! as JsonSchemaType)];
    }));
  });

  it("validates every tool against its discovered JSON schema and preserves native receipts", async () => {
    for (const request of requests) {
      const result = await client!.callTool(request);
      const output = expectStructured(request.name, result, validators);
      if (request.name === "natal_chart") expect(result).toMatchObject(natalChartTool(request.arguments));
      if (request.name === "event_search") {
        expect(output.data.search).toMatchObject({ status: "complete", crossings: [expect.any(Object)] });
        expect(output.receipts.map((receipt) => receipt.role)).toEqual(["search-start", "search-end", "event-1"]);
      }
      // Prove that discovery describes the envelope and concrete data, rather than accepting arbitrary JSON.
      const validate = validators.get(request.name)!;
      const dataKey = Object.keys(output.data)[0]!;
      for (const damaged of [
        { ...output, schemaVersion: "invalid" },
        { ...output, receipts: [] },
        { ...output, unexpected: true },
        { ...output, data: { ...output.data, unexpected: true } },
        { ...output, data: { ...output.data, [dataKey]: "invalid" } }
      ]) expect(validate(damaged).valid, request.name).toBe(false);
    }
  });

  it("validates nullable charts, polar fallback and relocated return results", async () => {
    const unknown = expectStructured("natal_chart", await client!.callTool({ name: "natal_chart", arguments: {
      birth: { utc: birth.utc, timeKnown: false }
    } }), validators);
    expect(unknown.data.chart).toMatchObject({ angles: null, houses: null, flags: ["no-time"] });
    const polar = expectStructured("natal_chart", await client!.callTool({ name: "natal_chart", arguments: {
      birth: { ...birth, latitude: 78, houseSystem: "placidus" }
    } }), validators);
    expect(polar.data.chart).toMatchObject({ houses: { system: "whole" }, flags: ["polar-fallback"] });
    for (const request of [
      { name: "solar_return", arguments: { birth, near: at, location: null, selection: "most-recent" } },
      { name: "lunar_return", arguments: { birth, after: at, location: null } }
    ]) {
      const output = expectStructured(request.name, await client!.callTool(request), validators);
      expect(output.data.return).toMatchObject({ location: null, chart: { angles: null, houses: null } });
    }
  });

  it("reports input and calculation errors for every tool, rejects unknown tools and recovers", async () => {
    for (const request of requests) {
      for (const args of [{}, { ...request.arguments, unexpected: true }]) {
        const result = await client!.callTool({ name: request.name, arguments: args });
        expectToolError(result);
        expect(result.content).toEqual([{ type: "text", text: expect.stringContaining("Input validation error") }]);
      }
    }
    const outside = "9999-01-01T00:00:00Z";
    const outsideBirth = { utc: outside };
    const calculationInputs = {
      natal_chart: { birth: outsideBirth },
      transits_at: { birth, at: outside },
      transits_now: { birth: outsideBirth },
      synastry: { first: birth, second: outsideBirth },
      solar_return: { birth: outsideBirth, near: at },
      lunar_return: { birth, after: outside },
      moon_phase: { at: outside },
      event_search: { body: "Sun", longitude: 0, from: outside, to: outside }
    } satisfies Record<ToolName, Record<string, unknown>>;
    for (const request of requests) {
      const result = await client!.callTool({ name: request.name, arguments: calculationInputs[request.name] });
      expectToolError(result);
      expect(result.content).not.toEqual([{ type: "text", text: expect.stringContaining("Input validation error") }]);
    }
    // These checks require server-side refinements or engine policy beyond the advertised JSON Schema.
    for (const request of [
      { name: "natal_chart", arguments: { birth: { utc: birth.utc, latitude: 12 } } },
      { name: "natal_chart", arguments: { birth: { utc: "2000-02-03T04:05:06.1234Z" } } },
      { name: "event_search", arguments: { body: "Sun", longitude: 0, from: at, to: birth.utc } },
      { name: "lunar_return", arguments: { birth: { ...birth, timeKnown: false }, after: at } },
      { name: "lunar_return", arguments: { birth, after: "1999-01-01T00:00:00Z" } }
    ]) expectToolError(await client!.callTool(request));
    await expect(client!.callTool({ name: "unknown_tool", arguments: {} })).rejects.toMatchObject({ code: -32602 });
    expectStructured("natal_chart", await client!.callTool(requests[0]!), validators);
  });

  it("validates empty scans and structured sample-budget refusals without partial events", async () => {
    const empty = expectStructured("event_search", await client!.callTool({ name: "event_search", arguments: {
      body: "Sun", longitude: 0, from: at, to: at
    } }), validators);
    expect(empty.data.search).toEqual({ status: "complete", crossings: [], samples: 0 });
    expect(empty.receipts.map((receipt) => receipt.role)).toEqual(["search-start", "search-end"]);
    for (const args of [
      { body: "Sun", longitude: 0, from: at, to: "2026-02-03T00:00:00Z", maxSamples: 1 },
      { ...requests[7]!.arguments, maxSamples: 13 }
    ]) {
      const output = expectStructured("event_search", await client!.callTool({ name: "event_search", arguments: args }), validators);
      expect(output.data.search).toMatchObject({ status: "refused", reason: "sample-budget", crossings: [] });
      expect(output.receipts.map((receipt) => receipt.role)).toEqual(["search-start", "search-end"]);
      const damaged = { ...output, data: { ...output.data,
        search: { ...(output.data.search as Record<string, unknown>), crossings: [{ at, retrograde: false }] }
      } };
      expect(validators.get("event_search")!(damaged).valid).toBe(false);
    }
    expectStructured("event_search", await client!.callTool(requests[7]!), validators);
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
