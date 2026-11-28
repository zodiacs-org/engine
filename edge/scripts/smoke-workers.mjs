import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildTarget } from "./build-bundles.mjs";
import { edgeRoot, requireNode22 } from "./build-support.mjs";
import { runRuntimeProcess } from "./runtime-process.mjs";

export const WORKERS_COMPATIBILITY_DATE = "2025-10-11";
const moduleNames = ["engine.mjs", "workloads.mjs", "worker.mjs"];
const hash = (text) => createHash("sha256").update(text).digest("hex");

// This function also runs verbatim in workerd. Keep it free of Node APIs and
// imports so that its Request/Response and numeric operations use that runtime.
export async function evaluateWorkerModules(engine, workloads, worker) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  check(typeof engine.natalChart === "function", "Missing engine natalChart export.");
  check(typeof worker.default?.fetch === "function", "Missing module Worker fetch handler.");
  const exact = workloads.runExactSmokeCases();
  check(typeof exact === "string" && exact === workloads.runExactSmokeCases(), "Workloads changed on repeat.");
  const cases = workloads.CHART_CASES.map(({ id, input }) => ({
    id, input, body: JSON.stringify(input), status: 200
  }));
  cases.push(
    { id: "wrong-route", path: "/missing", method: "GET", status: 404, code: "not-found" },
    { id: "wrong-method", method: "GET", status: 405, code: "method-not-allowed" },
    { id: "head", method: "HEAD", status: 405 },
    { id: "malformed-json", body: "{", status: 400, code: "invalid-json" },
    { id: "invalid-input", body: '{"utc":"2000-01-01","latitude":91,"longitude":0}', status: 400, code: "invalid-input" },
    { id: "invalid-date", body: '{"utc":"2000-02-30T12:00:00Z"}', status: 422, code: "calculation-rejected" },
    { id: "body-over-limit", body: " ".repeat(4097), status: 413, code: "body-too-large" }
  );
  const handlers = [];
  for (const item of cases) {
    const response = await worker.default.fetch(new Request(`https://edge.test${item.path ?? "/chart"}`, {
      method: item.method ?? "POST", headers: { "Content-Type": "application/json" },
      ...(item.body === undefined ? {} : { body: item.body })
    }));
    check(response instanceof Response, `${item.id}: handler must return a native Response.`);
    check(response.status === item.status, `${item.id}: unexpected HTTP status ${response.status}.`);
    const headers = Object.fromEntries(["content-type", "cache-control", "x-content-type-options", "allow"]
      .map((name) => [name, response.headers.get(name)]));
    check(headers["content-type"] === "application/json; charset=utf-8", `${item.id}: content-type changed.`);
    check(headers["cache-control"] === "no-store", `${item.id}: cache-control changed.`);
    check(headers["x-content-type-options"] === "nosniff", `${item.id}: nosniff changed.`);
    check(headers.allow === (item.status === 405 ? "POST" : null), `${item.id}: Allow changed.`);
    const body = await response.text();
    if (item.input) {
      // HTTP has ordinary JSON semantics. Full binary64/Date parity is checked
      // separately by the exact workload protocol, before JSON can lose detail.
      check(body === JSON.stringify({ ok: true, result: engine.natalChart(item.input) }),
        `${item.id}: handler differs from this runtime's engine.`);
    } else if (item.method === "HEAD") check(body === "", "HEAD must have an empty body.");
    else {
      const value = JSON.parse(body);
      check(value.ok === false && value.error?.code === item.code, `${item.id}: wrong error payload.`);
    }
    handlers.push({ id: item.id, status: response.status, headers, body });
  }
  return {
    exact, repeatable: true, handlers,
    imports: { engineExports: Object.keys(engine).sort(), workloadExports: Object.keys(workloads).sort(), workerExports: Object.keys(worker).sort() }
  };
}

export function workersProbeSource() {
  return `const nativeFetch = globalThis.fetch.bind(globalThis);
let deniedByGuard = 0;
Object.defineProperty(globalThis, "fetch", {
  configurable: false, writable: false,
  value() { deniedByGuard++; throw new Error("Unexpected network access during Workers smoke."); }
});
const evaluate = ${evaluateWorkerModules.toString()};
export default {
  async fetch(request) {
    if (new URL(request.url).pathname === "/network-probe") {
      const denied = await nativeFetch("https://edge-smoke.invalid/deny-probe");
      if (denied.status !== 503 || await denied.text() !== "edge-smoke-network-denied")
        throw new Error("Outbound network policy was not enforced.");
      return Response.json({ blocked: true });
    }
    // Dynamic imports ensure the guard is installed before any bundle runs.
    const engine = await import("./engine.mjs");
    const workloads = await import("./workloads.mjs");
    const worker = await import("./worker.mjs");
    const result = await evaluate(engine, workloads, worker);
    if (deniedByGuard !== 0) throw new Error("Bundle attempted network access.");
    return Response.json({ ...result, deniedByGuard });
  }
};\n`;
}

async function readInput() {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.byteLength;
    assert(length < 2_000_000, "Workers input exceeds its byte limit.");
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  assert.deepEqual(Object.keys(input).sort(), [...moduleNames].sort());
  for (const value of Object.values(input)) assert.equal(typeof value, "string");
  return input;
}

async function runWorkersChild(modules) {
  const { Miniflare } = await import("miniflare");
  const require = createRequire(import.meta.url);
  const miniflarePackage = JSON.parse(await readFile(require.resolve("miniflare/package.json"), "utf8"));
  const workerdPackage = JSON.parse(await readFile(require.resolve("workerd/package.json"), "utf8"));
  const installed = JSON.parse(await readFile(resolve(edgeRoot, "package.json"), "utf8"));
  assert.equal(miniflarePackage.version, installed.devDependencies.miniflare, "Miniflare differs from its pin.");
  assert.equal(workerdPackage.version, miniflarePackage.dependencies.workerd, "workerd differs from Miniflare's pin.");
  const outbound = [];
  const modulesRoot = resolve(edgeRoot, ".generated/workers-smoke");
  const mf = new Miniflare({
    host: "127.0.0.1", port: 0, inspectorPort: 0,
    cf: false, liveReload: false, compatibilityDate: WORKERS_COMPATIBILITY_DATE,
    modulesRoot,
    modules: [
      { type: "ESModule", path: resolve(modulesRoot, "probe.mjs"), contents: workersProbeSource() },
      ...moduleNames.map((name) => ({ type: "ESModule", path: resolve(modulesRoot, name), contents: modules[name] }))
    ],
    // The runtime's outbound service is denied too, independently of the JS
    // guard. The one intentional native-fetch probe proves it is connected.
    outboundService(request) {
      outbound.push(request.url);
      return new Response("edge-smoke-network-denied", { status: 503 });
    }
  });
  try {
    await mf.ready;
    const probe = await mf.dispatchFetch("https://edge.test/network-probe");
    assert.equal(probe.status, 200, "Workers network policy probe failed.");
    assert.deepEqual(await probe.json(), { blocked: true });
    assert.deepEqual(outbound, ["https://edge-smoke.invalid/deny-probe"]);
    const response = await mf.dispatchFetch("https://edge.test/smoke");
    assert.equal(response.status, 200, `Workers execution failed: ${(await response.clone().text()).slice(0, 2000)}`);
    const result = await response.json();
    assert.equal(result.deniedByGuard, 0);
    assert.deepEqual(outbound, ["https://edge-smoke.invalid/deny-probe"], "Unexpected native outbound request.");
    return {
      ...result,
      runtime: { name: "workers", version: workerdPackage.version, miniflare: miniflarePackage.version,
        compatibilityDate: WORKERS_COMPATIBILITY_DATE, platform: process.platform, arch: process.arch },
      network: { passed: true, guardInstalledBeforeImports: true, cfFetchDisabled: true, nativeDenyProbePassed: true,
        unexpectedRequests: 0, guardedRequests: 0 }
    };
  } finally {
    await mf.dispose();
  }
}

async function runNodeChild(modules) {
  let requests = 0;
  Object.defineProperty(globalThis, "fetch", {
    configurable: false, writable: false,
    value() { requests++; throw new Error("Unexpected Node reference network access."); }
  });
  const loaded = [];
  for (const name of moduleNames) loaded.push(await import(`data:text/javascript;base64,${Buffer.from(modules[name]).toString("base64")}`));
  const result = await evaluateWorkerModules(...loaded);
  assert.equal(requests, 0);
  return result;
}

export async function checkWorkersModules(modules, { signal, timeoutMs = 30_000 } = {}) {
  const input = JSON.stringify(modules);
  assert(Buffer.byteLength(input) < 2_000_000, "Workers module input exceeds its byte limit.");
  const options = { input, signal, timeoutMs, tempDirectory: resolve(edgeRoot, ".cache/workers-smoke") };
  const output = await runRuntimeProcess(process.execPath, [fileURLToPath(import.meta.url), "--workers-child"], options);
  const reference = await runRuntimeProcess(process.execPath, [fileURLToPath(import.meta.url), "--node-child"], options);
  const parse = ({ stdout }) => {
    const result = JSON.parse(stdout);
    assert.equal(JSON.stringify(result) + "\n", stdout, "Expected one Workers report line.");
    assert.equal(typeof result.exact, "string");
    assert.equal(result.repeatable, true);
    assert(Array.isArray(result.handlers) && result.handlers.length > 0);
    return result;
  };
  const actual = parse(output), expected = parse(reference);
  assert.deepEqual(actual.imports, expected.imports, "Workers exports differ from Node.");
  assert.deepEqual(actual.handlers.map(({ id }) => id), expected.handlers.map(({ id }) => id));
  const cases = actual.handlers.map((item, index) => {
    const node = expected.handlers[index];
    const exactToNode = JSON.stringify(item) === JSON.stringify(node);
    return { id: item.id, status: item.status, exactToNode,
      body: { bytes: Buffer.byteLength(item.body), sha256: hash(item.body) },
      difference: exactToNode ? null : {
        statusMatches: item.status === node.status, headersMatch: JSON.stringify(item.headers) === JSON.stringify(node.headers),
        bodyMatches: item.body === node.body, nodeBodySha256: hash(node.body)
      } };
  });
  return { exact: actual.exact, report: {
    runtime: actual.runtime, repeatable: true, imports: actual.imports, network: actual.network,
    handlers: { passed: true, exactToNode: cases.every(({ exactToNode }) => exactToNode), cases },
    stderr: output.stderr.slice(0, 2000), stderrTruncated: output.stderr.length > 2000
  } };
}

export async function runWorkersSmoke({ signal } = {}) {
  requireNode22();
  const { files, manifest } = await buildTarget("workers", { write: false });
  const modules = Object.fromEntries(moduleNames.map((name) => [name, files.get(name).toString("utf8")]));
  const { exact, report } = await checkWorkersModules(modules, { signal });
  return { exact, report: { ...report, build: {
    target: "workers", sourceDigest: manifest.sourceDigest,
    outputs: manifest.outputs.filter(({ path }) => moduleNames.includes(path))
  } } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    requireNode22();
    const args = process.argv.slice(2);
    assert(args.length === 1 && ["--workers-child", "--node-child"].includes(args[0]),
      "Use the smoke-web runner to check Workers against Node.");
    const modules = await readInput();
    console.log(JSON.stringify(await (args[0] === "--workers-child" ? runWorkersChild(modules) : runNodeChild(modules))));
  } catch (error) {
    console.error(`Workers smoke failed: ${error.message}`);
    process.exitCode = 1;
  }
}
