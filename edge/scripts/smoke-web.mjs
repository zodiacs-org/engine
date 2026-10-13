import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildReference } from "./build-reference.mjs";
import { edgeRoot, readToolchain, requireNode22 } from "./build-support.mjs";
import { checkRuntime, loadExactProtocol } from "./smoke-runtimes.mjs";

const names = ["node", "workers", "browser"];
const record = (path, bytes) => ({
  path, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex")
});
const errorReport = (error, code = error.code ?? "runtime-error") => ({
  status: "error", error: { code, message: String(error.message).slice(0, 2000) }
});

export function parseWebOptions(args) {
  const options = { runtimes: [...names], browserExecutable: "/usr/bin/google-chrome" };
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const option = args[i], value = args[i + 1];
    assert(["--runtimes", "--browser"].includes(option) && !seen.has(option)
      && typeof value === "string" && value.length > 0 && !value.startsWith("--"),
    "Usage: smoke-web.mjs [--runtimes node,workers,browser] [--browser /path/to/chromium]");
    seen.add(option);
    if (option === "--runtimes") {
      const requested = value.split(",");
      assert(requested.every((name) => names.includes(name)) && new Set(requested).size === requested.length,
        "Select unique runtimes from node,workers,browser.");
      options.runtimes = names.filter((name) => name === "node" || requested.includes(name));
    } else options.browserExecutable = resolve(value);
  }
  return options;
}

// Adapters enforce import, network and handler checks. Keep all generated exact
// results in memory; compact reports carry hashes and the first differing path.
export function summarizeWebResult(name, output, reference, protocol) {
  try {
    assert(["workers", "browser"].includes(name), "Unknown web runtime.");
    assert(output && typeof output === "object");
    assert.deepEqual(Object.keys(output).sort(), ["exact", "report"]);
    const { exact, report } = output;
    assert(report && typeof report === "object" && !Array.isArray(report));
    assert.equal(report.runtime?.name, name, "Wrong web runtime identity.");
    assert.equal(report.repeatable, true, "Web results did not repeat exactly.");
    assert(report.build && report.network, "Missing build or network checks.");
    assert.equal(report.network.passed, true, "Web network checks failed.");
    assert(!Object.hasOwn(report, "exact"), "Raw results do not belong in compact evidence.");
    if (name === "workers") {
      assert.equal(report.handlers?.passed, true, "Worker handler behavior checks failed.");
      assert.equal(typeof report.handlers.exactToNode, "boolean", "Missing Worker HTTP comparison.");
    }
    protocol.parseExact(exact);
    const summary = { ...report, result: record("exact-report", Buffer.from(exact)) };
    if (reference === undefined) return {
      ...summary, status: "uncompared", error: { code: "reference-failed", message: "No valid Node reference result." }
    };
    const difference = protocol.compareExact(reference, exact);
    const httpMismatch = name === "workers" && !report.handlers.exactToNode;
    return { ...summary, status: difference || httpMismatch ? "mismatch" : "passed", difference };
  } catch (error) {
    return errorReport(error, "invalid-report");
  }
}

export async function runWebSmokeSuite({ runtimes, browserExecutable }, { signal } = {}) {
  requireNode22();
  assert(runtimes[0] === "node" && runtimes.every((name) => names.includes(name))
    && new Set(runtimes).size === runtimes.length, "Node reference and unique known runtimes are required.");
  const protocol = await loadExactProtocol();
  const toolchain = await readToolchain();
  const reports = [];
  let reference;
  for (const name of runtimes) {
    try {
      if (name === "node") {
        const built = await buildReference({ write: false });
        const { exact, ...checked } = await checkRuntime({
          name, executable: process.execPath, moduleUrl: built.moduleUrl.href, protocol, signal
        });
        if (checked.status === "passed") reference = exact;
        reports.push({ name, build: { target: "node-reference", output: record("workloads.mjs", built.bytes) }, ...checked });
      } else {
        // Lazy imports allow deliberately narrower checks without loading the
        // unselected runtime's launcher. Every selected runtime is required.
        const output = name === "workers"
          ? await (await import("./smoke-workers.mjs")).runWorkersSmoke({ signal })
          : await (await import("./smoke-browser.mjs")).runBrowserSmoke({ executable: browserExecutable, signal });
        reports.push({ name, ...summarizeWebResult(name, output, reference, protocol) });
      }
    } catch (error) {
      reports.push({ name, ...errorReport(error) });
    }
  }
  const runnerSources = await Promise.all([
    "scripts/smoke-web.mjs", "scripts/smoke-runtimes.mjs", "scripts/runtime-process.mjs",
    "scripts/smoke-workers.mjs", "scripts/smoke-browser.mjs", "scripts/browser-driver.mjs",
    "scripts/build-reference.mjs", "src/exact.ts", "src/workloads.ts"
  ].map(async (path) => record(path, await readFile(resolve(edgeRoot, path)))));
  return {
    schema: "edge-web-smoke/1",
    passed: !signal?.aborted && reports.every(({ status }) => status === "passed"),
    requiredRuntimes: runtimes,
    unselectedRuntimes: names.filter((name) => !runtimes.includes(name)),
    protocol: protocol.EXACT_SCHEMA,
    engineVersion: toolchain.engineVersion, ephemeris: toolchain.ephemeris,
    toolchain: toolchain.toolchain, runnerSources, reports,
    scope: "Local workerd and Chromium imports, network checks and full synthetic results compared exactly to Node; runtime compatibility only."
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    const report = await runWebSmokeSuite(parseWebOptions(process.argv.slice(2)), { signal: abort.signal });
    const text = JSON.stringify(report, null, 2) + "\n";
    assert(Buffer.byteLength(text) < 2_000_000, "Web smoke report exceeds project file limit.");
    process.stdout.write(text);
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    console.error(`Web smoke failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
}
