import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MAX_TOKEN_BYTES, type BearerAuthSource } from "../src/auth.js";
import { parseArguments } from "../src/cli.js";
import { MAX_REQUEST_BYTES, startHttp } from "../src/transports.js";

const project = fileURLToPath(new URL("../", import.meta.url));
const cli = join(project, "build/cli.js");
const envName = "ZODIACS_MCP_TEST_TOKEN";
const credential = () => randomBytes(32).toString("base64url");
let endpoint: Awaited<ReturnType<typeof startHttp>> | undefined;
let directory: string | undefined;
const children: ChildProcess[] = [];

beforeAll(() => {
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.build.json"], { cwd: project, timeout: 30_000 });
}, 30_000);
afterEach(async () => {
  await endpoint?.close();
  endpoint = undefined;
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
  }
  vi.unstubAllEnvs();
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function tokenFile(contents: string): string {
  if (!directory) {
    const generated = join(project, ".generated");
    mkdirSync(generated, { recursive: true });
    directory = mkdtempSync(join(generated, "auth-"));
  }
  const path = join(directory, randomBytes(8).toString("hex"));
  writeFileSync(path, contents, { mode: 0o600 });
  return path;
}

async function checkSdk(url: URL, token: string) {
  const client = new Client({ name: "synthetic-auth-test", version: "0.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: `Bearer ${token}` } }
    }));
    expect((await client.listTools()).tools.some((tool) => tool.name === "moon_phase")).toBe(true);
    expect((await client.callTool({ name: "moon_phase", arguments: { at: "2026-01-03T00:00:00Z" } })).isError).not.toBe(true);
  } finally { await client.close(); }
}

function startChild(args: string[], env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  const child = spawn(process.execPath, [cli, ...args], { stdio: "pipe", env, cwd });
  children.push(child);
  let stdout = "";
  let stderr = "";
  child.stdout!.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr!.on("data", (chunk) => { stderr += String(chunk); });
  return { child, exited: once(child, "exit"), logs: () => ({ stdout, stderr }) };
}

describe("optional HTTP bearer authentication", () => {
  it("accepts the configured environment credential through the official SDK", async () => {
    const token = credential();
    vi.stubEnv(envName, token);
    endpoint = await startHttp({ port: 0, auth: { tokenEnv: envName } });
    await checkSdk(endpoint.url, token);
    // Sources are read once, with no surprise credential change on later requests.
    vi.stubEnv(envName, credential());
    await checkSdk(endpoint.url, token);
  });

  it.each(["", "\n", "\r\n"])("accepts a regular token file with terminal %j", async (ending) => {
    const token = credential();
    const path = tokenFile(token + ending);
    endpoint = await startHttp({ port: 0, auth: { tokenFile: path } });
    await checkSdk(endpoint.url, token);
    writeFileSync(path, credential());
    await checkSdk(endpoint.url, token);
  });

  it("resolves an embedded relative file source from the process working directory", async () => {
    const token = credential();
    const path = relative(process.cwd(), tokenFile(token));
    endpoint = await startHttp({ port: 0, auth: { tokenFile: path } });
    await checkSdk(endpoint.url, token);
  });

  it("keeps authentication off unless an HTTP source is selected", async () => {
    vi.stubEnv(envName, credential());
    endpoint = await startHttp({ port: 0 });
    const client = new Client({ name: "synthetic-default-auth-test", version: "0.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(endpoint.url));
      expect((await client.listTools()).tools.length).toBeGreaterThan(0);
    } finally { await client.close(); }
  });

  it("rejects missing, wrong, malformed and duplicate credentials identically before body parsing", async () => {
    const token = credential();
    vi.stubEnv(envName, token);
    const errors: Error[] = [];
    endpoint = await startHttp({ port: 0, auth: { tokenEnv: envName }, onerror: (error) => errors.push(error) });
    const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    let denial: string | undefined;
    for (const authorization of [undefined, `Bearer ${credential()}`, `Bearer ${token.slice(1)}`, `Bearer ${token}${token}`, `Basic ${token}`, "Bearer", `Bearer ${token} extra`]) {
      const response = await fetch(endpoint.url, {
        method: "POST", headers: { ...headers, ...(authorization ? { Authorization: authorization } : {}) },
        body: "x".repeat(MAX_REQUEST_BYTES + 1)
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe('Bearer realm="zodiacs-astro"');
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = await response.text();
      denial ??= body;
      expect(body).toBe(denial);
      expect(body).not.toContain(token);
    }
    const response = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
      const request = httpRequest(endpoint!.url, { method: "POST", headers: {
        ...headers, Authorization: [`Bearer ${token}`, `Bearer ${credential()}`]
      } }, (result) => {
        let body = "";
        result.on("data", (chunk) => { body += String(chunk); });
        result.on("end", () => resolve({ status: result.statusCode, body }));
      });
      request.on("error", reject);
      request.end("not-json");
    });
    expect(response).toEqual({ status: 401, body: denial });
    const bodyCredential = await fetch(endpoint.url, {
      method: "POST", headers, body: JSON.stringify({ access_token: token })
    });
    expect(bodyCredential.status).toBe(401);
    expect(await bodyCredential.text()).toBe(denial);
    for (const method of ["GET", "DELETE", "PUT"]) {
      const rejected = await fetch(endpoint.url, { method });
      expect(rejected.status).toBe(401);
      expect(await rejected.text()).toBe(denial);
    }
    const mixedCase = await fetch(endpoint.url, { method: "POST", headers: { ...headers, authorization: `bEaReR ${token}` }, body: "not-json" });
    expect(mixedCase.status).toBe(400);
    expect(errors).toEqual([]);
    await checkSdk(endpoint.url, token);
  });

  it("preserves host, origin and path guards with authentication enabled", async () => {
    const token = credential();
    vi.stubEnv(envName, token);
    endpoint = await startHttp({ port: 0, auth: { tokenEnv: envName } });
    const hostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(endpoint!.url, { headers: { Host: "foreign.example", Authorization: `Bearer ${token}` } }, (result) => {
        result.resume();
        result.on("end", () => resolve(result.statusCode));
      });
      request.on("error", reject);
      request.end();
    });
    expect(hostStatus).toBe(403);
    expect((await fetch(endpoint.url, { headers: { Origin: "https://foreign.example", Authorization: `Bearer ${token}` } })).status).toBe(403);
    expect((await fetch(new URL("/other", endpoint.url))).status).toBe(404);
    expect((await fetch(new URL(`?access_token=${token}`, endpoint.url))).status).toBe(404);
  });

  it.each(["env", "file-lf", "file-crlf"] as const)("accepts the token byte boundary and permitted ASCII characters from %s", async (source) => {
    expect(MAX_TOKEN_BYTES).toBe(4096);
    const prefix = credential() + "._~+/-";
    // Generate the boundary without storing a reusable credential in the repository.
    const boundary = prefix + "a".repeat(MAX_TOKEN_BYTES - prefix.length - 1) + "=";
    expect(Buffer.byteLength(boundary)).toBe(MAX_TOKEN_BYTES);
    vi.stubEnv(envName, boundary);
    const auth = source === "env" ? { tokenEnv: envName } : { tokenFile: tokenFile(boundary + (source === "file-lf" ? "\n" : "\r\n")) };
    endpoint = await startHttp({ port: 0, auth });
    await checkSdk(endpoint.url, boundary);
  });

  it("fails closed on absent, empty, non-ASCII, whitespace or oversized environment values", async () => {
    for (const value of [undefined, "", " ", `${credential()}\n`, `${credential()}\r\n`, ` ${credential()}`, `${credential()} extra`, `${credential()}é`, "a".repeat(MAX_TOKEN_BYTES + 1)]) {
      vi.stubEnv(envName, value);
      await expect(startHttp({ port: 0, auth: { tokenEnv: envName } })).rejects.toThrow(/^Invalid HTTP authentication configuration\.$/);
    }
  });

  it("fails closed on unreadable, nonregular, invalid or oversized file sources without source details", async () => {
    const valid = tokenFile(credential());
    const invalid = [valid + "-missing", directory!, ...["", "\n", `${credential()}\n\n`, `${credential()}\r`, `${credential()} extra`, "a".repeat(MAX_TOKEN_BYTES + 1)].map(tokenFile)];
    for (const path of invalid) {
      await expect(startHttp({ port: 0, auth: { tokenFile: path } })).rejects.toThrow(/^Invalid HTTP authentication configuration\.$/);
    }
    // The bounded reader must reject a large source rather than allocating its size.
    const large = tokenFile("a".repeat(MAX_TOKEN_BYTES * 4));
    await expect(startHttp({ port: 0, auth: { tokenFile: large } })).rejects.toThrow(/^Invalid HTTP authentication configuration\.$/);
  });

  it("rejects ambiguous or invalid embedded configuration", async () => {
    for (const auth of [null, {}, { tokenEnv: "" }, { tokenEnv: "INVALID NAME" }, { tokenEnv: `${envName}\n` }, { tokenFile: "" }, { tokenEnv: envName, tokenFile: "unused" }]) {
      await expect(startHttp({ port: 0, auth: auth as BearerAuthSource })).rejects.toThrow(/^Invalid HTTP authentication configuration\.$/);
    }
  });
});

describe("authentication CLI", () => {
  it("accepts either source with a port in any order and rejects ambiguous or inline credentials", () => {
    expect(parseArguments(["http", "--auth-token-env", envName, "--port", "0"])).toEqual({ transport: "http", port: 0, auth: { tokenEnv: envName } });
    expect(parseArguments(["http", "--port", "0", "--auth-token-file", "/operator/token"])).toEqual({ transport: "http", port: 0, auth: { tokenFile: "/operator/token" } });
    expect(parseArguments(["http", "--auth-token-file", "operator-token"])).toEqual({ transport: "http", auth: { tokenFile: "operator-token" } });
    for (const args of [
      ["stdio", "--auth-token-env", envName], ["stdio", "--auth-token-file", "/operator/token"],
      ["http", "--auth-token-env"], ["http", "--auth-token-file", ""], ["http", "--auth-token-env", "INVALID NAME"],
      ["http", "--auth-token-env", envName, "--auth-token-file", "/operator/token"],
      ["http", "--auth-token-env", envName, "--auth-token-env", envName],
      ["http", "--auth-token-file", "/operator/token", "--auth-token-file", "/operator/token"],
      ["http", "--port", "0", "--port", "1"], ["http", "--auth-token", credential()]
    ]) expect(() => parseArguments(args)).toThrow("Usage");
  });

  it.each(["env", "file", "relative-file"] as const)("authenticates CLI HTTP using %s without credential or source logging", async (source) => {
    const token = credential();
    const path = tokenFile(token + "\n");
    const fileArgument = source === "relative-file" ? basename(path) : path;
    const running = startChild(["http", "--port", "0", ...(source === "env" ? ["--auth-token-env", envName] : ["--auth-token-file", fileArgument])],
      { ...process.env, [envName]: token }, source === "relative-file" ? dirname(path) : project);
    const url = await new Promise<URL>((resolve, reject) => {
      running.child.once("exit", () => reject(new Error("Listener exited before readiness.")));
      running.child.stderr!.on("data", () => {
        const address = running.logs().stderr.match(/http:\/\/127\.0\.0\.1:\d+\/mcp/)?.[0];
        if (address) resolve(new URL(address));
      });
    });
    expect((await fetch(url)).status).toBe(401);
    await checkSdk(url, token);
    running.child.kill("SIGTERM");
    expect(await running.exited).toEqual([0, null]);
    expect(running.logs().stdout).toBe("");
    expect(running.logs().stderr).not.toContain(token);
    expect(running.logs().stderr).not.toContain(path);
    expect(running.logs().stderr).not.toContain(envName);
  });

  it("fails startup without logging a source path, missing variable name or supplied secret", async () => {
    const token = credential();
    const path = tokenFile(token + " invalid");
    for (const args of [["--auth-token-env", envName], ["--auth-token-file", path], ["--auth-token-file", path + "-missing"], ["--auth-token", token]]) {
      const running = startChild(["http", "--port", "0", ...args], { ...process.env, [envName]: "" });
      expect(await running.exited).toEqual([1, null]);
      expect(running.logs().stdout).toBe("");
      expect(running.logs().stderr).toContain("startup failed");
      expect(running.logs().stderr).not.toContain("listening");
      for (const value of [token, path, envName]) expect(running.logs().stderr).not.toContain(value);
    }
  });

  it("keeps stdio protocol output clean with a credential in the environment", async () => {
    const running = startChild(["stdio"], { ...process.env, [envName]: credential() });
    const ready = once(running.child.stdout!, "data");
    running.child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "synthetic-stdio-auth-test", version: "0.0.0" }
    } }) + "\n");
    const [chunk] = await ready;
    expect(JSON.parse(String(chunk)).result.serverInfo.name).toBe("zodiacs-astro");
    running.child.stdin!.end();
    expect(await running.exited).toEqual([0, null]);
    expect(running.logs().stderr).toBe("");
  });
});
