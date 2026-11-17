import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { buildReference } from "./build-reference.mjs";
import { buildTarget } from "./build-bundles.mjs";
import { edgeRoot, requireNode22, readToolchain } from "./build-support.mjs";
import { runRuntimeProcess } from "./runtime-process.mjs";

const names = ["node", "deno", "bun"];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const record = (path, bytes) => ({ path, bytes: bytes.byteLength, sha256: hash(bytes) });
const message = (error) => String(error.message).slice(0, 2000);

export async function loadExactProtocol() {
  const result = await build({
    absWorkingDir: edgeRoot, entryPoints: ["src/exact.ts"],
    bundle: true, platform: "node", format: "esm", target: "es2022",
    write: false, logLevel: "silent"
  });
  assert.equal(result.warnings.length, 0);
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

export function parseOptions(args) {
  const options = { runtimes: [...names], executables: { node: process.execPath, deno: "deno", bun: "bun" } };
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const option = args[i], value = args[i + 1];
    assert(["--runtimes", "--deno", "--bun"].includes(option) && !seen.has(option)
      && typeof value === "string" && value.length > 0 && !value.startsWith("--"),
    "Usage: smoke-runtimes.mjs [--runtimes node,deno,bun] [--deno executable] [--bun executable]");
    seen.add(option);
    if (option === "--runtimes") {
      const requested = value.split(",");
      assert(requested.every((name) => names.includes(name)) && new Set(requested).size === requested.length,
        "Select unique runtimes from node,deno,bun.");
      options.runtimes = names.filter((name) => name === "node" || requested.includes(name));
    } else {
      options.executables[option.slice(2)] = /[/\\]/.test(value) ? resolve(value) : value;
    }
  }
  return options;
}

export function runtimeProbe(name, moduleUrl) {
  assert(names.includes(name));
  const facts = {
    node: '{ name: "node", version: process.versions.node, v8: process.versions.v8, platform: process.platform, arch: process.arch }',
    deno: '{ name: "deno", version: Deno.version.deno, v8: Deno.version.v8, platform: Deno.build.os, arch: Deno.build.arch }',
    bun: '{ name: "bun", version: Bun.version, revision: Bun.revision, platform: process.platform, arch: process.arch }'
  }[name];
  return `import { runExactSmokeCases } from ${JSON.stringify(moduleUrl)};\n`
    + `const exact = runExactSmokeCases();\n`
    + `if (exact !== runExactSmokeCases()) throw new Error("Exact workload results changed on repeat.");\n`
    + `console.log(JSON.stringify({ schema: "edge-runtime-output/1", runtime: ${facts}, exact }));\n`;
}

export function runtimeCommand(name, moduleUrl) {
  const probe = runtimeProbe(name, moduleUrl);
  if (name === "node") return { args: ["--input-type=module"], input: probe };
  if (name === "deno") return {
    args: ["run", "--no-config", "--no-lock", "--no-npm", "--no-remote", "--no-prompt", "-"], input: probe
  };
  return { args: ["--no-env-file", "--no-install", "--eval", probe], input: "" };
}

export function parseRuntimeOutput(text, name, protocol) {
  const result = JSON.parse(text);
  assert.equal(JSON.stringify(result) + "\n", text, "Expected exactly one canonical runtime report line.");
  assert.deepEqual(Object.keys(result).sort(), ["exact", "runtime", "schema"]);
  assert.equal(result.schema, "edge-runtime-output/1");
  const metadata = result.runtime;
  assert(metadata && !Array.isArray(metadata), "Missing runtime metadata.");
  assert.deepEqual(Object.keys(metadata).sort(), ["arch", "name", "platform", name === "bun" ? "revision" : "v8", "version"].sort());
  assert.equal(metadata.name, name, "Wrong runtime identity.");
  for (const value of Object.values(metadata)) {
    assert(typeof value === "string" && /^[\x21-\x7e]{1,200}$/.test(value), "Invalid runtime metadata.");
  }
  assert(/^\d+\.\d+\.\d+/.test(metadata.version), "Invalid runtime version.");
  if (name === "node") assert(metadata.version.startsWith("22."), "Reference must run on Node 22.");
  protocol.parseExact(result.exact);
  return result;
}

// Separate execution from comparison so tests can exercise failure paths with
// small controlled modules. Native CLI runs always build the real workloads.
export async function checkRuntime({ name, executable, moduleUrl, reference, protocol, signal, timeoutMs }) {
  const command = runtimeCommand(name, moduleUrl);
  let processResult;
  try {
    processResult = await runRuntimeProcess(executable, command.args, {
      input: command.input, signal, ...(timeoutMs === undefined ? {} : { timeoutMs })
    });
  } catch (error) {
    return { status: "error", error: { code: error.code ?? "process-error", message: message(error) } };
  }
  let output;
  try {
    output = parseRuntimeOutput(processResult.stdout, name, protocol);
  } catch (error) {
    return { status: "error", error: { code: "invalid-report", message: message(error) } };
  }
  const summary = {
    runtime: output.runtime,
    result: record("exact-report", Buffer.from(output.exact)),
    stderr: processResult.stderr.slice(0, 2000),
    stderrTruncated: processResult.stderr.length > 2000,
    repeatable: true
  };
  if (reference === undefined && name !== "node") {
    return { ...summary, status: "uncompared", error: { code: "reference-failed", message: "No valid Node reference result." } };
  }
  const difference = reference === undefined ? null : protocol.compareExact(reference, output.exact);
  return { ...summary, status: difference ? "mismatch" : "passed", difference, exact: output.exact };
}

export async function runSmokeSuite({ runtimes, executables }, { signal } = {}) {
  requireNode22();
  assert(runtimes[0] === "node" && runtimes.every((name) => names.includes(name))
    && new Set(runtimes).size === runtimes.length, "Node reference and unique known runtimes are required.");
  const protocol = await loadExactProtocol();
  const toolchain = await readToolchain();
  const reports = [];
  let reference;
  for (const name of runtimes) {
    let moduleUrl, provenance;
    try {
      if (name === "node") {
        const built = await buildReference({ write: false });
        moduleUrl = built.moduleUrl;
        provenance = { target: "node-reference", output: record("workloads.mjs", built.bytes) };
      } else {
        const { manifest } = await buildTarget(name);
        moduleUrl = pathToFileURL(resolve(edgeRoot, ".generated", name, "workloads.mjs"));
        provenance = {
          target: name, sourceDigest: manifest.sourceDigest,
          output: manifest.outputs.find(({ path }) => path === "workloads.mjs")
        };
      }
    } catch (error) {
      reports.push({ name, status: "error", error: { code: "build-error", message: message(error) } });
      continue;
    }
    const { exact, ...checked } = await checkRuntime({
      name, executable: executables[name], moduleUrl: moduleUrl.href, reference, protocol, signal
    });
    if (name === "node" && checked.status === "passed") reference = exact;
    reports.push({ name, build: provenance, ...checked });
  }
  const runnerSources = await Promise.all([
    "scripts/smoke-runtimes.mjs", "scripts/runtime-process.mjs", "scripts/build-reference.mjs", "src/exact.ts", "src/workloads.ts"
  ].map(async (path) => record(path, await readFile(resolve(edgeRoot, path)))));
  return {
    schema: "edge-runtime-smoke/1",
    passed: !signal?.aborted && reports.every(({ status }) => status === "passed"),
    requiredRuntimes: runtimes,
    unselectedRuntimes: names.filter((name) => !runtimes.includes(name)),
    protocol: protocol.EXACT_SCHEMA,
    engineVersion: toolchain.engineVersion, ephemeris: toolchain.ephemeris,
    toolchain: toolchain.toolchain, runnerSources, reports,
    scope: "Full synthetic chart, houses and transit-scan results compared exactly to Node; runtime compatibility only."
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    const result = await runSmokeSuite(parseOptions(process.argv.slice(2)), { signal: abort.signal });
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    console.error(`Runtime smoke failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
}
